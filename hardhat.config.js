require("@nomicfoundation/hardhat-toolbox");
require("solidity-coverage");
require("dotenv").config();

const PK = process.env.DEPLOYER_PRIVATE_KEY || "";
const accounts = PK ? [PK.startsWith("0x") ? PK : "0x" + PK] : [];

/**
 * Solidity settings mirror the proven NoxSend build (solc 0.8.35, optimizer 200, viaIR).
 * The default EVM version for solc 0.8.35 is `cancun`, which the Nox libraries target.
 * The local `hardhat` network (chainId 31337) is where EVERYTHING is built + unit-tested — free,
 * ephemeral, pre-funded. `sepolia` is wired for the funded deploy run only.
 * @type import('hardhat/config').HardhatUserConfig
 */
module.exports = {
  solidity: {
    version: "0.8.35",
    settings: {
      optimizer: { enabled: true, runs: 200 },
      viaIR: true,
    },
  },
  networks: {
    hardhat: { chainId: 31337 },
    localhost: { url: "http://127.0.0.1:8545", chainId: 31337 },
    sepolia: {
      url: process.env.SEPOLIA_RPC_URL || "https://ethereum-sepolia-rpc.publicnode.com",
      accounts,
      chainId: 11155111,
    },
  },
  etherscan: {
    apiKey: process.env.ETHERSCAN_API_KEY || "",
  },
  sourcify: { enabled: false },
};
