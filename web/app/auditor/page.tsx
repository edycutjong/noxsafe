'use client';
import { useState } from 'react';
import { ROSTER, CAP, ORG, formatDisplay, short, capStatus } from '../../lib/demo';
import { LockIcon } from '../../components/LockIcon';

export default function AuditorPortal() {
  const [granted, setGranted] = useState(true);
  const lines = ROSTER;
  const s = capStatus(lines, CAP);

  return (
    <>
      <div className="card">
        <h2>Auditor portal</h2>
        <div className="sub">A read-all VIEWER, granted by one multisig tx (<code>grantAuditor</code> → <code>addViewer</code> on every line). Full visibility, zero on-chain leak.</div>
        <div className="warn" style={{ marginTop: 10 }}>
          Read-only storyboard of the auditor’s read-all view — already proven on Sepolia (the <code>grantAuditor</code> tx is linked in <code>/verify</code>). Toggling here simulates the granted/revoked states; it does not perform an on-chain grant.
        </div>
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <span className={granted ? 'badge' : 'warn'}>{granted ? 'Auditor access granted by multisig' : 'Access not yet granted'}</span>
          <button className="btn ghost" onClick={() => setGranted((g) => !g)}>{granted ? 'Simulate revoked view' : 'Simulate granted view'}</button>
        </div>
      </div>

      <div className="card">
        <h2>Roster #1 — all lines</h2>
        <div className="sub">{ORG} · every amount decrypts for the auditor; each row’s ACL is provable on-chain.</div>
        <table>
          <thead><tr><th>#</th><th>Name</th><th>Recipient</th><th>Amount</th><th>Access control</th></tr></thead>
          <tbody>
            {lines.map((l, i) => (
              <tr key={i}>
                <td className="mono">{i}</td>
                <td>{l.name}</td>
                <td className="mono">{short(l.recipient)}</td>
                <td>{granted ? <span className="pill unsealed">{formatDisplay(l.amount, 'cUSD')}</span> : <span className="pill sealed"><LockIcon /> ••••••</span>}</td>
                <td className="muted mono" style={{ fontSize: 11 }}>rail · recipient · auditor</td>
              </tr>
            ))}
          </tbody>
        </table>
        <div className="row" style={{ justifyContent: 'space-between', marginTop: 14 }}>
          <span className="muted">Roster total (auditor-only): <strong>{granted ? formatDisplay(s.total, 'cUSD') : <LockIcon />}</strong></span>
          <span className="badge" style={{ background: 'rgba(139,92,246,0.14)', color: '#A78BFA', borderColor: 'rgba(139,92,246,0.4)' }}>Etherscan shows none of this</span>
        </div>
      </div>

      <div className="card">
        <h2>Compliance officer (ADMIN)</h2>
        <div className="sub">A distinct role: <code>grantOfficer</code> → <code>allow</code> gives admin — decrypt AND extend viewers without a new multisig round-trip.</div>
        <div className="warn">Admin grants are <strong>irrevocable by design</strong> — which is exactly why the officer role is a deliberate multisig decision.</div>
      </div>
    </>
  );
}
