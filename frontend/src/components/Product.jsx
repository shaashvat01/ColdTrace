import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { readOnly, STATUS, DOCS, startBlock, toC, short, date, errMsg } from "../chain.js";
import { check, GATEWAY } from "../ipfs.js";

function Product({ id }) {
  const [p, setP] = useState(null);
  const [type, setType] = useState(null);
  const [history, setHistory] = useState([]);
  const [docs, setDocs] = useState([]);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState("");
  const [checks, setChecks] = useState({});

  // no wallet needed here, consumers just read
  async function load() {
    try {
      const c = readOnly();
      const prod = await c.getProduct(id);
      const t = await c.getProductType(prod.productTypeId);
      const h = await c.getHistory(id);
      const d = await c.getDocuments(id);
      // readings are only in events so rebuild them from the logs
      const logs = await c.queryFilter(c.filters.ConditionRecorded(id), startBlock);
      setType(t);
      setHistory(h);
      setDocs(d);
      setReadings(logs.map((l) => l.args));
      setP(prod);
    } catch (e) {
      setError(errMsg(e));
    }
  }

  async function verify(i, d) {
    setChecks((c) => ({ ...c, [i]: "Checking..." }));
    try {
      const ok = await check(d.cid, d.docHash);
      setChecks((c) => ({ ...c, [i]: ok ? "Match" : "Hash mismatch" }));
    } catch (e) {
      setChecks((c) => ({ ...c, [i]: e.message }));
    }
  }

  useEffect(() => {
    setP(null);
    setError("");
    load();
  }, [id]);

  if (error) return <div className="box"><a href="#/">← Back</a><p className="error">Could not load product #{id}: {error}</p></div>;
  if (!p) return <div className="box">Loading...</div>;

  const s = Number(p.status);

  return (
    <div>
      <a href="#/">← Back</a>

      <div className="box top">
        <div>
          <h1>Batch {p.batchId}</h1>
          <p className="sub">Product #{id} · {type.name} · allowed {toC(type.minTemp)} to {toC(type.maxTemp)}</p>
          <p>
            <span className={"pill s" + s}>{STATUS[s]}</span>
            <span className={p.certified ? "pill good" : "pill gray"}>{p.certified ? "Certified" : "Not certified"}</span>
            <span className={p.breached ? "pill bad" : "pill good"}>{p.breached ? "Temperature breach" : "Temperature OK"}</span>
          </p>
          <p>Producer: {short(p.producer)}</p>
          <p>Current custodian: {short(p.custodian)}</p>
          <p>Registered: {date(p.createdAt)}</p>
        </div>
        <div className="qr">
          <QRCodeSVG value={window.location.href} size={130} />
          <p>Scan to verify</p>
        </div>
      </div>

      <div className="progress">
        {STATUS.map((name, i) => (
          <div key={name} className={i <= s ? "done" : ""}>{name}</div>
        ))}
      </div>

      <div className="box">
        <h2>Custody history</h2>
        <table>
          <thead><tr><th>Status</th><th>Custodian</th><th>Time</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}>
                <td><span className={"pill s" + Number(h.status)}>{STATUS[Number(h.status)]}</span></td>
                <td>{short(h.custodian)}</td>
                <td>{date(h.timestamp)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="box">
        <h2>Sensor readings</h2>
        {readings.length === 0 ? <p className="sub">No readings yet.</p> : (
          <table>
            <thead><tr><th>Temp</th><th>Location</th><th>Time</th><th>Result</th></tr></thead>
            <tbody>
              {readings.map((r, i) => (
                <tr key={i} className={r.breach ? "breach" : ""}>
                  <td>{toC(r.temp)}</td>
                  <td>{(Number(r.latE6) / 1e6).toFixed(4)}, {(Number(r.lonE6) / 1e6).toFixed(4)}</td>
                  <td>{date(r.measuredAt)}</td>
                  <td>{r.breach ? <span className="pill bad">Breach</span> : <span className="pill good">OK</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="box">
        <h2>Documents</h2>
        {docs.length === 0 ? <p className="sub">No documents yet.</p> : (
          <table>
            <thead><tr><th>Type</th><th>CID</th><th>Hash</th><th>Added by</th><th>Verify</th></tr></thead>
            <tbody>
              {docs.map((d, i) => (
                <tr key={i}>
                  <td>{DOCS[Number(d.docType)]}</td>
                  <td><a href={GATEWAY + d.cid.replace("ipfs://", "")} target="_blank">{d.cid}</a></td>
                  <td className="mono">{d.docHash.slice(0, 12)}...</td>
                  <td>{short(d.addedBy)}</td>
                  <td>{checks[i] ? checks[i] : <button onClick={() => verify(i, d)}>Check</button>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default Product;
