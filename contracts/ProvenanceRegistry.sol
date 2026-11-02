// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {AccessControl} from "@openzeppelin/contracts/access/AccessControl.sol";
import {IProvenanceRegistry} from "./IProvenanceRegistry.sol";

// main coldtrace contract, stores products, custody, status, readings and document hashes
contract ProvenanceRegistry is IProvenanceRegistry, AccessControl {
    // roles granted by the admin
    bytes32 public constant PRODUCER_ROLE = keccak256("PRODUCER_ROLE");
    bytes32 public constant DISTRIBUTOR_ROLE = keccak256("DISTRIBUTOR_ROLE");
    bytes32 public constant RETAILER_ROLE = keccak256("RETAILER_ROLE");
    bytes32 public constant REGULATOR_ROLE = keccak256("REGULATOR_ROLE");
    bytes32 public constant ORACLE_ROLE = keccak256("ORACLE_ROLE");

    // id counters and storage, ids start at 1
    uint256 private _nextProductTypeId = 1;
    uint256 private _nextProductId = 1;

    mapping(uint256 => ProductType) private _productTypes;
    mapping(uint256 => Product) private _products;
    mapping(uint256 => Document[]) private _documents;
    mapping(uint256 => HistoryEntry[]) private _history;

    // custom errors
    error UnknownProductType(uint256 productTypeId);
    error UnknownProduct(uint256 productId);
    error InvalidTempRange(int16 minTemp, int16 maxTemp);
    error NotCustodian(uint256 productId, address caller);
    error InvalidRecipient(address to);
    error InvalidTransition(uint256 productId, Status from, Status to);
    error NotAllowed(uint256 productId, address caller);
    error ProductClosed(uint256 productId);

    // reverts if the product id was never registered
    modifier productExists(uint256 productId) {
        if (productId == 0 || productId >= _nextProductId) revert UnknownProduct(productId);
        _;
    }

    // reverts unless the caller is the current custodian
    modifier onlyCustodian(uint256 productId) {
        if (_products[productId].custodian != msg.sender) revert NotCustodian(productId, msg.sender);
        _;
    }

    // deployer passes the admin account that manages roles and product types
    constructor(address admin) {
        _grantRole(DEFAULT_ADMIN_ROLE, admin);
    }

    // adds a product category, min must not be above max
    function addProductType(string calldata name, int16 minTemp, int16 maxTemp)
        external
        onlyRole(DEFAULT_ADMIN_ROLE)
        returns (uint256 productTypeId)
    {
        if (minTemp > maxTemp) revert InvalidTempRange(minTemp, maxTemp);
        productTypeId = _nextProductTypeId++;
        _productTypes[productTypeId] = ProductType({name: name, minTemp: minTemp, maxTemp: maxTemp, exists: true});
        emit ProductTypeAdded(productTypeId, name, minTemp, maxTemp);
    }

    // creates the product with status created and the producer as custodian
    function registerProduct(string calldata batchId, string calldata metaCID, uint256 productTypeId)
        external
        onlyRole(PRODUCER_ROLE)
        returns (uint256 productId)
    {
        if (!_productTypes[productTypeId].exists) revert UnknownProductType(productTypeId);
        productId = _nextProductId++;
        _products[productId] = Product({
            id: productId,
            batchId: batchId,
            productTypeId: productTypeId,
            producer: msg.sender,
            custodian: msg.sender,
            status: Status.Created,
            certified: false,
            breached: false,
            createdAt: uint64(block.timestamp),
            metaCID: metaCID
        });
        _history[productId].push(HistoryEntry(Status.Created, msg.sender, uint64(block.timestamp)));
        emit ProductRegistered(productId, productTypeId, msg.sender, batchId, metaCID);
    }

    // moves custody to a distributor or retailer and sets status to shipped
    function transferCustody(uint256 productId, address to)
        external
        productExists(productId)
        onlyCustodian(productId)
    {
        Product storage p = _products[productId];
        if (p.status != Status.Created && p.status != Status.InStorage) {
            revert InvalidTransition(productId, p.status, Status.Shipped);
        }
        if (to == msg.sender || !_canHoldCustody(to)) revert InvalidRecipient(to);
        p.custodian = to;
        emit CustodyTransferred(productId, msg.sender, to);
        _setStatus(productId, Status.Shipped);
    }

    // only shipped to instorage and instorage to delivered are allowed here
    function updateStatus(uint256 productId, Status status)
        external
        productExists(productId)
        onlyCustodian(productId)
    {
        Status current = _products[productId].status;
        bool received = current == Status.Shipped && status == Status.InStorage;
        bool delivered = current == Status.InStorage && status == Status.Delivered;
        if (!received && !delivered) revert InvalidTransition(productId, current, status);
        if (delivered) _checkRole(RETAILER_ROLE);
        _setStatus(productId, status);
    }

    // custodian and regulator can attach any type, the oracle only sensor logs
    function attachDocument(uint256 productId, DocType docType, string calldata cid, bytes32 docHash)
        external
        productExists(productId)
    {
        bool allowed = _products[productId].custodian == msg.sender
            || hasRole(REGULATOR_ROLE, msg.sender)
            || (docType == DocType.SensorLog && hasRole(ORACLE_ROLE, msg.sender));
        if (!allowed) revert NotAllowed(productId, msg.sender);
        _documents[productId].push(
            Document({docType: docType, cid: cid, docHash: docHash, addedBy: msg.sender, addedAt: uint64(block.timestamp)})
        );
        emit DocumentAttached(productId, docType, cid, docHash, msg.sender);
    }

    // sets the breached flag if the reading is outside the product type range
    function recordCondition(uint256 productId, Reading calldata reading)
        external
        productExists(productId)
        onlyRole(ORACLE_ROLE)
    {
        Product storage p = _products[productId];
        if (p.status == Status.Delivered) revert ProductClosed(productId);
        ProductType storage pt = _productTypes[p.productTypeId];
        bool breach = reading.temp < pt.minTemp || reading.temp > pt.maxTemp;
        if (breach) p.breached = true;
        emit ConditionRecorded(productId, reading.temp, reading.latE6, reading.lonE6, reading.measuredAt, breach);
    }

    // regulator marks the product certified, the certificate file goes through attachDocument
    function certify(uint256 productId) external productExists(productId) onlyRole(REGULATOR_ROLE) {
        _products[productId].certified = true;
        emit ProductCertified(productId, msg.sender);
    }

    // full status and custody trail for a product
    function getHistory(uint256 productId) external view productExists(productId) returns (HistoryEntry[] memory) {
        return _history[productId];
    }

    // current product record
    function getProduct(uint256 productId) external view productExists(productId) returns (Product memory) {
        return _products[productId];
    }

    // product category lookup
    function getProductType(uint256 productTypeId) external view returns (ProductType memory) {
        if (!_productTypes[productTypeId].exists) revert UnknownProductType(productTypeId);
        return _productTypes[productTypeId];
    }

    // all anchored documents for a product
    function getDocuments(uint256 productId) external view productExists(productId) returns (Document[] memory) {
        return _documents[productId];
    }

    // product ids run from 1 to productCount
    function productCount() external view returns (uint256) {
        return _nextProductId - 1;
    }

    // a shipment can only go to a distributor or retailer
    function _canHoldCustody(address account) internal view returns (bool) {
        return hasRole(DISTRIBUTOR_ROLE, account) || hasRole(RETAILER_ROLE, account);
    }

    // updates status, logs it in the history and emits StatusUpdated
    function _setStatus(uint256 productId, Status newStatus) internal {
        Product storage p = _products[productId];
        Status old = p.status;
        p.status = newStatus;
        _history[productId].push(HistoryEntry(newStatus, p.custodian, uint64(block.timestamp)));
        emit StatusUpdated(productId, old, newStatus);
    }
}
