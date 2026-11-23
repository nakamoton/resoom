import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { Bi } from './_i18n/Bi';
import { T } from './_i18n/texts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${T.appName.en} · ${T.appName.ja}`, template: '%s | resoom' },
  description: `${T.catalogLead.en} ${T.catalogLead.ja}`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/rooms" className="brand">
              resoom <Bi text={T.appName} />
            </Link>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
