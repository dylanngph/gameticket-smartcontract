import * as dotenv from "dotenv";

// import "@nomiclabs/hardhat-ethers";
// import "@nomiclabs/hardhat-etherscan";
// import "@nomiclabs/hardhat-waffle";
// import "@openzeppelin/hardhat-upgrades";
// import "@typechain/hardhat";
// import "hardhat-gas-reporter";
// import "hardhat-log-remover";
// import "solidity-coverage";
import "hardhat-abi-exporter";
import {HardhatUserConfig, task} from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import {getDeployerPrivateKey, NETWORK_CONFIG} from "./network.config";

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
        version: "0.8.9",
        settings: {
            optimizer: {
                enabled: true,
                runs: 1000000,
            },
        },
    },
    networks: {
        // hardhat: {
        //   initialBaseFeePerGas: 0,
        //   forking: {
        //     url: "https://rpc.ankr.com/bsc",
        //     // blockNumber: 18929615,
        //   },
        // },
        bscTestnet: {
            chainId: 97,
            url: NETWORK_CONFIG["97"].rpc,
            accounts: [getDeployerPrivateKey()],
        },
    },
    gasReporter: {
        // enabled: process.env.REPORT_GAS !== undefined,
        enabled: true,
        currency: "USD",
        gasPrice: 5,
        token: "BNB",
        gasPriceApi: "https://api.bscscan.com/api?module=proxy&action=eth_gasPrice",
    },
    etherscan: {
        apiKey: {
            bscTestnet: NETWORK_CONFIG["97"].scanApiKey!,
        },
    },
    abiExporter: {
        runOnCompile: true,
        flat: true,
    },
    typechain: {
        outDir: "types",
    },
};

export default config;
