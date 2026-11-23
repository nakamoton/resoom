import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import './globals.css';

export const metadata: Metadata = {
  title: { default: '施設台帳 | resoom', template: '%s | resoom' },
  description: '吹奏楽団のための施設台帳。部屋ごとの楽器の可否と、その根拠を記録します。',
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1 };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="ja">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/rooms" className="brand">
              resoom <span>施設台帳</span>
            </Link>
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
