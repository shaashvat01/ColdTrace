// simulated temperature and gps sensor that sends readings to the contract
const { ethers } = require("ethers");
const info = require("../frontend/src/contract.json");

// hardhat test account 5, it gets ORACLE_ROLE in the local deploy
const LOCAL_KEY = "0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba";

const RPC_URL = process.env.RPC_URL || info.rpc;
const KEY = process.env.ORACLE_KEY || LOCAL_KEY;
const PINATA_JWT = process.env.PINATA_JWT;

// usage: node oracle.js <productId> [count] [--breach]
const productId = process.argv[2];
const count = Number(process.argv[3]) || 5;
const breach = process.argv.includes("--breach");

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function random(min, max) {
  return Math.round(min + Math.random() * (max - min));
}

async function uploadToPinata(text, name) {
  const form = new FormData();
  form.append("file", new Blob([text]), name);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: "Bearer " + PINATA_JWT },
    body: form,
  });
  if (!res.ok) throw new Error("Pinata upload failed: " + (await res.text()));
  const data = await res.json();
  return data.IpfsHash;
}

async function main() {
  if (!productId) {
    console.log("usage: node oracle.js <productId> [count] [--breach]");
    return;
  }

  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet = new ethers.Wallet(KEY, provider);
  const contract = new ethers.Contract(info.address, info.abi, wallet);
  console.log("Oracle", wallet.address, "sending", count, "readings for product", productId);

  const product = await contract.getProduct(productId);
  const type = await contract.getProductType(product.productTypeId);
  const min = Number(type.minTemp);
  const max = Number(type.maxTemp);
  console.log("Product type:", type.name, "range", min / 10, "to", max / 10, "C");

  // start near phoenix and drift a bit each reading
  let lat = 33.4484;
  let lon = -112.074;
  const log = [];

  for (let i = 0; i < count; i++) {
    let temp = random(min, max);
    // put one bad reading in the middle when --breach is passed
    if (breach && i === Math.floor(count / 2)) temp = max + random(10, 40);

    lat += 0.01;
    lon += 0.01;
    const reading = {
      temp: temp,
      latE6: Math.round(lat * 1e6),
      lonE6: Math.round(lon * 1e6),
      measuredAt: Math.floor(Date.now() / 1000),
    };

    const tx = await contract.recordCondition(productId, reading);
    await tx.wait();
    const bad = temp < min || temp > max;
    console.log(`reading ${i + 1}: ${temp / 10} C at ${lat.toFixed(4)}, ${lon.toFixed(4)}${bad ? "  BREACH" : ""}  tx ${tx.hash}`);
    log.push({ ...reading, breach: bad });
    await sleep(1000);
  }

  // full sensor log goes to ipfs, only the cid and hash go on chain
  if (!PINATA_JWT) {
    console.log("PINATA_JWT not set, skipping sensor log upload");
    return;
  }
  const text = JSON.stringify({ productId: Number(productId), readings: log }, null, 2);
  const cid = await uploadToPinata(text, `sensor-log-${productId}.json`);
  const hash = ethers.keccak256(ethers.toUtf8Bytes(text));
  const tx = await contract.attachDocument(productId, 1, cid, hash);
  await tx.wait();
  console.log("Sensor log uploaded to IPFS:", cid);
  console.log("Anchored on chain, tx", tx.hash);
}

main().catch((e) => {
  // show the contract error name like ProductClosed if there is one
  const parsed = e.data ? new ethers.Interface(info.abi).parseError(e.data) : null;
  console.error("Error:", parsed ? parsed.name : e.shortMessage || e.message);
  process.exitCode = 1;
});
