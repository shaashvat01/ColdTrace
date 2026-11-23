import { ethers } from "ethers";

const JWT = import.meta.env.VITE_PINATA_JWT;
export const GATEWAY = "https://gateway.pinata.cloud/ipfs/";
export const hasPinata = !!JWT;

// uploads a file to pinata and returns its cid
export async function upload(file) {
  const form = new FormData();
  form.append("file", file);
  const res = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: "Bearer " + JWT },
    body: form,
  });
  if (!res.ok) throw new Error("Pinata upload failed");
  const data = await res.json();
  return data.IpfsHash;
}

export async function hashFile(file) {
  return ethers.keccak256(new Uint8Array(await file.arrayBuffer()));
}

// downloads the file from ipfs and checks it matches the hash on chain
export async function check(cid, docHash) {
  const res = await fetch(GATEWAY + cid.replace("ipfs://", ""));
  if (!res.ok) throw new Error("Could not download file");
  const bytes = new Uint8Array(await res.arrayBuffer());
  return ethers.keccak256(bytes) === docHash;
}
