import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import type { PgDatabase, PgQueryResultHKT } from 'drizzle-orm/pg-core';
import * as schema from './schema';

/**
 * データベース。開発とテストでは組み込みの PGlite、本番では DATABASE_URL の PostgreSQL（Neon）を使う。
 * どちらも同じ定義（schema）とマイグレーションを使う。
 */
export type Db = PgDatabase<PgQueryResultHKT, typeof schema>;

/** 開いたデータベースを閉じる関数。 */
const closers = new WeakMap<object, () => Promise<void>>();

/** pnpm-workspace.yaml のあるディレクトリ（リポジトリのルート）を、現在地からさかのぼって探す。 */
export function findRepoRoot(from: string = process.cwd()): string {
  // 開発用の保存先を探すだけなので、ビルド時のファイル追跡の対象から外す
  let dir = resolve(/* turbopackIgnore: true */ from);
  for (;;) {
    if (existsSync(join(dir, 'pnpm-workspace.yaml'))) return dir;
    const parent = dirname(dir);
    if (parent === dir) throw new Error('リポジトリのルート（pnpm-workspace.yaml）が見つかりません');
    dir = parent;
  }
}

/** マイグレーションの置き場所。RESOOM_MIGRATIONS_DIR で上書きできる（コンテナ内など）。 */
export function migrationsFolder(): string {
  return process.env.RESOOM_MIGRATIONS_DIR ?? join(findRepoRoot(), 'packages', 'db', 'drizzle');
}

export interface OpenDbOptions {
  /** PGlite の保存先。省略するとメモリ上だけに作る（テスト用） */
  dataDir?: string;
  migrationsFolder?: string;
}

/**
 * 開発・テスト用の組み込みデータベース（PGlite）を開き、未適用のマイグレーションを当てる。
 */
export async function openDb(options: OpenDbOptions = {}): Promise<Db> {
  const { PGlite } = await import('@electric-sql/pglite');
  const { drizzle } = await import('drizzle-orm/pglite');
  const { migrate } = await import('drizzle-orm/pglite/migrator');
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const client = new PGlite(options.dataDir);
  const db = drizzle(client, { schema });
  await migrate(db, { migrationsFolder: options.migrationsFolder ?? migrationsFolder() });
  closers.set(db, () => client.close());
  return db as unknown as Db;
}

/**
 * 本番の PostgreSQL（DATABASE_URL）に接続する。マイグレーションは当てない（pnpm db:migrate で別に行う）。
 */
export async function openPostgres(url: string): Promise<Db> {
  const { Pool } = await import('pg');
  const { drizzle } = await import('drizzle-orm/node-postgres');
  // サーバーレスで動かすので、接続は少なく、使わない接続は早めに閉じる
  const pool = new Pool({ connectionString: url, max: 3, idleTimeoutMillis: 10_000 });
  const db = drizzle(pool, { schema });
  closers.set(db, () => pool.end());
  return db as unknown as Db;
}

/** 本番の PostgreSQL にマイグレーションを当てる。 */
export async function migratePostgres(url: string): Promise<void> {
  const { migrate } = await import('drizzle-orm/node-postgres/migrator');
  const db = await openPostgres(url);
  try {
    await migrate(db as never, { migrationsFolder: migrationsFolder() });
  } finally {
    await disposeDb(db);
  }
}

/** openDb / openPostgres で開いたデータベースを閉じる。 */
export async function disposeDb(db: Db): Promise<void> {
  await closers.get(db)?.();
  closers.delete(db);
}

const globalForDb = globalThis as typeof globalThis & { __resoomDb?: Promise<Db> };

/** 本番（DATABASE_URL がある）かどうか。 */
export function usesPostgres(): boolean {
  return Boolean(process.env.DATABASE_URL);
}

/**
 * アプリやスクリプトが共有するデータベース。
 * DATABASE_URL があればその PostgreSQL、なければ開発用の PGlite（RESOOM_DATA_DIR、なければ .data/pglite）。
 * 開発サーバーの再読み込みで二重に開かないよう、プロセス内で1つだけ持つ。
 */
export function getDb(): Promise<Db> {
  const url = process.env.DATABASE_URL;
  globalForDb.__resoomDb ??= url
    ? openPostgres(url)
    : openDb({ dataDir: process.env.RESOOM_DATA_DIR ?? join(findRepoRoot(), '.data', 'pglite') });
  return globalForDb.__resoomDb;
}

/**
 * 共有のデータベースを閉じる。スクリプトは終了前に必ず呼ぶ。
 * 閉じないとプロセスが終了せず、データの保存も完了しないことがある。
 */
export async function closeDb(): Promise<void> {
  const pending = globalForDb.__resoomDb;
  globalForDb.__resoomDb = undefined;
  if (pending) await disposeDb(await pending);
}
