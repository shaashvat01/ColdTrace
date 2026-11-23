import { useState } from "react";
import { send } from "../chain.js";

function Regulator({ contract }) {
  const [id, setId] = useState("");
  const [msg, setMsg] = useState("");

  function certify() {
    send(setMsg, () => contract.certify(id));
  }

  return (
    <div className="box">
      <h2>Regulator: certify product</h2>
      <input placeholder="Product ID" value={id} onChange={(e) => setId(e.target.value)} />
      <button onClick={certify}>Certify</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default Regulator;
