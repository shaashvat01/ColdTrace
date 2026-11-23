import { useState } from "react";
import { send } from "../chain.js";

function Regulator({ contract }) {
  const [id, setId] = useState("");
  const [reason, setReason] = useState("");
  const [msg, setMsg] = useState("");

  function certify() {
    send(setMsg, () => contract.certify(id));
  }

  function recall() {
    send(setMsg, () => contract.recall(id, reason));
  }

  return (
    <div className="box">
      <h2>Regulator</h2>
      <input placeholder="Product ID" value={id} onChange={(e) => setId(e.target.value)} />
      <button onClick={certify}>Certify</button>
      <br />
      <input placeholder="Recall reason" value={reason} onChange={(e) => setReason(e.target.value)} />
      <button className="red" onClick={recall}>Recall</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default Regulator;
