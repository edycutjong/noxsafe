const { expect } = require("chai");
const { ethers } = require("hardhat");
const { deployRailFixture, encryptInputs, makeInputHandle, makeProof, RosterStatus } = require("./helpers");

const U = (n) => BigInt(n) * 10n ** 6n; // human -> 6-decimal base units
const CAP = U(25_000);

describe("PayrollRail — configure (onboarding)", () => {
  it("onlySafe: a non-safe caller reverts NotSafe", async () => {
    const { rail, signers } = await deployRailFixture();
    await expect(rail.connect(signers.treasurer).configure(signers.treasurer.address, CAP))
      .to.be.revertedWithCustomError(rail, "NotSafe");
  });

  it("safe can configure; sets treasurer + cap + configured", async () => {
    const { rail, signers } = await deployRailFixture();
    await rail.connect(signers.safe).configure(signers.treasurer.address, CAP);
    expect(await rail.treasurer()).to.equal(signers.treasurer.address);
    expect(await rail.cap()).to.equal(CAP);
    expect(await rail.configured()).to.equal(true);
  });

  it("initializes the encrypted spend accumulator to a non-zero (typed-zero) handle", async () => {
    const { rail, signers } = await deployRailFixture();
    await rail.connect(signers.safe).configure(signers.treasurer.address, CAP);
    expect(await rail.spentHandle()).to.not.equal(ethers.ZeroHash);
  });

  it("emits Configured(treasurer, cap)", async () => {
    const { rail, signers } = await deployRailFixture();
    await expect(rail.connect(signers.safe).configure(signers.treasurer.address, CAP))
      .to.emit(rail, "Configured").withArgs(signers.treasurer.address, CAP);
  });

  it("re-configure updates cap without wiping the accumulator handle", async () => {
    const { rail, signers } = await deployRailFixture();
    await rail.connect(signers.safe).configure(signers.treasurer.address, CAP);
    const spent0 = await rail.spentHandle();
    await rail.connect(signers.safe).configure(signers.treasurer.address, U(30_000));
    expect(await rail.cap()).to.equal(U(30_000));
    expect(await rail.spentHandle()).to.equal(spent0);
  });

  it("wires immutable safe + cUSD at construction", async () => {
    const { rail, token, signers } = await deployRailFixture();
    expect(await rail.safe()).to.equal(signers.safe.address);
    expect(await rail.cUSD()).to.equal(await token.getAddress());
  });

  it("reports the rail as the active operator after onboarding", async () => {
    const { rail } = await deployRailFixture();
    expect(await rail.isActiveOperator()).to.equal(true);
  });
});

describe("PayrollRail — proposeRoster", () => {
  async function configured() {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    return f;
  }

  it("before configure there is no treasurer, so propose is gated (NotTreasurer)", async () => {
    // configure() sets treasurer + configured together, so the onlyTreasurer gate fires first for any
    // pre-configure propose — passing onlyTreasurer already implies configured, which is why proposeRoster
    // carries no separate NotConfigured check (the reachable NotConfigured path is proveSpendWithinBudget).
    const { rail, signers, recipients } = await deployRailFixture();
    const { handles, proofs } = encryptInputs(1);
    await expect(
      rail.connect(signers.treasurer).proposeRoster([recipients[0].address], handles, proofs)
    ).to.be.revertedWithCustomError(rail, "NotTreasurer");
  });

  it("onlyTreasurer: a non-treasurer caller reverts NotTreasurer", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(1);
    await expect(
      rail.connect(signers.stranger).proposeRoster([recipients[0].address], handles, proofs)
    ).to.be.revertedWithCustomError(rail, "NotTreasurer");
  });

  it("reverts EmptyRoster on a zero-length roster", async () => {
    const { rail, signers } = await configured();
    await expect(rail.connect(signers.treasurer).proposeRoster([], [], []))
      .to.be.revertedWithCustomError(rail, "EmptyRoster");
  });

  it("reverts LengthMismatch when handles/proofs/recipients disagree", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(2);
    await expect(
      rail.connect(signers.treasurer).proposeRoster([recipients[0].address], handles, proofs)
    ).to.be.revertedWithCustomError(rail, "LengthMismatch");
  });

  it("reverts LengthMismatch when ONLY proofs disagree (handles match recipients)", async () => {
    // Covers the second operand of `handles.length != n || proofs.length != n`: the first check passes
    // (handles.length == n), so the guard fires only via the proofs-length mismatch.
    const { rail, signers, recipients } = await configured();
    const { handles } = encryptInputs(2);
    const { proofs } = encryptInputs(3);
    const addrs = [recipients[0].address, recipients[1].address];
    await expect(
      rail.connect(signers.treasurer).proposeRoster(addrs, handles, proofs)
    ).to.be.revertedWithCustomError(rail, "LengthMismatch");
  });

  it("stores a 5-line roster in PROPOSED with a non-zero roster hash", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    const id = await rail.connect(signers.treasurer).proposeRoster.staticCall(
      recipients.map((r) => r.address), handles, proofs
    );
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    expect(id).to.equal(1n);
    expect(await rail.rosterStatus(1)).to.equal(RosterStatus.Proposed);
    expect(await rail.lineCount(1)).to.equal(5n);
    expect(await rail.rosterHash(1)).to.not.equal(ethers.ZeroHash);
  });

  it("emits RosterProposed(id, hash, lineCount)", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    const addrs = recipients.map((r) => r.address);
    const expectedHash = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address[]", "bytes32[]"], [addrs, handles])
    );
    await expect(rail.connect(signers.treasurer).proposeRoster(addrs, handles, proofs))
      .to.emit(rail, "RosterProposed").withArgs(1, expectedHash, 5);
  });

  it("roster hash matches keccak256(abi.encode(recipients, handleIds)) — approval integrity (I3)", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(3);
    const addrs = recipients.slice(0, 3).map((r) => r.address);
    await rail.connect(signers.treasurer).proposeRoster(addrs, handles, proofs);
    const expected = ethers.keccak256(
      ethers.AbiCoder.defaultAbiCoder().encode(["address[]", "bytes32[]"], [addrs, handles])
    );
    expect(await rail.rosterHash(1)).to.equal(expected);
  });

  it("stores each recipient at its line index", async () => {
    const { rail, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    for (let i = 0; i < 5; i++) {
      expect(await rail.lineRecipient(1, i)).to.equal(recipients[i].address);
    }
  });

  it("ACL exactness (I4): each recipient is a VIEWER of exactly their own line", async () => {
    const { rail, nox, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    for (let i = 0; i < 5; i++) {
      const h = await rail.lineAmountHandle(1, i);
      expect(await nox.isViewer(h, recipients[i].address)).to.equal(true);
    }
  });

  it("ACL exactness (I4): a recipient is NOT a viewer of another recipient's line", async () => {
    const { rail, nox, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    const line0 = await rail.lineAmountHandle(1, 0);
    expect(await nox.isViewer(line0, recipients[1].address)).to.equal(false);
  });

  it("ACL exactness (I4): a stranger can neither view nor access any line", async () => {
    const { rail, nox, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    const line0 = await rail.lineAmountHandle(1, 0);
    expect(await nox.isViewer(line0, signers.stranger.address)).to.equal(false);
    expect(await nox.isAllowed(line0, signers.stranger.address)).to.equal(false);
  });

  it("the rail holds persistent access to every line handle (allowThis)", async () => {
    const { rail, nox, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(5);
    await rail.connect(signers.treasurer).proposeRoster(recipients.map((r) => r.address), handles, proofs);
    const railAddr = await rail.getAddress();
    for (let i = 0; i < 5; i++) {
      const h = await rail.lineAmountHandle(1, i);
      expect(await nox.isAllowed(h, railAddr)).to.equal(true);
    }
  });

  it("line handles are non-public (confidential) — ACL actually applies", async () => {
    const { rail, nox, signers, recipients } = await configured();
    const { handles, proofs } = encryptInputs(2);
    await rail.connect(signers.treasurer).proposeRoster(
      [recipients[0].address, recipients[1].address], handles, proofs
    );
    const h = await rail.lineAmountHandle(1, 0);
    expect(await nox.isPubliclyDecryptable(h)).to.equal(false);
  });

  it("assigns sequential roster ids", async () => {
    const { rail, signers, recipients } = await configured();
    const a = encryptInputs(1), b = encryptInputs(1);
    await rail.connect(signers.treasurer).proposeRoster([recipients[0].address], a.handles, a.proofs);
    await rail.connect(signers.treasurer).proposeRoster([recipients[1].address], b.handles, b.proofs);
    expect(await rail.rosterCount()).to.equal(2n);
    expect(await rail.rosterStatus(2)).to.equal(RosterStatus.Proposed);
  });
});

describe("PayrollRail — approveRoster (multisig)", () => {
  async function proposed(n = 5) {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(n);
    const addrs = f.recipients.slice(0, n).map((r) => r.address);
    await f.rail.connect(f.signers.treasurer).proposeRoster(addrs, handles, proofs);
    return f;
  }

  it("onlySafe: a non-safe caller reverts NotSafe", async () => {
    const { rail, signers } = await proposed();
    await expect(rail.connect(signers.treasurer).approveRoster(1))
      .to.be.revertedWithCustomError(rail, "NotSafe");
  });

  it("safe approves: status -> APPROVED, emits RosterApproved", async () => {
    const { rail, signers } = await proposed();
    await expect(rail.connect(signers.safe).approveRoster(1))
      .to.emit(rail, "RosterApproved").withArgs(1);
    expect(await rail.rosterStatus(1)).to.equal(RosterStatus.Approved);
  });

  it("reverts BadRosterState when approving a non-proposed roster (double approve)", async () => {
    const { rail, signers } = await proposed();
    await rail.connect(signers.safe).approveRoster(1);
    await expect(rail.connect(signers.safe).approveRoster(1))
      .to.be.revertedWithCustomError(rail, "BadRosterState");
  });

  it("reverts BadRosterState when approving an unknown roster id", async () => {
    const { rail, signers } = await proposed();
    await expect(rail.connect(signers.safe).approveRoster(99))
      .to.be.revertedWithCustomError(rail, "BadRosterState");
  });
});

describe("PayrollRail — executePayroll (encrypted budget invariant)", () => {
  async function approved(n = 5) {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(n);
    const addrs = f.recipients.slice(0, n).map((r) => r.address);
    await f.rail.connect(f.signers.treasurer).proposeRoster(addrs, handles, proofs);
    await f.rail.connect(f.signers.safe).approveRoster(1);
    return { ...f, addrs };
  }

  it("reverts BadRosterState if the roster is not APPROVED", async () => {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(2);
    await f.rail.connect(f.signers.treasurer).proposeRoster(
      [f.recipients[0].address, f.recipients[1].address], handles, proofs
    );
    await expect(f.rail.executePayroll(1)).to.be.revertedWithCustomError(f.rail, "BadRosterState");
  });

  it("anyone may execute once approved; status -> SETTLED", async () => {
    const { rail, signers } = await approved();
    await rail.connect(signers.stranger).executePayroll(1);
    expect(await rail.rosterStatus(1)).to.equal(RosterStatus.Settled);
  });

  it("performs exactly one confidentialTransferFrom per line (operator-pull)", async () => {
    const { rail, token, signers } = await approved(5);
    await rail.executePayroll(1);
    expect(await token.transferCount()).to.equal(5n);
  });

  it("moves each payout from the Safe to the recipient (last transfer = last line)", async () => {
    const { rail, token, signers, addrs } = await approved(5);
    await rail.executePayroll(1);
    expect(await token.lastFrom()).to.equal(signers.safe.address);
    expect(await token.lastTo()).to.equal(addrs[4]);
  });

  it("emits Paid for every line and RosterSettled once", async () => {
    const { rail, addrs } = await approved(5);
    const tx = await rail.executePayroll(1);
    const rc = await tx.wait();
    const paid = rc.logs.filter((l) => { try { return rail.interface.parseLog(l)?.name === "Paid"; } catch { return false; } });
    const settled = rc.logs.filter((l) => { try { return rail.interface.parseLog(l)?.name === "RosterSettled"; } catch { return false; } });
    expect(paid.length).to.equal(5);
    expect(settled.length).to.equal(1);
  });

  it("marks every line's cap-compliance flag publicly decryptable (public audit)", async () => {
    const { rail, nox } = await approved(5);
    await rail.executePayroll(1);
    for (let i = 0; i < 5; i++) {
      const ok = await rail.lineOkHandle(1, i);
      expect(await nox.isPubliclyDecryptable(ok)).to.equal(true);
    }
  });

  it("keeps the encrypted spend accumulator rail-owned + confidential after settle", async () => {
    const { rail, nox } = await approved(5);
    await rail.executePayroll(1);
    const spent = await rail.spentHandle();
    expect(await nox.isAllowed(spent, await rail.getAddress())).to.equal(true);
    expect(await nox.isPubliclyDecryptable(spent)).to.equal(false);
  });

  it("records the settled roster id", async () => {
    const { rail } = await approved(3);
    await rail.executePayroll(1);
    const ids = await rail.settledRosterIds();
    expect(ids.map((x) => Number(x))).to.deep.equal([1]);
  });

  it("cannot re-execute a settled roster", async () => {
    const { rail } = await approved(2);
    await rail.executePayroll(1);
    await expect(rail.executePayroll(1)).to.be.revertedWithCustomError(rail, "BadRosterState");
  });

  it("over-cap probe: a 6-line roster still settles and every ok flag is publicly auditable", async () => {
    // Seed data: 5 lines (24,000) + a 6th over-cap line (2,000) that breaches the 25,000 cap.
    // Locally we assert the STRUCTURE (all six ok flags are public; the 6th decrypts to `false` on
    // Sepolia where the TEE computes plaintext). No line amount is ever revealed on-chain.
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(6);
    const addrs = [...f.recipients.map((r) => r.address), f.signers.stranger.address];
    await f.rail.connect(f.signers.treasurer).proposeRoster(addrs, handles, proofs);
    await f.rail.connect(f.signers.safe).approveRoster(1);
    await f.rail.executePayroll(1);
    expect(await f.rail.rosterStatus(1)).to.equal(RosterStatus.Settled);
    expect(await f.token.transferCount()).to.equal(6n);
    for (let i = 0; i < 6; i++) {
      expect(await f.nox.isPubliclyDecryptable(await f.rail.lineOkHandle(1, i))).to.equal(true);
    }
  });

  it("accumulates spend across multiple settled rosters (per-quarter accumulator)", async () => {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    // roster 1
    let e = encryptInputs(2);
    await f.rail.connect(f.signers.treasurer).proposeRoster(
      [f.recipients[0].address, f.recipients[1].address], e.handles, e.proofs);
    await f.rail.connect(f.signers.safe).approveRoster(1);
    await f.rail.executePayroll(1);
    const spent1 = await f.rail.spentHandle();
    // roster 2
    e = encryptInputs(2);
    await f.rail.connect(f.signers.treasurer).proposeRoster(
      [f.recipients[2].address, f.recipients[3].address], e.handles, e.proofs);
    await f.rail.connect(f.signers.safe).approveRoster(2);
    await f.rail.executePayroll(2);
    const spent2 = await f.rail.spentHandle();
    expect(spent2).to.not.equal(spent1); // accumulator advanced
    const ids = (await f.rail.settledRosterIds()).map((x) => Number(x));
    expect(ids).to.deep.equal([1, 2]);
  });

  it("reverts if the rail's operator grant has been revoked (setOperator(rail,0))", async () => {
    const { rail, token, signers } = await approved(2);
    await token.connect(signers.safe).setOperator(await rail.getAddress(), 0); // revoke
    await expect(rail.executePayroll(1)).to.be.revertedWithCustomError(token, "NotOperator");
  });
});

describe("PayrollRail — disclosure grants (the ACL org chart)", () => {
  async function settled(n = 5) {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(n);
    const addrs = f.recipients.slice(0, n).map((r) => r.address);
    await f.rail.connect(f.signers.treasurer).proposeRoster(addrs, handles, proofs);
    await f.rail.connect(f.signers.safe).approveRoster(1);
    await f.rail.executePayroll(1);
    return f;
  }

  it("grantAuditor onlySafe", async () => {
    const { rail, signers } = await settled();
    await expect(rail.connect(signers.stranger).grantAuditor(signers.auditor.address))
      .to.be.revertedWithCustomError(rail, "NotSafe");
  });

  it("grantAuditor reverts NoSettledRosters before any settlement", async () => {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    await expect(f.rail.connect(f.signers.safe).grantAuditor(f.signers.auditor.address))
      .to.be.revertedWithCustomError(f.rail, "NoSettledRosters");
  });

  it("auditor becomes a VIEWER of every settled line; emits AuditorGranted(auditor, 5)", async () => {
    const { rail, nox, signers } = await settled(5);
    await expect(rail.connect(signers.safe).grantAuditor(signers.auditor.address))
      .to.emit(rail, "AuditorGranted").withArgs(signers.auditor.address, 5);
    for (let i = 0; i < 5; i++) {
      expect(await nox.isViewer(await rail.lineAmountHandle(1, i), signers.auditor.address)).to.equal(true);
    }
    expect(await rail.auditor()).to.equal(signers.auditor.address);
  });

  it("auditor is a read-only VIEWER, not an ADMIN (cannot grant)", async () => {
    const { rail, nox, signers } = await settled(3);
    await rail.connect(signers.safe).grantAuditor(signers.auditor.address);
    const h = await rail.lineAmountHandle(1, 0);
    // viewer => can read, but is not `allowed` (admin/compute) — the least-privilege distinction
    expect(await nox.isViewer(h, signers.auditor.address)).to.equal(true);
    expect(await nox.isAllowed(h, signers.auditor.address)).to.equal(false);
  });

  it("grantOfficer grants ADMIN (isAllowed) over every settled line; emits OfficerGranted", async () => {
    const { rail, nox, signers } = await settled(5);
    await expect(rail.connect(signers.safe).grantOfficer(signers.officer.address))
      .to.emit(rail, "OfficerGranted").withArgs(signers.officer.address, 5);
    for (let i = 0; i < 5; i++) {
      const h = await rail.lineAmountHandle(1, i);
      expect(await nox.isAllowed(h, signers.officer.address)).to.equal(true); // admin can decrypt AND compute
      expect(await nox.isViewer(h, signers.officer.address)).to.equal(true);
    }
    expect(await rail.complianceOfficer()).to.equal(signers.officer.address);
  });

  it("grantOfficer onlySafe + NoSettledRosters guard", async () => {
    const { rail, signers } = await settled();
    await expect(rail.connect(signers.stranger).grantOfficer(signers.officer.address))
      .to.be.revertedWithCustomError(rail, "NotSafe");
  });

  it("grantOfficer reverts NoSettledRosters before any settlement", async () => {
    // The safe (authorized) calls grantOfficer with zero settled rosters -> the s==0 guard fires
    // (mirrors the grantAuditor NoSettledRosters test; exercises grantOfficer's own guard branch).
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    await expect(f.rail.connect(f.signers.safe).grantOfficer(f.signers.officer.address))
      .to.be.revertedWithCustomError(f.rail, "NoSettledRosters");
  });
});

describe("PayrollRail — cryptographic accounting proof (Tier-B, additive)", () => {
  it("proveSpendWithinBudget publishes a public 'spend <= budget' ebool; emits event", async () => {
    const f = await deployRailFixture();
    await f.rail.connect(f.signers.safe).configure(f.signers.treasurer.address, CAP);
    const { handles, proofs } = encryptInputs(3);
    const addrs = f.recipients.slice(0, 3).map((r) => r.address);
    await f.rail.connect(f.signers.treasurer).proposeRoster(addrs, handles, proofs);
    await f.rail.connect(f.signers.safe).approveRoster(1);
    await f.rail.executePayroll(1);
    const tx = await f.rail.proveSpendWithinBudget();
    const rc = await tx.wait();
    const evt = rc.logs.map((l) => { try { return f.rail.interface.parseLog(l); } catch { return null; } })
      .find((x) => x?.name === "BudgetComplianceProven");
    expect(evt).to.not.equal(undefined);
    expect(await f.nox.isPubliclyDecryptable(evt.args.okHandle)).to.equal(true);
  });

  it("reverts NotConfigured before configure", async () => {
    const { rail } = await deployRailFixture();
    await expect(rail.proveSpendWithinBudget()).to.be.revertedWithCustomError(rail, "NotConfigured");
  });
});
