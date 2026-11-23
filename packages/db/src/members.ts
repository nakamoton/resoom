import { asc, eq, sql } from 'drizzle-orm';
import { normalizeEmail, type MemberRole } from '@resoom/core';
import type { Db } from './client';
import { authSessions, authUsers, members, type Member } from './schema';

export class MemberError extends Error {
  constructor(readonly code: 'memberExists' | 'lastAdmin' | 'notFound') {
    super(code);
    this.name = 'MemberError';
  }
}

/** 名簿をロール（管理者から）とメールアドレスの順で返す。 */
export async function listMembers(db: Db): Promise<Member[]> {
  const rows = await db.select().from(members).orderBy(asc(members.email));
  const order: Record<MemberRole, number> = { admin: 0, editor: 1, member: 2 };
  return rows.sort((a, b) => order[a.role] - order[b.role]);
}

/** メールアドレスで楽団員を探す。名簿になければ null。 */
export async function getMember(db: Db, email: string): Promise<Member | null> {
  const [row] = await db.select().from(members).where(eq(members.email, normalizeEmail(email)));
  return row ?? null;
}

/** 楽団員を招待する（名簿に加える）。すでにいれば MemberError('memberExists')。 */
export async function inviteMember(db: Db, input: { email: string; role: MemberRole; invitedBy: string | null }): Promise<Member> {
  const [row] = await db
    .insert(members)
    .values({ email: normalizeEmail(input.email), role: input.role, invitedBy: input.invitedBy ? normalizeEmail(input.invitedBy) : null })
    .onConflictDoNothing()
    .returning();
  if (!row) throw new MemberError('memberExists');
  return row;
}

async function adminCount(db: Db): Promise<number> {
  const [row] = await db.select({ n: sql<number>`count(*)::int` }).from(members).where(eq(members.role, 'admin'));
  return row?.n ?? 0;
}

/** ロールを変える。最後の管理者を管理者以外にはできない。 */
export async function changeMemberRole(db: Db, email: string, role: MemberRole): Promise<void> {
  const current = await getMember(db, email);
  if (!current) throw new MemberError('notFound');
  if (current.role === 'admin' && role !== 'admin' && (await adminCount(db)) <= 1) throw new MemberError('lastAdmin');
  await db.update(members).set({ role }).where(eq(members.email, current.email));
}

/**
 * 楽団員を名簿から外し、ログイン中のセッションも消す。最後の管理者は外せない。
 */
export async function removeMember(db: Db, email: string): Promise<void> {
  const current = await getMember(db, email);
  if (!current) throw new MemberError('notFound');
  if (current.role === 'admin' && (await adminCount(db)) <= 1) throw new MemberError('lastAdmin');
  await db.transaction(async (tx) => {
    await tx.delete(members).where(eq(members.email, current.email));
    const users = await tx.select({ id: authUsers.id }).from(authUsers).where(eq(authUsers.email, current.email));
    for (const user of users) await tx.delete(authSessions).where(eq(authSessions.userId, user.id));
  });
}

/**
 * 最初の管理者を名簿に入れる（環境変数 ADMIN_EMAILS から）。すでに名簿にいる人は変えない。
 */
export async function ensureAdmins(db: Db, emails: readonly string[]): Promise<void> {
  for (const email of emails.map(normalizeEmail).filter(Boolean)) {
    await db.insert(members).values({ email, role: 'admin', invitedBy: null }).onConflictDoNothing();
  }
}
