import { existsSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle, type PgliteDatabase } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import * as schema from './schema';

export type Db = PgliteDatabase<typeof schema> & { $client: PGlite };

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

export interface OpenDbOptions {
  /** データの保存先。省略するとメモリ上だけに作る（テスト用） */
  dataDir?: string;
  migrationsFolder?: string;
}

/**
 * 開発・テスト用の組み込みデータベース（PGlite）を開き、未適用のマイグレーションを当てる。
 * 本番では同じスキーマを通常の PostgreSQL に対して使う。
 */
export async function openDb(options: OpenDbOptions = {}): Promise<Db> {
  if (options.dataDir) mkdirSync(options.dataDir, { recursive: true });
  const db = drizzle(new PGlite(options.dataDir), { schema });
  await migrate(db, {
    migrationsFolder: options.migrationsFolder ?? join(findRepoRoot(), 'packages', 'db', 'drizzle'),
  });
  return db;
}

const globalForDb = globalThis as typeof globalThis & { __resoomDb?: Promise<Db> };

/**
 * アプリやスクリプトが共有する開発用データベース。
 * 保存先は RESOOM_DATA_DIR、なければリポジトリの .data/pglite。
 * 開発サーバーの再読み込みで二重に開かないよう、プロセス内で1つだけ持つ。
 */
export function getDb(): Promise<Db> {
  globalForDb.__resoomDb ??= openDb({
    dataDir: process.env.RESOOM_DATA_DIR ?? join(findRepoRoot(), '.data', 'pglite'),
  });
  return globalForDb.__resoomDb;
}

/**
 * 共有のデータベースを閉じる。スクリプトは終了前に必ず呼ぶ。
 * 閉じないとプロセスが終了せず、データの保存も完了しないことがある。
 */
export async function closeDb(): Promise<void> {
  const pending = globalForDb.__resoomDb;
  globalForDb.__resoomDb = undefined;
  if (pending) await (await pending).$client.close();
}
