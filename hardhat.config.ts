import { HardhatUserConfig } from "hardhat/config";
import "@nomicfoundation/hardhat-toolbox";
import "@nomicfoundation/hardhat-verify";
import "@matterlabs/hardhat-zksync";
import "./tasks/generate-docs";

// Load environment variables from a .env file
import * as dotenv from "dotenv";
dotenv.config();

const config: HardhatUserConfig = {
  networks: {
    localhost: {
      url: "http://127.0.0.1:8545"
    },
    hardhat: {
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.WALLET_PRIVATE_KEY || ""],
    },
    polygonMainnet: {
      url: "https://polygon-mainnet.infura.io", // Polygon Mainnet RPC URL
      accounts: [process.env.WALLET_PRIVATE_KEY || ""], // Load private key from environment variable
    },
    zkSyncMainnet: {
      url: "https://mainnet.era.zksync.io",
      ethNetwork: "mainnet",
      zksync: true,
      verifyURL: "https://zksync2-mainnet-explorer.zksync.io/contract_verification",
    },
    optimism: {
      url: `https://optimism-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.WALLET_PRIVATE_KEY || ""],
    },
    arbitrum: {
      url: `https://arbitrum-mainnet.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.WALLET_PRIVATE_KEY || ""],
    },
    bnb: {
      url: `https://bsc-dataseed.binance.org/${process.env.INFURA_API_KEY}`,
      accounts: [process.env.WALLET_PRIVATE_KEY || ""],
    },
    sepolia: {
      url: `https://sepolia.infura.io/v3/${process.env.INFURA_API_KEY}`,
      accounts: {
        mnemonic: "test test test test test test test test test test test junk",
        path: "m/44'/60'/0'/0",
        initialIndex: 0,
        count: 20,
        passphrase: "",
      },
    },
    polygonAmoyTestnet: {
      url: "https://rpc-amoy.polygon.technology",
      accounts: [process.env.WALLET_PRIVATE_KEY || ""],
    },
    // zkSync Sepolia Testnet Configuration
    zkSyncSepoliaTestnet: {
      url: "https://sepolia.era.zksync.dev", // zkSync Sepolia RPC URL
      ethNetwork: "sepolia",
      zksync: true,
      verifyURL: "https://explorer.sepolia.era.zksync.dev/contract_verification",
      // accounts: [process.env.ZKSYNC_PRIVATE_KEY as string],
    },
    somnia: {
      url: "https://dream-rpc.somnia.network",
      accounts: [process.env.WALLET_PRIVATE_KEY || ""], // put dev menomonic or PK here,
    },
  },

  etherscan: {
    customChains: [
      {
        network: "somnia",
        chainId: 50312,
        urls: {
          apiURL: "https://somnia-poc.w3us.site/api",
          browserURL: "https://somnia-poc.w3us.site"
        },
      },
    ],
    apiKey: 
    {
      mainnet: process.env.ETHERSCAN_API_KEY || "",
      polygonAmoy: process.env.POLYGONSCAN_API_KEY || "",
      optimism: process.env.OPTIMISM_API_KEY || "",
      arbitrum: process.env.ARBITRUM_API_KEY || "",
      somnia:  "Somnia-verify-api-key",
    },
  },

  sourcify: {
    // Disabled by default
    // Doesn't need an API key
    enabled: true
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
      outputSelection: {
        "*": {
          "*": [
            "abi",
            "evm.bytecode",
            "evm.deployedBytecode",
            "userdoc",
            "devdoc"
          ],
        },
      },
    },
  },

};

export default config;
