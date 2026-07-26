'use client';
import { useState } from 'react';
import { ROSTER, CAP, PROOF, formatDisplay, capStatus, short, etherscanAddr, etherscanTx } from '../../lib/demo';
import { LockIcon } from '../../components/LockIcon';

const EVENTS = [
  { ev: 'RosterProposed', args: 'id=1, hash=0x…, lines=6', tx: PROOF.tx.propose },
  { ev: 'RosterApproved', args: 'id=1', tx: PROOF.tx.approve },
  { ev: 'Paid', args: 'id=1, i=0…5, handles only', tx: PROOF.tx.execute },
  { ev: 'RosterSettled', args: 'id=1', tx: PROOF.tx.execute },
  { ev: 'BudgetComplianceProven', args: 'spend ≤ budget = true', tx: PROOF.tx.proveBudget },
];

export default function Verify() {
  const [before, setBefore] = useState(false);
  const s = capStatus(ROSTER, CAP);

  return (
    <>
      <div className="card">
        <h2>/verify — judge dashboard</h2>
        <div className="sub">Live roster events, publicly-decryptable cap checks, and every handle’s ACL. Zero mocks: on Sepolia these read straight off the chain + the Nox gateway.</div>
        <div className="row">
          <button className={`btn ${before ? 'ghost' : ''}`} onClick={() => setBefore(false)}>NoxSafe queue</button>
          <button className={`btn ${before ? '' : 'ghost'}`} onClick={() => setBefore(true)}>Before: naked ERC-20 batch</button>
        </div>
        <div style={{ marginTop: 14 }}>
          {before ? (
            <table>
              <thead><tr><th>#</th><th>Call in the Safe queue</th><th>Amount (public!)</th></tr></thead>
              <tbody>
                {ROSTER.slice(0, 5).map((l, i) => (
                  <tr key={i}><td className="mono">{i}</td><td className="mono">usdc.transfer({l.recipient.slice(0, 8)}…)</td><td className="flag-over mono">{formatDisplay(l.amount, 'USDC')}</td></tr>
                ))}
              </tbody>
            </table>
          ) : (
            <table>
              <thead><tr><th>#</th><th>Call in the Safe queue</th><th>Amount</th></tr></thead>
              <tbody>
                {['approve(cUSD, 25000)', 'wrap(safe, 25000)', 'setOperator(rail, Q3-end)', 'approveRoster(1)'].map((c, i) => (
                  <tr key={i}><td className="mono">{i}</td><td className="mono">{c}</td><td><span className="pill sealed"><LockIcon /> none</span></td></tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <div className="card">
        <h2>Cap-compliance checks (publicly decryptable)</h2>
        <div className="sub"><code>publicDecrypt(okHandle)</code> per line — anyone audits compliance without seeing a single amount.</div>
        <div className="row">
          {s.perLineOk.map((ok, i) => (
            <span key={i} className={`pill ${ok ? 'unsealed' : 'sealed'}`} style={ok ? {} : { background: 'rgba(248,113,113,0.14)', color: '#F87171', borderColor: 'rgba(248,113,113,0.4)' }}>
              L{i}: {ok ? 'true' : 'false — over cap, paid encrypted zero'}
            </span>
          ))}
        </div>
        <div className="muted" style={{ marginTop: 12 }}>Aggregate proof: <code>proveSpendWithinBudget()</code> → “spend ≤ budget” = <span className="flag-ok">true</span> (24,000 paid ≤ 25,000 cap; the total is never revealed).</div>
      </div>

      <div className="card">
        <h2>Live event stream — real Sepolia txs from the funded 2-of-3 Safe run</h2>
        <div className="sub">Every hash below opens on Etherscan. The <code>Paid</code> events carry handles only — no amounts.</div>
        <table>
          <thead><tr><th>Event</th><th>Args</th><th>Tx (Sepolia)</th></tr></thead>
          <tbody>
            {EVENTS.map((e, i) => (
              <tr key={i}><td className="mono">{e.ev}</td><td className="muted mono" style={{ fontSize: 12 }}>{e.args}</td><td className="hash"><a href={etherscanTx(e.tx)} target="_blank" rel="noreferrer">{short(e.tx)} ↗</a></td></tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>Contracts + benchmarks (real, on-chain)</h2>
        <div className="sub">Live on Ethereum Sepolia — click any address to verify on Etherscan.</div>
        <div className="kv">
          <div className="k">PayrollRail</div><div className="hash"><a href={etherscanAddr(PROOF.rail)} target="_blank" rel="noreferrer">{short(PROOF.rail)} ↗</a> <span className="badge">Etherscan-verified</span></div>
          <div className="k">ConfidentialUSD (cUSD)</div><div className="hash"><a href={etherscanAddr(PROOF.cUSD)} target="_blank" rel="noreferrer">{short(PROOF.cUSD)} ↗</a> <span className="badge">reused · verified</span></div>
          <div className="k">Demo Safe (2-of-3)</div><div className="hash"><a href={etherscanAddr(PROOF.safe)} target="_blank" rel="noreferrer">{short(PROOF.safe)} ↗</a></div>
          <div className="k">Nox protocol</div><div className="hash"><a href={etherscanAddr(PROOF.nox)} target="_blank" rel="noreferrer">{short(PROOF.nox)} ↗</a></div>
        </div>
        <div className="row" style={{ marginTop: 14 }}>
          <div className="card" style={{ flex: 1, margin: 0, textAlign: 'center' }}><div className="muted">concurrent encrypt ×10</div><div style={{ fontSize: 22 }}>{(PROOF.bench.concurrentEncryptMs / 1000).toFixed(1)}s</div><div className="muted" style={{ fontSize: 11 }}>{PROOF.bench.encryptPerLineMs} ms/line</div></div>
          <div className="card" style={{ flex: 1, margin: 0, textAlign: 'center' }}><div className="muted">per-payout gas</div><div style={{ fontSize: 22 }}>{PROOF.bench.perPayoutGas.toLocaleString()}</div></div>
          <div className="card" style={{ flex: 1, margin: 0, textAlign: 'center' }}><div className="muted">decrypt p50 / p95</div><div style={{ fontSize: 22 }}>{PROOF.bench.decryptP50Ms}ms / {(PROOF.bench.decryptP95Ms / 1000).toFixed(1)}s</div></div>
        </div>
        <div className="muted" style={{ marginTop: 10 }}>Numbers from <code>fixtures/bench.json</code> (reproduce with <code>npm run bench</code>).</div>
      </div>
    </>
  );
}
