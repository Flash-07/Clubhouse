import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

dotenv.config();

const configPath = path.resolve(__dirname, "appsettings.json");
const winnersPath = path.resolve(__dirname, "winners.json");

if (!fs.existsSync(configPath)) throw new Error(`❌ Missing appsettings.json at: ${configPath}`);
if (!fs.existsSync(winnersPath)) throw new Error(`❌ winners.json not found at ${winnersPath}`);

const configFile = fs.readFileSync(configPath, "utf-8");
const config = JSON.parse(configFile);

const PRIVATE_KEY = config.Wallet?.PrivateKey || process.env.WALLET_PRIVATE_KEY;
const CONTRACT_ADDRESS = config.ClubhouseContractAddress;
const RPC_URL = config.RPC_URL || process.env.RPC_URL;

if (!PRIVATE_KEY) throw new Error("❌ Private key is missing in appsettings.json");
if (!CONTRACT_ADDRESS) throw new Error("❌ Contract address is missing in config");

const ABI = [
    "function batchWithdrawToUsers(address[] calldata recipients, uint256[] calldata amounts) external",
];

const winnersFile = fs.readFileSync(winnersPath, "utf-8");
const winners: { address: string; amount: string }[] = JSON.parse(winnersFile);

const EXECUTE_TRANSACTIONS = true; // set to true to actually send
const BATCH_SIZE = 100;
const DECIMALS = 18;

async function main() {
    console.log("🔌 Connecting to Polygon Amoy...");

    const provider = new ethers.JsonRpcProvider(RPC_URL);
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    const signerAddress = await wallet.getAddress();

    const contract = new ethers.Contract(CONTRACT_ADDRESS, ABI, wallet);
    const gasPrice: bigint = BigInt(await provider.send("eth_gasPrice", []));

    console.log("🔐 Using signer:", signerAddress);
    console.log("⛽ Current Gas Price:", ethers.formatUnits(gasPrice, "gwei"), "gwei");

    let totalGasUsed = 0n; // ✅ native bigint

    for (let i = 0; i < winners.length; i += BATCH_SIZE) {
        const batch = winners.slice(i, i + BATCH_SIZE);
        const recipientAddresses = batch.map(w => w.address);
        const amounts = batch.map(w => ethers.parseUnits(w.amount, DECIMALS));

        console.log(`\n📦 Processing batch ${i / BATCH_SIZE + 1} with ${batch.length} users`);
        console.log("Recipients:", recipientAddresses);
        console.log("Amounts:", amounts.map(a => a.toString()));

        if (EXECUTE_TRANSACTIONS) {
            try {
                const estimatedGas: bigint = await contract.getFunction("batchWithdrawToUsers").estimateGas(recipientAddresses, amounts);
                const gasCost = estimatedGas * gasPrice;
                totalGasUsed += estimatedGas;

                console.log(`→ ${recipientAddresses} | ${amounts} TMKOC | Est. Gas: ${estimatedGas} | Cost: ${ethers.formatUnits(gasCost, "ether")} MATIC`);

                const tx = await contract.batchWithdrawToUsers(recipientAddresses, amounts);
                console.log(`🚀 Tx sent: ${tx.hash}`);
                const receipt = await tx.wait();
                console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
            } catch (err) {
                console.error("❌ Batch transaction failed:", err);
            }
        } else {
            console.log("🧪 Dry run complete. No transaction sent.");
        }
    }
}

main().catch((err) => {
    console.error("🔥 Script crashed:", err);
    process.exit(1);
});
