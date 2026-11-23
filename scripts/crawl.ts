/**
 * 台帳の部屋の空き状況を自治体サイトから取得し、データベースに保存する（定期実行用）。
 * 検索ページ（ログインなしで使える）は、ここで保存したデータだけを読む。
 *
 *   pnpm crawl                 今日から92日分
 *   pnpm crawl --days 45
 *   pnpm crawl --adapters ota,shibuya --municipality 大田区
 *
 * ログイン不要の照会だけを使い、自治体サイトごとに間隔を空けて1件ずつ問い合わせる。
 * 1つの施設で失敗しても、ほかの施設の取得は続け、失敗は部屋ごとに記録する（前回の結果は残す）。
 * 取得の開始と終了は crawl_runs に記録する。別の取得が実行中なら、重ならないよう何もせずに終わる。
 * 検索ページの「今すぐ最新を取得」で申し込まれた取得も、この処理で行う。
 */
import { parseArgs } from 'node:util';
import { ADAPTER_IDS, DEFAULT_ADAPTER_IDS, combineRooms, createAdapter } from '@resoom/adapters';
import {
  beginCrawlRun,
  closeDb,
  finishCrawlRun,
  getDb,
  listRooms,
  recordAvailabilityError,
  saveAvailability,
  type RoomWithEvidences,
} from '@resoom/db';

const { values } = parseArgs({
  options: {
    days: { type: 'string' },
    adapters: { type: 'string' },
    municipality: { type: 'string' },
    'max-requests': { type: 'string' },
  },
});
const list = (value: string | undefined): string[] => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const days = Number(values.days ?? '92');
const maxRequests = Number(values['max-requests'] ?? '100');
if (!Number.isInteger(days) || days < 1 || days > 400) {
  console.error('--days は1〜400の整数で指定してください');
  process.exit(1);
}
if (!Number.isInteger(maxRequests) || maxRequests < 10 || maxRequests > 300) {
  console.error('--max-requests は10〜300の整数で指定してください');
  process.exit(1);
}
const adapterIds = new Set(values.adapters ? list(values.adapters) : DEFAULT_ADAPTER_IDS);
const unknown = [...adapterIds].filter((id) => !ADAPTER_IDS.includes(id));
if (unknown.length > 0) {
  console.error(`--adapters は ${ADAPTER_IDS.join(',')} から指定してください（不明: ${unknown.join(',')}）`);
  process.exit(1);
}
const municipalities = new Set(list(values.municipality));

/** 日本時間の今日（YYYY-MM-DD）。 */
const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const to = new Date(Date.parse(`${today}T00:00:00Z`) + (days - 1) * 86_400_000).toISOString().slice(0, 10);

const db = await getDb();

// 取得の記録を始める。別の取得が実行中なら、重ならないよう何もしない
let runId: string | null = null;
try {
  const run = await beginCrawlRun(db, new Date());
  if (!run) {
    console.log('別の取得が実行中のため、今回は取得しません。');
    await closeDb();
    process.exit(0);
  }
  runId = run.id;
  console.log(run.trigger === 'manual' ? '手動で申し込まれた取得を始めます。' : '定期の取得を始めます。');
} catch (error) {
  // 記録できなくても（マイグレーションの前など）、取得そのものは行う
  console.log(`取得の記録を始められませんでした: ${error instanceof Error ? error.message : String(error)}`);
}

const targets = (await listRooms(db)).filter(
  (r) =>
    r.adapterId !== null &&
    r.adapterFacilityCode !== null &&
    adapterIds.has(r.adapterId) &&
    (municipalities.size === 0 || municipalities.has(r.municipality)),
);
if (targets.length === 0) {
  console.error('取得する部屋がありません。pnpm db:seed を実行したか、指定を確認してください。');
  if (runId) await finishCrawlRun(db, runId, { ok: false, message: '取得する部屋がありません' }, new Date());
  await closeDb();
  process.exit(1);
}

const groups = new Map<string, RoomWithEvidences[]>();
for (const room of targets) {
  const key = `${room.adapterId}\u0000${room.adapterFacilityCode}`;
  groups.set(key, [...(groups.get(key) ?? []), room]);
}
const siteRoomsOf = (room: RoomWithEvidences): string[] => room.adapterRoomNames ?? [room.roomName];

console.log(`取得期間: ${today} 〜 ${to}（${targets.length}部屋、${groups.size}施設）`);
let saved = 0;
let failed = 0;
for (const rooms of groups.values()) {
  const first = rooms[0];
  if (!first?.adapterId || !first.adapterFacilityCode) continue;
  const adapter = createAdapter(first.adapterId, { maxRequests });
  if (!adapter) continue;
  const started = Date.now();
  try {
    const result = await adapter.fetchAvailability({
      facilityCode: first.adapterFacilityCode,
      rooms: [...new Set(rooms.flatMap(siteRoomsOf))],
      from: today,
      to,
    });
    for (const room of rooms) {
      const slots = combineRooms(result.slots, siteRoomsOf(room), room.roomName);
      await saveAvailability(db, {
        roomId: room.id,
        from: today,
        to,
        coveredThrough: result.coveredThrough,
        fetchedAt: new Date(result.fetchedAt),
        slots,
      });
      saved += 1;
    }
    const seconds = Math.round((Date.now() - started) / 1000);
    console.log(`  OK  ${adapter.label} ${first.facilityName}（${rooms.length}部屋）: ${result.coveredThrough ?? '照会できる期間なし'} まで、${seconds}秒`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    for (const room of rooms) await recordAvailabilityError(db, room.id, message, new Date());
    failed += rooms.length;
    console.log(`  NG  ${adapter.label} ${first.facilityName}: ${message}`);
  }
}
if (runId) {
  await finishCrawlRun(db, runId, { ok: failed === 0, message: failed > 0 ? `失敗 ${failed}部屋` : undefined }, new Date());
}
await closeDb();
console.log(`完了: 保存 ${saved}部屋、失敗 ${failed}部屋`);
if (failed > 0) process.exitCode = 1;
