import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClubhouseVaultModule = buildModule("ClubhouseVaultModule", (m) => {

    // Specify the contract to deploy
    const clubhouseMain = m.contract("ClubhouseVault", [
        "0x9ffd281286450cF2b7e20dC057b04cb7eB18D604", // Address of TMKOC Token
    ]);

    return { clubhouseMain };
});

export default ClubhouseVaultModule;

