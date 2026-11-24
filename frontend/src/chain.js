import { ethers } from "ethers";
import info from "./contract.json";

export const ROLES = ["PRODUCER", "DISTRIBUTOR", "RETAILER", "REGULATOR", "ORACLE"];
export const STATUS = ["Created", "Shipped", "InStorage", "Delivered"];
export const DOCS = ["Certificate", "SensorLog", "Photo", "Other"];

export const deployed = info.address !== "";

// connects metamask and returns the contract with a signer
export async function connect() {
  if (!window.ethereum) throw new Error("MetaMask is not installed");
  const provider = new ethers.BrowserProvider(window.ethereum);
  await provider.send("eth_requestAccounts", []);
  const net = await provider.getNetwork();
  if (Number(net.chainId) !== info.chainId) throw new Error("Switch MetaMask to chain id " + info.chainId);
  const signer = await provider.getSigner();
  return new ethers.Contract(info.address, info.abi, signer);
}

// read only contract for the public product page
export function readOnly() {
  const provider = new ethers.JsonRpcProvider(info.rpc);
  return new ethers.Contract(info.address, info.abi, provider);
}

export async function getRoles(contract, account) {
  const list = [];
  if (await contract.hasRole(ethers.ZeroHash, account)) list.push("ADMIN");
  for (const r of ROLES) {
    if (await contract.hasRole(ethers.id(r + "_ROLE"), account)) list.push(r);
  }
  return list;
}

// there is no type count in the contract so keep reading until it reverts
export async function getTypes(contract) {
  const list = [];
  for (let i = 1; ; i++) {
    try {
      const t = await contract.getProductType(i);
      list.push({ id: i, name: t.name, min: t.minTemp, max: t.maxTemp });
    } catch {
      break;
    }
  }
  return list;
}

const iface = new ethers.Interface(info.abi);

// turns the revert data into the contract error name like NotCustodian
export function errMsg(e) {
  if (e.revert) return e.revert.name;
  // ethers and metamask put the revert data in different places
  const list = [e.data, e.error?.data?.data, e.error?.data, e.info?.error?.data?.data, e.info?.error?.data];
  const data = list.find((d) => typeof d === "string" && d.startsWith("0x"));
  if (data) {
    const parsed = iface.parseError(data);
    if (parsed) return parsed.name;
  }
  return e.shortMessage || e.message;
}

// the public amoy rpc only allows 10000 blocks per log query so ask in pieces
export async function getReadings(contract, id) {
  const latest = await contract.runner.provider.getBlockNumber();
  const ranges = [];
  for (let from = info.block; from <= latest; from += 9000) {
    ranges.push([from, Math.min(from + 8999, latest)]);
  }
  const all = [];
  // 10 pieces at a time so the rpc does not block us
  for (let i = 0; i < ranges.length; i += 10) {
    const part = ranges.slice(i, i + 10).map((r) => contract.queryFilter(contract.filters.ConditionRecorded(id), r[0], r[1]));
    for (const logs of await Promise.all(part)) all.push(...logs);
  }
  return all.map((l) => l.args);
}

// sends a tx and shows progress in the message box
export async function send(setMsg, call) {
  try {
    setMsg("Confirm in MetaMask...");
    const tx = await call();
    setMsg("Pending " + tx.hash);
    await tx.wait();
    setMsg("Done: " + tx.hash);
    return true;
  } catch (e) {
    setMsg("Error: " + errMsg(e));
    return false;
  }
}

// temps are stored in tenths of a degree
export function toC(t) {
  return (Number(t) / 10).toFixed(1) + " C";
}

export function short(addr) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export function date(ts) {
  return new Date(Number(ts) * 1000).toLocaleString();
}
