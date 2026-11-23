import { ethers } from "ethers";
import info from "./contract.json";

export const ROLES = ["PRODUCER", "DISTRIBUTOR", "RETAILER", "REGULATOR", "ORACLE"];
export const STATUS = ["Created", "Shipped", "InStorage", "Delivered"];
export const DOCS = ["Certificate", "SensorLog", "Photo", "Other"];

export const deployed = info.address !== "";
export const startBlock = info.block;

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
  if (e.data) {
    const parsed = iface.parseError(e.data);
    if (parsed) return parsed.name;
  }
  return e.shortMessage || e.message;
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
