import 'server-only';
import { eq } from 'drizzle-orm';
import { APIError, betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { nextCookies } from 'better-auth/next-js';
import { authUsers, ensureAdmins, getDb, getMember, schema, usesPostgres, type Db } from '@resoom/db';

/**
 * ローカルの開発・確認用のログイン（メールアドレスとパスワード）を使えるか。
 * 本番（DATABASE_URL がある）では、環境変数の指定にかかわらず使えない。
 */
export function devLoginEnabled(): boolean {
  return process.env.RESOOM_DEV_LOGIN === '1' && !usesPostgres();
}

/** Google でのログインが設定されているか。 */
export function googleLoginEnabled(): boolean {
  return Boolean(process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET);
}

/** 招待されていない人のログインを止めるときのエラー。 */
const notInvited = (): APIError => new APIError('FORBIDDEN', { message: 'not_invited' });

function createAuth(db: Db) {
  const secret = process.env.BETTER_AUTH_SECRET ?? (usesPostgres() ? undefined : 'local-development-secret-not-for-production');
  if (!secret) throw new Error('BETTER_AUTH_SECRET が設定されていません');
  return betterAuth({
    secret,
    baseURL: process.env.BETTER_AUTH_URL,
    database: drizzleAdapter(db, {
      provider: 'pg',
      schema: {
        authUsers: schema.authUsers,
        authSessions: schema.authSessions,
        authAccounts: schema.authAccounts,
        authVerifications: schema.authVerifications,
      },
    }),
    user: { modelName: 'authUsers' },
    session: { modelName: 'authSessions', expiresIn: 60 * 60 * 24 * 30, updateAge: 60 * 60 * 24 },
    account: { modelName: 'authAccounts' },
    verification: { modelName: 'authVerifications' },
    socialProviders: googleLoginEnabled()
      ? { google: { clientId: process.env.GOOGLE_CLIENT_ID as string, clientSecret: process.env.GOOGLE_CLIENT_SECRET as string, prompt: 'select_account' } }
      : {},
    emailAndPassword: { enabled: devLoginEnabled(), autoSignIn: true },
    databaseHooks: {
      user: {
        create: {
          // 名簿（招待）にないメールアドレスのアカウントは作らない
          before: async (user) => {
            if (!(await getMember(db, user.email))) throw notInvited();
          },
        },
      },
      session: {
        create: {
          // 名簿から外された人は、アカウントが残っていてもログインできない
          before: async (session) => {
            const [user] = await db.select({ email: authUsers.email }).from(authUsers).where(eq(authUsers.id, session.userId));
            if (!user || !(await getMember(db, user.email))) throw notInvited();
          },
        },
      },
    },
    plugins: [nextCookies()],
  });
}

export type Auth = ReturnType<typeof createAuth>;

const globalForAuth = globalThis as typeof globalThis & { __resoomAuth?: Promise<Auth> };

/** ログイン機能。最初の管理者（ADMIN_EMAILS）を名簿に入れてから使う。 */
export function getAuth(): Promise<Auth> {
  globalForAuth.__resoomAuth ??= (async () => {
    const db = await getDb();
    await ensureAdmins(db, (process.env.ADMIN_EMAILS ?? '').split(','));
    return createAuth(db);
  })();
  return globalForAuth.__resoomAuth;
}
