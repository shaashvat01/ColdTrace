// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

// interface for the coldtrace registry that tracks each product batch through the cold chain
interface IProvenanceRegistry {
    // life cycle of a product, shipped and instorage repeat once per hop
    enum Status {
        Created,
        Shipped,
        InStorage,
        Delivered
    }

    // kind of off-chain file stored on ipfs
    enum DocType {
        Certificate,
        SensorLog,
        Photo,
        Other
    }

    // product category with its allowed temperature range in tenths of a degree celsius
    struct ProductType {
        string name;
        int16 minTemp;
        int16 maxTemp;
        bool exists;
    }

    // on-chain record of one registered product batch
    struct Product {
        uint256 id;
        string batchId;
        uint256 productTypeId;
        address producer;
        address custodian;
        Status status;
        bool certified;
        bool breached;
        uint64 createdAt;
        string metaCID;
    }

    // one sensor reading sent by the oracle, coordinates are degrees times 1e6
    struct Reading {
        int16 temp;
        int32 latE6;
        int32 lonE6;
        uint64 measuredAt;
    }

    // ipfs cid and file hash anchored to a product
    struct Document {
        DocType docType;
        string cid;
        bytes32 docHash;
        address addedBy;
        uint64 addedAt;
    }

    // one entry in a product's status and custody history
    struct HistoryEntry {
        Status status;
        address custodian;
        uint64 timestamp;
    }

    // emitted when the admin adds a product category
    event ProductTypeAdded(uint256 indexed productTypeId, string name, int16 minTemp, int16 maxTemp);

    // emitted when a producer registers a new product
    event ProductRegistered(uint256 indexed productId, uint256 indexed productTypeId, address indexed producer, string batchId, string metaCID);

    // emitted when the custodian hands a product to the next party
    event CustodyTransferred(uint256 indexed productId, address indexed from, address indexed to);

    // emitted on every status change
    event StatusUpdated(uint256 indexed productId, Status oldStatus, Status newStatus);

    // emitted when a document is anchored to a product
    event DocumentAttached(uint256 indexed productId, DocType docType, string cid, bytes32 docHash, address indexed addedBy);

    // emitted for every sensor reading, breach is true if temp is out of range
    event ConditionRecorded(uint256 indexed productId, int16 temp, int32 latE6, int32 lonE6, uint64 measuredAt, bool breach);

    // emitted when a regulator certifies a product
    event ProductCertified(uint256 indexed productId, address indexed regulator);

    // admin only, adds a product category with its temperature range
    function addProductType(string calldata name, int16 minTemp, int16 maxTemp) external returns (uint256 productTypeId);

    // producer only, registers a batch and returns its unique product id
    function registerProduct(string calldata batchId, string calldata metaCID, uint256 productTypeId) external returns (uint256 productId);

    // current custodian ships the product to a distributor or retailer
    function transferCustody(uint256 productId, address to) external;

    // custodian confirms receipt (instorage) or a retailer marks it delivered
    function updateStatus(uint256 productId, Status status) external;

    // custodian, regulator or oracle (sensor logs only) anchors an ipfs document
    function attachDocument(uint256 productId, DocType docType, string calldata cid, bytes32 docHash) external;

    // oracle only, records a temperature and gps reading and flags breaches
    function recordCondition(uint256 productId, Reading calldata reading) external;

    // regulator only, marks the product as certified
    function certify(uint256 productId) external;

    // returns every status and custody change for a product
    function getHistory(uint256 productId) external view returns (HistoryEntry[] memory);

    // returns the current record of a product
    function getProduct(uint256 productId) external view returns (Product memory);

    // returns a product category
    function getProductType(uint256 productTypeId) external view returns (ProductType memory);

    // returns all documents anchored to a product
    function getDocuments(uint256 productId) external view returns (Document[] memory);

    // number of products registered so far
    function productCount() external view returns (uint256);
}
