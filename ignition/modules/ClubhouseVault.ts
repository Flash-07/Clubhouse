import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const ClubhouseMainModule = buildModule("ClubhouseMainModule", (m) => {

    // Define the token address parameter to be passed during deployment
    const tokenAddress = m.getParameter("tokenAddress", "0x5FbDB2315678afecb367f032d93F642f64180aa3");

    // Specify the contract to deploy
    const clubhouseMain = m.contract("ClubhouseVault", [
        [tokenAddress], // Address of TMKOC Token
    ]);

    return { clubhouseMain };
});

export default ClubhouseMainModule;
