'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bi } from './Bi';
import { T } from './texts';

/** 画面上部のナビゲーション。今いるページに aria-current を付ける。 */
export function NavLinks() {
  const pathname = usePathname();
  const items = [
    { href: '/search', text: T.navSearch },
    { href: '/rooms', text: T.navCatalog },
  ];
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
