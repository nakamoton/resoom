'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { LocalizedText } from '@resoom/core';
import { Bi } from './Bi';

/** 画面上部のナビゲーション。今いるページに aria-current を付ける。 */
export function NavLinks({ items }: { items: { href: string; text: LocalizedText }[] }) {
  const pathname = usePathname();
  return (
    <nav className="site-nav" aria-label="Main / メイン">
      <ul>
        {items.map((item) => (
          <li key={item.href}>
            <Link href={item.href} aria-current={pathname.startsWith(item.href) ? 'page' : undefined}>
              <Bi text={item.text} />
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
