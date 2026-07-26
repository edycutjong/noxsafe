'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

const LINKS = [
  { href: '/', label: 'Safe App' },
  { href: '/recipient', label: 'Recipient portal' },
  { href: '/auditor', label: 'Auditor portal' },
  { href: '/verify', label: '/verify' },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav className="nav">
      {LINKS.map((l) => (
        <Link key={l.href} href={l.href} className={path === l.href ? 'active' : ''}>
          {l.label}
        </Link>
      ))}
    </nav>
  );
}
