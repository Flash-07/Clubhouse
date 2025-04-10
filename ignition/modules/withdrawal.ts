import { ethers } from "ethers";
import * as fs from "fs";
import dotenv from "dotenv";

// // Load environment variables
// dotenv.config();

// Load the appsettings.json file
const configFile = fs.readFileSync("appsettings.json", "utf-8");
const config = JSON.parse(configFile);

// Ensure private key is provided
// const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
const PRIVATE_KEY = config.Wallet?.PrivateKey;
// const PRIVATE_KEY = "38821a2b7ad1509731acbf67906e883f9966433af6c86ccddb3048c967aafb00";
if (!PRIVATE_KEY) {
    throw new Error("Private key must be provided in the .env file");
}

// Polygon Amoy Testnet RPC URL
const RPC_URL = "https://rpc-amoy.polygon.technology";

// Address of the deployed contract
const CONTRACT_ADDRESS = "0xdce77344d59fEF3f96587eA6244674CcEa21d2B9";
if (!CONTRACT_ADDRESS) throw new Error("Provide a valid contract address!");

// ABI of the ClubhouseMain contract (include only the required function)
const ABI = [
    "function withdrawToUser(address recipient, uint256 amount) external"
];

// Get arguments from the command line
const args = process.argv.slice(2); // Ignore "node" and script name
if (args.length < 2) {
    console.error("Missing arguments! Usage: npx ts-node withdrawToUser.ts <recipient> <amount>");
    process.exit(1);
}

const recipient = args[0]; // First argument: recipient address
const amount = ethers.parseUnits(args[1], 18); // Second argument: amount (converted to 18 decimals)

async function main() {
    console.log("📡 Connecting to Polygon Amoy Testnet...");

    // Initialize provider, wallet, and contract instance
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY as string, provider);
    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);

    console.log(`🚀 Sending withdrawal transaction to ${recipient}...`);

    try {
        const tx = await contract.withdrawToUser(recipient, amount);
        console.log("Transaction sent. Waiting for confirmation...");

        const receipt = await tx.wait();
        console.log(`Transaction confirmed! Tx Hash: ${receipt.hash}`);
    } catch (error) {
        console.error("Error executing transaction:", error);
    }
}

main().catch((error) => {
    console.error("Script failed:", error);
});
