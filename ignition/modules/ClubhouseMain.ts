import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClubhouseMainModule = buildModule("ClubhouseMainModule", (m) => {

    // Specify the contract to deploy
    const clubhouseMain = m.contract("ClubhouseMain", [
        "0x554B47F324bf8Dc0e9cCF82B16c2DdA21befFE86"
    ]);

    return { clubhouseMain };
});

export default ClubhouseMainModule;

