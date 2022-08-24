import * as dotenv from "dotenv";

import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-etherscan";
import "@nomiclabs/hardhat-waffle";
import "@openzeppelin/hardhat-upgrades";
import "@typechain/hardhat";
import "hardhat-abi-exporter";
import "hardhat-gas-reporter";
import "hardhat-log-remover";
import { HardhatUserConfig, task } from "hardhat/config";
import "solidity-coverage";

dotenv.config({
  path: `.env.${process.env.NODE_ENV ? process.env.NODE_ENV : "development"}`,
});

task("accounts", "Prints the list of accounts", async (taskArgs, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

const config: HardhatUserConfig = {
  solidity: {
    version: "0.8.4",
    settings: {
      optimizer: {
        enabled: true,
        runs: 999999,
      },
    },
  },
  networks: {
    hardhat: {
      initialBaseFeePerGas: 0,
      forking: {
        url: "https://bsc-dataseed1.binance.org/",
        // blockNumber: 18929615,
      },
    },
    bsc: {
      url: process.env.BSC_RPC,
      accounts: [process.env.DEPLOYER_PRIVATE_KEY!],
    },
  },
  gasReporter: {
    enabled: process.env.REPORT_GAS !== undefined,
    currency: "USD",
  },
  etherscan: {
    apiKey: process.env.BSCSCAN_API_KEY,
  },
  abiExporter: {
    runOnCompile: true,
    flat: true,
    only: ["Greeter"],
  },
  typechain: {
    outDir: "types",
  },
};

export default config;
