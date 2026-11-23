'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { MEMBER_ROLE_LABELS, type MemberRole } from '@resoom/core';
import { authClient } from '@/lib/auth-client';
import { Bi } from './Bi';
import { T } from './texts';

/** 画面右上のログイン状態。ログイン中なら名前・ロールとログアウト、そうでなければログインへのリンク。 */
export function UserMenu({ member }: { member: { name: string; email: string; role: MemberRole } | null }) {
  const router = useRouter();
  if (!member) {
    return (
      <Link href="/sign-in" className="user-menu">
        <Bi text={T.signIn} />
      </Link>
    );
  }
  async function signOut() {
    await authClient.signOut();
    router.push('/search');
    router.refresh();
  }
  return (
    <div className="user-menu">
      <span className="who" title={member.email}>
        {member.name} · <Bi text={MEMBER_ROLE_LABELS[member.role]} />
      </span>
      <button type="button" className="link-button" onClick={signOut}>
        <Bi text={T.signOut} />
      </button>
    </div>
  );
}
