import 'server-only';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { can, type MemberRole, type Permission } from '@resoom/core';
import { getDb, getMember } from '@resoom/db';
import { getAuth } from './auth';

export interface CurrentMember {
  email: string;
  name: string;
  role: MemberRole;
}

/** ログインしていて、名簿に載っている楽団員。そうでなければ null。 */
export async function getCurrentMember(): Promise<CurrentMember | null> {
  const auth = await getAuth();
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const member = await getMember(await getDb(), session.user.email);
  if (!member) return null;
  return { email: member.email, name: session.user.name, role: member.role };
}

/**
 * ページの表示に必要な権限を確かめる。ログインしていなければログインページへ、
 * 権限が足りなければ「権限がありません」のページへ移す。
 */
export async function requirePermission(permission: Permission, returnTo: string): Promise<CurrentMember> {
  const member = await getCurrentMember();
  if (!member) redirect(`/sign-in?next=${encodeURIComponent(returnTo)}`);
  if (!can(member.role, permission)) redirect('/sign-in?error=forbidden');
  return member;
}

/** サーバー側の処理（フォームの送信など）で権限を確かめる。足りなければ null。 */
export async function memberWith(permission: Permission): Promise<CurrentMember | null> {
  const member = await getCurrentMember();
  return member && can(member.role, permission) ? member : null;
}

/** ログイン後に戻る先として安全か（同じサイト内のパスだけを許す）。 */
export function safeReturnPath(value: string | undefined | null): string {
  if (!value || !value.startsWith('/') || value.startsWith('//') || value.startsWith('/\\')) return '/rooms';
  return value;
}
