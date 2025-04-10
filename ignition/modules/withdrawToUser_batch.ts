import { ethers } from "ethers";
import * as fs from "fs";
import * as path from "path";
import dotenv from "dotenv";

// Optional .env (if needed)
dotenv.config();

// ✅ Correct path to appsettings.json (relative to this script's location)
const configPath = path.resolve(__dirname, "appsettings.json");
const winnersPath = path.resolve(__dirname, "winners.json");

if (!fs.existsSync(configPath)) {
    throw new Error(`❌ Missing appsettings.json at: ${configPath}`);
}

if (!fs.existsSync(winnersPath)) {
    throw new Error(`❌ winners.json not found at ${winnersPath}`);
}

// Load from config
const configFile = fs.readFileSync(configPath, "utf-8");
const config = JSON.parse(configFile);

const PRIVATE_KEY = config.Wallet?.PrivateKey || process.env.WALLET_PRIVATE_KEY;
const CONTRACT_ADDRESS = config.ClubhouseContractAddress || "0xdce77344d59fEF3f96587eA6244674CcEa21d2B9";
const RPC_URL = config.RPC_URL || process.env.RPC_URL || "https://rpc-amoy.polygon.technology";

if (!PRIVATE_KEY) throw new Error("❌ Private key is missing in appsettings.json");
if (!CONTRACT_ADDRESS) throw new Error("❌ Contract address is missing in config");

const ABI = [
    "function withdrawToUser(address recipient, uint256 amount) external",
    "function estimateGas() view returns (uint256)"
];

// Load winners from JSON
const winnersFile = fs.readFileSync(winnersPath, "utf-8");
const winners: { address: string; amount: string }[] = JSON.parse(winnersFile);

// Toggle actual execution (true = send, false = dry run)
const EXECUTE_TRANSACTIONS = false;
const BATCH_SIZE = 50;
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

    // let totalGasUsed = BigNumber.from(0);
    let totalGasUsed = 0n; // ✅ native bigint

    for (let i = 0; i < winners.length; i += BATCH_SIZE) {
        const batch = winners.slice(i, i + BATCH_SIZE);
        console.log(`\n📦 Processing batch ${i / BATCH_SIZE + 1} (${batch.length} winners)`);

        for (const winner of batch) {
            const recipient = winner.address;
            const amount = ethers.parseUnits(winner.amount, DECIMALS);

            try {

                const estimatedGas: bigint = await contract.getFunction("withdrawToUser").estimateGas(recipient, amount);
                const gasCost = estimatedGas * gasPrice;
                totalGasUsed += estimatedGas;

                console.log(`→ ${recipient} | ${winner.amount} TMKOC | Est. Gas: ${estimatedGas} | Cost: ${ethers.formatUnits(gasCost, "ether")} MATIC`);

                if (EXECUTE_TRANSACTIONS) {
                    const tx = await contract.withdrawToUser(recipient, amount);
                    console.log(`🚀 Tx sent: ${tx.hash}`);
                    const receipt = await tx.wait();
                    console.log(`✅ Confirmed in block ${receipt.blockNumber}`);
                }

            } catch (err) {
                console.error(`❌ Error with ${recipient}:`, err);
            }
        }
    }

    const totalCostMatic = ethers.formatUnits(totalGasUsed * gasPrice, "ether");

    console.log("\n🧾 Total Estimated Gas:", totalGasUsed.toString());
    console.log("💰 Estimated Total Cost in MATIC:", totalCostMatic);
}

main().catch((err) => {
    console.error("🔥 Script crashed:", err);
    process.exit(1);
});
