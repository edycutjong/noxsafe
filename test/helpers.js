// Shared Hardhat-test helpers. EVERYTHING here runs on the local in-process Hardhat network
// (chainId 31337) — free, ephemeral, pre-funded. No Sepolia, no gas spent.
const { ethers, network } = require("hardhat");

// The Nox library (`Nox.noxComputeContract()`) hardcodes this address as the compute contract for
// chainId 31337. We deploy MockNoxCompute, then relocate its runtime bytecode here via `hardhat_setCode`
// so the REAL PayrollRail + wrapper resolve to our local test double. The mock has no constructor state
// or immutables, so a setCode relocation is exact (fresh empty ACL storage is the correct start state).
const NOX_LOCAL = "0x75C6AF4430cc474b1bb9b8540b7E46D6f8e1C685";

const TEE_UINT256 = 35; // TEEType.Uint256 (matches the on-chain enum + the TS handle decoder)

/** Install MockNoxCompute at the canonical local Nox address and return a bound contract instance. */
async function installMockNox() {
  const Mock = await ethers.getContractFactory("MockNoxCompute");
  const deployed = await Mock.deploy();
  await deployed.waitForDeployment();
  const code = await ethers.provider.getCode(await deployed.getAddress());
  await network.provider.send("hardhat_setCode", [NOX_LOCAL, code]);
  return Mock.attach(NOX_LOCAL);
}

/**
 * Craft a well-formed ERC-7984 input handle (externalEuint256) with correct metadata bytes:
 *   [0]=version(0)  [1-4]=chainId(31337)  [5]=TEEType.Uint256(35)  [6]=attrs(0x01 unique)  [7-31]=random
 * Plus a non-empty input proof. MockNoxCompute.validateInputProof accepts these (it relaxes only the
 * gateway signature, which requires a real TEE). On Sepolia the SDK's encryptInput produces the real proof.
 */
function makeInputHandle() {
  const b = ethers.getBytes(ethers.hexlify(ethers.randomBytes(32)));
  b[0] = 0x00; // version
  b[1] = 0x00;
  b[2] = 0x00;
  b[3] = 0x7a; // 31337 = 0x00007A69
  b[4] = 0x69;
  b[5] = TEE_UINT256; // Uint256
  b[6] = 0x01; // unique / confidential (has ACL) — required so allowThis/addViewer don't hit notPublicHandle
  return ethers.hexlify(b);
}

function makeProof() {
  return ethers.hexlify(ethers.randomBytes(137)); // real proof is 137 bytes; content is ignored locally
}

/** Build parallel {handles, proofs} arrays for `count` roster lines. */
function encryptInputs(count) {
  const handles = [];
  const proofs = [];
  for (let i = 0; i < count; i++) {
    handles.push(makeInputHandle());
    proofs.push(makeProof());
  }
  return { handles, proofs };
}

const RosterStatus = { None: 0, Proposed: 1, Approved: 2, Settled: 3 };

/**
 * Full fixture: MockNoxCompute installed + a PayrollRail wired to a MockERC7984 token, with the
 * "safe" EOA having granted the rail operator status (mirrors the onboarding setOperator step).
 */
async function deployRailFixture() {
  const [deployer, safe, treasurer, dev, designer, writer, ops, advisor, auditor, officer, stranger] =
    await ethers.getSigners();

  const nox = await installMockNox();

  const Token = await ethers.getContractFactory("MockERC7984");
  const token = await Token.deploy();
  await token.waitForDeployment();

  const Rail = await ethers.getContractFactory("PayrollRail");
  const rail = await Rail.deploy(await token.getAddress(), safe.address);
  await rail.waitForDeployment();

  // Onboarding: the Safe grants the rail a time-bound operator on the token.
  const quarterEnd = (await ethers.provider.getBlock("latest")).timestamp + 90 * 24 * 3600;
  await token.connect(safe).setOperator(await rail.getAddress(), quarterEnd);

  return {
    nox, token, rail,
    quarterEnd,
    signers: { deployer, safe, treasurer, dev, designer, writer, ops, advisor, auditor, officer, stranger },
    recipients: [dev, designer, writer, ops, advisor],
  };
}

module.exports = {
  NOX_LOCAL,
  TEE_UINT256,
  RosterStatus,
  installMockNox,
  makeInputHandle,
  makeProof,
  encryptInputs,
  deployRailFixture,
};
