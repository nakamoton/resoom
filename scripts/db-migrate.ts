/**
 * データベースにマイグレーションを当てる。
 * 本番（DATABASE_URL がある）では、デプロイのたびに一度実行する。
 * 開発用の PGlite は開くときに自動で当てるので、実行しなくてもよい。
 *
 *   pnpm db:migrate
 */
import { closeDb, getDb, migratePostgres } from '@resoom/db';

const url = process.env.DATABASE_URL;
if (url) {
  await migratePostgres(url);
  console.log('マイグレーションを当てました（PostgreSQL）');
} else {
  await getDb();
  await closeDb();
  console.log('マイグレーションを当てました（開発用の PGlite）');
}
