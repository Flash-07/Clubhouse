import { ethers } from "ethers";
import * as hre from "hardhat";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

// Ensure private key is provided
const PRIVATE_KEY = process.env.WALLET_PRIVATE_KEY;
if (!PRIVATE_KEY) {
    throw new Error("Private key must be provided in the .env file");
}

// Polygon Amoy Testnet RPC URL
const RPC_URL = "https://rpc-amoy.polygon.technology";

// Address of the deployed contract
const CONTRACT_ADDRESS = "0xF0b997a3d3667aa263625a5bD2B0BBd43494a6Ea";
if (!CONTRACT_ADDRESS) throw "⛔️ Provide a valid contract address!";

console.log("📡 Connecting to Polygon Amoy Testnet...");
console.log("📜 Interacting with contract:", CONTRACT_ADDRESS);

// Function to create a wallet with the provider
function getWallet() {
    const provider = new ethers.JsonRpcProvider(RPC_URL);
    return new ethers.Wallet(PRIVATE_KEY!, provider);
}

// Function to interact with the contract
async function interactWithContract() {
    console.log(`🚀 Running script to set the Trusted Signer in contract ${CONTRACT_ADDRESS}`);

    // Load wallet
    const wallet = getWallet();
    const walletAddress = await wallet.getAddress();
    console.log("🔑 Wallet Address:", walletAddress);

    // Load contract ABI
    const contractArtifact = await hre.artifacts.readArtifact("ClubhouseMain");
    console.log("✅ Contract ABI Loaded Successfully.");

    // Initialize contract instance
    const clubhouseMainContract = new ethers.Contract(
        CONTRACT_ADDRESS,
        contractArtifact.abi,
        wallet
    );

    console.log("🏠 Contract Instance Initialized at:", clubhouseMainContract.address);

    // Define the trusted signer address
    const trustedSigner = "0xe0523bE2684bE1C1A759C45f1211b5C744e176ee";

    try {
        console.log(`🔹 Setting Trusted Signer to: ${trustedSigner}...`);

        // Send the transaction to set the trusted signer
        const setTrustedSignerTx = await clubhouseMainContract.setTrustedSigner(trustedSigner, {
            gasLimit: ethers.parseUnits("100000", "wei") // Adjust gas limit if necessary
        });

        console.log(`🔄 Transaction submitted. Hash: ${setTrustedSignerTx.hash}`);

        // Wait for confirmation
        await setTrustedSignerTx.wait();
        console.log("✅ Trusted Signer successfully set!");
    } catch (error) {
        console.error("❌ Error while setting Trusted Signer:", error);
    }
}

// Execute the function
interactWithContract().catch((error) => {
    console.error("❌ Error interacting with the contract:", error);
    process.exit(1);
});
