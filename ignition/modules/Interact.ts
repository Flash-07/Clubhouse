import { ethers } from "ethers";
import dotenv from "dotenv";
import * as hre from "hardhat";

dotenv.config();

// Environment variables
const { WALLET_PRIVATE_KEY } = process.env;
const RPC_URL = "https://rpc-amoy.polygon.technology"; // Polygon Amoy Testnet RPC
const CONTRACT_ADDRESS = "0x554b47f324bf8dc0e9ccf82b16c2dda21beffe86"; // TMKOC Token Contract

if (!WALLET_PRIVATE_KEY) {
    throw new Error("Private key must be provided in the .env file!");
}

if (!CONTRACT_ADDRESS) {
    throw new Error("Contract address must be specified!");
}

// Initialize provider and wallet
const provider = new ethers.JsonRpcProvider(RPC_URL);
const wallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

// Async function to interact with the contract
export default async function interactWithContract() {
    console.log(`Running script to interact with contract ${CONTRACT_ADDRESS}`);

    const walletAddress = await wallet.getAddress();
    console.log("Wallet address:", walletAddress);

    // Load compiled contract info
    const contractArtifact = await hre.artifacts.readArtifact("TaarakMehtaKaOoltahChashmash");

    // Initialize contract instance for interaction
    const tokenContract = new ethers.Contract(CONTRACT_ADDRESS, contractArtifact.abi, wallet);

    console.log("Token contract initialized at:", tokenContract.address);

    // Define recipient address and transfer amount
    const recipientAddress = "0xF0b997a3d3667aa263625a5bD2B0BBd43494a6Ea"; // Replace with recipient
    const transferAmount = ethers.parseUnits("1000", 18); // 10,000 tokens

    console.log("🔹 Transfer Amount:", ethers.formatUnits(transferAmount, 18), "TMKOC");

    try {
        // Execute token transfer
        console.log("Sending transfer transaction...");
        const transferTx = await tokenContract.transfer(recipientAddress, transferAmount);
        console.log(`Transaction submitted: ${transferTx.hash}`);

        // Wait for transaction confirmation
        const receipt = await transferTx.wait();
        console.log(`Transaction confirmed in block: ${receipt.blockNumber}`);

        // Log transaction details
        console.log("\n Transaction Receipt:");
        console.log(`- From: ${receipt.from}`);
        console.log(`- To: ${receipt.to}`);
        console.log(`- Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`- Status: ${receipt.status === 1 ? "Success" : "Failed"}`);
    } catch (error) {
        console.error("Error during transfer:", error);
    }
}

// Run the interaction script
interactWithContract().catch((error) => {
    console.error("Error interacting with the contract:", error);
    process.exit(1);
});
