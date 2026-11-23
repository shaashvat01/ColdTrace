import { useState } from "react";
import { ethers } from "ethers";
import { DOCS, send } from "../chain.js";

function AddDoc({ contract }) {
  const [id, setId] = useState("");
  const [type, setType] = useState("0");
  const [cid, setCid] = useState("");
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState("");

  // hash the file in the browser so anyone can check it later
  async function attach() {
    if (!file) return setMsg("Pick a file first");
    const bytes = new Uint8Array(await file.arrayBuffer());
    const hash = ethers.keccak256(bytes);
    send(setMsg, () => contract.attachDocument(id, type, cid, hash));
  }

  return (
    <div className="box">
      <h2>Attach document</h2>
      <input placeholder="Product ID" value={id} onChange={(e) => setId(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {DOCS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
      <input placeholder="IPFS CID" value={cid} onChange={(e) => setCid(e.target.value)} />
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={attach}>Attach</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default AddDoc;
