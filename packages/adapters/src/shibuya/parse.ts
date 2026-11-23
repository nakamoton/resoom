import type { AvailabilitySlot, RoomInfo, SlotStatus } from '../types';

/** GET /api/csrf の応答。匿名の訪問者にも配られるトークンと、それを載せるヘッダー名。 */
export interface CsrfToken {
  headerName: string;
  token: string;
}

/** 目的から引ける施設の1件。 */
export interface FacilityInfo {
  id: number;
  name: string;
}

/** 空き照会が返す1コマに、部屋の識別子を添えたもの。 */
export interface VacantSlot extends AvailabilitySlot {
  roomKey: string;
}

type Json = Record<string, unknown>;

const isRecord = (value: unknown): value is Json => typeof value === 'object' && value !== null && !Array.isArray(value);
const pad2 = (n: number): string => String(n).padStart(2, '0');

function parseJson(text: string, what: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    // メンテナンス画面などのHTMLが返ったとき
    throw new Error(`想定外の応答です（${what}: JSONではありません）`);
  }
}

/** 応答の共通の外枠 { messages, errors, warns, content } から content（配列）を取り出す。 */
function contentOf(text: string, what: string): unknown[] {
  const json = parseJson(text, what);
  if (!isRecord(json)) throw new Error(`想定外の応答です（${what}: 外枠がありません）`);
  if (Array.isArray(json.errors) && json.errors.length > 0) {
    const messages = json.errors.map((e) => (isRecord(e) && typeof e.message === 'string' ? e.message : JSON.stringify(e)));
    throw new Error(`サイトがエラーを返しました（${what}）: ${messages.join(' / ')}`);
  }
  if (!Array.isArray(json.content)) throw new Error(`想定外の応答です（${what}: content が配列ではありません）`);
  return json.content;
}

/** 「2026/12」「2026/12/04」を「2026-12」「2026-12-04」にする。形式が違えばエラー。 */
function normalizeDate(value: unknown, what: string): string {
  const m = typeof value === 'string' ? /^(\d{4})\/(\d{2})(?:\/(\d{2}))?$/.exec(value) : null;
  if (!m) throw new Error(`想定外の応答です（${what}: 日付を解析できません: ${JSON.stringify(value)}）`);
  return m[3] === undefined ? `${m[1]}-${m[2]}` : `${m[1]}-${m[2]}-${m[3]}`;
}

/** 「9:00」を「09:00」にする。 */
function normalizeTime(value: unknown, what: string): string {
  const m = typeof value === 'string' ? /^(\d{1,2}):(\d{2})$/.exec(value) : null;
  if (!m) throw new Error(`想定外の応答です（${what}: 時刻を解析できません: ${JSON.stringify(value)}）`);
  return `${pad2(Number(m[1]))}:${m[2]}`;
}

/**
 * 空きコマの状態を、部屋ごとに付く2つのフラグから決める。
 * - reservable_period が false: 予約の受付期間外（画面が選ばせない先の月を照会したときに確認）
 * - reservable が false: 空いているがWebからは申し込めない（当日分で確認。画面は電話番号を添えて表示する）
 */
function classify(item: Json): { status: SlotStatus; rawLabel: string } {
  const flags = `reservable=${String(item.reservable)} reservable_period=${String(item.reservable_period)}`;
  if (item.reservable_period === true) {
    return { status: 'available', rawLabel: item.reservable === true ? '空き時間' : `空き時間（Web申込不可 ${flags}）` };
  }
  if (item.reservable_period === false) return { status: 'not_bookable', rawLabel: `空き時間（予約受付期間外 ${flags}）` };
  return { status: 'unknown', rawLabel: `空き時間（${flags}）` };
}

/** GET /api/csrf の応答を読む。 */
export function parseCsrf(text: string): CsrfToken {
  const json = parseJson(text, 'CSRFトークン');
  if (!isRecord(json) || typeof json.token !== 'string' || json.token === '' || typeof json.header_name !== 'string' || json.header_name === '') {
    throw new Error('想定外の応答です（CSRFトークン: token と header_name がありません）');
  }
  return { headerName: json.header_name, token: json.token };
}

/** 目的で絞った施設の一覧を読む。 */
export function parseFacilities(text: string): FacilityInfo[] {
  return contentOf(text, '施設一覧').map((item) => {
    if (!isRecord(item) || typeof item.id !== 'number' || typeof item.name !== 'string') {
      throw new Error('想定外の応答です（施設一覧: id と name がありません）');
    }
    return { id: item.id, name: item.name };
  });
}

/** 施設の部屋一覧を読む。応答に施設名は含まれないので、呼び出し側から渡す。 */
export function parseRoomList(text: string, facilityName: string): RoomInfo[] {
  return contentOf(text, '部屋一覧').map((item) => {
    if (!isRecord(item) || typeof item.id !== 'number' || typeof item.name !== 'string') {
      throw new Error('想定外の応答です（部屋一覧: id と name がありません）');
    }
    const capacity = typeof item.max_amount === 'number' && item.max_amount > 0 ? item.max_amount : null;
    return { key: String(item.id), facility: facilityName, room: item.name, capacity };
  });
}

/** 照会できる利用月の一覧を YYYY-MM で返す。 */
export function parseReservableMonths(text: string): string[] {
  return contentOf(text, '利用月一覧').map((item) => normalizeDate(item, '利用月一覧'));
}

/**
 * 月を指定した空き照会の応答から、空きコマが1つ以上ある日を YYYY-MM-DD の昇順で返す。
 * この応答には日付しか入っていない（部屋やコマは日を指定した照会で取る）。
 */
export function parseVacantDates(text: string, month: string): string[] {
  const dates = contentOf(text, '月の空き状況').map((item) => {
    const date = normalizeDate(isRecord(item) ? item.use_date : undefined, '月の空き状況');
    if (date.length !== 10 || !date.startsWith(`${month}-`)) {
      throw new Error(`想定外の応答です（月の空き状況: ${month} を照会したのに ${date} が返りました）`);
    }
    return date;
  });
  return [...new Set(dates)].sort();
}

/**
 * 日を指定した空き照会の応答から、空きコマを取り出す。
 * サイトが返すのは「空き時間」だけで、予約済み・休館などのコマは応答に現れない。
 */
export function parseDayFrames(text: string, date: string): VacantSlot[] {
  const slots: VacantSlot[] = [];
  for (const item of contentOf(text, '日の空き状況')) {
    const useDate = normalizeDate(isRecord(item) ? item.use_date : undefined, '日の空き状況');
    if (useDate !== date) throw new Error(`想定外の応答です（日の空き状況: ${date} を照会したのに ${useDate} が返りました）`);
    if (!isRecord(item) || typeof item.room_area_id !== 'number' || typeof item.room_area_name !== 'string') {
      throw new Error('想定外の応答です（日の空き状況: room_area_id と room_area_name がありません）');
    }
    if (!Array.isArray(item.reservable_frames)) continue;
    const { status, rawLabel } = classify(item);
    for (const frame of item.reservable_frames) {
      if (!isRecord(frame)) throw new Error('想定外の応答です（日の空き状況: コマを解析できません）');
      slots.push({
        roomKey: String(item.room_area_id),
        facility: typeof item.facility_name === 'string' ? item.facility_name : '',
        room: item.room_area_name,
        date,
        start: normalizeTime(frame.start_time, '日の空き状況'),
        end: normalizeTime(frame.end_time, '日の空き状況'),
        status,
        rawLabel,
      });
    }
  }
  return slots;
}
