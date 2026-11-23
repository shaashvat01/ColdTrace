import { useState } from "react";
import { DOCS, send } from "../chain.js";
import { upload, hashFile, hasPinata } from "../ipfs.js";

function AddDoc({ contract }) {
  const [id, setId] = useState("");
  const [type, setType] = useState("0");
  const [cid, setCid] = useState("");
  const [file, setFile] = useState(null);
  const [msg, setMsg] = useState("");

  // file goes to ipfs, only the cid and hash go on chain
  async function attach() {
    if (!file) return setMsg("Pick a file first");
    const hash = await hashFile(file);
    let fileCid = cid;
    if (hasPinata) {
      try {
        setMsg("Uploading to IPFS...");
        fileCid = await upload(file);
        setCid(fileCid);
      } catch (e) {
        return setMsg("Error: " + e.message);
      }
    }
    if (!fileCid) return setMsg("Enter a CID");
    send(setMsg, () => contract.attachDocument(id, type, fileCid, hash));
  }

  return (
    <div className="box">
      <h2>Attach document</h2>
      <input placeholder="Product ID" value={id} onChange={(e) => setId(e.target.value)} />
      <select value={type} onChange={(e) => setType(e.target.value)}>
        {DOCS.map((d, i) => <option key={d} value={i}>{d}</option>)}
      </select>
      {!hasPinata && <input placeholder="IPFS CID" value={cid} onChange={(e) => setCid(e.target.value)} />}
      <input type="file" onChange={(e) => setFile(e.target.files[0])} />
      <button onClick={attach}>{hasPinata ? "Upload and attach" : "Attach"}</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default AddDoc;
