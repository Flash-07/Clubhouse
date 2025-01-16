import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@matterlabs/hardhat-zksync";

// Load environment variables from a .env file
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  networks: {
    hardhat: {      
    },
    // zkSync Sepolia Testnet Configuration
    zkSyncSepoliaTestnet: {
      url: "https://sepolia.era.zksync.dev", // zkSync Sepolia RPC URL
      ethNetwork: "sepolia",
      zksync: true,
      verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
      // accounts: [process.env.ZKSYNC_PRIVATE_KEY as string],
    },

    zkSyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      zksync: true,
      verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },

    polygon_amoy: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: [process.env.WALLET_PRIVATE_KEY ?? ""],
    },
  },

  etherscan: {
    apiKey: process.env.POLYGONSCAN_API_KEY
  },

  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled:true
  },

  solidity: {
    compilers: [
      {
        version: "0.8.0",
      },
      {
        version: "0.8.28",
      }
    ],
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },

};

export default config;
