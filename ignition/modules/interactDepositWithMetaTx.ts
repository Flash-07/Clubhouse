import { ethers } from "ethers";
import dotenv from "dotenv";

dotenv.config();

const { USER_PRIVATE_KEY, WALLET_PRIVATE_KEY } = process.env;
const RPC_URL="https://rpc-amoy.polygon.technology";
const TMKOC_CONTRACT="0x554B47F324bf8Dc0e9cCF82B16c2DdA21befFE86";
const CLUBHOUSE_CONTRACT="0xdce77344d59fEF3f96587eA6244674CcEa21d2B9";

if (!USER_PRIVATE_KEY || !WALLET_PRIVATE_KEY) {
    throw new Error("Missing environment variables! Ensure .env file is set up correctly.");
}

const provider = new ethers.JsonRpcProvider(RPC_URL);
const userWallet = new ethers.Wallet(USER_PRIVATE_KEY, provider);
const signerWallet = new ethers.Wallet(WALLET_PRIVATE_KEY, provider);

const tmkocAbi = [
    "function name() view returns (string)",
    "function nonces(address owner) view returns (uint256)",
    "function permit(address owner, address spender, uint256 value, uint256 deadline, uint8 v, bytes32 r, bytes32 s)",
    "function allowance(address owner, address spender) view returns (uint256)",
    "function balanceOf(address account) view returns (uint256)",
    "event Transfer(address indexed from, address indexed to, uint256 value)"
];

const clubhouseAbi = [
    "function depositWithMetaTx(address user, uint256 amount, uint256 deadline, uint8 v, bytes32 r, bytes32 s) external",
    "event TokensDeposited(address indexed user, uint256 amount)",
    "event WithdrawalWithSignature(address indexed user, uint256 amount, uint256 nonce)",
    "event TournamentFeesCollected(uint256 amount)",
    "event TournamentFeesWithdrawn(address indexed to, uint256 amount)",
    "event EmergencyWithdrawal(address indexed to, uint256 amount)"
];

// Decode Logs Function
const decodeLogs = async (logs: any, contract: any, abi: any, contractName: any) => {
    console.log(`\nDecoding logs for ${contractName}...`);
    const iface = new ethers.Interface(abi);
    
    logs.forEach((log: any) => {
        if (log.address.toLowerCase() === contract.toLowerCase()) {
            try {
                const parsedLog = iface.parseLog(log);
                if (parsedLog) {
                    console.log(`Event: ${parsedLog.name}`);
                    parsedLog.args.forEach((arg, index) => {
                        console.log(`  - ${parsedLog.fragment.inputs[index].name}: ${arg}`);
                    });
                } else {
                    console.log("Parsed log is null");
                }
            } catch (err) {
                console.error("Log parsing error:", err);
            }
        }
    });
};

const main = async () => {
    try {
        console.log("Initializing contracts...");
        const tmkocToken = new ethers.Contract(TMKOC_CONTRACT, tmkocAbi, userWallet);
        const clubhouse = new ethers.Contract(CLUBHOUSE_CONTRACT, clubhouseAbi, signerWallet);

        const userAddress = await userWallet.getAddress();
        const spender = CLUBHOUSE_CONTRACT;
        const amount = ethers.parseUnits("20", 18); // Adjust decimals as needed
        const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

        console.log(`Fetching nonce for user: ${userAddress}...`);
        const nonce = await tmkocToken.nonces(userAddress);

        console.log(`\nChecking Allowance Before Permit...`);
        const allowanceBeforePermit = await tmkocToken.allowance(userAddress, spender);
        console.log(`🔹 Allowance Before Permit: ${ethers.formatUnits(allowanceBeforePermit, 18)} TMKOC`);

        console.log(`Generating permit signature for amount: ${amount.toString()}...`);
        const tokenName = await tmkocToken.name();
        const domain = {
            name: tokenName,
            version: "1",
            chainId: (await provider.getNetwork()).chainId,
            verifyingContract: TMKOC_CONTRACT,
        };

        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" }
            ]
        };

        const values = {
            owner: userAddress,
            spender: spender,
            value: amount,
            nonce: nonce,
            deadline: deadline
        };

        const signature = await userWallet.signTypedData(domain, types, values);
        const { v, r, s } = ethers.Signature.from(signature);

        console.log("Signature obtained. Submitting depositWithMetaTx transaction...");

        const tx = await clubhouse.depositWithMetaTx(userAddress, amount, deadline, v, r, s);
        console.log("Transaction submitted:", tx.hash);

        console.log(`\nChecking Allowance Before Permit...`);
        const allowanceAfterPermit = await tmkocToken.allowance(userAddress, spender);
        console.log(`🔹 Allowance Before Permit: ${ethers.formatUnits(allowanceAfterPermit, 18)} TMKOC`);

        const receipt = await tx.wait();
        console.log("Transaction confirmed in block:", receipt.blockNumber);
        console.log("\n Transaction Receipt:");
        console.log(`  - From: ${receipt.from}`);
        console.log(`  - To: ${receipt.to}`);
        console.log(`  - Gas Used: ${receipt.gasUsed.toString()}`);
        console.log(`  - Status: ${receipt.status === 1 ? "Success ✅" : "Failed ❌"}`);

        // Decode transaction logs
        await decodeLogs(receipt.logs, TMKOC_CONTRACT, tmkocAbi, "TMKOC Token");
        await decodeLogs(receipt.logs, CLUBHOUSE_CONTRACT, clubhouseAbi, "Clubhouse Vault");
    } catch (error) {
        console.error("Error:", error);
    }
};

main();
