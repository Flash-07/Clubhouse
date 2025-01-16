import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClubhouseVaultModule = buildModule("ClubhouseVaultModule", (m) => {

    // Specify the contract to deploy
    const clubhouseMain = m.contract("ClubhouseVault", [
        "0x5FbDB2315678afecb367f032d93F642f64180aa3", // Address of TMKOC Token
    ]);

    return { clubhouseMain };
});

export default ClubhouseVaultModule;

