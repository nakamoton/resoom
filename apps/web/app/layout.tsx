import type { Metadata, Viewport } from 'next';
import Link from 'next/link';
import type { ReactNode } from 'react';
import { can } from '@resoom/core';
import { getCurrentMember } from '@/lib/session';
import { BrandMark } from './_i18n/BrandMark';
import { NavLinks } from './_i18n/NavLinks';
import { UserMenu } from './_i18n/UserMenu';
import { T } from './_i18n/texts';
import './globals.css';

export const metadata: Metadata = {
  title: { default: `${T.appName.en} · ${T.appName.ja}`, template: '%s | resoom' },
  description: `${T.searchLead.en} ${T.searchLead.ja}`,
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#131b2e' };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const member = await getCurrentMember();
  const items = [
    { href: '/search', text: T.navSearch },
    ...(can(member?.role, 'viewCatalog') ? [{ href: '/rooms', text: T.navCatalog }] : []),
    ...(can(member?.role, 'manageMembers') ? [{ href: '/members', text: T.navMembers }] : []),
  ];
  return (
    <html lang="en">
      <body>
        <header className="site-header">
          <div className="container">
            <Link href="/search" className="brand">
              <BrandMark />
              resoom
            </Link>
            <NavLinks items={items} />
            <UserMenu member={member} />
          </div>
        </header>
        <main className="container">{children}</main>
      </body>
    </html>
  );
}
