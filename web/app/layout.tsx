import './globals.css';
import type { Metadata } from 'next';
import { Nav } from '../components/Nav';

const TITLE = 'NoxSafe — Confidential Payroll for Safe';
const DESCRIPTION =
  'Pay DAO contributors from your Safe with amounts encrypted end-to-end. Owners approve a cap; each recipient decrypts only their own line.';

export const metadata: Metadata = {
  metadataBase: new URL('https://noxsafe.edycu.dev'),
  title: TITLE,
  description: DESCRIPTION,
  icons: { icon: '/icon.svg' },
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://noxsafe.edycu.dev',
    siteName: 'NoxSafe',
    images: [
      {
        url: '/og-image.png',
        width: 1200,
        height: 630,
        alt: 'NoxSafe — confidential payroll rails for Safe multisigs',
      },
    ],
    locale: 'en_US',
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
    images: ['/og-image.png'],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="wrap">
          <div className="brand">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="NoxSafe" />
            <div>
              <h1>NoxSafe</h1>
              <div className="tag">Confidential payroll rails for Safe{'{'}Wallet{'}'} · iExec Nox · ERC-7984</div>
            </div>
          </div>
          <Nav />
          {children}
          <footer className="tag" style={{ textAlign: 'center', padding: '1.5rem 0', opacity: 0.7 }}>
            NoxSafe · confidential payroll rails · iExec Nox · ERC-7984 · live on Ethereum Sepolia · v
            {process.env.NEXT_PUBLIC_APP_VERSION}
          </footer>
        </div>
      </body>
    </html>
  );
}
