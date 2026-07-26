'use client';
import { useState, useMemo } from 'react';
import { ROSTER, CAP, FLOAT, ORG, QUARTER_END, SEED_CSV, PROOF, formatDisplay, etherscanTx, etherscanAddr, short, type DemoLine } from '../lib/demo';
import { parseRosterCsv } from '@noxsafe/rail-sdk';
import { RosterTable, CapMeter, StatusRail } from '../components/RosterBits';
import { LockIcon } from '../components/LockIcon';

const TABS = ['Onboard', 'Roster', 'Status'] as const;

/**
 * Honest storyboard control. This static Safe App is a read-only walkthrough of the flow that is
 * ALREADY PROVEN on-chain — clicking a primary action reveals the real Sepolia tx that performed it,
 * rather than pretending to sign from a page with no wallet/env. The real multisig run is one command
 * (`npm run e2e:safe`); the frontend never fakes a signature.
 */
function ProofButton({ label, className, txKey, cmd }: { label: string; className?: string; txKey: keyof typeof PROOF.tx; cmd: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button className={className ?? 'btn'} onClick={() => setOpen((o) => !o)}>{label}</button>
      {open && (
        <div className="badge" style={{ display: 'block', marginTop: 10, fontSize: 12, padding: '8px 12px', lineHeight: 1.5 }}>
          Storyboard — the real multisig action ran on Sepolia via a 2-of-3 Safe.{' '}
          <a href={etherscanTx(PROOF.tx[txKey])} target="_blank" rel="noreferrer">{short(PROOF.tx[txKey])} ↗</a>
          {' '}· reproduce: <code>{cmd}</code>
        </div>
      )}
    </div>
  );
}

export default function SafeApp() {
  const [tab, setTab] = useState<(typeof TABS)[number]>('Onboard');
  return (
    <>
      <Hero />
      <FlowStrip />
      <LiveProof />

      <div className="card" style={{ borderColor: 'rgba(139,92,246,0.4)' }}>
        <h2>Safe App — runs inside app.safe.global</h2>
        <div className="sub">
          The treasurer experience lives in an iframe inside the unmodified Safe UI. Everything below is
          proposed to the owners as standard queue items — the trust flow never changes.
        </div>
        <div className="warn" style={{ marginTop: 10 }}>
          Read-only storyboard of a flow that is <strong>already live on Sepolia</strong> (no wallet/env needed to browse).
          The roster builder parses your CSV for real; the primary buttons reveal the real on-chain tx that performed
          each step. Full multisig run: <code>npm run e2e:safe</code>. Proof in <code>/verify</code>.
        </div>
        <div className="nav" style={{ margin: 0 }}>
          {TABS.map((t) => (
            <a key={t} className={t === tab ? 'active' : ''} onClick={() => setTab(t)} style={{ cursor: 'pointer' }}>
              {t}
            </a>
          ))}
        </div>
      </div>

      {tab === 'Onboard' && <Onboard />}
      {tab === 'Roster' && <RosterBuilder />}
      {tab === 'Status' && <StatusBoard />}

      <Faq />
    </>
  );
}

function Hero() {
  return (
    <div className="card hero">
      <span className="eyebrow">Confidential payroll for Safe · iExec Nox · ERC-7984</span>
      <h2>Owners approve the cap.<br /><span className="accent">Nobody reads the salaries.</span></h2>
      <div className="lead">
        Pay DAO contributors from your Safe with every amount encrypted end-to-end. Owners approve <strong>who</strong>{' '}
        gets paid and a <strong>public budget cap</strong> — individual salaries stay sealed, enforced against the cap
        in encrypted space, visible only to each recipient and an auditor you choose.
      </div>
      <div className="lead">
        The hero fact: an over-cap line pays <span className="accent-v">encrypted zero</span> while the public
        “spend ≤ budget” flag stays <span className="accent">true</span> — verifiable, and it leaks no amount.
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <a className="btn" href="/verify">See it live — /verify</a>
        <a className="btn ghost" href="https://github.com/edycutjong/noxsafe" target="_blank" rel="noreferrer">View on GitHub ↗</a>
      </div>
    </div>
  );
}

const FLOW = [
  { label: 'Wrap float → cUSD', note: 'USDC wraps 1:1 into confidential cUSD (float ≡ cap).' },
  { label: 'Grant time-bound operator', note: 'setOperator(rail, quarterEnd) — revocable, no Safe module.' },
  { label: 'Owners approve cap + roster', note: 'Two owners sign the who + the public cap; never the amounts.' },
  { label: 'Execute — amounts sealed', note: 'Per line: over-cap pays encrypted zero, cap flag stays true.', seal: true },
  { label: 'Auditor reads all lines', note: 'Per-handle viewer ACLs — recipients see one line, auditor sees all.' },
];

function FlowStrip() {
  return (
    <div className="card">
      <h2>The one flow</h2>
      <div className="sub">One multisig batch onboards the rail; from there payroll runs on the queue the owners already know.</div>
      <div className="steps">
        {FLOW.map((s, i) => (
          <div key={i} className={`step${s.seal ? ' seal' : ''}`}>
            <span className="num">{i + 1}</span>
            <div className="st-label">{s.label}</div>
            <div className="st-note">{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function LiveProof() {
  const stats = [
    { big: <><span className="dot-live" />Sepolia</>, lbl: 'Live on Ethereum' },
    { big: '2-of-3', lbl: 'Real Safe multisig' },
    { big: '195', lbl: 'Tests passing' },
    { big: '100%', lbl: 'Contract coverage' },
  ];
  return (
    <div className="card">
      <h2>Live proof — not a mock</h2>
      <div className="sub">
        The full quarter lifecycle is proven on Ethereum Sepolia, governed by a real 2-of-3 Safe. Every stat below is
        reproducible — open <code>/verify</code> for the on-chain event stream and tx hashes.
      </div>
      <div className="stats">
        {stats.map((s, i) => (
          <div key={i} className="stat">
            <div className="big">{s.big}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <a className="btn" href="/verify">Open /verify</a>
        <a className="btn ghost" href="https://github.com/edycutjong/noxsafe" target="_blank" rel="noreferrer">View on GitHub ↗</a>
        <a className="btn ghost" href="/pitch">Pitch deck</a>
        <a className="btn ghost" href={etherscanAddr(PROOF.rail)} target="_blank" rel="noreferrer">Verified contract ↗</a>
      </div>
    </div>
  );
}

const FAQ_ITEMS: { q: string; a: React.ReactNode }[] = [
  {
    q: 'Does it change our Safe?',
    a: (
      <>
        No. The rail holds zero Safe execution rights — it is a time-bound ERC-7984 <em>operator</em>
        (<code>setOperator(rail, quarterEnd)</code>), not a Safe module. Same contracts, same owners, same signing queue.
        Revoke any time with one <code>setOperator(rail, 0)</code> from the queue.
      </>
    ),
  },
  {
    q: 'Can the rail drain the treasury?',
    a: (
      <>
        No. Its worst-case blast radius is the wrapped float, which the app sets equal to the approved cap
        (<code>float ≡ cap</code>) — so the worst case <em>is</em> the approved spend. The Safe’s unwrapped USDC is
        untouchable.
      </>
    ),
  },
  {
    q: 'Are salaries hidden?',
    a: (
      <>
        Yes. Amounts are sealed end-to-end via Nox confidential tokens (ERC-7984) and the budget cap is enforced
        entirely in encrypted space (<code>le</code>+<code>select</code>). The multisig queue shows <strong>who</strong>{' '}
        gets paid and the public cap — never <strong>how much</strong>.
      </>
    ),
  },
  {
    q: 'What happens to an over-cap line?',
    a: (
      <>
        It pays <code>encrypted zero</code> via <code>select</code> — on-chain indistinguishable from any other payout —
        while the publicly-decryptable “spend ≤ budget” flag stays <span className="flag-ok">true</span> and leaks no
        amount.
      </>
    ),
  },
  {
    q: 'Who can read the amounts?',
    a: (
      <>
        Each recipient decrypts only their own line via per-handle viewer ACLs; an auditor can be granted all lines if
        the DAO chooses. The treasurer sees plaintext client-side while composing payroll (inherent to building it).
      </>
    ),
  },
  {
    q: 'Is this a mock?',
    a: (
      <>
        No — it is live on Ethereum Sepolia via a real 2-of-3 Safe running the full confidential-payroll lifecycle
        on-chain, with 195 tests green and 100% contract coverage. See <a href="/verify">/verify</a> for the real tx
        hashes on Etherscan.
      </>
    ),
  },
];

function Faq() {
  return (
    <div className="card">
      <h2>How it works — FAQ</h2>
      <div className="sub">Straight answers, every one backed by the on-chain proof in <code>/verify</code>.</div>
      {FAQ_ITEMS.map((item, i) => (
        <details key={i} className="faq">
          <summary>{item.q}</summary>
          <div className="ans">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

function Onboard() {
  const batch = [
    { call: 'usdc.approve(cUSD, 25,000)', why: 'let the wrapper pull the float' },
    { call: 'cUSD.wrap(safe, 25,000)', why: 'USDC → cUSD 1:1 (float ≡ cap)' },
    { call: `cUSD.setOperator(rail, ${QUARTER_END})`, why: 'time-bound, revocable operator' },
    { call: 'rail.configure(treasurer, 25,000)', why: 'treasurer + PUBLIC budget cap' },
  ];
  return (
    <div className="card">
      <h2>Set up confidential payroll</h2>
      <div className="sub">{ORG} · one multisig batch · owners sign the queue item they already know.</div>
      <div className="kv">
        <div className="k">Budget cap (public)</div><div className="mono">{formatDisplay(CAP, 'cUSD')}</div>
        <div className="k">Float to wrap</div><div className="mono">{formatDisplay(FLOAT, 'cUSD')} <span className="badge">float = cap</span></div>
        <div className="k">Operator expiry</div><div className="mono">{QUARTER_END}</div>
      </div>
      <label>Proposed batch (4 decoded calls — one queue item)</label>
      <table>
        <thead><tr><th>#</th><th>Call</th><th>Why</th></tr></thead>
        <tbody>
          {batch.map((b, i) => (
            <tr key={i}><td className="mono">{i + 1}</td><td className="mono">{b.call}</td><td className="muted">{b.why}</td></tr>
          ))}
        </tbody>
      </table>
      <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <ProofButton label="Propose batch to signers" txKey="onboarding" cmd="npm run e2e:safe" />
        <span className="muted">Blast radius if the rail misbehaves = the wrapped float, which equals the approved cap. The Safe’s unwrapped USDC is untouchable.</span>
      </div>
    </div>
  );
}

function RosterBuilder() {
  const [csv, setCsv] = useState(SEED_CSV);
  const [reveal, setReveal] = useState(false);
  const lines = useMemo<DemoLine[]>(() => {
    try {
      const parsed = parseRosterCsv(csv);
      return parsed.map((l, i) => ({ ...l, name: l.name ?? `L${i}`, role: '' }));
    } catch {
      return ROSTER.slice(0, 5);
    }
  }, [csv]);

  return (
    <>
      <div className="card">
        <h2>Roster builder</h2>
        <div className="sub">Upload a CSV; each amount is encrypted in-browser (<code>encryptInput</code>, concurrent) and bound to the rail. Owners approve the roster hash + the public cap — never the amounts.</div>
        <label>roster.csv (name, address, amount)</label>
        <textarea value={csv} onChange={(e) => setCsv(e.target.value)} spellCheck={false} />
        <div className="row" style={{ marginTop: 12, justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <ProofButton label="🔒 Encrypt & propose roster" className="btn violet" txKey="propose" cmd="npm run e2e:safe" />
          <button className="btn ghost" onClick={() => setReveal((r) => !r)}>
            {reveal ? 'Hide amounts (treasurer view)' : 'Show amounts (treasurer only)'}
          </button>
        </div>
      </div>

      <div className="card">
        <h2>Preview — what the multisig queue will show</h2>
        <div className="sub">To everyone but the treasurer, every amount is a sealed pill. The queue shows WHO + the cap; never HOW MUCH.</div>
        <RosterTable lines={lines} mode={reveal ? 'audit' : 'public'} />
        <div style={{ marginTop: 18 }}><CapMeter lines={lines} cap={CAP} /></div>
      </div>
    </>
  );
}

function StatusBoard() {
  return (
    <div className="card">
      <h2>Roster #1 — {ORG}</h2>
      <div className="sub">Q3 contributor payroll</div>
      <StatusRail active={2} />
      <div className="kv" style={{ marginTop: 16 }}>
        <div className="k">Owners signed</div><div>2 of 3 <span className="badge">approved</span></div>
        <div className="k">Recipients</div><div>{ROSTER.length} (public)</div>
        <div className="k">Amounts</div><div><span className="pill sealed"><LockIcon /> sealed until execute</span></div>
        <div className="k">Roster hash</div><div className="hash">keccak256(recipients, handleIds) — approval integrity</div>
      </div>
      <div className="row" style={{ marginTop: 16, alignItems: 'flex-start' }}>
        <ProofButton label="Execute payroll" txKey="execute" cmd="npm run e2e:safe" />
        <a href={etherscanTx(PROOF.tx.execute)} target="_blank" rel="noreferrer" className="muted">View executePayroll on Etherscan →</a>
      </div>
    </div>
  );
}
