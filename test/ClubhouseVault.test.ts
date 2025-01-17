// import { expect } from "chai";
// import { ethers } from "hardhat";
// import { time } from "@nomicfoundation/hardhat-toolbox/network-helpers";

// describe("ClubhouseVault", function () {
//   async function deployFixtures() {
//     // 1. Deploy TMKOC token
//     const TMKOC = await ethers.getContractFactory("TaarakMehtaKaOoltahChashmash");
//     const tmkoc = await TMKOC.deploy("TaarakMehtaKaOoltah", "TMKOC", ethers.parseEther("1000000"));
//     // await tmkoc.deployed();

//     // 2. Deploy ClubhouseVault
//     const Vault = await ethers.getContractFactory("ClubhouseVault");
//     const vault = await Vault.deploy(tmkoc.getAddress());
//     // await vault.deployed();

//     // 3. Grab signers
//     const [deployer, user, trustedSigner] = await ethers.getSigners();

//     // 4. Set the trustedSigner in the vault (owner is deployer by default)
//     await vault.setTrustedSigner(trustedSigner.address);

//     // Return all relevant objects for tests
//     return { tmkoc, vault, deployer, user, trustedSigner };
//   }

//   it("should deposit tokens, generate a withdraw signature hash, and withdraw with signature", async function () {
//     // Use a Hardhat Fixture so each test runs in a clean environment
//     const { tmkoc, vault, deployer, user, trustedSigner } = await deployFixtures();

//     // Step A: Deployer => transfer some tokens to user so user can deposit
//     await tmkoc.transfer(user.address, ethers.parseEther("1000"));

//     // Step B: user approves the vault
//     await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));

//     // Step C: user deposits 500 tokens
//     await vault.connect(user).deposit(user.address, ethers.parseEther("500"));
//     const vaultBalanceAfterDeposit = await vault.contractBalance();
//     expect(vaultBalanceAfterDeposit).to.equal(ethers.parseEther("500"));

//     // Step D: Now user wants to withdraw 100 tokens using signature
//     const amount = ethers.parseEther("100");
//     const nonce = 1;
//     const expiry = (await time.latest()) + 60 * 60; // 1 hour from now

//     // Step E: Off-chain we get the hash from the contract
//     const messageHash = await vault.getWithdrawWithSignatureHash(
//       user.address,
//       amount,
//       nonce,
//       expiry
//     );

//     // Step F: The trustedSigner will sign this hash
//     // In a real scenario, trustedSigner might be a separate wallet
//     const signature = await trustedSigner.signMessage(ethers.encodeBytes32String(messageHash));

//     // Step G: user calls withdrawWithSignature
//     await vault.connect(user).withdrawWithSignature(amount, nonce, expiry, signature);

//     // Step H: confirm user got their 100 tokens back
//     const userBalance = await tmkoc.balanceOf(user.address);
//     expect(userBalance).to.equal(ethers.parseEther("600")); // 500 deposit from deployer + 100 withdrawn?

//     // Check vault balance
//     const vaultBalanceAfterWithdraw = await vault.contractBalance();
//     expect(vaultBalanceAfterWithdraw).to.equal(ethers.parseEther("400"));
//   });

//   it("should fail if signature is invalid", async function () {
//     const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

//     // Transfer + approve + deposit
//     await tmkoc.transfer(user.address, ethers.parseEther("1000"));
//     await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
//     await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

//     // Try to withdraw 200 tokens
//     const amount = ethers.parseEther("200");
//     const nonce = 2;
//     const expiry = (await time.latest()) + 60 * 60;

//     // Suppose user tries to sign themselves, but 'trustedSigner' is different
//     const badSignature = await user.signMessage(
//       ethers.encodeBytes32String(
//         await vault.getWithdrawWithSignatureHash(user.address, amount, nonce, expiry)
//       )
//     );

//     // This should revert because 'signer' won't match the 'trustedSigner'
//     await expect(
//       vault.connect(user).withdrawWithSignature(amount, nonce, expiry, badSignature)
//     ).to.be.revertedWith("Invalid signature");
//   });
// });


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
    const [deployer, user, trustedSigner] = await ethers.getSigners();

    // Set the trustedSigner in the vault
    await vault.setTrustedSigner(trustedSigner.address);

    return { tmkoc, vault, deployer, user, trustedSigner };
  }

  it("should deposit tokens, generate a withdraw signature hash, and withdraw with signature", async function () {
    const { tmkoc, vault, user, trustedSigner } = await deployFixtures();

    // Step 1: Transfer tokens to user
    await tmkoc.transfer(user.address, ethers.parseEther("1000"));

    // Step 2: Approve the vault
    await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));

    // Step 3: Deposit tokens
    await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

    // Step 4: Generate the withdraw signature hash
    const amount = ethers.parseEther("100");
    const nonce = 1;
    const expiry = (await time.latest()) + 60 * 60; // 1 hour from now
    const messageHash = await vault.getWithdrawWithSignatureHash(user.address, amount, nonce, expiry);

    // Step 5: Sign the hash with the trusted signer
    const signature = await trustedSigner.signMessage(arrayify(messageHash));

    // Step 6: Call withdrawWithSignature
    await vault.connect(user).withdrawWithSignature(amount, nonce, expiry, signature);

    // Check user balance
    const userBalance = await tmkoc.balanceOf(user.address);
    expect(userBalance).to.equal(ethers.parseEther("600"));

    // Check vault balance
    const vaultBalance = await vault.contractBalance();
    expect(vaultBalance).to.equal(ethers.parseEther("400"));
  });

  it("should fail if signature is invalid", async function () {
    const { tmkoc, vault, user } = await deployFixtures();

    // Transfer tokens, approve, and deposit
    await tmkoc.transfer(user.address, ethers.parseEther("1000"));
    await tmkoc.connect(user).approve(vault.getAddress(), ethers.parseEther("1000"));
    await vault.connect(user).deposit(user.address, ethers.parseEther("500"));

    // Try invalid signature
    const amount = ethers.parseEther("200");
    const nonce = 2;
    const expiry = (await time.latest()) + 60 * 60;
    const messageHash = await vault.getWithdrawWithSignatureHash(user.address, amount, nonce, expiry);
    const invalidSignature = await user.signMessage(arrayify(messageHash));

    await expect(
      vault.connect(user).withdrawWithSignature(amount, nonce, expiry, invalidSignature)
    ).to.be.revertedWith("Invalid signature");
  });
});

