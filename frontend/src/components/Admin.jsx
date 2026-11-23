import { useState } from "react";
import { ethers } from "ethers";
import { ROLES, send } from "../chain.js";

function Admin({ contract }) {
  const [role, setRole] = useState("PRODUCER");
  const [addr, setAddr] = useState("");
  const [name, setName] = useState("");
  const [min, setMin] = useState("");
  const [max, setMax] = useState("");
  const [msg, setMsg] = useState("");

  function grant() {
    send(setMsg, () => contract.grantRole(ethers.id(role + "_ROLE"), addr));
  }

  function revoke() {
    send(setMsg, () => contract.revokeRole(ethers.id(role + "_ROLE"), addr));
  }

  // user types degrees, contract wants tenths
  function addType() {
    send(setMsg, () => contract.addProductType(name, Math.round(min * 10), Math.round(max * 10)));
  }

  return (
    <div className="box">
      <h2>Admin</h2>
      <h3>Roles</h3>
      <select value={role} onChange={(e) => setRole(e.target.value)}>
        {ROLES.map((r) => <option key={r}>{r}</option>)}
      </select>
      <input placeholder="Address 0x..." value={addr} onChange={(e) => setAddr(e.target.value)} />
      <button onClick={grant}>Grant</button>
      <button onClick={revoke}>Revoke</button>

      <h3>Add product type</h3>
      <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
      <input placeholder="Min temp C" type="number" value={min} onChange={(e) => setMin(e.target.value)} />
      <input placeholder="Max temp C" type="number" value={max} onChange={(e) => setMax(e.target.value)} />
      <button onClick={addType}>Add type</button>
      <p className="msg">{msg}</p>
    </div>
  );
}

export default Admin;
