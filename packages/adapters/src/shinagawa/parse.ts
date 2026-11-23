import * as cheerio from 'cheerio';
import type { RoomInfo, SlotStatus } from '../types';

/**
 * 品川区施設予約システムの空き状況アイコン（ファイル名）と状態の対応。
 * 実際のコマで確認できたのは「空き」「予約あり」「受付期間外」「休館日」で、ほかは画面の凡例からの対応づけ。
 */
const ICON_STATUS: Record<string, SlotStatus> = {
  calendar_available_outline: 'available', // 空き
  calendar_full_outline: 'reserved', // 予約あり
  'calendar_non-operatingtime_outline': 'not_bookable', // 受付期間外
  'calendar_off-hours_outline': 'unavailable', // 時間外
  calendar_closed_outline: 'closed', // 休館・休館日
  calendar_maintenance_outline: 'maintenance', // 保守・保守日
  calendar_rain_outline: 'suspended', // 雨天
  calendar_delete_outline: 'reserved', // 取消処理中（取消の手続き中で、まだ空きになっていない）
  calendar_open_outline: 'unavailable', // 一般開放（個人利用への開放で、団体の予約はできない）
  calendar_tel_outline: 'not_bookable', // 電話問合せ（インターネットでは申し込めない）
};

/** 受付が始まっていない日・当日や過ぎた日のコマに出る表示。照会できる範囲の終わりの判定に使う。 */
export const OUT_OF_PERIOD_LABEL = '受付期間外';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

/** ページの title。想定外の画面（エラー・セッション切れ）の検知に使う。 */
export function parseTitle(html: string): string {
  return squash(cheerio.load(html)('title').first().text());
}

/**
 * ホーム画面の「どこで」の選択肢から、館の名前を取り出す。
 * facilityCode は選択肢の値そのまま（地域コード_館コード）。見つからなければ null。
 */
export function parseFacilityName(html: string, facilityCode: string): string | null {
  const $ = cheerio.load(html);
  const option = $('#bname option')
    .toArray()
    .find((o) => $(o).attr('value') === facilityCode);
  return option ? squash($(option).text()) : null;
}

/** 画面が非同期で受け取る JSON を読む。サイトがエラーを返していればエラーにする。 */
function parseJson(text: string): Record<string, unknown> {
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error('想定外の応答です（JSON として読めません）');
  }
  if (!isRecord(value)) throw new Error('想定外の応答です（JSON の形が違います）');
  const error = value.ErrManager;
  if (isRecord(error)) {
    throw new Error(`サイトがエラーを返しました: ${typeof error.message === 'string' ? error.message : '内容不明'}`);
  }
  return value;
}

/**
 * 館を選んだときに画面が受け取る施設（部屋）の一覧から、部屋を取り出す。
 * key は施設コード（例: 24000130）。定員はこの一覧に含まれない。
 */
export function parseRoomList(json: string, facility: string): RoomInfo[] {
  const results = parseJson(json).results;
  if (!Array.isArray(results)) throw new Error('想定外の応答です（施設の一覧がありません）');
  const rooms: RoomInfo[] = [];
  for (const row of results) {
    if (!isRecord(row) || typeof row.icd !== 'string' || typeof row.iname !== 'string') continue;
    rooms.push({ key: row.icd, facility, room: squash(row.iname), capacity: null });
  }
  return rooms;
}

/** 週表示の1コマ。 */
export interface WeekCell {
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  status: SlotStatus;
  /** 画面の表示（アイコンの代替テキスト。例: 空き、予約あり） */
  rawLabel: string;
}

export interface WeekPage {
  /** 表の見出しに並ぶ日付（YYYY-MM-DD）。指定した日から7日間 */
  dates: string[];
  cells: WeekCell[];
}

/** 20261123 のような数値の日付を YYYY-MM-DD にする。 */
function toIsoDate(value: unknown): string {
  const text = typeof value === 'number' ? String(value) : '';
  const m = /^(\d{4})(\d{2})(\d{2})$/.exec(text);
  if (!m) throw new Error(`日付を解析できません: ${String(value)}`);
  return `${m[1]}-${m[2]}-${m[3]}`;
}

/** 900 や 1630 のような数値の時刻を HH:MM にする。 */
function toTime(value: unknown): string {
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0 || value > 2400 || value % 100 >= 60) {
    throw new Error(`時刻を解析できません: ${String(value)}`);
  }
  return `${pad2(Math.floor(value / 100))}:${pad2(value % 100)}`;
}

/**
 * 週表示（1週間空き表示）の JSON から空き状況を取り出す。
 * コマの時刻は JSON の開始・終了時刻（数値）から取り、行見出し（午前・午後・夜間）には頼らない。
 */
export function parseWeek(json: string): WeekPage {
  const data = parseJson(json);
  if (!Array.isArray(data.weekDay) || !Array.isArray(data.result)) {
    throw new Error('空き状況の応答ではありません（日付またはコマの一覧がありません）');
  }
  const dates = data.weekDay.map((day) => toIsoDate(isRecord(day) ? day.useDay : undefined));

  const cells: WeekCell[] = [];
  for (const row of data.result) {
    const times = isRecord(row) ? row.timeResult : undefined;
    if (!Array.isArray(times)) throw new Error('空き状況の応答ではありません（時間帯のコマがありません）');
    for (const cell of times) {
      if (!isRecord(cell)) throw new Error('空き状況の応答ではありません（コマの形が違います）');
      const date = toIsoDate(cell.useDay);
      if (!dates.includes(date)) throw new Error(`見出しにない日付のコマがあります: ${date}`);
      const icon = /([A-Za-z_-]+)\.svg$/.exec(typeof cell.imgURL === 'string' ? cell.imgURL : '')?.[1] ?? '';
      const label = typeof cell.alt === 'string' ? squash(cell.alt) : '';
      // 画面は状態コード 0 のコマを空きとして描く。知らないアイコンでも、状態コードが 0 なら空きとする
      const status = ICON_STATUS[icon] ?? (cell.status === 0 ? 'available' : 'unknown');
      cells.push({
        date,
        start: toTime(cell.startTime),
        end: toTime(cell.endTime),
        status,
        rawLabel: label !== '' ? label : status === 'available' ? '空き' : '',
      });
    }
  }
  return { dates, cells };
}
