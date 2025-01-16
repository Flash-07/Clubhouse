import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TMKOCModule = buildModule("TMKOCModule", (m) => {
  // Specify the contract to deploy
  const tmkoc = m.contract("TaarakMehtaKaOoltahChashmash", [
    "Taarak Mehta Ka Ooltah Chashmah", // Name of the token
    "TMKOC",                           // Symbol of the token
    "1000000000000000000000000",        // Total supply (1 million tokens with 18 decimals)
  ]);

  return { tmkoc };
});

export default TMKOCModule;
