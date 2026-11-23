# ColdTrace

Blockchain provenance for cold-chain supply chains. CSE 540 (Engineering Blockchain Applications), Fall 2026, Team 6.

## Description

Fresh produce and refrigerated drugs like vaccines and insulin go through several custodians before they reach a store or pharmacy. Each party keeps its own records, so nobody has the full history of a batch. When there is an outbreak or a temperature breach, tracing the source means calling suppliers one by one.

ColdTrace records every custody transfer and temperature reading for a product on a shared ledger that producers, distributors, retailers, regulators and consumers can all check. Everything goes through one Solidity contract, `ProvenanceRegistry`:

- Each registered batch gets a unique product ID and a product type with an allowed temperature range (0-4 C for leafy greens, 2-8 C for vaccines).
- Status follows `Created -> Shipped -> InStorage -> Delivered`. Shipped and InStorage repeat for each hop, and no step can be skipped or reversed.
- Only the current custodian can transfer a product, and only to a distributor or retailer, who then confirms receipt by setting the status to InStorage.
- Access is role based using OpenZeppelin `AccessControl`.
- Certificates, sensor logs and photos are stored on IPFS. The contract only keeps the CID and file hash.
- Every change emits an event, and `getHistory` returns the full status and custody trail.

## Roles

| Role | Who | Can do |
|---|---|---|
| DEFAULT_ADMIN_ROLE | deployer | grant/revoke roles, add product types |
| PRODUCER_ROLE | farm, drug manufacturer | register products |
| DISTRIBUTOR_ROLE | processor, carrier, warehouse | receive and forward products |
| RETAILER_ROLE | store, pharmacy | receive products, mark them delivered |
| REGULATOR_ROLE | inspector | certify products, attach documents |
| ORACLE_ROLE | sensor relayer | record temperature and GPS readings |

Consumers don't need a role. They just read a product through the view functions (QR lookup page is planned).

## Repository structure

```
contracts/
  IProvenanceRegistry.sol    interface with enums, structs, events and function signatures
  ProvenanceRegistry.sol     contract implementation
scripts/
  deploy.js                  deploys the contract, adds demo product types, grants demo roles
test/
  ProvenanceRegistry.test.js Hardhat tests
hardhat.config.js
package.json
frontend/
  src/App.jsx                main page, connects MetaMask and shows panels by role
  src/chain.js               contract helpers
  src/ipfs.js                Pinata upload and document hash check
  src/components/            one file per panel, Product.jsx is the public product page
oracle/
  oracle.js                  simulated temperature/GPS sensor that sends readings to the contract
```

## Contract functions

Temperatures are in tenths of a degree Celsius (40 means 4.0 C). Coordinates are degrees x 1e6.

| Function | Who can call | What it does |
|---|---|---|
| `addProductType(name, minTemp, maxTemp)` | admin | adds a product category |
| `registerProduct(batchId, metaCID, productTypeId)` | producer | registers a batch, returns productId |
| `transferCustody(productId, to)` | custodian | hands the product to `to`, status becomes Shipped |
| `updateStatus(productId, status)` | custodian | Shipped to InStorage (receipt), or InStorage to Delivered (retailer only) |
| `attachDocument(productId, docType, cid, docHash)` | custodian, regulator, oracle | anchors an IPFS document |
| `recordCondition(productId, reading)` | oracle | logs a temperature/GPS reading, flags a breach if out of range |
| `certify(productId)` | regulator | marks the product as certified |
| `getHistory(productId)` | anyone | status and custody history |
| `getProduct`, `getProductType`, `getDocuments`, `productCount` | anyone | read-only views |

Events: `ProductRegistered`, `CustodyTransferred`, `StatusUpdated`, `DocumentAttached`, `ConditionRecorded`, `ProductCertified`, `ProductTypeAdded`.

## Setup

You need Node.js 20+, npm, and MetaMask with some Polygon Amoy test POL if you want to deploy to the testnet. The project uses Hardhat 2.22, hardhat-toolbox and OpenZeppelin Contracts 5.

```bash
git clone https://github.com/shaashvat01/ColdTrace.git
cd ColdTrace
npm install
npx hardhat compile
npx hardhat test
```

## Deployment

Local network:

```bash
npx hardhat node        # terminal 1
npm run deploy:local    # terminal 2
```

Polygon Amoy testnet:

```bash
export AMOY_RPC_URL=https://rpc-amoy.polygon.technology
export PRIVATE_KEY=<testnet deployer key>
npm run deploy:amoy
```

The deploy script adds two product types (leafy greens and vaccines) and grants the five roles. Locally it uses Hardhat test accounts 1-5. On Amoy, set `PRODUCER_ADDRESS`, `DISTRIBUTOR_ADDRESS`, `RETAILER_ADDRESS`, `REGULATOR_ADDRESS` and `ORACLE_ADDRESS` first. Any role without an address is skipped and can be granted later with `grantRole`.

The deploy script also writes the contract address and ABI to `frontend/src/contract.json`.

## Front end

React + ethers.js app in `frontend/`. Deploy the contract first, then:

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:5173 and connect MetaMask. For local testing, add the Hardhat network to MetaMask (RPC `http://127.0.0.1:8545`, chain id 31337) and import the Hardhat test account keys printed by `npx hardhat node`. Account 0 is admin, 1 producer, 2 distributor, 3 retailer, 4 regulator, 5 oracle.

The page shows the panels for whatever roles the connected account has:

- Admin: grant/revoke roles, add product types
- Producer: register a batch
- Producer, distributor, retailer: list products you hold, ship, confirm receipt, mark delivered (retailer)
- Regulator: certify a product
- Custodians and regulator: attach a document. The file is hashed in the browser and uploaded to IPFS through Pinata, then the CID and hash are stored on chain
- Anyone: look up a product by ID. The product page shows status, custody history, sensor readings, documents and a QR code that links back to the same page. The Check button downloads each document from IPFS and compares its hash with the one on chain. No wallet needed.

To turn on IPFS uploads, create a free Pinata account, make an API key and put its JWT in `frontend/.env`:

```
VITE_PINATA_JWT=<your pinata jwt>
```

Without it the form asks for the CID by hand.

If you restart `npx hardhat node`, reset the account in MetaMask (Settings > Advanced > Clear activity tab data) so the nonce starts over.

## Oracle

`oracle/oracle.js` acts as the sensor relayer. It sends simulated temperature and GPS readings for a product with `recordCondition`. The contract flags a breach if a reading is outside the product type's range. At the end it uploads the full sensor log JSON to IPFS and anchors it with `attachDocument` as a SensorLog.

```bash
cd oracle
npm install
node oracle.js 1            # 5 normal readings for product 1
node oracle.js 1 8 --breach # 8 readings with one out of range
```

Locally it uses Hardhat account 5, which gets ORACLE_ROLE in the deploy script. Environment variables (see `oracle/.env.example`):

- `RPC_URL`: defaults to the RPC saved by the deploy script
- `ORACLE_KEY`: private key of the oracle account, defaults to Hardhat account 5
- `PINATA_JWT`: if set, the sensor log is uploaded to IPFS, otherwise that step is skipped

Put them in `oracle/.env` (gitignored) and run `node --env-file=.env oracle.js 1`.

## Team

- Huaiyuan Yao: smart contract
- Hanyang Chen: testing and deployment
- Shaashvat Mittal: front end
- Jatin Kumar Reddimalla: oracle and storage
- Zichen Zhao: report and coordination

## License

MIT
