import { useEffect, useState } from "react";
import { STATUS, send } from "../chain.js";

function MyProducts({ contract, account, roles }) {
  const [list, setList] = useState([]);
  const [to, setTo] = useState("");
  const [msg, setMsg] = useState("");

  // goes through every product and keeps the ones I hold
  async function load() {
    const count = Number(await contract.productCount());
    const mine = [];
    for (let i = 1; i <= count; i++) {
      const p = await contract.getProduct(i);
      if (p.custodian.toLowerCase() === account.toLowerCase()) mine.push(p);
    }
    setList(mine);
  }

  useEffect(() => {
    load();
  }, [contract]);

  async function ship(id) {
    if (await send(setMsg, () => contract.transferCustody(id, to))) load();
  }

  async function receive(id) {
    if (await send(setMsg, () => contract.updateStatus(id, 2))) load();
  }

  async function deliver(id) {
    if (await send(setMsg, () => contract.updateStatus(id, 3))) load();
  }

  return (
    <div className="box">
      <h2>Products I hold</h2>
      <input placeholder="Ship to address 0x..." value={to} onChange={(e) => setTo(e.target.value)} />
      <button onClick={load}>Refresh</button>
      <table>
        <thead>
          <tr><th>ID</th><th>Batch</th><th>Status</th><th>Breach</th><th>Actions</th></tr>
        </thead>
        <tbody>
          {list.map((p) => {
            const s = Number(p.status);
            return (
              <tr key={p.id.toString()}>
                <td><a href={"#/product/" + p.id}>{p.id.toString()}</a></td>
                <td>{p.batchId}</td>
                <td>{STATUS[s]}</td>
                <td>{p.breached ? "YES" : "no"}</td>
                <td>
                  {(s === 0 || s === 2) && <button onClick={() => ship(p.id)}>Ship</button>}
                  {s === 1 && <button onClick={() => receive(p.id)}>Confirm receipt</button>}
                  {s === 2 && roles.includes("RETAILER") && <button onClick={() => deliver(p.id)}>Mark delivered</button>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      {list.length === 0 && <p>No products right now.</p>}
      <p className="msg">{msg}</p>
    </div>
  );
}

export default MyProducts;
