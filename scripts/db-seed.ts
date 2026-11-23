/**
 * 初期データ（data/seed/rooms.json）を開発用データベースに取り込む。
 * 何度実行しても同じ結果になり、画面から追加した記録は消えない。
 *
 *   pnpm db:seed
 */
import { readFileSync } from 'node:fs';
import { closeDb, getDb, importSeed, type SeedRoom } from '@resoom/db';

const seed = JSON.parse(readFileSync(new URL('../data/seed/rooms.json', import.meta.url), 'utf8')) as SeedRoom[];
const result = await importSeed(await getDb(), seed);
await closeDb();
console.log(`取り込み完了: 部屋 ${result.rooms} 件、新しく追加した記録 ${result.evidences} 件`);
