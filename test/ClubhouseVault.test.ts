import { expect } from "chai";
import { ethers } from "hardhat";
import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

/**
 * Converts a `bytes32` or similar hash into a byte array.
 * @param hex The hex string to convert.
 * @returns Uint8Array
 */
function arrayify(hex: string): Uint8Array {
    if (!hex.startsWith("0x") || hex.length !== 66) {
        throw new Error("Invalid bytes32 value");
    }
    return Uint8Array.from(Buffer.from(hex.slice(2), "hex"));
}

describe("ClubhouseVault", function () {
    async function deployFixtures() {
        // Deploy TMKOC token
        const TMKOC = await ethers.getContractFactory("TaarakMehtaKaOoltahChashmash");
        const tmkoc = await TMKOC.deploy("TaarakMehtaKaOoltah", "TMKOC", ethers.parseEther("1000000"));

        // Deploy ClubhouseVault
        const Vault = await ethers.getContractFactory("ClubhouseVault");
        const vault = await Vault.deploy(tmkoc.getAddress());

        // Grab signers
        const [deployer, user, trustedSigner, otherSigner, receiver, owner1, owner2] = await ethers.getSigners();

        // Set the trustedSigner in the vault
        await vault.setTrustedSigner(trustedSigner.address);

        await vault.setMultiSigOwners([owner1.address, owner2.address], 1);

        return { tmkoc, vault, deployer, user, trustedSigner, otherSigner, receiver, owner1, owner2 };
    }

    it("should deposit tokens, generate a withdraw signature hash, and withdraw with signature", async function () {
        const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

        // Step 1: Transfer tokens to user
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));

        // Step 2: Approve the vault
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));

        // Step 3: Deposit tokens
        await vault.connect(user).deposit(user.address, ethers.parseEther("500"));
        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        console.log("Vault Balance After Deposit: ", vaultBalanceAfterDeposit);
        expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
        console.log("Vault Address: ", await vault.getAddress());

        // Step 4: Generate the withdraw signature hash
        const amount = ethers.parseEther("100");
        const nonce = 1;
        const expiry = (await time.latest()) + 60 * 60; // 1 hour from now
        const message = "Withdrawal by user";
        const VaultAddress = await vault.getAddress();
        const user1 = "0xAb8483F64d9C6d1EcF9b849Ae677dD3315835cb2";

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "string", "uint256"],
            [user.address, amount, message, nonce]
        );
        // const messageHash = await vault.getMessageHash(user1, amount, message, nonce);
        console.log("MessageHash: ", messageHash);

        // // Step 5: Sign the hash with the trusted signer
        const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        console.log("Eth Signed Hash: ", ethSignedHash);
        const signature = await trustedSigner.signMessage(ethers.getBytes(ethSignedHash));
        // const signature = await trustedSigner.signMessage(ethers.toBeArray(ethSignedHash));
        console.log("Signature: ", signature);
        console.log("User Address: ", user.address);

        // Step 6: Call withdrawWithSignature
        await vault
            .connect(user)
            .withdrawWithSignature(user.address, amount, nonce, message, expiry, signature);

        // // Check user balance
        const userBalance = await tmkoc.balanceOf(user.address);
        expect(userBalance).to.equal(ethers.parseEther("600"));

        // // Check vault balance
        const vaultBalance = await tmkoc.balanceOf(vault.getAddress());
        expect(vaultBalance).to.equal(ethers.parseEther("400"));
    });

    it("should fail if signature is invalid", async function () {
        const { tmkoc, vault, user, otherSigner } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

        // Try invalid signature
        const amount = ethers.parseEther("200");
        const nonce = 2;
        const expiry = (await time.latest()) + 60 * 60;
        const message = "Invalid withdrawal test";

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "string", "uint256"],
            [user.address, amount, message, nonce]
        );

        // Sign with a different signer
        const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        const invalidSignature = await otherSigner.signMessage(ethers.getBytes(ethSignedHash));

        await vault
            .connect(user)
            .withdrawWithSignature(user.address, amount, nonce, message, expiry, invalidSignature);
    });

    it("should prevent withdrawals if the contract is paused", async function () {
        const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

        // Transfer tokens, approve, and deposit
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
        await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

        // Pause the contract
        await vault.pause();

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

        // Expect revert due to paused contract
        await expect(
            vault
                .connect(user)
                .withdrawWithSignature(user.address, amount, nonce, message, expiry, signature)
        ).to.be.revertedWithCustomError(vault, "EnforcedPause");
    });
    it("should deposit tokens, generate a withdrawTournamentFee signature hash, and withdrawTournamentFee with signature", async function () {
        const { tmkoc, vault, user, trustedSigner, receiver, owner1, owner2 } = await deployFixtures();

        // Step 1: Transfer tokens to user
        await tmkoc.transfer(user.address, ethers.parseEther("1000"));

        // Step 2: Approve the vault
        await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));

        // Step 3: Deposit tokens
        await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

        const vaultBalanceAfterDeposit = await tmkoc.balanceOf(vault.getAddress());
        console.log("Vault Balance After Deposit: ", vaultBalanceAfterDeposit);

        expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));
        console.log("Vault Address: ", await vault.getAddress());

        await vault.collectTournamentFee(ethers.parseEther("150"));

        // Step 4: Generate the withdraw signature hash
        const amount = ethers.parseEther("100");
        const sendTo = receiver.address;
        // const nonce = 1;
        // const expiry = (await time.latest()) + 60 * 60; // 1 hour from now
        // const message = "Withdrawal by user";
        const VaultAddress = await vault.getAddress();

        const messageHash = ethers.solidityPackedKeccak256(
            ["address", "uint256", "address"],
            [sendTo, amount, VaultAddress]
        );
        // const messageHash = await vault.getMessageHash(user1, amount, message, nonce);
        console.log("MessageHash: ", messageHash);

        // // Step 5: Sign the hash with the trusted signer
        // No need to do this 
        // const ethSignedHash = ethers.hashMessage(arrayify(messageHash));
        const ethSignedHash = ethers.hashMessage(ethers.getBytes(messageHash));
        // console.log("Eth Signed Hash: ", ethSignedHash);

        // const signature1 = await owner1.signMessage(arrayify(ethSignedHash));
        // const ethSignedHash = ethers.hashMessage(arrayify(messageHash));
        // const signature1 = await owner1.signMessage(arrayify(ethSignedHash));
        // const signature1 = "0x2e39ec196ebd5d0276f0a98d02e7cb6e4e73c0a76bb00bffc34685320e2223e03fd63b76b0ecfa395ef435984ec28e6a3b73a2c7d2aff6971b34fc4f45ae8aa31b";
        // 0x6fc8bd4e85b978ca7e09416433238b611f5b0580f1493085e19457e5c6fc31f50696ea118eae7a7ad6d8ce5051711fb936d053947cf515c5c6b131456f03a9281b

        // const signature = await trustedSigner.signMessage(ethers.toBeArray(ethSignedHash));
        const signature1 = await owner1.signMessage(ethers.getBytes(messageHash));
        const signature2 = await owner2.signMessage(ethers.getBytes(messageHash));
        console.log("Signature: ", signature1, owner1.address);

        // Verify the signers
        const recoveredSigner1 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature1
        );
        const recoveredSigner2 = ethers.verifyMessage(
            ethers.getBytes(messageHash),
            signature2
        );

        console.log("Recovered Signer 1: ", recoveredSigner1);
        console.log("Recovered Signer 2: ", recoveredSigner2);

        // const signature2 = await owner2.signMessage(arrayify(ethSignedHash));
        // const signature2 = await owner2.signMessage(arrayify(ethSignedHash));
        // const signature2 = "0x4afad5c8bad70c48289fc3e1991bf25aadee3f0fe150be905959aaee7ce4848238311e833e80d0d0a320907e1274d9473dc1b25545ae2b3690fdf910dcd1cc761c"
        // const signature = await trustedSigner.signMessage(ethers.toBeArray(ethSignedHash));
        console.log("Signature2: ", signature2, owner2.address);

        // Step 6: Call withdrawWithSignature
        await vault.withdrawTournamentFee(sendTo, amount, [signature1, signature2]);

        // // // Check user balance
        // const userBalance = await tmkoc.balanceOf(user.address);
        // expect(userBalance).to.equal(ethers.parseEther("600"));

        // // // Check vault balance
        // const vaultBalance = await tmkoc.balanceOf(vault.getAddress());
        // expect(vaultBalance).to.equal(ethers.parseEther("400"));

        // Check if the tournament fees have been deducted
        const remainingTournamentFees = await vault.totalTournamentFees();
        expect(remainingTournamentFees).to.equal(ethers.parseEther("50"));

        // Check if the receiver received the amount
        const receiverBalance = await tmkoc.balanceOf(sendTo);
        expect(receiverBalance).to.equal(ethers.parseEther("100"));

        console.log("Receiver Balance After Withdrawal: ", receiverBalance.toString());
    });

});

