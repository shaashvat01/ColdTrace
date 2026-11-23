import { useEffect, useState } from "react";
import { getTypes, send, toC } from "../chain.js";

function Producer({ contract }) {
  const [types, setTypes] = useState([]);
  const [typeId, setTypeId] = useState("1");
  const [batch, setBatch] = useState("");
  const [cid, setCid] = useState("");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    getTypes(contract).then(setTypes);
  }, [contract]);

  function register() {
    send(setMsg, () => contract.registerProduct(batch, cid, typeId));
  }

  return (
    <div className="box">
      <h2>Producer: register batch</h2>
      <input placeholder="Batch ID e.g. LOT-001" value={batch} onChange={(e) => setBatch(e.target.value)} />
      <input placeholder="Metadata CID (optional)" value={cid} onChange={(e) => setCid(e.target.value)} />
      <select value={typeId} onChange={(e) => setTypeId(e.target.value)}>
        {types.map((t) => (
          <option key={t.id} value={t.id}>{t.name} ({toC(t.min)} to {toC(t.max)})</option>
        ))}
      </select>
      <button onClick={register}>Register</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default Producer;
