import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClubhouseMainModule = buildModule("ClubhouseMainModule", (m) => {

    // Specify the contract to deploy
    const clubhouseMain = m.contract("ClubhouseMain", [
        "0x369baC795Dd369c6fDE5271A3835afE91536E0EA", // Address of TMKOC Token
    ]);

    return { clubhouseMain };
});

export default ClubhouseMainModule;

