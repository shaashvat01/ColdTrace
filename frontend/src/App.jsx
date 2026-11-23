import { useEffect, useState } from "react";
import { connect, getRoles, deployed, short } from "./chain.js";
import Admin from "./components/Admin.jsx";
import Producer from "./components/Producer.jsx";
import MyProducts from "./components/MyProducts.jsx";
import Regulator from "./components/Regulator.jsx";
import AddDoc from "./components/AddDoc.jsx";
import Lookup from "./components/Lookup.jsx";
import Product from "./components/Product.jsx";

function App() {
  const [hash, setHash] = useState(window.location.hash);
  const [contract, setContract] = useState(null);
  const [account, setAccount] = useState("");
  const [roles, setRoles] = useState([]);
  const [error, setError] = useState("");

  useEffect(() => {
    window.onhashchange = () => setHash(window.location.hash);
    // reload when the user switches account in metamask
    if (window.ethereum) window.ethereum.on("accountsChanged", () => window.location.reload());
  }, []);

  async function onConnect() {
    try {
      setError("");
      const c = await connect();
      const addr = await c.runner.getAddress();
      setContract(c);
      setAccount(addr);
      setRoles(await getRoles(c, addr));
    } catch (e) {
      setError(e.message);
    }
  }

  const isCustodian = roles.includes("PRODUCER") || roles.includes("DISTRIBUTOR") || roles.includes("RETAILER");

  // public product page, this is what the qr code opens
  let content;
  if (!deployed) {
    content = <div className="box">Contract not deployed yet. Run the deploy script first.</div>;
  } else if (hash.startsWith("#/product/")) {
    content = <Product id={hash.split("/")[2]} />;
  } else if (!contract) {
    content = <Home />;
  } else {
    content = (
      <div>
        <div className="account">
          <span>Connected as <b>{short(account)}</b></span>
          {roles.length === 0 && <span className="tag">CONSUMER</span>}
          {roles.map((r) => <span key={r} className="tag">{r}</span>)}
        </div>
        <Lookup />
        {roles.includes("ADMIN") && <Admin contract={contract} />}
        {roles.includes("PRODUCER") && <Producer contract={contract} />}
        {isCustodian && <MyProducts contract={contract} account={account} roles={roles} />}
        {roles.includes("REGULATOR") && <Regulator contract={contract} />}
        {(isCustodian || roles.includes("REGULATOR")) && <AddDoc contract={contract} />}
      </div>
    );
  }

  return (
    <div>
      <div className="nav">
        <a href="#/" className="logo">❄ ColdTrace</a>
        {contract ? <span className="addr">{short(account)}</span> : <button onClick={onConnect}>Connect MetaMask</button>}
      </div>
      <div className="page">
        {error && <p className="error">{error}</p>}
        {content}
      </div>
    </div>
  );
}

function Home() {
  return (
    <div>
      <div className="hero">
        <h1>Track cold chain products you can trust</h1>
        <p>ColdTrace records every custody transfer and temperature reading on the blockchain, so farms, distributors, stores, regulators and shoppers all see the same history.</p>
      </div>
      <Lookup />
      <div className="steps">
        <div className="step">
          <h3>1. Register</h3>
          <p>A producer registers a batch with its allowed temperature range.</p>
        </div>
        <div className="step">
          <h3>2. Ship and monitor</h3>
          <p>Each handoff is recorded and sensors log the temperature on the way.</p>
        </div>
        <div className="step">
          <h3>3. Verify</h3>
          <p>Scan the QR code to see the full history, breaches and certificates.</p>
        </div>
      </div>
      <p className="hint">Supply chain partners: connect MetaMask at the top right to see your tools.</p>
    </div>
  );
}

export default App;
