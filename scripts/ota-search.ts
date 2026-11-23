/**
 * 大田区の空き状況を試しに検索するスクリプト。
 *
 *   pnpm ota:search --from 2027-01-01 --to 2027-03-31 --days sat,sun --dates 2027-01-16,2027-02-20
 *
 * --days  曜日で絞る（sun,mon,tue,wed,thu,fri,sat）。省略すると全曜日。
 * --dates 特に見たい日。結果の先頭にまとめて表示する。
 * --json  結果をJSONでファイルに保存する。
 */
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';
import { OtaClient, type AvailabilitySlot } from '@resoom/adapters';
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
    days: { type: 'string' },
    dates: { type: 'string' },
    json: { type: 'string' },
  },
});
if (!values.from || !values.to) {
  console.error('使い方: pnpm ota:search --from YYYY-MM-DD --to YYYY-MM-DD [--days sat,sun] [--dates YYYY-MM-DD,...] [--json 出力先]');
  process.exit(1);
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const wantedDays = values.days
  ? new Set(values.days.split(',').map((d) => WEEKDAYS.indexOf(d.trim().toLowerCase() as (typeof WEEKDAYS)[number])))
  : null;
if (wantedDays?.has(-1)) {
  console.error(`--days は ${WEEKDAYS.join(',')} から指定してください`);
  process.exit(1);
}
const focusDates = new Set((values.dates ?? '').split(',').map((d) => d.trim()).filter(Boolean));

// 台帳のうち、大田区のアダプタで照会できる部屋を対象にする。
const catalog = (await listRooms(await getDb(), { adapterId: 'ota' })).filter((r) => r.adapterFacilityCode);
await closeDb();
if (catalog.length === 0) {
  console.error('台帳に大田区の部屋がありません。先に pnpm db:seed を実行してください。');
  process.exit(1);
}
const byFacility = new Map<string, RoomWithEvidences[]>();
for (const room of catalog) {
  const code = room.adapterFacilityCode ?? '';
  byFacility.set(code, [...(byFacility.get(code) ?? []), room]);
}

/** 例: 「小物打楽器:可 / ドラムセット:不可 / 大型打楽器:可」 */
function percussionLabel(room: RoomWithEvidences): string {
  const policy = effectivePolicy(room.evidences);
  return PERCUSSION.map((cls) => `${INSTRUMENT_LABELS[cls]}:${STATUS_LABELS[policy[cls].status]}`).join(' / ');
}

const client = new OtaClient();
const slots: AvailabilitySlot[] = [];
/** 会館ごとの、照会できた最後の日。 */
const coveredThrough = new Map<string, string | null>();
let fetchedAt = '';
for (const [facilityCode, rooms] of byFacility) {
  console.error(`取得中: ${rooms[0]?.facilityName}（${rooms.map((r) => r.roomName).join('、')}）`);
  const result = await client.fetchAvailability({
    facilityCode,
    rooms: rooms.map((r) => r.roomName),
    from: values.from,
    to: values.to,
  });
  slots.push(...result.slots);
  for (const room of rooms) coveredThrough.set(room.facilityName, result.coveredThrough);
  fetchedAt = result.fetchedAt;
}

if (values.json) {
  writeFileSync(values.json, JSON.stringify({ fetchedAt, coveredThrough: Object.fromEntries(coveredThrough), slots }, null, 1));
}

const counts = new Map<string, number>();
for (const s of slots) counts.set(s.status, (counts.get(s.status) ?? 0) + 1);
console.log(`取得: ${slots.length} コマ（${[...counts].map(([k, v]) => `${k} ${v}`).join(' / ')}）`);
console.log(`取得時刻: ${fetchedAt}\n`);

console.log('照会できた範囲:');
for (const [facility, through] of coveredThrough) {
  console.log(`  ${facility}: ${through ? `${values.from} 〜 ${through}` : 'なし（まだ照会できない期間です）'}`);
}
console.log('');

/** 日付ごとに、台帳の各部屋の空きコマを並べる。 */
function printDay(date: string): void {
  console.log(`${date}（${WEEKDAY_JA[weekdayOf(date)]}）`);
  for (const room of catalog) {
    const label = `  ${room.facilityName} ${room.roomName}［${percussionLabel(room)}］`;
    const ofRoom = slots.filter((s) => s.date === date && s.facility === room.facilityName && s.room === room.roomName);
    if (ofRoom.length === 0) {
      const through = coveredThrough.get(room.facilityName);
      console.log(`${label} まだ照会できません${through ? `（${through} まで照会可）` : ''}`);
      continue;
    }
    const free = ofRoom.filter((s) => s.status === 'available').map((s) => `${s.start}-${s.end}`);
    const other = [...new Set(ofRoom.filter((s) => s.status !== 'available').map((s) => s.rawLabel))];
    console.log(free.length > 0 ? `${label} 空き: ${free.join(', ')}` : `${label} 空きなし（${other.join('・')}）`);
  }
}

if (focusDates.size > 0) {
  console.log('=== 指定した日 ===');
  for (const date of [...focusDates].sort()) printDay(date);
  console.log('');
}

console.log('=== 空きのある日 ===');
const freeDates = [...new Set(slots.filter((s) => s.status === 'available').map((s) => s.date))]
  .filter((d) => !wantedDays || wantedDays.has(weekdayOf(d)))
  .sort();
for (const date of freeDates) printDay(date);
if (freeDates.length === 0) console.log('（該当なし）');
