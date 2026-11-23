/**
 * 台帳の部屋の空き状況を、自治体をまたいで検索するスクリプト。
 *
 *   pnpm availability --from 2027-01-01 --to 2027-01-31 --days sat --dates 2027-01-16
 *
 * --municipality 自治体で絞る（例: 大田区）。カンマ区切りで複数指定できる。
 * --days         曜日で絞る（sun,mon,tue,wed,thu,fri,sat）。省略すると全曜日。
 * --dates        特に見たい日。結果の先頭にまとめて表示する。
 * --json         結果をJSONでファイルに保存する。
 *
 * 対象は、台帳で空き照会の設定（adapterId と会館コード）がある部屋。
 * ログイン不要の照会だけを使い、自治体サイトごとに間隔を空けて1件ずつ問い合わせる。
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { combineRooms, createAdapter, type AvailabilitySlot } from '@resoom/adapters';
import { INSTRUMENT_LABELS, STATUS_LABELS, effectivePolicy, type InstrumentClass } from '@resoom/core';
import { closeDb, getDb, listRooms, type RoomWithEvidences } from '@resoom/db';

/** 検索結果に添える打楽器の区分。 */
const PERCUSSION: InstrumentClass[] = ['small_percussion', 'drum_set', 'large_percussion'];
const WEEKDAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
const WEEKDAY_JA = ['日', '月', '火', '水', '木', '金', '土'];

const { values } = parseArgs({
  options: {
    from: { type: 'string' },
    to: { type: 'string' },
    municipality: { type: 'string' },
    days: { type: 'string' },
    dates: { type: 'string' },
    json: { type: 'string' },
  },
});
const { from, to } = values;
if (!from || !to) {
  console.error('使い方: pnpm availability --from YYYY-MM-DD --to YYYY-MM-DD [--municipality 大田区] [--days sat,sun] [--dates YYYY-MM-DD,...] [--json 出力先]');
  process.exit(1);
}

const list = (value: string | undefined): string[] => (value ?? '').split(',').map((v) => v.trim()).filter(Boolean);
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const wantedDays = values.days ? new Set(list(values.days).map((d) => WEEKDAYS.indexOf(d.toLowerCase() as (typeof WEEKDAYS)[number]))) : null;
if (wantedDays?.has(-1)) {
  console.error(`--days は ${WEEKDAYS.join(',')} から指定してください`);
  process.exit(1);
}
const focusDates = new Set(list(values.dates));
/** 問い合わせる日。曜日の指定があれば、その曜日と、特に見たい日だけにする（自治体サイトへの問い合わせを減らす）。 */
const wantsDate = wantedDays ? (date: string): boolean => wantedDays.has(weekdayOf(date)) || focusDates.has(date) : undefined;
const municipalities = new Set(list(values.municipality));

// 台帳のうち、空き照会の設定があり、対応するアダプタがある部屋を対象にする。
const allRooms = await listRooms(await getDb());
await closeDb();
const catalog = allRooms.filter(
  (r) =>
    r.adapterId !== null &&
    r.adapterFacilityCode !== null &&
    createAdapter(r.adapterId) !== null &&
    (municipalities.size === 0 || municipalities.has(r.municipality)),
);
if (catalog.length === 0) {
  console.error('対象の部屋がありません。pnpm db:seed を実行したか、--municipality の指定を確認してください。');
  process.exit(1);
}

/** 台帳の部屋を一意に表す名前。 */
const nameOf = (room: RoomWithEvidences): string => `${room.facilityName} ${room.roomName}`;
/** 自治体サイトでの部屋名。指定がなければ台帳の部屋名。 */
const siteRoomsOf = (room: RoomWithEvidences): string[] => room.adapterRoomNames ?? [room.roomName];

/** 例: 「小物打楽器:可 / ドラムセット:不可 / 大型打楽器:可」 */
function percussionLabel(room: RoomWithEvidences): string {
  const policy = effectivePolicy(room.evidences);
  return PERCUSSION.map((cls) => `${INSTRUMENT_LABELS[cls]}:${STATUS_LABELS[policy[cls].status]}`).join(' / ');
}

// アダプタと会館ごとにまとめて問い合わせる。
const groups = new Map<string, RoomWithEvidences[]>();
for (const room of catalog) {
  const key = `${room.adapterId}\u0000${room.adapterFacilityCode}`;
  groups.set(key, [...(groups.get(key) ?? []), room]);
}

/** 台帳の部屋名ごとの空きコマ。 */
const slotsByRoom = new Map<string, AvailabilitySlot[]>();
/** 台帳の部屋名ごとの、照会できた最後の日。 */
const coveredThrough = new Map<string, string | null>();
const failures: string[] = [];
let fetchedAt = '';

for (const rooms of groups.values()) {
  const first = rooms[0];
  if (!first?.adapterId || !first.adapterFacilityCode) continue;
  const adapter = createAdapter(first.adapterId);
  if (!adapter) continue;
  console.error(`取得中: ${adapter.label} ${first.facilityName}（${rooms.map((r) => r.roomName).join('、')}）`);
  try {
    const result = await adapter.fetchAvailability({
      facilityCode: first.adapterFacilityCode,
      rooms: [...new Set(rooms.flatMap(siteRoomsOf))],
      from,
      to,
      wantsDate,
    });
    fetchedAt = result.fetchedAt;
    for (const room of rooms) {
      slotsByRoom.set(nameOf(room), combineRooms(result.slots, siteRoomsOf(room), room.roomName));
      coveredThrough.set(nameOf(room), result.coveredThrough);
    }
  } catch (error) {
    // 1つの施設で失敗しても、ほかの施設の結果は出す
    failures.push(`${adapter.label} ${first.facilityName}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

const allSlots = [...slotsByRoom.entries()].flatMap(([name, slots]) => slots.map((s) => ({ ...s, catalogRoom: name })));
if (values.json) {
  writeFileSync(values.json, JSON.stringify({ fetchedAt, coveredThrough: Object.fromEntries(coveredThrough), failures, slots: allSlots }, null, 1));
}

console.log(`取得: ${allSlots.length} コマ（うち空き ${allSlots.filter((s) => s.status === 'available').length}）`);
console.log(`取得時刻: ${fetchedAt || '-'}\n`);
console.log('照会できた範囲:');
for (const room of catalog) {
  if (!slotsByRoom.has(nameOf(room))) {
    console.log(`  ${nameOf(room)}: 取得できませんでした`);
    continue;
  }
  const through = coveredThrough.get(nameOf(room));
  console.log(`  ${nameOf(room)}: ${through ? `${from} 〜 ${through}` : 'なし（まだ照会できない期間です）'}`);
}
console.log('');

/** 日付ごとに、台帳の各部屋の空きコマを並べる。 */
function printDay(date: string): void {
  console.log(`${date}（${WEEKDAY_JA[weekdayOf(date)]}）`);
  for (const room of catalog) {
    const label = `  ${room.municipality} ${nameOf(room)}［${percussionLabel(room)}］`;
    const slots = slotsByRoom.get(nameOf(room));
    if (!slots) {
      console.log(`${label} 取得できませんでした`);
      continue;
    }
    const ofDay = slots.filter((s) => s.date === date);
    if (ofDay.length === 0) {
      const through = coveredThrough.get(nameOf(room)) ?? null;
      // 空いているコマしか返さないサイトでは、照会できた範囲内でコマがない日は「空きなし」
      if (through !== null && date <= through) console.log(`${label} 空きなし`);
      else console.log(`${label} まだ照会できません${through ? `（${through} まで照会可）` : ''}`);
      continue;
    }
    const free = ofDay.filter((s) => s.status === 'available').map((s) => `${s.start}-${s.end}`);
    const other = [...new Set(ofDay.filter((s) => s.status !== 'available').map((s) => s.rawLabel))];
    console.log(free.length > 0 ? `${label} 空き: ${free.join(', ')}` : `${label} 空きなし（${other.join('・')}）`);
  }
}

if (focusDates.size > 0) {
  console.log('=== 指定した日 ===');
  for (const date of [...focusDates].sort()) printDay(date);
  console.log('');
}

console.log('=== 空きのある日 ===');
const freeDates = [...new Set(allSlots.filter((s) => s.status === 'available').map((s) => s.date))]
  .filter((d) => !wantedDays || wantedDays.has(weekdayOf(d)))
  .sort();
for (const date of freeDates) printDay(date);
if (freeDates.length === 0) console.log('（該当なし）');

if (failures.length > 0) {
  console.log('\n=== 取得できなかった施設 ===');
  for (const failure of failures) console.log(`  ${failure}`);
  process.exitCode = 1;
}
