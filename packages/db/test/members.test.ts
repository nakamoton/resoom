import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  MemberError,
  authSessions,
  authUsers,
  changeMemberRole,
  disposeDb,
  ensureAdmins,
  getMember,
  inviteMember,
  listMembers,
  openDb,
  removeMember,
  type Db,
} from '../src/index';

let db: Db;
beforeEach(async () => {
  db = await openDb();
});
afterEach(async () => {
  await disposeDb(db);
});

const codeOf = async (promise: Promise<unknown>): Promise<string | null> => {
  try {
    await promise;
    return null;
  } catch (error) {
    return error instanceof MemberError ? error.code : String(error);
  }
};

describe('楽団員の名簿', () => {
  it('最初の管理者を登録し、メールアドレスを小文字にそろえて引ける', async () => {
    await ensureAdmins(db, [' Admin@Example.com ', '']);

    expect(await getMember(db, 'ADMIN@example.com')).toMatchObject({ email: 'admin@example.com', role: 'admin', invitedBy: null });
  });

  it('最初の管理者の登録は、すでに名簿にいる人のロールを変えない', async () => {
    await inviteMember(db, { email: 'a@example.com', role: 'member', invitedBy: null });

    await ensureAdmins(db, ['a@example.com']);

    expect((await getMember(db, 'a@example.com'))?.role).toBe('member');
  });

  it('招待した人を名簿に加え、同じ人は二重に招待できない', async () => {
    await inviteMember(db, { email: 'Hanako@Example.com', role: 'editor', invitedBy: 'Admin@example.com' });

    expect(await getMember(db, 'hanako@example.com')).toMatchObject({ role: 'editor', invitedBy: 'admin@example.com' });
    expect(await codeOf(inviteMember(db, { email: 'hanako@example.com', role: 'member', invitedBy: null }))).toBe('memberExists');
  });

  it('名簿は管理者・施設編集・団員の順に並ぶ', async () => {
    await inviteMember(db, { email: 'm@example.com', role: 'member', invitedBy: null });
    await inviteMember(db, { email: 'e@example.com', role: 'editor', invitedBy: null });
    await inviteMember(db, { email: 'a@example.com', role: 'admin', invitedBy: null });

    expect((await listMembers(db)).map((m) => m.role)).toEqual(['admin', 'editor', 'member']);
  });

  it('ロールを変えられるが、最後の管理者は管理者以外にできない', async () => {
    await ensureAdmins(db, ['a@example.com']);
    await inviteMember(db, { email: 'b@example.com', role: 'member', invitedBy: null });

    await changeMemberRole(db, 'b@example.com', 'admin');
    await changeMemberRole(db, 'a@example.com', 'editor');
    expect(await codeOf(changeMemberRole(db, 'b@example.com', 'member'))).toBe('lastAdmin');
    expect((await getMember(db, 'b@example.com'))?.role).toBe('admin');
  });

  it('名簿から外すと、ログイン中のセッションも消える', async () => {
    await ensureAdmins(db, ['a@example.com']);
    await inviteMember(db, { email: 'b@example.com', role: 'member', invitedBy: null });
    const now = new Date();
    await db.insert(authUsers).values({ id: 'u1', name: 'B', email: 'b@example.com', emailVerified: true, createdAt: now, updatedAt: now });
    await db.insert(authSessions).values({ id: 's1', token: 't1', userId: 'u1', expiresAt: new Date(now.getTime() + 3_600_000), createdAt: now, updatedAt: now });

    await removeMember(db, 'B@example.com');

    expect(await getMember(db, 'b@example.com')).toBeNull();
    expect(await db.select().from(authSessions)).toEqual([]);
  });

  it('最後の管理者は外せず、名簿にいない人は notFound', async () => {
    await ensureAdmins(db, ['a@example.com']);

    expect(await codeOf(removeMember(db, 'a@example.com'))).toBe('lastAdmin');
    expect(await codeOf(removeMember(db, 'nobody@example.com'))).toBe('notFound');
    expect(await codeOf(changeMemberRole(db, 'nobody@example.com', 'admin'))).toBe('notFound');
  });
});
