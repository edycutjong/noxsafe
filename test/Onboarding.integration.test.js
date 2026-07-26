const { expect } = require("chai");
const { ethers } = require("hardhat");
const { installMockNox, encryptInputs } = require("./helpers");

const U = (n) => BigInt(n) * 10n ** 6n;
const CAP = U(25_000);
const FLOAT = U(25_000); // float == cap by default (blast radius == approved spend)

/**
 * Integration proof against the REAL ConfidentialUSD (ERC20ToERC7984Wrapper) + DemoUSD contracts —
 * NOT the MockERC7984. Exercises the exact 4-call onboarding batch a Safe multisig signs, then a real
 * confidentialTransferFrom through the wrapper's optimized-primitive _update path. Runs 100% locally.
 */
describe("Onboarding + real wrapper integration", () => {
  async function onboarded() {
    const [deployer, safe, treasurer, dev, designer, stranger] = await ethers.getSigners();
    const nox = await installMockNox();

    const Demo = await ethers.getContractFactory("DemoUSD");
    const demo = await Demo.deploy();
    await demo.waitForDeployment();

    const CUSD = await ethers.getContractFactory("ConfidentialUSD");
    const cusd = await CUSD.deploy(await demo.getAddress());
    await cusd.waitForDeployment();

    const Rail = await ethers.getContractFactory("PayrollRail");
    const rail = await Rail.deploy(await cusd.getAddress(), safe.address);
    await rail.waitForDeployment();

    // Fund the Safe treasury with DemoUSD (mint — DemoUSD.mint is open for the seed).
    await demo.mint(safe.address, U(50_000));

    const quarterEnd = (await ethers.provider.getBlock("latest")).timestamp + 90 * 24 * 3600;
    return { nox, demo, cusd, rail, quarterEnd, signers: { deployer, safe, treasurer, dev, designer, stranger } };
  }

  it("runs the 4-call onboarding batch (approve -> wrap -> setOperator -> configure)", async () => {
    const { demo, cusd, rail, quarterEnd, signers } = await onboarded();
    const railAddr = await rail.getAddress();
    const cusdAddr = await cusd.getAddress();

    const before = await demo.balanceOf(signers.safe.address);
    // 1) approve
    await demo.connect(signers.safe).approve(cusdAddr, FLOAT);
    // 2) wrap the float (USDC -> cUSD, 1:1)
    await cusd.connect(signers.safe).wrap(signers.safe.address, FLOAT);
    // 3) grant the rail a time-bound operator
    await cusd.connect(signers.safe).setOperator(railAddr, quarterEnd);
    // 4) configure the rail (treasurer + public cap)
    await rail.connect(signers.safe).configure(signers.treasurer.address, CAP);

    expect(await demo.balanceOf(signers.safe.address)).to.equal(before - FLOAT); // float left the Safe
    expect(await demo.balanceOf(cusdAddr)).to.equal(FLOAT); // held 1:1 by the wrapper
    expect(await cusd.confidentialBalanceOf(signers.safe.address)).to.not.equal(ethers.ZeroHash);
    expect(await cusd.isOperator(signers.safe.address, railAddr)).to.equal(true);
    expect(await rail.isActiveOperator()).to.equal(true);
    expect(await rail.configured()).to.equal(true);
  });

  it("the Safe's UNWRAPPED balance is untouched by onboarding (blast radius = wrapped float)", async () => {
    const { demo, cusd, rail, quarterEnd, signers } = await onboarded();
    await demo.connect(signers.safe).approve(await cusd.getAddress(), FLOAT);
    await cusd.connect(signers.safe).wrap(signers.safe.address, FLOAT);
    await cusd.connect(signers.safe).setOperator(await rail.getAddress(), quarterEnd);
    // 50,000 minted - 25,000 wrapped = 25,000 unwrapped USDC still fully under the Safe's own control.
    expect(await demo.balanceOf(signers.safe.address)).to.equal(U(25_000));
  });

  it("full flow through the REAL wrapper: propose -> approve -> execute settles a roster", async () => {
    const { cusd, rail, quarterEnd, signers } = await onboarded();
    const railAddr = await rail.getAddress();
    await cusd.connect(signers.safe).setOperator(railAddr, quarterEnd);
    // fund + wrap so the Safe has a confidential balance to pay from
    const { demo } = { demo: await ethers.getContractAt("DemoUSD", await cusd.underlying()) };
    await demo.connect(signers.safe).approve(await cusd.getAddress(), FLOAT);
    await cusd.connect(signers.safe).wrap(signers.safe.address, FLOAT);
    await rail.connect(signers.safe).configure(signers.treasurer.address, CAP);

    const { handles, proofs } = encryptInputs(2);
    const addrs = [signers.dev.address, signers.designer.address];
    await rail.connect(signers.treasurer).proposeRoster(addrs, handles, proofs);
    await rail.connect(signers.safe).approveRoster(1);
    await rail.executePayroll(1); // runs cUSD.confidentialTransferFrom via the real _update path

    expect(await rail.rosterStatus(1)).to.equal(3); // Settled
    // recipients now carry a confidential balance handle in the real wrapper
    expect(await cusd.confidentialBalanceOf(signers.designer.address)).to.not.equal(ethers.ZeroHash);
  });

  it("revocation is one tx: setOperator(rail, 0) disables the rail", async () => {
    const { cusd, rail, quarterEnd, signers } = await onboarded();
    const railAddr = await rail.getAddress();
    await cusd.connect(signers.safe).setOperator(railAddr, quarterEnd);
    expect(await rail.isActiveOperator()).to.equal(true);
    await cusd.connect(signers.safe).setOperator(railAddr, 0);
    expect(await rail.isActiveOperator()).to.equal(false);
  });
});
