// makes one wallet per role for the testnet demo, saves the keys to .env and sends each some POL
const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

const ROLES = ["PRODUCER", "DISTRIBUTOR", "RETAILER", "REGULATOR", "ORACLE"];
const AMOUNT = "0.08";

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  const envFile = path.join(__dirname, "../.env");
  console.log("Funding from", deployer.address);

  for (const name of ROLES) {
    let key = process.env[`${name}_KEY`];
    // only make a new wallet if this role does not have one yet
    if (!key) {
      const wallet = hre.ethers.Wallet.createRandom();
      key = wallet.privateKey;
      fs.appendFileSync(envFile, `${name}_KEY=${key}\n${name}_ADDRESS=${wallet.address}\n`);
    }
    const address = new hre.ethers.Wallet(key).address;
    const tx = await deployer.sendTransaction({ to: address, value: hre.ethers.parseEther(AMOUNT) });
    await tx.wait();
    console.log(`${name}: ${address} got ${AMOUNT} POL`);
  }
  console.log("Keys saved in .env");
}

main().catch((err) => {
  console.error(err);
  process.exitCode = 1;
});
