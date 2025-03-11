import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

import dotenv from "dotenv";
dotenv.config();

describe("ClubhouseMain", function () {
    /**
     * Deploys and initializes the test environment for ClubhouseVault.
     * Includes the deployment of ERC20 token and ClubhouseVault contracts.
     */
    async function deployFixtures() {
        // Deploy the TMKOC ERC20 token
        const TMKOC = await ethers.getContractFactory("TaarakMehtaKaOoltahChashmash");
        const tmkoc = await TMKOC.deploy("TaarakMehtaKaOoltahChashmah", "TMKOC", ethers.parseEther("1000000"));

        // Deploy the ClubhouseVault contract
        const Vault = await ethers.getContractFactory("ClubhouseMain");
        const vault = await Vault.deploy(tmkoc.getAddress());

        // Retrieve signers for testing
        const [deployer, user, trustedSigner, otherSigner, receiver, owner1, owner2] = await ethers.getSigners();

        // Set the trusted signer for withdrawal validation
        await vault.setTrustedSigner(trustedSigner.address);
        // console.log(`Trusted Signer Set: ${trustedSigner.address}`);

        // Configure multi-sig owners with a minimum of 1 approval
        await vault.setMultiSigOwners([owner1.address, owner2.address], 1);

        return { tmkoc, vault, deployer, user, trustedSigner, otherSigner, receiver, owner1, owner2 };
    }

    it("should deposit tokens, generate a withdraw signature hash, and withdraw with signature", async function () {
        const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

        // Step 1: Transfer tokens to the user
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));

        // Step 2: Approve the vault to spend tokens on behalf of the user
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));

        // Step 3: Deposit tokens into the vault
        // await vault.connect(user).deposit(user.address, ethers.parseEther("500"));
        await vault.connect(user).deposit(ethers.parseEther("500"));

        // Check vault balance after deposit
        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        // console.log("Vault Balance After Deposit: ", vaultBalanceAfterDeposit);
        expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
        // console.log("Vault Address: ", await vault.getAddress());

        // Step 4: Generate the withdrawal signature hash
        const amount = ethers.parseEther("100");
        const nonce = 1;
        const expiry = (await time.latest()) + 60 * 60; // 1 hour from now
        const message = "Withdrawal by user";
        const VaultAddress = await vault.getAddress();

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "string", "uint256"],
            [user.address, amount, message, nonce]
        );
        // console.log("MessageHash: ", messageHash);

        // Step 5: Generate the signature using the trusted signer
        const signature = await trustedSigner.signMessage(ethers.getBytes(messageHash));
        // console.log("Signature: ", signature);
        // console.log("Trusted Address: ", trustedSigner.address);

        // Verify the recovered signer matches the trusted signer
        const recoveredTrustedSigner = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature
        );
        // console.log("Recovered Trusted Signer : ", recoveredTrustedSigner);

        // Step 6: Call withdrawWithSignature to withdraw the tokens
        await vault
            .connect(user)
            .withdrawWithSignature(user.address, amount, nonce, message, expiry, signature);

        // Verify user balance after withdrawal
        const userBalance = await tmkoc.balanceOf(user.address);
        expect(userBalance).to.equal(ethers.parseEther("600"));

        // Verify vault balance after withdrawal
        const vaultBalance = await tmkoc.balanceOf(vault.getAddress());
        expect(vaultBalance).to.equal(ethers.parseEther("400"));
    });

    it("should fail if signature is invalid", async function () {
        const { tmkoc, vault, user, otherSigner } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(ethers.parseEther("500"));

        // Generate an invalid signature using a different signer
        const amount = ethers.parseEther("200");
        const nonce = 2;
        const expiry = (await time.latest()) + 60 * 60; // Expiry set to 1 hour from now
        const message = "Invalid withdrawal test";

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "string", "uint256"],
            [user.address, amount, message, nonce]
        );

        const invalidSignature = await otherSigner.signMessage(ethers.getBytes(messageHash));
        // console.log("Invalid Signature: ", invalidSignature);
        // console.log("OtherSigner Address: ", otherSigner.address);

        // Verify the invalid signature
        const recoveredOtherSigner = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            invalidSignature
        );

        // console.log("Recovered Trusted Signer : ", recoveredOtherSigner);

        // Expect the transaction to revert due to invalid signature
        await expect(
            vault
                .connect(user)
                .withdrawWithSignature(user.address, amount, nonce, message, expiry, invalidSignature)
        ).to.be.revertedWith("Invalid signature");
    });

    it("should prevent withdrawals if the contract is paused", async function () {
        const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(ethers.parseEther("500"));

        // Pause the contract
        await vault.pause();

        // Attempt withdrawal
        const amount = ethers.parseEther("100");
        const nonce = 1;
        const expiry = (await time.latest()) + 60 * 60;
        const message = "Paused withdrawal test";

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "string", "uint256"],
            [user.address, amount, message, nonce]
        );

        const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        const signature = await trustedSigner.signMessage(ethers.getBytes(ethSignedHash));

        // Expect the transaction to revert due to contract pause
        await expect(
            vault
                .connect(user)
                .withdrawWithSignature(user.address, amount, nonce, message, expiry, signature)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });

    it("should deposit tokens, generate a withdrawTournamentFee signature hash, and withdrawTournamentFee with signature", async function () {
        const { tmkoc, vault, user, receiver, owner1, owner2 } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(ethers.parseEther("500"));

        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        // console.log("Vault Balance After Deposit: ", vaultBalanceAfterDeposit);

        expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
        // console.log("Vault Address: ", await vault.getAddress());

        // Collect tournament fees
        await vault.collectTournamentFee(ethers.parseEther("150"));

        // Generate the signature hash for withdrawing tournament fees
        const amount = ethers.parseEther("100");
        const sendTo = receiver.address;

        const VaultAddress = await vault.getAddress();

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "address"],
            [sendTo, amount, VaultAddress]
        );
        // console.log("MessageHash: ", messageHash);

        // Sign the message hash with multi-sig owners
        const signature1 = await owner1.signMessage(ethers.getBytes(messageHash));
        const signature2 = await owner2.signMessage(ethers.getBytes(messageHash));
        // console.log("Signature1: ", signature1, owner1.address);
        // console.log("Signature2: ", signature2, owner2.address);

        // Verify the signatures
        const recoveredSigner1 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature1
        );
        const recoveredSigner2 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature2
        );

        // console.log("Recovered Signer 1: ", recoveredSigner1);
        // console.log("Recovered Signer 2: ", recoveredSigner2);

        // Withdraw tournament fees
        await vault.withdrawTournamentFee(sendTo, amount, [signature1, signature2]);

        // Verify remaining tournament fees
        const remainingTournamentFees = await vault.totalTournamentFees();
        expect(remainingTournamentFees).to.equal(ethers.parseEther("50"));

        // Verify the receiver's balance
        const receiverBalance = await tmkoc.balanceOf(sendTo);
        expect(receiverBalance).to.equal(ethers.parseEther("100"));

        // console.log("Receiver Balance After Withdrawal: ", receiverBalance.toString());
    });

    it("should deposit tokens, generate a emergencyWithdraw signature hash, and emergencyWithdraw with signature", async function () {
        const { tmkoc, vault, user, receiver, owner1, owner2 } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(ethers.parseEther("500"));

        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        // console.log("Vault Balance After Deposit: ", vaultBalanceAfterDeposit);

        expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
        // console.log("Vault Address: ", await vault.getAddress());

        // Generate the signature hash for withdrawing tournament fees
        const amount = ethers.parseEther("100");
        const sendTo = receiver.address;

        const VaultAddress = await vault.getAddress();

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "address"],
            [sendTo, amount, VaultAddress]
        );
        // console.log("MessageHash: ", messageHash);

        // Sign the message hash with multi-sig owners
        const signature1 = await owner1.signMessage(ethers.getBytes(messageHash));
        const signature2 = await owner2.signMessage(ethers.getBytes(messageHash));
        // console.log("Signature1: ", signature1, owner1.address);
        // console.log("Signature2: ", signature2, owner2.address);

        // Verify the signatures
        const recoveredSigner1 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature1
        );
        const recoveredSigner2 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature2
        );

        // console.log("Recovered Signer 1: ", recoveredSigner1);
        // console.log("Recovered Signer 2: ", recoveredSigner2);

        // Withdraw tournament fees
        await vault.emergencyWithdraw(sendTo, amount, [signature1, signature2]);

        // Verify the receiver's balance
        const receiverBalance = await tmkoc.balanceOf(sendTo);
        expect(receiverBalance).to.equal(ethers.parseEther("100"));

        // console.log("Receiver Balance After Withdrawal: ", receiverBalance.toString());
    });

    // it("should deposit tokens using depositWithMetaTx (permit + deposit in one transaction)", async function () {
    //     const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

    //     // ✅ Step 1: Transfer tokens to the user
    //     await tmkoc.transfer(user.address, ethers.parseEther("1000"));

    //     // ✅ Step 2: Fetch latest `nonce`
    //     const nonce = await tmkoc.nonces(user.address);
    //     console.log("Nonce:", nonce.toString());

    //     // ✅ Step 3: Set correct `deadline`
    //     const deadline = Math.floor(Date.now() / 1000) + 3600; // 1 hour from now

    //     // ✅ Step 4: Get `chainId` and `verifyingContract`
    //     const network = await ethers.provider.getNetwork();
    //     const chainId = network.chainId;
    //     const verifyingContract = await tmkoc.getAddress();

    //     console.log("Chain ID:", chainId);
    //     console.log("Verifying Contract:", verifyingContract);

    //     // ✅ Step 5: Define `domain` correctly for ethers v6
    //     const domain = {
    //         name: await tmkoc.name(),
    //         version: "1",
    //         chainId: chainId,
    //         verifyingContract: verifyingContract,
    //     };

    //     // ✅ Step 6: Define correct `Permit` struct for signing
    //     const types = {
    //         Permit: [
    //             { name: "owner", type: "address" },
    //             { name: "spender", type: "address" },
    //             { name: "value", type: "uint256" },
    //             { name: "nonce", type: "uint256" },
    //             { name: "deadline", type: "uint256" },
    //         ],
    //     };

    //     // ✅ Step 7: Set correct values for signing
    //     const permitData = {
    //         owner: user.address,
    //         spender: await vault.getAddress(),
    //         value: ethers.parseEther("500"),
    //         nonce: nonce,
    //         deadline: deadline,
    //     };

    //     console.log("Permit Data:", permitData);

    //     // ✅ Step 8: Generate `signature` using `ethers@6`
    //     const signature = await user.signTypedData(domain, types, permitData);
    //     const { v, r, s } = ethers.Signature.from(signature);

    //     console.log("Signature v:", v);
    //     console.log("Signature r:", r);
    //     console.log("Signature s:", s);

    //     // ✅ Step 9: Verify `recoveredSigner` BEFORE calling `permit`
    //     const recoveredSigner = ethers.verifyTypedData(domain, types, permitData, signature);
    //     console.log("Recovered Signer:", recoveredSigner);
    //     console.log("Expected Signer:", user.address);

    //     // 🚨 Debugging: If `recoveredSigner !== user.address`, stop execution
    //     if (recoveredSigner.toLowerCase() !== user.address.toLowerCase()) {
    //         throw new Error("Signature does not match expected signer! Fix before calling permit.");
    //     }

    //     // ✅ Step 10: Call `depositWithMetaTx`
    //     await vault.connect(trustedSigner).depositWithMetaTx(user.address, permitData.value, deadline, v, r, s);

    //     // ✅ Step 11: Verify Vault balance after deposit
    //     const vaultBalanceAfterDeposit = await tmkoc.balanceOf(await vault.getAddress());
    //     console.log("Vault Balance After Deposit:", vaultBalanceAfterDeposit.toString());
    //     expect(vaultBalanceAfterDeposit).to.equal(permitData.value);

    //     const domainSeparator = await tmkoc.DOMAIN_SEPARATOR();
    //     console.log("DOMAIN_SEPARATOR from Contract:", domainSeparator);
    //     const amount = ethers.parseEther("500");

    //     // ✅ Get nonce BEFORE calling permit
    //     const nonceBefore = await tmkoc.nonces(user.address);
    //     console.log("Nonce Before Permit:", nonceBefore.toString());

    //     const vaultAddress = await vault.getAddress();
    //     console.log("VaultAddress",vaultAddress);

    //     // ✅ Manually compute the exact digest Hardhat signs
    //     const structHash = ethers.solidityPackedKeccak256(
    //         ["bytes32", "address", "address", "uint256", "uint256", "uint256"],
    //         [
    //             ethers.solidityPackedKeccak256(
    //                 ["string"],
    //                 ["Permit(address owner,address spender,uint256 value,uint256 nonce,uint256 deadline)"]
    //             ),
    //             user.address,
    //             vaultAddress,
    //             amount,
    //             nonceBefore, // FIX: Use nonce BEFORE permit()
    //             deadline
    //         ]
    //     );

    //     const expectedDigest = ethers.solidityPackedKeccak256(
    //         ["bytes1", "bytes1", "bytes32", "bytes32"],
    //         ["0x19", "0x01", domainSeparator, structHash]
    //     );

    //     console.log("Expected Digest in Hardhat:", expectedDigest);


    //     // ✅ Step 12: Verify User balance after deposit
    //     const userBalanceAfterDeposit = await tmkoc.balanceOf(user.address);
    //     console.log("User Balance After Deposit:", userBalanceAfterDeposit.toString());
    //     expect(userBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
    // });

    // it("should deposit tokens using depositWithMetaTx (Amoy Testnet)", async function () {
    //     const provider = new ethers.JsonRpcProvider("https://rpc-amoy.polygon.technology");
    //     const wallet = new ethers.Wallet(process.env.WALLET_PRIVATE_KEY!, provider);
    //     console.log("Using Wallet Address:", wallet.address);

    //     // ✅ Fetch Deployed Contracts on Amoy
    //     const TMKOC = await ethers.getContractAt("TaarakMehtaKaOoltahChashmash", "0x554B47F324bf8Dc0e9cCF82B16c2DdA21befFE86", wallet);
    //     const Vault = await ethers.getContractAt("ClubhouseMain", "0xC67f34dfee3A6869cB7CBD15b65914414202623c", wallet);

    //     // ✅ Transfer tokens to user
    //     const user = wallet;
    //     await TMKOC.transfer(user.address, ethers.parseEther("1000"));
    //     console.log("Tokens transferred to user");

    //     // ✅ Generate permit signature
    //     const amount = ethers.parseEther("500");
    //     const deadline = Math.floor(Date.now() / 1000) + 3600;
    //     const nonce = await TMKOC.nonces(user.address);

    //     const domain = {
    //         name: await TMKOC.name(),
    //         version: "1",
    //         chainId: 80002,
    //         verifyingContract: await TMKOC.getAddress(),
    //     };

    //     const types = {
    //         Permit: [
    //             { name: "owner", type: "address" },
    //             { name: "spender", type: "address" },
    //             { name: "value", type: "uint256" },
    //             { name: "nonce", type: "uint256" },
    //             { name: "deadline", type: "uint256" },
    //         ],
    //     };

    //     const permitData = {
    //         owner: user.address,
    //         spender: await Vault.getAddress(),
    //         value: amount,
    //         nonce: nonce,
    //         deadline: deadline,
    //     };

    //     // ✅ Sign the permit
    //     const signature = await user.signTypedData(domain, types, permitData);
    //     const { v, r, s } = ethers.Signature.from(signature);

    //     console.log("Signature v:", v);
    //     console.log("Signature r:", r);
    //     console.log("Signature s:", s);

    //     // ✅ Call depositWithMetaTx
    //     await Vault.connect(wallet).depositWithMetaTx(user.address, amount, deadline, v, r, s);

    //     // ✅ Verify vault balance
    //     const vaultBalanceAfterDeposit = await TMKOC.balanceOf(await Vault.getAddress());
    //     console.log("Vault Balance After Deposit:", vaultBalanceAfterDeposit.toString());

    //     expect(vaultBalanceAfterDeposit).to.equal(amount);
    // });

    // it("should execute permit separately and update allowance", async function () {
    //     const { tmkoc, vault, user } = await deployFixtures();

    //     // Transfer tokens to the user
    //     await tmkoc.transfer(user.address, ethers.parseEther("1000"));

    //     // Generate the permit signature for approval
    //     const amount = ethers.parseEther("500");
    //     const deadline = (await time.latest()) + 60 * 60; // 1 hour from now

    //     // Get domain separator and nonce
    //     const domain = {
    //         name: await tmkoc.name(),
    //         version: "1",
    //         chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
    //         verifyingContract: await tmkoc.getAddress(),
    //     };

    //     const types = {
    //         Permit: [
    //             { name: "owner", type: "address" },
    //             { name: "spender", type: "address" },
    //             { name: "value", type: "uint256" },
    //             { name: "nonce", type: "uint256" },
    //             { name: "deadline", type: "uint256" },
    //         ],
    //     };

    //     const nonce = await tmkoc.nonces(user.address);

    //     const permitData = {
    //         owner: user.address,
    //         spender: await vault.getAddress(),
    //         value: amount,
    //         nonce: nonce,
    //         deadline: deadline,
    //     };

    //     // Check Allowance Before Permit
    //     const allowanceBefore = await tmkoc.allowance(user.address, vault.getAddress());
    //     console.log("Allowance Before Permit: ", allowanceBefore.toString());

    //     // User signs the permit message
    //     const signature = await user.signTypedData(domain, types, permitData);
    //     const { v, r, s } = ethers.Signature.from(signature);

    //     // ✅ Manually Call `permit` Before `depositWithMetaTx`
    //     await tmkoc.connect(user).permit(
    //         user.address,
    //         vault.getAddress(),
    //         amount,
    //         deadline,
    //         v, r, s
    //     );

    //     // Check Allowance After Permit
    //     const allowanceAfter = await tmkoc.allowance(user.address, vault.getAddress());
    //     console.log("Allowance After Permit: ", allowanceAfter.toString());

    //     // Expect allowance to be updated
    //     expect(allowanceAfter).to.equal(amount);
    // });    

});
