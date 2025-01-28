import { task } from "hardhat/config";

task("generate-docs", "Generate userdoc and devdoc for contracts")
  .setAction(async (_, { artifacts }) => {
    console.log("Task started: Generating documentation");

    const artifactPaths = await artifacts.getArtifactPaths();
    console.log(`Found ${artifactPaths.length} artifact(s).`);

    if (artifactPaths.length === 0) {
      console.log("No artifacts found. Please run `npx hardhat compile` first.");
      return;
    }

    for (const path of artifactPaths) {
      console.log(`Processing artifact at path: ${path}`);
      try {
        const artifact = require(path);
        console.log(`Contract Name: ${artifact.contractName || "Unknown"}`);

        if (artifact.userdoc) {
          console.log(`Userdoc for ${artifact.contractName}:`);
          console.log(JSON.stringify(artifact.userdoc, null, 2));
        } else {
          console.log(`No userdoc found for ${artifact.contractName}`);
        }

        if (artifact.devdoc) {
          console.log(`Devdoc for ${artifact.contractName}:`);
          console.log(JSON.stringify(artifact.devdoc, null, 2));
        } else {
          console.log(`No devdoc found for ${artifact.contractName}`);
        }
      } catch (err) {
        console.error(`Error processing artifact at ${path}:`, err);
      }
    }
  });
