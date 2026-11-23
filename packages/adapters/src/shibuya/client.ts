import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { parseCsrf, parseDayFrames, parseFacilities, parseReservableMonths, parseRoomList, parseVacantDates, type CsrfToken } from './parse';

const API = '/api';
const FRAMES_PATH = `${API}/reservations/facilities/room_areas/reservable_frames`;
/** 施設コードで目的を省いたときに使う目的コード。120010 = 器楽。 */
const DEFAULT_USE_TYPE = '120010';

export type ShibuyaClientOptions = PoliteSessionOptions;

interface Target {
  facilityId: number;
  useType: string;
}

/** 「29001」「29001:120010」を、施設IDと目的コードに分ける。 */
function parseFacilityCode(code: string): Target {
  const m = /^(\d+)(?::(\d+))?$/.exec(code);
  if (!m) throw new Error(`施設コードは「施設ID」または「施設ID:目的コード」の形式で指定してください: ${code}`);
  return { facilityId: Number(m[1]), useType: m[2] ?? DEFAULT_USE_TYPE };
}

/** from〜to にかかる月（YYYY-MM）を順に並べる。 */
function monthsBetween(from: Date, to: Date): string[] {
  const months: string[] = [];
  let cursor = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth(), 1));
  while (cursor <= to) {
    months.push(formatIsoDate(cursor).slice(0, 7));
    cursor = new Date(Date.UTC(cursor.getUTCFullYear(), cursor.getUTCMonth() + 1, 1));
  }
  return months;
}

/** YYYY-MM の月の最終日（YYYY-MM-DD）。 */
const lastDayOf = (month: string): string =>
  formatIsoDate(new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)));

/**
 * 渋谷区施設予約システムの、ログイン不要の「空き状況確認」だけを使うクライアント。
 *
 * facilityCode は「施設ID」または「施設ID:目的コード」（例: 文化総合センター大和田（練習室）= 29001、
 * 目的を明示するなら 29001:120010）。目的を省くと 器楽（120010）で照会する。
 * 部屋の一覧は目的によって変わる（その目的で使える部屋だけが出る）。
 *
 * このサイトが返すのは空いているコマだけなので、結果のコマは available（受付期間外と印が付いたものは
 * not_bookable）になる。予約済み・休館のコマは結果に現れず、区別もできない。
 *
 * 空きのある日ごとに1回の問い合わせが必要なため、空きが多い部屋を長い期間で照会すると
 * リクエスト数の上限に届く。そのときはエラーにせず、取得できた日までを coveredThrough として返す。
 */
export class ShibuyaClient implements AvailabilityAdapter {
  readonly id = 'shibuya';
  readonly label = '渋谷区 施設予約システム';
  private readonly session: PoliteSession;
  private csrf: CsrfToken | null = null;

  constructor(options: ShibuyaClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://www.yoyaku.city.shibuya.tokyo.jp',
        name: '渋谷区施設予約システム',
        // 定時の停止時間帯は案内されていない（メンテナンスはその都度ホーム画面で告知される）
      },
      options,
    );
  }

  /** 施設の部屋一覧を取得する。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    const target = parseFacilityCode(facilityCode);
    await this.startSession();
    return this.fetchRooms(target);
  }

  /** 指定した施設・部屋・期間の空きコマを取得する。 */
  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');
    const target = parseFacilityCode(query.facilityCode);

    await this.startSession();
    const all = await this.fetchRooms(target);
    const rooms = query.rooms.map((name) => {
      const found = all.find((r) => r.room === name);
      if (!found) {
        throw new Error(`部屋「${name}」が見つかりません。候補: ${all.map((r) => r.room).join('、')}`);
      }
      return found;
    });
    const byKey = new Map(rooms.map((room) => [room.key, room]));

    // 画面が選ばせる利用月の一覧。これより先の月もAPIは答えるが、画面には出ない
    // （抽選前で予約できないコマが空きとして返る）ので、一覧にある月だけを照会する。
    const viewable = new Set(
      parseReservableMonths(
        await this.get(`${API}/reservations/facilities/reservable_month?code=${target.useType}&facility_id=${target.facilityId}`),
      ),
    );

    const slots: AvailabilitySlot[] = [];
    let coveredThrough: string | null = null;
    let started = false;
    scan: for (const month of monthsBetween(from, to)) {
      if (!viewable.has(month)) {
        // 過去の月は飛ばす。照会できる月を過ぎたら終わり。
        if (started) break;
        continue;
      }
      // 月ごとの照会（部屋の数だけ）を送る余裕がなければ、前の月までで止める
      if (this.session.remainingRequests < byKey.size) break;
      started = true;
      const first = `${month}-01` < query.from ? query.from : `${month}-01`;
      const last = lastDayOf(month) > query.to ? query.to : lastDayOf(month);

      // 部屋ごとに、空きのある日を調べる
      const dates = new Set<string>();
      for (const room of byKey.values()) {
        const body = this.framesBody(target, month, '', Number(room.key));
        for (const date of parseVacantDates(await this.post(FRAMES_PATH, body), month)) {
          if (date >= first && date <= last && (query.wantsDate?.(date) ?? true)) dates.add(date);
        }
      }

      // 空きのある日ごとに、コマを調べる。部屋が1つならその部屋に絞り、複数なら施設全体を1回で取る
      const onlyRoom = byKey.size === 1 ? Number([...byKey.keys()][0]) : undefined;
      for (const date of [...dates].sort()) {
        if (this.session.remainingRequests < 1) {
          // 上限に届いた: この日より前までを照会できた範囲とする
          const previous = formatIsoDate(addDays(parseIsoDate(date), -1));
          if (previous >= first) coveredThrough = previous;
          break scan;
        }
        const body = this.framesBody(target, month, date.replaceAll('-', '/'), onlyRoom);
        for (const slot of parseDayFrames(await this.post(FRAMES_PATH, body), date)) {
          const room = byKey.get(slot.roomKey);
          if (!room) continue;
          slots.push({
            facility: room.facility,
            room: room.room,
            date: slot.date,
            start: slot.start,
            end: slot.end,
            status: slot.status,
            rawLabel: slot.rawLabel,
          });
        }
      }
      coveredThrough = last;
    }

    const order = new Map(rooms.map((room, index) => [room.room, index]));
    slots.sort(
      (a, b) =>
        a.date.localeCompare(b.date) || (order.get(a.room) ?? 0) - (order.get(b.room) ?? 0) || a.start.localeCompare(b.start),
    );
    return {
      rooms,
      slots: slots.filter((s) => s.date >= query.from && s.date <= query.to),
      coveredThrough,
      fetchedAt: this.session.currentTime().toISOString(),
    };
  }

  /** 新しい訪問として、匿名の訪問者にも配られるCSRFトークン（Cookieと対）を受け取る。 */
  private async startSession(): Promise<void> {
    this.session.clearCookies();
    this.csrf = null;
    this.csrf = parseCsrf(await this.get(`${API}/csrf`));
  }

  private async fetchRooms(target: Target): Promise<RoomInfo[]> {
    const facilities = parseFacilities(await this.get(`${API}/use_types/facilities/reservation?code=${target.useType}`));
    const facility = facilities.find((f) => f.id === target.facilityId);
    if (!facility) {
      const candidates = facilities.map((f) => `${f.id}=${f.name}`).join('、') || 'なし';
      throw new Error(`施設ID ${target.facilityId} は目的コード ${target.useType} では照会できません。候補: ${candidates}`);
    }
    const rooms = parseRoomList(
      await this.get(`${API}/reservations/facilities/${target.facilityId}/room_areas?code=${target.useType}`),
      facility.name,
    );
    if (rooms.length === 0) throw new Error(`施設ID ${target.facilityId} の部屋が見つかりません`);
    return rooms;
  }

  /** 画面の検索フォームが送るのと同じ内容。useDate が空なら月の照会、入っていれば日の照会。 */
  private framesBody(target: Target, month: string, useDate: string, roomAreaId: number | undefined): Record<string, unknown> {
    return {
      use_type_code: target.useType,
      facility_id: target.facilityId,
      ...(roomAreaId === undefined ? {} : { room_area_id: roomAreaId }),
      use_month: month.replace('-', '/'),
      use_date: useDate,
      start_time: '',
      end_time: '',
    };
  }

  private get(path: string): Promise<string> {
    return this.send(path, undefined);
  }

  private post(path: string, json: Record<string, unknown>): Promise<string> {
    return this.send(path, json);
  }

  private async send(path: string, json: Record<string, unknown> | undefined): Promise<string> {
    const headers: Record<string, string> = { Accept: 'application/json, text/plain, */*' };
    if (this.csrf) headers[this.csrf.headerName] = this.csrf.token;
    const { text } = await this.session.request(path, json === undefined ? { headers } : { json, headers });
    return text;
  }
}
