import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

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

    it("should deposit tokens using depositWithMetaTx (permit + deposit in one transaction)", async function () {
        const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

        // Transfer tokens to the user
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));

        // Generate the permit signature for approval
        const amount = ethers.parseEther("500");
        const deadline = (await time.latest()) + 60 * 60; // 1 hour from now

        // Get domain separator and nonce
        const domain = {
            name: await tmkoc.name(),
            version: "1",
            chainId: await ethers.provider.getNetwork().then((n) => n.chainId),
            verifyingContract: await tmkoc.getAddress(),
        };

        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        };

        const nonce = await tmkoc.nonces(user.address);

        const permitData = {
            owner: user.address,
            spender: await vault.getAddress(),
            value: amount,
            nonce: nonce,
            deadline: deadline,
        };

        // User signs the permit message
        const signature = await user.signTypedData(domain, types, permitData);
        const { v, r, s } = ethers.Signature.from(signature);

        // Call depositWithMetaTx from the relayer
        await vault
            .connect(trustedSigner)
            .depositWithMetaTx(user.address, amount, deadline, v, r, s);

        // Check vault balance after deposit
        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        expect(vaultBalanceAfterDeposit).to.equal(amount);

        // Check user balance after deposit
        const userBalanceAfterDeposit = await tmkoc.balanceOf(user.address);
        expect(userBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
    });

});
