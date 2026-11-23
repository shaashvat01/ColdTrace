import { useEffect, useState } from "react";
import { QRCodeSVG } from "qrcode.react";
import { readOnly, STATUS, DOCS, startBlock, toC, short, date, errMsg } from "../chain.js";

function Product({ id }) {
  const [p, setP] = useState(null);
  const [type, setType] = useState(null);
  const [history, setHistory] = useState([]);
  const [docs, setDocs] = useState([]);
  const [readings, setReadings] = useState([]);
  const [error, setError] = useState("");

  // no wallet needed here, consumers just read
  async function load() {
    try {
      const c = readOnly();
      const prod = await c.getProduct(id);
      setP(prod);
      setType(await c.getProductType(prod.productTypeId));
      setHistory(await c.getHistory(id));
      setDocs(await c.getDocuments(id));
      // readings are only in events so rebuild them from the logs
      const logs = await c.queryFilter(c.filters.ConditionRecorded(id), startBlock);
      setReadings(logs.map((l) => l.args));
    } catch (e) {
      setError(errMsg(e));
    }
  }

  useEffect(() => {
    load();
  }, [id]);

  if (error) return <div className="page"><a href="#/">Back</a><p className="error">{error}</p></div>;
  if (!p) return <div className="page">Loading...</div>;

  return (
    <div className="page">
      <a href="#/">Back</a>
      <h1>Product #{id}</h1>

      <div className="box">
        <p>Batch: <b>{p.batchId}</b></p>
        <p>Type: {type.name} (allowed {toC(type.minTemp)} to {toC(type.maxTemp)})</p>
        <p>Status: <b>{STATUS[Number(p.status)]}</b></p>
        <p>Producer: {short(p.producer)} | Custodian: {short(p.custodian)}</p>
        <p>Registered: {date(p.createdAt)}</p>
        <p>
          <span className={p.certified ? "good" : "bad"}>{p.certified ? "Certified" : "Not certified"}</span>{" "}
          <span className={p.breached ? "bad" : "good"}>{p.breached ? "Temperature breach" : "No breach"}</span>
        </p>
        <QRCodeSVG value={window.location.href} size={120} />
      </div>

      <div className="box">
        <h2>Custody history</h2>
        <table>
          <thead><tr><th>Status</th><th>Custodian</th><th>Time</th></tr></thead>
          <tbody>
            {history.map((h, i) => (
              <tr key={i}><td>{STATUS[Number(h.status)]}</td><td>{short(h.custodian)}</td><td>{date(h.timestamp)}</td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="box">
        <h2>Sensor readings</h2>
        <table>
          <thead><tr><th>Temp</th><th>Lat</th><th>Lon</th><th>Time</th><th>Breach</th></tr></thead>
          <tbody>
            {readings.map((r, i) => (
              <tr key={i} className={r.breach ? "bad" : ""}>
                <td>{toC(r.temp)}</td>
                <td>{(Number(r.latE6) / 1e6).toFixed(4)}</td>
                <td>{(Number(r.lonE6) / 1e6).toFixed(4)}</td>
                <td>{date(r.measuredAt)}</td>
                <td>{r.breach ? "YES" : "no"}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {readings.length === 0 && <p>No readings yet.</p>}
      </div>

      <div className="box">
        <h2>Documents</h2>
        <table>
          <thead><tr><th>Type</th><th>CID</th><th>Hash</th><th>Added by</th></tr></thead>
          <tbody>
            {docs.map((d, i) => (
              <tr key={i}>
                <td>{DOCS[Number(d.docType)]}</td>
                <td><a href={"https://ipfs.io/ipfs/" + d.cid.replace("ipfs://", "")} target="_blank">{d.cid}</a></td>
                <td>{d.docHash.slice(0, 12)}...</td>
                <td>{short(d.addedBy)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        {docs.length === 0 && <p>No documents yet.</p>}
      </div>
    </div>
  );
}

export default Product;
