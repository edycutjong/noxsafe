'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
import {
  ROSTER, CAP, FLOAT, ORG, QUARTER_END, SEED_CSV, PROOF, YOU_INDEX,
  formatDisplay, etherscanTx, etherscanAddr, short, type DemoLine,
} from '../lib/demo';
import { parseRosterCsv } from '@noxsafe/rail-sdk';
import { RosterTable, CapMeter, StatusRail } from '../components/RosterBits';
import { LockIcon } from '../components/LockIcon';

const TABS = ['Onboard', 'Roster', 'Status'] as const;
const GITHUB_URL = 'https://github.com/edycutjong/noxsafe';

/* Presentational reduced-motion probe — gates every rAF/interval below. */
function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    const m = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(m.matches);
    const on = () => setReduced(m.matches);
    m.addEventListener('change', on);
    return () => m.removeEventListener('change', on);
  }, []);
  return reduced;
}

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

  // Scroll-reveal: fade/slide landing sections in as they enter the viewport (once).
  useEffect(() => {
    if (typeof window === 'undefined' || !('IntersectionObserver' in window)) return;
    const els = Array.from(document.querySelectorAll('.reveal'));
    const io = new IntersectionObserver((ents) => ents.forEach(e => { if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); } }), { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    els.forEach(el => io.observe(el));
    return () => io.disconnect();
  }, []);

  return (
    <>
      <Hero />
      <LiveProof />
      <FlowStrip />

      <div className="card reveal" style={{ borderColor: 'rgba(139,92,246,0.35)' }}>
        <span className="eyebrow">The product · runs inside app.safe.global</span>
        <h2>Try the treasurer flow</h2>
        <div className="sub">
          The treasurer experience lives in an iframe inside the unmodified Safe UI. Everything below is
          proposed to the owners as standard queue items — the trust flow never changes.
        </div>
        <div className="warn" style={{ marginTop: 10 }}>
          Read-only storyboard of a flow that is <strong>already live on Sepolia</strong> (no wallet/env needed to browse).
          The roster builder parses your CSV for real; the primary buttons reveal the real on-chain tx that performed
          each step. Full multisig run: <code>npm run e2e:safe</code>. Proof in <code>/verify</code>.
        </div>
        <div className="nav" style={{ margin: '14px 0 0' }}>
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

      <Credibility />
      <Faq />
      <FinalCta />
    </>
  );
}

/* ─────────────────────────── Hero + signature widget ─────────────────────────── */

function Hero() {
  return (
    <div className="card hero reveal">
      <div className="hero-grid">
        <div>
          <div className="hero-chips hero-in" style={{ ['--d' as any]: '0ms' }}>
            <span className="chip live"><span className="dot" /> Live on Sepolia</span>
            <span className="chip">Safe · ERC-7984</span>
            <span className="chip">2-of-3 multisig</span>
          </div>
          <div className="eyebrow hero-in" style={{ ['--d' as any]: '60ms', marginTop: 14 }}>Confidential payroll for Safe · iExec Nox</div>
          <h2 className="hero-in" style={{ ['--d' as any]: '120ms' }}>
            Owners approve the cap.<br />
            <span className="brand-gradient">Nobody reads the salaries.</span>
          </h2>
          <div className="lead hero-in" style={{ ['--d' as any]: '200ms' }}>
            Pay DAO contributors from your Safe with every amount encrypted end-to-end. Owners approve <strong>who</strong>{' '}
            gets paid and a <strong>public budget cap</strong> — individual salaries stay sealed, enforced against the cap
            in encrypted space, visible only to each recipient and an auditor you choose.
          </div>
          <div className="lead hero-in" style={{ ['--d' as any]: '280ms' }}>
            The devastating detail: an over-cap line pays <span className="accent-v">encrypted zero</span> while the public
            “spend ≤ budget” flag stays <span className="accent">true</span> — verifiable, and it leaks no amount.
          </div>
          <div className="row hero-in" style={{ marginTop: 18, ['--d' as any]: '360ms' }}>
            <a className="btn lg" href="/verify">See it live — /verify</a>
            <a className="btn ghost lg" href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub ↗</a>
          </div>
        </div>

        <div className="hero-in" style={{ ['--d' as any]: '260ms' }}>
          <CipherRoster />
        </div>
      </div>
    </div>
  );
}

type ViewMode = 'public' | 'you' | 'auditor';
const MODES: { id: ViewMode; label: string }[] = [
  { id: 'public', label: 'Public' },
  { id: 'you', label: 'You' },
  { id: 'auditor', label: 'Auditor' },
];

/* The signature interactive: one roster, three truths. Salaries scramble into sealed hex handles
   while the public "spend ≤ cap" flag stays TRUE — including the over-cap line that pays encrypted zero. */
function CipherRoster() {
  const reduced = usePrefersReducedMotion();
  const [mode, setMode] = useState<ViewMode>('public');
  const userPicked = useRef(false);

  // Four contributor lines drawn from the real demo roster — one is the over-cap "Probe".
  const rows = useMemo(
    () => [ROSTER[0], ROSTER[YOU_INDEX], ROSTER[2], ROSTER[5]].map((l, i) => ({
      line: l,
      you: i === 1,
      over: i === 3,
    })),
    [],
  );

  const [handles, setHandles] = useState<string[]>(() => rows.map(() => '9f3a··2b1c'));

  // Auto-cycle Public → You → Auditor until the visitor takes over — dramatizes selective disclosure.
  useEffect(() => {
    if (reduced) return;
    const id = setInterval(() => {
      if (userPicked.current) return;
      setMode((m) => (m === 'public' ? 'you' : m === 'you' ? 'auditor' : 'public'));
    }, 3400);
    return () => clearInterval(id);
  }, [reduced]);

  // Live "encryption" scramble on every still-sealed handle.
  useEffect(() => {
    if (reduced) return;
    const hex = '0123456789abcdef';
    const rnd = () => Array.from({ length: 4 }, () => hex[Math.floor(Math.random() * 16)]).join('');
    const id = setInterval(() => setHandles(rows.map(() => `${rnd()}··${rnd()}`)), 70);
    return () => clearInterval(id);
  }, [reduced, rows]);

  const pick = (m: ViewMode) => { userPicked.current = true; setMode(m); };
  const revealed = (r: { you: boolean }) => mode === 'auditor' || (mode === 'you' && r.you);

  return (
    <div className="cipher scanline">
      <div className="cipher-head">
        <span className="eyebrow" style={{ margin: 0 }}>Roster #1 · one view, three truths</span>
        <div className="seg" role="tablist" aria-label="Whose view">
          {MODES.map((m) => (
            <button key={m.id} role="tab" aria-selected={mode === m.id} data-on={mode === m.id} onClick={() => pick(m.id)}>{m.label}</button>
          ))}
        </div>
      </div>

      {rows.map((r, i) => {
        const show = revealed(r);
        return (
          <div key={i} className={`crow${r.over ? ' overcap' : ''}`}>
            <div className="who">
              <div className="nm">{r.line.name}{r.you && <span className="badge" style={{ marginLeft: 8 }}>you</span>}</div>
              <div className="rl">{r.line.role} · {short(r.line.recipient)}</div>
            </div>
            {show ? (
              r.over ? (
                <div className="camt zero"><LockIcon /> encrypted 0 · over cap</div>
              ) : (
                <div className="camt shown">{formatDisplay(r.line.amount, 'cUSD')}</div>
              )
            ) : (
              <div className="camt sealed-hex" aria-label="sealed handle">0x{handles[i]}</div>
            )}
          </div>
        );
      })}

      <div className="verifier">
        <span className="vlabel">spend ≤ cap</span>
        <span className="vflag"><LockIcon /> ✓ TRUE</span>
      </div>

      <p className="note">
        {mode === 'public' && 'Public + Etherscan see only sealed handles and the green cap flag — never a single amount.'}
        {mode === 'you' && 'You decrypt exactly one line via a viewer-gated EIP-712 request. Everyone else stays sealed.'}
        {mode === 'auditor' && 'An auditor you grant reads every line. The over-cap line paid encrypted zero — the cap flag stayed TRUE, no amount leaked.'}
      </p>
    </div>
  );
}

/* ─────────────────────────── Live proof (counted up) ─────────────────────────── */

function CountUp({ to, suffix = '' }: { to: number; suffix?: string }) {
  const reduced = usePrefersReducedMotion();
  const [n, setN] = useState(reduced ? to : 0);
  const ref = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (reduced) { setN(to); return; }
    const el = ref.current;
    if (!el) return;
    let raf = 0;
    const io = new IntersectionObserver((ents) => {
      if (!ents[0].isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const dur = 1100;
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / dur);
        const eased = 1 - Math.pow(1 - p, 3);
        setN(Math.round(to * eased));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    }, { threshold: 0.4 });
    io.observe(el);
    return () => { io.disconnect(); cancelAnimationFrame(raf); };
  }, [to, reduced]);
  return <span ref={ref}>{n}{suffix}</span>;
}

function LiveProof() {
  const stats = [
    { big: <><span className="dot-live" />Sepolia</>, lbl: 'Live on Ethereum' },
    { big: <>2-of-3</>, lbl: 'Real Safe multisig' },
    { big: <CountUp to={195} />, lbl: 'Tests passing' },
    { big: <CountUp to={100} suffix="%" />, lbl: 'Contract coverage' },
  ];
  return (
    <div className="card reveal">
      <span className="kicker">Verify every claim yourself — zero mock</span>
      <h2>Live proof, not a mock</h2>
      <div className="sub">
        The full quarter lifecycle is proven on Ethereum Sepolia, governed by a real 2-of-3 Safe. Every stat below is
        reproducible — open <code>/verify</code> for the on-chain event stream and tx hashes.
      </div>
      <div className="stats">
        {stats.map((s, i) => (
          <div key={i} className="stat reveal lift" style={{ ['--d' as any]: `${i * 80}ms` }}>
            <div className="big">{s.big}</div>
            <div className="lbl">{s.lbl}</div>
          </div>
        ))}
      </div>
      <div className="row" style={{ marginTop: 16 }}>
        <a className="btn" href="/verify">Open /verify</a>
        <a className="btn ghost" href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub ↗</a>
        <a className="btn ghost" href="/pitch">Pitch deck</a>
        <a className="btn ghost" href={etherscanAddr(PROOF.rail)} target="_blank" rel="noreferrer">Verified contract ↗</a>
      </div>
    </div>
  );
}

/* ─────────────────────────── The one flow ─────────────────────────── */

const FLOW = [
  { label: 'Wrap float → cUSD', note: 'USDC wraps 1:1 into confidential cUSD (float ≡ cap).' },
  { label: 'Grant time-bound operator', note: 'setOperator(rail, quarterEnd) — revocable, no Safe module.' },
  { label: 'Owners approve cap + roster', note: 'Two owners sign the who + the public cap; never the amounts.' },
  { label: 'Execute — amounts sealed', note: 'Per line: over-cap pays encrypted zero, cap flag stays true.', seal: true },
  { label: 'Auditor reads all lines', note: 'Per-handle viewer ACLs — recipients see one line, auditor sees all.' },
];

function FlowStrip() {
  return (
    <div className="card reveal">
      <span className="kicker">The one flow — narrow and deep</span>
      <h2>One multisig batch onboards the rail</h2>
      <div className="sub">From there payroll runs on the queue the owners already know.</div>
      <div className="steps">
        {FLOW.map((s, i) => (
          <div key={i} className={`step reveal lift${s.seal ? ' seal' : ''}`} style={{ ['--d' as any]: `${i * 80}ms` }}>
            <span className="num">{i + 1}</span>
            <div className="st-label">{s.label}</div>
            <div className="st-note">{s.note}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── Credibility band (honest, not testimonials) ─────────────────────────── */

const CRED = [
  { k: 'On real infra', t: 'Not a stub', b: 'The full confidential-payroll lifecycle runs on Ethereum Sepolia, governed by a real 2-of-3 Safe. Onboard, propose, approve, execute and audit each land a real proof transaction on Etherscan.' },
  { k: 'On your Safe', t: 'Nothing modified', b: 'The rail holds zero Safe execution rights — it is a time-bound ERC-7984 operator, not a Safe module. Same contracts, same owners, same signing queue. Revoke with one setOperator(rail, 0).' },
  { k: 'Honest by design', t: 'Amount-privacy, stated plainly', b: 'Recipients and the public cap stay public; the treasurer sees plaintext client-side while composing payroll. We say so here, in the README and in /verify. No overclaiming.' },
];

function Credibility() {
  return (
    <div className="card reveal">
      <span className="kicker">Why judges can trust it</span>
      <h2>Every claim is on-chain-checkable</h2>
      <div className="steps" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', marginTop: 14 }}>
        {CRED.map((c, i) => (
          <div key={c.t} className="step reveal lift" style={{ ['--d' as any]: `${i * 80}ms` }}>
            <span className="eyebrow" style={{ margin: '0 0 8px' }}>{c.k}</span>
            <div className="st-label" style={{ fontSize: 15, marginBottom: 6 }}>{c.t}</div>
            <div className="st-note">{c.b}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─────────────────────────── FAQ ─────────────────────────── */

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
    <div className="card reveal">
      <span className="kicker">How it works · FAQ</span>
      <h2>Straight answers</h2>
      <div className="sub">Every one backed by the on-chain proof in <code>/verify</code>.</div>
      {FAQ_ITEMS.map((item, i) => (
        <details key={i} className="faq reveal">
          <summary>{item.q}</summary>
          <div className="ans">{item.a}</div>
        </details>
      ))}
    </div>
  );
}

/* ─────────────────────────── Final CTA ─────────────────────────── */

function FinalCta() {
  return (
    <div className="cta-band reveal">
      <span className="eyebrow">Ready when you are</span>
      <h2>Pay a number only the right people can read.</h2>
      <p>
        Owners approve the cap and the roster on the queue they already know. Every salary stays sealed,
        enforced against the cap in encrypted space — live on Ethereum Sepolia.
      </p>
      <div className="row" style={{ justifyContent: 'center' }}>
        <a className="btn lg" href="/verify">See live proof →</a>
        <a className="btn ghost lg" href={GITHUB_URL} target="_blank" rel="noreferrer">View on GitHub ↗</a>
      </div>
    </div>
  );
}

/* ─────────────────────────── Safe App tabs (logic unchanged) ─────────────────────────── */

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
