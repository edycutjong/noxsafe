'use client';
import { useState } from 'react';
import { ROSTER, YOU_INDEX, ORG, formatDisplay, short } from '../../lib/demo';
import { SealedCell } from '../../components/RosterBits';
import { LockIcon } from '../../components/LockIcon';

export default function RecipientPortal() {
  const [revealed, setRevealed] = useState(false);
  const you = ROSTER[YOU_INDEX];

  return (
    <>
      <div className="card" style={{ textAlign: 'center' }}>
        <h2>You were paid by {ORG}</h2>
        <div className="sub">Q3 payroll · your line only — your teammates can’t read it, and neither can Etherscan.</div>
        <div className="warn" style={{ marginTop: 10 }}>
          Read-only storyboard — this reveal illustrates the recipient’s EIP-712 viewer-gated decrypt (<code>addViewer</code> on your line).
          The real signature + gateway decrypt run during <code>npm run e2e:safe</code>; every ACL is provable in <code>/verify</code>.
        </div>
        <div style={{ fontSize: 34, margin: '22px 0' }}>
          {revealed
            ? <span className="pill unsealed" style={{ fontSize: 30, padding: '10px 20px' }}>{formatDisplay(you.amount, 'cUSD')}</span>
            : <span className="pill sealed" style={{ fontSize: 30, padding: '10px 20px' }}><LockIcon size={24} /> ••••••</span>}
        </div>
        {!revealed
          ? <button className="btn violet" onClick={() => setRevealed(true)}>Reveal my line (storyboard)</button>
          : <div className="badge" style={{ fontSize: 13, padding: '6px 12px' }}>Illustrates the EIP-712 viewer-gated decrypt (addViewer on your line) · real run: npm run e2e:safe</div>}
        <div className="muted" style={{ marginTop: 14 }}>Recipient: {short(you.recipient)} · you are a <strong>viewer</strong> of exactly this handle.</div>
      </div>

      <div className="card">
        <h2>Payout history</h2>
        <div className="sub">Only your own row unseals. Every other contributor’s line stays a sealed pill.</div>
        <table>
          <thead><tr><th>Roster</th><th>Date</th><th>Recipient</th><th>Amount</th></tr></thead>
          <tbody>
            {ROSTER.slice(0, 5).map((l, i) => (
              <tr key={i}>
                <td className="mono">#1</td>
                <td className="muted">2026-07-01</td>
                <td className="mono">{short(l.recipient)}{i === YOU_INDEX && <span className="badge" style={{ marginLeft: 8 }}>you</span>}</td>
                <td><SealedCell amount={l.amount} reveal={revealed && i === YOU_INDEX} /></td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="muted" style={{ marginTop: 12 }}>Private permalink: <code>/payslip/1/{YOU_INDEX}</code></div>
      </div>
    </>
  );
}
