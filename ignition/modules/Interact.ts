import * as hre from "hardhat";
// import { getWallet } from "./utils";
import { ethers } from "ethers";
import dotenv from "dotenv";

// Load env file
dotenv.config();

//Private key
const PRIVATE_KEY = process.env.PRIVATE_KEY; // Never share your private key
if (!PRIVATE_KEY) {
    throw new Error("Private key must be provided");
}

// Address of the contract to interact with
const CONTRACT_ADDRESS = "0xA9Bb779d5b0267c16B54CB65b6AF921D63507D8A";
console.log("Interacting contract: ", CONTRACT_ADDRESS)
if (!CONTRACT_ADDRESS) throw "⛔️ Provide address of the contract to interact with!";

// Function to create a wallet from a private key
function getWallet() {
    return new ethers.Wallet("PRIVATE_KEY", ethers.getDefaultProvider());
}

// An example of a script to interact with the contract
export default async function interactWithContract() {
  console.log(`Running script to interact with contract ${CONTRACT_ADDRESS}`);

  // Load wallet for contract interaction
  const wallet = getWallet();
  const walletAddress = await wallet.getAddress(); // Get the wallet address
  console.log("Wallet address:", walletAddress);

  // Load compiled contract info
  const contractArtifact = await hre.artifacts.readArtifact("TaarakMehtaKaOoltahChashmash");
  console.log("Contract ABI:", contractArtifact.abi);

  // Initialize contract instance for interaction
  const tokenContract = new ethers.Contract(
    CONTRACT_ADDRESS,
    contractArtifact.abi,
    wallet // Interact with the contract on behalf of this wallet
  );

  console.log("tokenContract initialized:", tokenContract.address);

  // // Check the balance of the wallet before the transfer
  // const walletAddress = await wallet.getAddress();
  // try {
  //   const balanceBefore = await tokenContract.balanceOf(walletAddress);
  //   console.log(`Current balance of ${walletAddress}: ${ethers.formatUnits(balanceBefore, 18)} tokens`);
  // } catch (error) {
  //   console.error("Error fetching balance:", error);
  // }

  // Define recipient address and amount of tokens to transfer
  const recipientAddress = "0x8E2E982c3066c3427B9FaddeA4b78a55346DC52A"; // Replace with recipient address
  const transferAmount = ethers.parseUnits("1000", 18); // 1000 tokens to transfer (adjust decimals if needed)

  // Convert BigInt to string
  const transferAmountString = transferAmount.toString();
  console.log("transferAmountString", transferAmountString);

  // // Execute the transfer
  // const transferTx = await tokenContract.transfer(recipientAddress, transferAmountString);
  // console.log(`Transaction hash of token transfer: ${transferTx.hash}`);

  // // Wait until the transaction is processed
  // await transferTx.wait();

  // Execute the transfer
  try {
    const transferTx = await tokenContract.transfer(recipientAddress, transferAmount);
    console.log(`Transaction hash of token transfer: ${transferTx.hash}`);

    // Wait until the transaction is processed
    await transferTx.wait();

    // // Check the balance of the wallet after the transfer
    // const balanceAfter = await tokenContract.balanceOf(walletAddress);
    // console.log(`Balance of ${walletAddress} after transfer: ${ethers.formatUnits(balanceAfter, 18)} tokens`);
  } catch (error) {
    console.error("Error during transfer:", error);
  }

  // // Check the balance of the wallet after the transfer
  // const balanceAfter = await tokenContract.balanceOf(walletAddress);
  // console.log(`Balance of ${walletAddress} after transfer: ${ethers.formatUnits(balanceAfter, 18)} tokens`);
  // Check the balance of the wallet after the transfer
}

// Ensure the function is called when the script is executed
interactWithContract().catch((error) => {
  console.error("Error interacting with the contract:", error);
  process.exit(1);
});