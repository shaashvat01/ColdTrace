// tests for roles, state machine, custody, sensor readings, documents and certification
const { expect } = require("chai");
const { ethers } = require("hardhat");
const { loadFixture, time } = require("@nomicfoundation/hardhat-toolbox/network-helpers");

const Status = { Created: 0n, Shipped: 1n, InStorage: 2n, Delivered: 3n };
const DocType = { Certificate: 0n, SensorLog: 1n, Photo: 2n, Other: 3n };
const HASH = ethers.keccak256(ethers.toUtf8Bytes("file contents"));

const reading = (temp, measuredAt, latE6 = 0, lonE6 = 0) => ({ temp, latE6, lonE6, measuredAt });

describe("ProvenanceRegistry", function () {
  async function deploy() {
    const [admin, producer, distributor, retailer, regulator, oracle, outsider, distributor2] =
      await ethers.getSigners();
    const registry = await ethers.deployContract("ProvenanceRegistry", [admin.address]);
    return { registry, admin, producer, distributor, retailer, regulator, oracle, outsider, distributor2 };
  }

  async function deployWithProduct() {
    const ctx = await deploy();
    const { registry, producer, distributor, retailer, regulator, oracle, distributor2 } = ctx;
    await registry.grantRole(await registry.PRODUCER_ROLE(), producer.address);
    await registry.grantRole(await registry.DISTRIBUTOR_ROLE(), distributor.address);
    await registry.grantRole(await registry.DISTRIBUTOR_ROLE(), distributor2.address);
    await registry.grantRole(await registry.RETAILER_ROLE(), retailer.address);
    await registry.grantRole(await registry.REGULATOR_ROLE(), regulator.address);
    await registry.grantRole(await registry.ORACLE_ROLE(), oracle.address);
    await registry.addProductType("Leafy greens", 0, 40);
    await registry.addProductType("Vaccine", 20, 80);
    await registry.connect(producer).registerProduct("LOT-001", "ipfs://batch-meta", 1);
    return { ...ctx, productId: 1n };
  }

  it("deploys with the admin role set", async function () {
    const { registry, admin } = await loadFixture(deploy);
    expect(await registry.hasRole(await registry.DEFAULT_ADMIN_ROLE(), admin.address)).to.equal(true);
    expect(await registry.productCount()).to.equal(0n);
  });

  describe("product types", function () {
    it("admin adds a type with a valid temperature range", async function () {
      const { registry } = await loadFixture(deploy);
      await expect(registry.addProductType("Vaccine", 20, 80))
        .to.emit(registry, "ProductTypeAdded")
        .withArgs(1n, "Vaccine", 20, 80);
      const pt = await registry.getProductType(1);
      expect(pt.name).to.equal("Vaccine");
      expect(pt.minTemp).to.equal(20n);
      expect(pt.maxTemp).to.equal(80n);
    });

    it("rejects minTemp > maxTemp", async function () {
      const { registry } = await loadFixture(deploy);
      await expect(registry.addProductType("Bad", 50, 10))
        .to.be.revertedWithCustomError(registry, "InvalidTempRange")
        .withArgs(50, 10);
    });

    it("rejects callers without DEFAULT_ADMIN_ROLE", async function () {
      const { registry, outsider } = await loadFixture(deploy);
      await expect(registry.connect(outsider).addProductType("X", 0, 10))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("registration", function () {
    it("producer registers a product with a unique id and status Created", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).registerProduct("LOT-002", "ipfs://second", 2))
        .to.emit(registry, "ProductRegistered")
        .withArgs(2n, 2n, producer.address, "LOT-002", "ipfs://second");
      expect(await registry.productCount()).to.equal(2n);
      const p = await registry.getProduct(1);
      expect(p.id).to.equal(1n);
      expect(p.batchId).to.equal("LOT-001");
      expect(p.producer).to.equal(producer.address);
      expect(p.custodian).to.equal(producer.address);
      expect(p.status).to.equal(Status.Created);
      expect(p.metaCID).to.equal("ipfs://batch-meta");
    });

    it("rejects an unknown product type", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).registerProduct("LOT-X", "x", 99))
        .to.be.revertedWithCustomError(registry, "UnknownProductType")
        .withArgs(99n);
    });

    it("rejects callers without PRODUCER_ROLE", async function () {
      const { registry, outsider } = await loadFixture(deployWithProduct);
      await expect(registry.connect(outsider).registerProduct("LOT-X", "x", 1))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("rejects lookups of unknown products", async function () {
      const { registry } = await loadFixture(deployWithProduct);
      await expect(registry.getProduct(0)).to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.getProduct(2)).to.be.revertedWithCustomError(registry, "UnknownProduct");
    });
  });

  describe("state machine and custody", function () {
    it("follows Created -> Shipped -> InStorage -> Delivered", async function () {
      const { registry, producer, retailer, productId } = await loadFixture(deployWithProduct);

      await expect(registry.connect(producer).transferCustody(productId, retailer.address))
        .to.emit(registry, "CustodyTransferred")
        .withArgs(productId, producer.address, retailer.address)
        .and.to.emit(registry, "StatusUpdated")
        .withArgs(productId, Status.Created, Status.Shipped);
      let p = await registry.getProduct(productId);
      expect(p.custodian).to.equal(retailer.address);
      expect(p.status).to.equal(Status.Shipped);

      await expect(registry.connect(retailer).updateStatus(productId, Status.InStorage))
        .to.emit(registry, "StatusUpdated")
        .withArgs(productId, Status.Shipped, Status.InStorage);

      await expect(registry.connect(retailer).updateStatus(productId, Status.Delivered))
        .to.emit(registry, "StatusUpdated")
        .withArgs(productId, Status.InStorage, Status.Delivered);
      expect((await registry.getProduct(productId)).status).to.equal(Status.Delivered);
    });

    it("repeats Shipped -> InStorage for each hop", async function () {
      const { registry, producer, distributor, distributor2, retailer, productId } =
        await loadFixture(deployWithProduct);
      const hops = [
        [producer, distributor],
        [distributor, distributor2],
        [distributor2, retailer],
      ];
      for (const [from, to] of hops) {
        await registry.connect(from).transferCustody(productId, to.address);
        await registry.connect(to).updateStatus(productId, Status.InStorage);
        const p = await registry.getProduct(productId);
        expect(p.custodian).to.equal(to.address);
        expect(p.status).to.equal(Status.InStorage);
      }
    });

    it("getHistory returns every status and custody change", async function () {
      const { registry, producer, distributor, retailer, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await registry.connect(distributor).updateStatus(productId, Status.InStorage);
      await registry.connect(distributor).transferCustody(productId, retailer.address);
      await registry.connect(retailer).updateStatus(productId, Status.InStorage);
      await registry.connect(retailer).updateStatus(productId, Status.Delivered);
      const history = await registry.getHistory(productId);
      expect(history.map((h) => h.status)).to.deep.equal([
        Status.Created,
        Status.Shipped,
        Status.InStorage,
        Status.Shipped,
        Status.InStorage,
        Status.Delivered,
      ]);
      expect(history.map((h) => h.custodian)).to.deep.equal([
        producer.address,
        distributor.address,
        distributor.address,
        retailer.address,
        retailer.address,
        retailer.address,
      ]);
    });

    it("only the custodian can transfer, only to a distributor or retailer", async function () {
      const { registry, producer, distributor, outsider, regulator, productId } =
        await loadFixture(deployWithProduct);
      await expect(registry.connect(distributor).transferCustody(productId, distributor.address))
        .to.be.revertedWithCustomError(registry, "NotCustodian");
      await expect(registry.connect(producer).transferCustody(productId, outsider.address))
        .to.be.revertedWithCustomError(registry, "InvalidRecipient")
        .withArgs(outsider.address);
      await expect(registry.connect(producer).transferCustody(productId, regulator.address))
        .to.be.revertedWithCustomError(registry, "InvalidRecipient");
      await expect(registry.connect(producer).transferCustody(productId, ethers.ZeroAddress))
        .to.be.revertedWithCustomError(registry, "InvalidRecipient");
    });

    it("rejects transferring to yourself", async function () {
      const { registry, producer, distributor, distributor2, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await registry.connect(distributor).updateStatus(productId, Status.InStorage);
      await expect(registry.connect(distributor).transferCustody(productId, distributor.address))
        .to.be.revertedWithCustomError(registry, "InvalidRecipient");
      await registry.connect(distributor).transferCustody(productId, distributor2.address);
    });

    it("only the new custodian can confirm receipt", async function () {
      const { registry, producer, distributor, distributor2, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await expect(registry.connect(distributor2).updateStatus(productId, Status.InStorage))
        .to.be.revertedWithCustomError(registry, "NotCustodian")
        .withArgs(productId, distributor2.address);
      await expect(registry.connect(producer).updateStatus(productId, Status.InStorage))
        .to.be.revertedWithCustomError(registry, "NotCustodian");
    });

    it("only a retailer custodian can mark Delivered", async function () {
      const { registry, producer, distributor, retailer, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await registry.connect(distributor).updateStatus(productId, Status.InStorage);
      await expect(registry.connect(distributor).updateStatus(productId, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(retailer).updateStatus(productId, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "NotCustodian");
    });

    it("rejects skipped or reversed transitions", async function () {
      const { registry, producer, retailer, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).updateStatus(productId, Status.InStorage))
        .to.be.revertedWithCustomError(registry, "InvalidTransition")
        .withArgs(productId, Status.Created, Status.InStorage);
      await expect(registry.connect(producer).updateStatus(productId, Status.Shipped))
        .to.be.revertedWithCustomError(registry, "InvalidTransition");

      await registry.connect(producer).transferCustody(productId, retailer.address);
      await expect(registry.connect(retailer).transferCustody(productId, retailer.address))
        .to.be.revertedWithCustomError(registry, "InvalidTransition")
        .withArgs(productId, Status.Shipped, Status.Shipped);
      await expect(registry.connect(retailer).updateStatus(productId, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "InvalidTransition")
        .withArgs(productId, Status.Shipped, Status.Delivered);

      await registry.connect(retailer).updateStatus(productId, Status.InStorage);
      await expect(registry.connect(retailer).updateStatus(productId, Status.Created))
        .to.be.revertedWithCustomError(registry, "InvalidTransition");
      await registry.connect(retailer).updateStatus(productId, Status.Delivered);

      await expect(registry.connect(retailer).updateStatus(productId, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "InvalidTransition")
        .withArgs(productId, Status.Delivered, Status.Delivered);
      await expect(registry.connect(retailer).transferCustody(productId, retailer.address))
        .to.be.revertedWithCustomError(registry, "InvalidTransition");
    });

    it("cannot mark a product Delivered straight from Created", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await registry.grantRole(await registry.RETAILER_ROLE(), producer.address);
      await expect(registry.connect(producer).updateStatus(1, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "InvalidTransition")
        .withArgs(1n, Status.Created, Status.Delivered);
    });
  });

  describe("sensor readings", function () {
    it("only the oracle records conditions", async function () {
      const { registry, producer, outsider, oracle, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).recordCondition(productId, reading(20, 1000)))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(outsider).recordCondition(productId, reading(20, 1000)))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(oracle).recordCondition(productId, reading(20, 1000, 33448000, -112074000)))
        .to.emit(registry, "ConditionRecorded")
        .withArgs(productId, 20, 33448000, -112074000, 1000n, false);
      expect((await registry.getProduct(productId)).breached).to.equal(false);
    });

    it("accepts readings exactly at the range limits", async function () {
      const { registry, oracle, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(oracle).recordCondition(productId, reading(0, 1)))
        .to.emit(registry, "ConditionRecorded")
        .withArgs(productId, 0, 0, 0, 1n, false);
      await expect(registry.connect(oracle).recordCondition(productId, reading(40, 2)))
        .to.emit(registry, "ConditionRecorded")
        .withArgs(productId, 40, 0, 0, 2n, false);
    });

    it("flags a breach outside the range", async function () {
      const { registry, oracle, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(oracle).recordCondition(productId, reading(55, 2000)))
        .to.emit(registry, "ConditionRecorded")
        .withArgs(productId, 55, 0, 0, 2000n, true);
      expect((await registry.getProduct(productId)).breached).to.equal(true);
      await expect(registry.connect(oracle).recordCondition(productId, reading(-5, 2001)))
        .to.emit(registry, "ConditionRecorded")
        .withArgs(productId, -5, 0, 0, 2001n, true);
      await registry.connect(oracle).recordCondition(productId, reading(20, 2002));
      expect((await registry.getProduct(productId)).breached).to.equal(true);
    });

    it("rejects readings for a delivered product", async function () {
      const { registry, producer, retailer, oracle, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, retailer.address);
      await registry.connect(retailer).updateStatus(productId, Status.InStorage);
      await registry.connect(retailer).updateStatus(productId, Status.Delivered);
      await expect(registry.connect(oracle).recordCondition(productId, reading(20, 3000)))
        .to.be.revertedWithCustomError(registry, "ProductClosed")
        .withArgs(productId);
    });
  });

  describe("documents and certification", function () {
    it("only a regulator can certify", async function () {
      const { registry, regulator, producer, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).certify(productId))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
      await expect(registry.connect(regulator).certify(productId))
        .to.emit(registry, "ProductCertified")
        .withArgs(productId, regulator.address);
      expect((await registry.getProduct(productId)).certified).to.equal(true);
      await expect(registry.connect(regulator).certify(productId))
        .to.be.revertedWithCustomError(registry, "AlreadyCertified")
        .withArgs(productId);
    });

    it("regulator attaches a certificate document", async function () {
      const { registry, regulator, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(regulator).attachDocument(productId, DocType.Certificate, "ipfs://cert", HASH))
        .to.emit(registry, "DocumentAttached")
        .withArgs(productId, DocType.Certificate, "ipfs://cert", HASH, regulator.address);
      const docs = await registry.getDocuments(productId);
      expect(docs.length).to.equal(1);
      expect(docs[0].docType).to.equal(DocType.Certificate);
      expect(docs[0].cid).to.equal("ipfs://cert");
      expect(docs[0].docHash).to.equal(HASH);
      expect(docs[0].addedBy).to.equal(regulator.address);
    });

    it("custodian attaches a document, outsiders cannot", async function () {
      const { registry, producer, distributor, outsider, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).attachDocument(productId, DocType.Photo, "ipfs://photo", HASH))
        .to.emit(registry, "DocumentAttached")
        .withArgs(productId, DocType.Photo, "ipfs://photo", HASH, producer.address);
      await expect(registry.connect(outsider).attachDocument(productId, DocType.Photo, "ipfs://x", HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed")
        .withArgs(productId, outsider.address);
      await expect(registry.connect(distributor).attachDocument(productId, DocType.Other, "ipfs://x", HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed");
      expect((await registry.getDocuments(productId)).length).to.equal(1);
    });

    it("regulator attaches any document, oracle only sensor logs", async function () {
      const { registry, regulator, oracle, productId } = await loadFixture(deployWithProduct);
      await registry.connect(regulator).attachDocument(productId, DocType.Other, "ipfs://inspection", HASH);
      await registry.connect(oracle).attachDocument(productId, DocType.SensorLog, "ipfs://log", HASH);
      await expect(registry.connect(oracle).attachDocument(productId, DocType.Photo, "ipfs://p", HASH))
        .to.be.revertedWithCustomError(registry, "NotAllowed");
      const docs = await registry.getDocuments(productId);
      expect(docs.map((d) => d.docType)).to.deep.equal([DocType.Other, DocType.SensorLog]);
    });
  });

  describe("input validation", function () {
    it("rejects an empty product type name", async function () {
      const { registry } = await loadFixture(deploy);
      await expect(registry.addProductType("", 0, 40)).to.be.revertedWithCustomError(registry, "EmptyValue");
    });

    it("rejects an empty batch id", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).registerProduct("", "x", 1))
        .to.be.revertedWithCustomError(registry, "EmptyValue");
    });

    it("rejects a duplicate batch id, even for another type", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).registerProduct("LOT-001", "x", 2))
        .to.be.revertedWithCustomError(registry, "DuplicateBatchId")
        .withArgs("LOT-001");
      expect(await registry.productCount()).to.equal(1n);
    });

    it("rejects an empty cid or zero hash", async function () {
      const { registry, regulator, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(regulator).attachDocument(productId, DocType.Certificate, "", HASH))
        .to.be.revertedWithCustomError(registry, "EmptyValue");
      await expect(registry.connect(regulator).attachDocument(productId, DocType.Certificate, "ipfs://c", ethers.ZeroHash))
        .to.be.revertedWithCustomError(registry, "ZeroHash");
    });

    it("rejects a reading with time 0 or too far in the future", async function () {
      const { registry, oracle, productId } = await loadFixture(deployWithProduct);
      const now = await time.latest();
      await expect(registry.connect(oracle).recordCondition(productId, reading(20, 0)))
        .to.be.revertedWithCustomError(registry, "InvalidTimestamp")
        .withArgs(0n);
      await expect(registry.connect(oracle).recordCondition(productId, reading(20, now + 3600)))
        .to.be.revertedWithCustomError(registry, "InvalidTimestamp");
      // a small clock drift is fine
      await expect(registry.connect(oracle).recordCondition(productId, reading(20, now + 60)))
        .to.emit(registry, "ConditionRecorded");
    });

    it("rejects unknown product ids everywhere", async function () {
      const { registry, regulator, oracle } = await loadFixture(deployWithProduct);
      await expect(registry.getHistory(5)).to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.getDocuments(5)).to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.getProductType(9)).to.be.revertedWithCustomError(registry, "UnknownProductType");
      await expect(registry.connect(regulator).certify(5)).to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.connect(regulator).recall(5, "x")).to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.connect(oracle).recordCondition(5, reading(20, 1)))
        .to.be.revertedWithCustomError(registry, "UnknownProduct");
      await expect(registry.connect(regulator).attachDocument(5, DocType.Other, "ipfs://x", HASH))
        .to.be.revertedWithCustomError(registry, "UnknownProduct");
    });
  });

  describe("roles", function () {
    it("a revoked producer can no longer register", async function () {
      const { registry, producer } = await loadFixture(deployWithProduct);
      await registry.revokeRole(await registry.PRODUCER_ROLE(), producer.address);
      await expect(registry.connect(producer).registerProduct("LOT-009", "x", 1))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("only the admin can grant roles", async function () {
      const { registry, outsider } = await loadFixture(deployWithProduct);
      await expect(registry.connect(outsider).grantRole(await registry.PRODUCER_ROLE(), outsider.address))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });
  });

  describe("recall", function () {
    it("only a regulator can recall", async function () {
      const { registry, producer, productId } = await loadFixture(deployWithProduct);
      await expect(registry.connect(producer).recall(productId, "bad"))
        .to.be.revertedWithCustomError(registry, "AccessControlUnauthorizedAccount");
    });

    it("regulator recalls a breached product and it stops moving", async function () {
      const { registry, producer, distributor, retailer, regulator, oracle, productId } =
        await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await registry.connect(oracle).recordCondition(productId, reading(90, 1));
      expect((await registry.getProduct(productId)).breached).to.equal(true);

      await expect(registry.connect(regulator).recall(productId, "temperature breach"))
        .to.emit(registry, "ProductRecalled")
        .withArgs(productId, regulator.address, "temperature breach");
      expect((await registry.getProduct(productId)).recalled).to.equal(true);

      await expect(registry.connect(distributor).updateStatus(productId, Status.InStorage))
        .to.be.revertedWithCustomError(registry, "IsRecalled")
        .withArgs(productId);
      await expect(registry.connect(distributor).transferCustody(productId, retailer.address))
        .to.be.revertedWithCustomError(registry, "IsRecalled");
      await expect(registry.connect(regulator).certify(productId))
        .to.be.revertedWithCustomError(registry, "IsRecalled");
    });

    it("blocks delivery of a recalled product at the retailer", async function () {
      const { registry, producer, retailer, regulator, productId } = await loadFixture(deployWithProduct);
      await registry.connect(producer).transferCustody(productId, retailer.address);
      await registry.connect(retailer).updateStatus(productId, Status.InStorage);
      await registry.connect(regulator).recall(productId, "outbreak");
      await expect(registry.connect(retailer).updateStatus(productId, Status.Delivered))
        .to.be.revertedWithCustomError(registry, "IsRecalled");
    });

    it("cannot recall twice, but documents can still be added", async function () {
      const { registry, regulator, productId } = await loadFixture(deployWithProduct);
      await registry.connect(regulator).recall(productId, "outbreak");
      await expect(registry.connect(regulator).recall(productId, "again"))
        .to.be.revertedWithCustomError(registry, "AlreadyRecalled")
        .withArgs(productId);
      await registry.connect(regulator).attachDocument(productId, DocType.Other, "ipfs://recall-report", HASH);
      expect((await registry.getDocuments(productId)).length).to.equal(1);
    });
  });

  describe("full journey", function () {
    it("farm to store with readings, documents and certification", async function () {
      const { registry, producer, distributor, retailer, regulator, oracle, productId } =
        await loadFixture(deployWithProduct);
      await registry.connect(producer).attachDocument(productId, DocType.Photo, "ipfs://harvest", HASH);
      await registry.connect(producer).transferCustody(productId, distributor.address);
      await registry.connect(oracle).recordCondition(productId, reading(25, 10));
      await registry.connect(distributor).updateStatus(productId, Status.InStorage);
      await registry.connect(oracle).attachDocument(productId, DocType.SensorLog, "ipfs://log", HASH);
      await registry.connect(regulator).certify(productId);
      await registry.connect(regulator).attachDocument(productId, DocType.Certificate, "ipfs://cert", HASH);
      await registry.connect(distributor).transferCustody(productId, retailer.address);
      await registry.connect(retailer).updateStatus(productId, Status.InStorage);
      await registry.connect(retailer).updateStatus(productId, Status.Delivered);

      const p = await registry.getProduct(productId);
      expect(p.status).to.equal(Status.Delivered);
      expect(p.custodian).to.equal(retailer.address);
      expect(p.certified).to.equal(true);
      expect(p.breached).to.equal(false);
      expect(p.recalled).to.equal(false);
      expect((await registry.getHistory(productId)).length).to.equal(6);
      expect((await registry.getDocuments(productId)).length).to.equal(3);
    });
  });
});
