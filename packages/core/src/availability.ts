import { isJapaneseHoliday } from './holidays';
import type { InstrumentClass, PolicyStatus } from './policy';
import { effectivePolicy, type EvidenceLike } from './policy';

/** 自治体をまたいで共通の、空き状況の状態。 */
export type SlotStatus =
  | 'available' // 空き
  | 'reserved' // 予約済み
  | 'not_bookable' // 予約申込対象外（受付期間外、抽選期間中など）
  | 'closed' // 休館日
  | 'maintenance' // 保守点検
  | 'suspended' // 利用中止
  | 'unavailable' // 利用不可
  | 'unknown'; // 解析できなかった

/** 時間帯。コマの開始時刻で分ける。 */
export const TIMES_OF_DAY = ['morning', 'afternoon', 'evening'] as const;
export type TimeOfDay = (typeof TIMES_OF_DAY)[number];

/** 開始時刻（HH:MM）から時間帯を決める。12時より前は午前、17時より前は午後、それ以降は夜間。 */
export function timeOfDayOf(start: string): TimeOfDay {
  if (start < '12:00') return 'morning';
  if (start < '17:00') return 'afternoon';
  return 'evening';
}

export interface SearchCriteria {
  /** YYYY-MM-DD（この日を含む） */
  from: string;
  /** YYYY-MM-DD（この日を含む） */
  to: string;
  /** 曜日（0 = 日曜）。null なら曜日では絞らない */
  weekdays: number[] | null;
  /** 祝日（振替休日・国民の休日を含む）も対象にするか。weekdays のどれか、または祝日に当てはまる日を残す */
  holidays: boolean;
  /** 時間帯。null ならすべて */
  timesOfDay: TimeOfDay[] | null;
  /** 人数。定員がこれに満たない部屋を除く（定員が未登録の部屋は残す）。null なら絞らない */
  people: number | null;
  /** 使いたい楽器。すべてが「可」か「条件付き」の部屋に絞る */
  needs: InstrumentClass[];
  /** 使いたい楽器の可否が「未確認」の部屋も含めるか */
  includeUnknown: boolean;
  /** 自治体。null ならすべて */
  municipalities: string[] | null;
}

export interface SearchRoom {
  id: string;
  municipality: string;
  capacity: number | null;
  evidences: readonly EvidenceLike[];
}

export interface SearchSlot {
  roomId: string;
  date: string;
  start: string;
  end: string;
  status: SlotStatus;
}

export interface SearchSnapshot {
  roomId: string;
  coveredFrom: string | null;
  coveredThrough: string | null;
}

export interface SearchDay<R> {
  date: string;
  rooms: { room: R; slots: SearchSlot[] }[];
}

export interface SearchResult<R> {
  /** 空きのある日（日付順）。日ごとに、空きのある部屋とそのコマ */
  days: SearchDay<R>[];
  /** 条件に合い、空き状況を自動で取得している部屋 */
  automatic: R[];
  /** 条件に合うが、空き状況を自動で取得していない部屋（各自でサイトを確認する） */
  manual: R[];
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();

/** 日付が、曜日・祝日の条件に合うか。どちらも指定がなければすべての日が合う。 */
export function dayMatches(date: string, criteria: Pick<SearchCriteria, 'weekdays' | 'holidays'>): boolean {
  if (criteria.weekdays === null && !criteria.holidays) return true;
  return (criteria.weekdays?.includes(weekdayOf(date)) ?? false) || (criteria.holidays && isJapaneseHoliday(date));
}

/** 部屋が、人数・楽器・自治体の条件に合うか。 */
export function roomMatches(room: SearchRoom, criteria: SearchCriteria): boolean {
  if (criteria.municipalities && !criteria.municipalities.includes(room.municipality)) return false;
  if (criteria.people !== null && room.capacity !== null && room.capacity < criteria.people) return false;
  if (criteria.needs.length > 0) {
    const policy = effectivePolicy(room.evidences);
    const accepted: PolicyStatus[] = criteria.includeUnknown ? ['allowed', 'conditional', 'unknown'] : ['allowed', 'conditional'];
    if (!criteria.needs.every((cls) => accepted.includes(policy[cls].status))) return false;
  }
  return true;
}

/**
 * 保存済みの空き状況から、条件に合う空きコマを探す。
 * 自治体サイトには問い合わせない（取得は定期実行の処理が行う）。
 * snapshots にない部屋は「自動で取得していない部屋」として manual に入れる。
 */
export function searchAvailability<R extends SearchRoom>(
  rooms: readonly R[],
  slots: readonly SearchSlot[],
  snapshots: readonly SearchSnapshot[],
  criteria: SearchCriteria,
): SearchResult<R> {
  const tracked = new Set(snapshots.filter((s) => s.coveredThrough !== null).map((s) => s.roomId));
  const matching = rooms.filter((room) => roomMatches(room, criteria));
  const automatic = matching.filter((room) => tracked.has(room.id));
  const manual = matching.filter((room) => !tracked.has(room.id));
  const byId = new Map(automatic.map((room) => [room.id, room]));

  const days = new Map<string, Map<string, SearchSlot[]>>();
  for (const slot of slots) {
    if (slot.status !== 'available' || !byId.has(slot.roomId)) continue;
    if (slot.date < criteria.from || slot.date > criteria.to) continue;
    if (!dayMatches(slot.date, criteria)) continue;
    if (criteria.timesOfDay && !criteria.timesOfDay.includes(timeOfDayOf(slot.start))) continue;
    const day = days.get(slot.date) ?? new Map<string, SearchSlot[]>();
    days.set(slot.date, day);
    day.set(slot.roomId, [...(day.get(slot.roomId) ?? []), slot]);
  }

  const order = new Map(automatic.map((room, index) => [room.id, index]));
  return {
    days: [...days.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, byRoom]) => ({
        date,
        rooms: [...byRoom.entries()]
          .sort(([a], [b]) => (order.get(a) ?? 0) - (order.get(b) ?? 0))
          .map(([roomId, roomSlots]) => ({
            room: byId.get(roomId) as R,
            slots: [...roomSlots].sort((a, b) => a.start.localeCompare(b.start)),
          })),
      })),
    automatic,
    manual,
  };
}
