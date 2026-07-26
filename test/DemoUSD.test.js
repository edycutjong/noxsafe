const { expect } = require("chai");
const { ethers } = require("hardhat");

// Unit tests for the underlying ERC-20 (runs on the local Hardhat network — no Nox/TEE needed).
// The confidential cUSD + escrow paths require the live NoxCompute precompile and are proven by the
// live `npm run e2e` on Sepolia; @noxsend/core carries 122 pure unit tests (`npm test`).
describe("DemoUSD", function () {
  let demo, owner, alice;

  beforeEach(async function () {
    [owner, alice] = await ethers.getSigners();
    demo = await (await ethers.getContractFactory("DemoUSD")).deploy();
    await demo.waitForDeployment();
  });

  it("uses 6 decimals (mirrors USDC)", async function () {
    expect(await demo.decimals()).to.equal(6);
  });

  it("has name/symbol dUSD", async function () {
    expect(await demo.symbol()).to.equal("dUSD");
    expect(await demo.name()).to.equal("Demo USD");
  });

  it("mints 1,000,000 to the deployer", async function () {
    expect(await demo.balanceOf(owner.address)).to.equal(1_000_000n * 10n ** 6n);
  });

  it("faucet mints 1,000 to the caller", async function () {
    await demo.connect(alice).faucet();
    expect(await demo.balanceOf(alice.address)).to.equal(1_000n * 10n ** 6n);
  });

  it("FAUCET_AMOUNT is 1,000e6", async function () {
    expect(await demo.FAUCET_AMOUNT()).to.equal(1_000n * 10n ** 6n);
  });

  it("mint(to, amount) credits an arbitrary account (seed convenience)", async function () {
    await demo.mint(alice.address, 4242n);
    expect(await demo.balanceOf(alice.address)).to.equal(4242n);
  });

  it("supports approve + transferFrom (wrap prerequisite)", async function () {
    await demo.approve(alice.address, 500n);
    expect(await demo.allowance(owner.address, alice.address)).to.equal(500n);
    await demo.connect(alice).transferFrom(owner.address, alice.address, 500n);
    expect(await demo.balanceOf(alice.address)).to.equal(500n);
  });

  it("reverts transfer above balance", async function () {
    await expect(demo.connect(alice).transfer(owner.address, 1n)).to.be.reverted;
  });
});
