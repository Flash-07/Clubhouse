import { buildModule } from "@nomicfoundation/hardhat-ignition/modules";

const TMKOCAndClubhouseModule = buildModule("TMKOCAndClubhouseModule", (m) => {
  // Deploy the TMKOC token contract first
  const tmkoc = m.contract("TaarakMehtaKaOoltahChashmash", [
    "TaarakMehtaKaOoltahChashmah", // Token Name
    "TMKOC",                           // Token Symbol
    "100000000000000000000000000",        // Total Supply (100 million tokens with 18 decimals)
  ]);

  // Deploy the ClubhouseMain contract with the TMKOC contract address
  const clubhouseMain = m.contract("ClubhouseMain", [tmkoc]);

  return { tmkoc, clubhouseMain };
});

export default TMKOCAndClubhouseModule;
