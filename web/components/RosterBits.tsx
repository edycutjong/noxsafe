'use client';
import { formatDisplay, short, type DemoLine, capStatus } from '../lib/demo';

/** The "sealed line items" motif: the same amount rendered three ways. */
export function SealedCell({ amount, reveal }: { amount: bigint; reveal: boolean }) {
  if (reveal) return <span className="pill unsealed">{formatDisplay(amount, 'cUSD')}</span>;
  return <span className="pill sealed">🔒 ••••••</span>;
}

type Mode = 'public' | 'mine' | 'audit';

/** The same roster, three truths: sealed to all / one line to a recipient / all to the auditor. */
export function RosterTable({ lines, mode, mineIndex }: { lines: DemoLine[]; mode: Mode; mineIndex?: number }) {
  return (
    <table>
      <thead>
        <tr>
          <th>#</th><th>Name</th><th>Role</th><th>Recipient</th><th>Amount</th>
        </tr>
      </thead>
      <tbody>
        {lines.map((l, i) => {
          const reveal = mode === 'audit' || (mode === 'mine' && i === mineIndex);
          return (
            <tr key={i}>
              <td className="mono">{i}</td>
              <td>{l.name}</td>
              <td className="muted">{l.role}</td>
              <td className="mono">{short(l.recipient)}</td>
              <td><SealedCell amount={l.amount} reveal={reveal} /></td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

export function CapMeter({ lines, cap }: { lines: DemoLine[]; cap: bigint }) {
  const s = capStatus(lines, cap);
  const pct = Number((s.paid * 100n) / cap);
  const over = s.total > cap;
  return (
    <div>
      <div className="row" style={{ justifyContent: 'space-between', marginBottom: 8 }}>
        <span className="muted">Budget cap (public)</span>
        <span className="mono">{formatDisplay(cap, 'cUSD')}</span>
      </div>
      <div className={`meter${over ? ' over' : ''}`}><span style={{ width: `${Math.min(100, pct)}%` }} /></div>
      <div className="row" style={{ justifyContent: 'space-between', marginTop: 8 }}>
        <span className="muted">Encrypted spend enforced by <code>le</code>+<code>select</code> — line items never revealed</span>
        <span className="mono">{s.perLineOk.map((ok) => (ok ? '●' : '○')).join(' ')}</span>
      </div>
      {over && (
        <div className="warn" style={{ marginTop: 10 }}>
          One line breaches the cap → it pays <strong>encrypted zero</strong> (on-chain indistinguishable
          from a payment). The <code>ok=false</code> flag is publicly decryptable; no amount leaks.
        </div>
      )}
    </div>
  );
}

const STEPS = ['DRAFT', 'PROPOSED', 'APPROVED', 'SETTLED'] as const;
export function StatusRail({ active }: { active: number }) {
  return (
    <div className="rail">
      {STEPS.map((s, i) => (
        <div key={s} className={`stp ${i < active ? 'done' : i === active ? 'active' : ''}`}>
          <div className="dot" />
          {s}
        </div>
      ))}
    </div>
  );
}
