// deploys the registry, adds two demo product types and grants roles to demo accounts
const hre = require("hardhat");

const ROLES = ["PRODUCER", "DISTRIBUTOR", "RETAILER", "REGULATOR", "ORACLE"];

async function main() {
  const signers = await hre.ethers.getSigners();
  const admin = signers[0];
  console.log("Deployer / admin:", admin.address);

  const Registry = await hre.ethers.getContractFactory("ProvenanceRegistry");
  const registry = await Registry.deploy(admin.address);
  await registry.waitForDeployment();
  console.log("ProvenanceRegistry:", await registry.getAddress());

  await (await registry.addProductType("Leafy greens", 0, 40)).wait();
  await (await registry.addProductType("Vaccine", 20, 80)).wait();
  console.log("Product types: 1 = Leafy greens (0-4 C), 2 = Vaccine (2-8 C)");

  for (const [i, name] of ROLES.entries()) {
    const account = process.env[`${name}_ADDRESS`] || signers[i + 1]?.address;
    if (!account) {
      console.log(`${name}_ROLE: skipped (set ${name}_ADDRESS to grant it)`);
      continue;
    }
    const role = await registry[`${name}_ROLE`]();
    await (await registry.grantRole(role, account)).wait();
    console.log(`${name}_ROLE ->`, account);
  }
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
