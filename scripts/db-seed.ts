/**
 * 初期データ（data/seed/rooms.json）を開発用データベースに取り込む。
 * 何度実行しても同じ結果になり、画面から追加した記録は消えない。
 * 候補から外した部屋（data/seed/removed-candidates.json）は台帳から消す。
 *
 *   pnpm db:seed
 */
import { readFileSync } from 'node:fs';
import { closeDb, getDb, importSeed, removeCandidateRooms, type RemovedCandidate, type SeedRoom } from '@resoom/db';

const readSeed = <T>(name: string): T => JSON.parse(readFileSync(new URL(`../data/seed/${name}`, import.meta.url), 'utf8')) as T;
const seed = readSeed<SeedRoom[]>('rooms.json');
const removedCandidates = readSeed<RemovedCandidate[]>('removed-candidates.json');

// 外した部屋が初期データにも残っていたら、取り込みと削除がぶつかるので止める
const keyOf = (r: { municipality: string; facilityName: string; roomName: string }): string =>
  `${r.municipality} ${r.facilityName} ${r.roomName}`;
const seeded = new Set(seed.map(keyOf));
const conflicts = removedCandidates.map(keyOf).filter((key) => seeded.has(key));
if (conflicts.length > 0) {
  throw new Error(`候補から外した部屋が rooms.json にも残っています: ${conflicts.join('、')}`);
}

const db = await getDb();
const result = await importSeed(db, seed);
const removal = await removeCandidateRooms(db, removedCandidates);
await closeDb();
console.log(`取り込み完了: 部屋 ${result.rooms} 件、新しく追加した記録 ${result.evidences} 件`);
if (removal.removed.length > 0) console.log(`候補から外した部屋を消しました: ${removal.removed.join('、')}`);
if (removal.kept.length > 0) {
  console.log(`候補から外した部屋のうち、使ったことがある・記録が追加されているため残した部屋: ${removal.kept.join('、')}`);
}
