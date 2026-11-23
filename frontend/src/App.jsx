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

  if (!deployed) return <div className="page"><h1>ColdTrace</h1><p>Contract not deployed yet. Run the deploy script first.</p></div>;

  // public product page, this is what the qr code opens
  if (hash.startsWith("#/product/")) return <Product id={hash.split("/")[2]} />;

  const isCustodian = roles.includes("PRODUCER") || roles.includes("DISTRIBUTOR") || roles.includes("RETAILER");

  return (
    <div className="page">
      <h1>ColdTrace</h1>
      <p>Cold chain provenance on the blockchain</p>

      <Lookup />

      {!contract && <button onClick={onConnect}>Connect MetaMask</button>}
      {error && <p className="error">{error}</p>}

      {contract && (
        <div>
          <p>Account: <b>{short(account)}</b> | Roles: <b>{roles.length ? roles.join(", ") : "none (consumer)"}</b></p>
          {roles.includes("ADMIN") && <Admin contract={contract} />}
          {roles.includes("PRODUCER") && <Producer contract={contract} />}
          {isCustodian && <MyProducts contract={contract} account={account} roles={roles} />}
          {roles.includes("REGULATOR") && <Regulator contract={contract} />}
          {(isCustodian || roles.includes("REGULATOR")) && <AddDoc contract={contract} />}
        </div>
      )}
    </div>
  );
}

export default App;
