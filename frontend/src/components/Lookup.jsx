import { useState } from "react";

function Lookup() {
  const [id, setId] = useState("");

  return (
    <div className="box">
      <h2>Look up a product</h2>
      <input placeholder="Product ID" value={id} onChange={(e) => setId(e.target.value)} />
      <button onClick={() => (window.location.hash = "#/product/" + id)}>View</button>
    </div>
  );
}

export default Lookup;
