import type { AvailabilitySlot, RoomInfo } from '../types';
import { parseAvailability, parseRoomList, parseTitle } from './parse';

const BASE = 'https://www.yoyaku.city.ota.tokyo.jp/eshisetsu';
const TITLE_ROOM_LIST = '施設絞り込み';
const TITLE_AVAILABILITY = '予約対象区分選択';
/** 31日間表示で1回に取れる日数。 */
const DAYS_PER_PAGE = 31;

export interface OtaClientOptions {
  /** 連続するリクエストの最小間隔（ミリ秒）。既定は2秒。 */
  minIntervalMs?: number;
  /** User-Agent。連絡先を入れるかどうかは運用側で決める。 */
  userAgent?: string;
  /** 1つのインスタンスが送れるリクエスト数の上限。暴走の歯止め。 */
  maxRequests?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface FetchAvailabilityParams {
  /** 会館コード（例: 大田区民プラザ = 131113_001_18） */
  facilityCode: string;
  /** 部屋名。会館内の表示名と完全一致で指定する。 */
  rooms: string[];
  /** YYYY-MM-DD（この日を含む） */
  from: string;
  /** YYYY-MM-DD（この日を含む） */
  to: string;
}

export interface FetchAvailabilityResult {
  rooms: RoomInfo[];
  slots: AvailabilitySlot[];
  /**
   * 実際に照会できた最後の日（YYYY-MM-DD）。受付開始前などでサイトが表示しない期間は含まない。
   * 1日も照会できなかった場合は null。
   */
  coveredThrough: string | null;
  fetchedAt: string;
}

/**
 * 大田区「うぐいすネット」の、ログイン不要の空き照会だけを使うクライアント。
 * サイトに負荷をかけないよう、リクエストは直列・間隔つきで送る。
 */
export class OtaClient {
  private readonly minIntervalMs: number;
  private readonly userAgent: string;
  private readonly maxRequests: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private cookies = new Map<string, string>();
  private lastRequestAt = 0;
  private requestCount = 0;

  constructor(options: OtaClientOptions = {}) {
    this.minIntervalMs = options.minIntervalMs ?? 2000;
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (compatible; availability-checker/0.1)';
    this.maxRequests = options.maxRequests ?? 60;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** 会館の部屋一覧を取得する。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    await this.startSession();
    return this.searchFacility(facilityCode);
  }

  /** 指定した会館・部屋・期間の空き状況を取得する。 */
  async fetchAvailability(params: FetchAvailabilityParams): Promise<FetchAvailabilityResult> {
    const from = parseDate(params.from);
    const to = parseDate(params.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');

    await this.startSession();
    const all = await this.searchFacility(params.facilityCode);
    const rooms = params.rooms.map((name) => {
      const found = all.find((r) => r.room === name);
      if (!found) {
        throw new Error(`部屋「${name}」が見つかりません。候補: ${all.map((r) => r.room).join('、')}`);
      }
      return found;
    });

    const select = new URLSearchParams({ action: 'Enter', txtProcId: '/yoyaku/ShisetsuMultiSelect' });
    for (const room of rooms) select.append('checkMeisaiUniqKey', room.key);
    await this.post('/yoyaku/ShisetsuMultiSelect.cgi', select, TITLE_AVAILABILITY);

    const slots: AvailabilitySlot[] = [];
    let coveredThrough: string | null = null;
    for (let start = from; start <= to; start = addDays(start, DAYS_PER_PAGE)) {
      const body = new URLSearchParams({
        action: 'Setup',
        txtProcId: '/yoyaku/CalendarStatusSelect',
        optYear: String(start.getUTCFullYear()),
        optMonth: String(start.getUTCMonth() + 1).padStart(2, '0'),
        optDay: String(start.getUTCDate()).padStart(2, '0'),
        radioshow: 'month',
      });
      for (const day of ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN', 'HOL']) body.append('checkShowDay', day);
      const html = await this.post('/yoyaku/CalendarStatusSelect.cgi', body, TITLE_AVAILABILITY);
      const page = parseAvailability(html);
      const dates = page.map((s) => s.date).sort();
      // まだ照会できない期間を指定すると、サイトは直前の表示をそのまま返す。
      // 指定した開始日から始まっていなければ、照会できる範囲の終わりと判断して止める。
      if (dates[0] !== formatDate(start)) break;
      slots.push(...page);
      coveredThrough = dates.at(-1) ?? coveredThrough;
    }

    return {
      rooms,
      slots: slots.filter((s) => s.date >= params.from && s.date <= params.to),
      coveredThrough: coveredThrough !== null && coveredThrough > params.to ? params.to : coveredThrough,
      fetchedAt: this.now().toISOString(),
    };
  }

  private async startSession(): Promise<void> {
    this.cookies.clear();
    await this.request('/menu/Welcome.cgi');
  }

  private async searchFacility(facilityCode: string): Promise<RoomInfo[]> {
    const body = new URLSearchParams({
      action: 'Search',
      txtProcId: '/menu/Login',
      loginBtn: '1', // 「ログインせずに空き状況を検索」
      optYoyakuMode: '0', // 空き照会（抽選申込ではない）
      chkSearchItemsKaikan: facilityCode,
      yoyakuMode: 'on',
      jouken1: 'on',
    });
    const html = await this.post('/menu/Login.cgi', body, TITLE_ROOM_LIST);
    const rooms = parseRoomList(html);
    if (rooms.length === 0) throw new Error(`会館コード ${facilityCode} の部屋が見つかりません`);
    return rooms;
  }

  private async post(path: string, body: URLSearchParams, expectedTitle: string): Promise<string> {
    const html = await this.request(path, body);
    const title = parseTitle(html);
    if (!title.includes(expectedTitle)) {
      throw new Error(`想定外の画面です（期待: ${expectedTitle} / 実際: ${title || '不明'}）`);
    }
    return html;
  }

  private async request(path: string, body?: URLSearchParams): Promise<string> {
    assertServiceHours(this.now());
    if (this.requestCount >= this.maxRequests) {
      throw new Error(`リクエスト数の上限（${this.maxRequests}）に達しました`);
    }
    const wait = this.lastRequestAt + this.minIntervalMs - this.now().getTime();
    if (this.requestCount > 0 && wait > 0) await this.sleep(wait);

    this.requestCount += 1;
    this.lastRequestAt = this.now().getTime();
    const headers: Record<string, string> = { 'User-Agent': this.userAgent, 'Accept-Language': 'ja' };
    if (this.cookies.size > 0) {
      headers.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');
    }
    if (body) headers['Content-Type'] = 'application/x-www-form-urlencoded';

    const res = await this.fetchImpl(`${BASE}${path}`, {
      method: body ? 'POST' : 'GET',
      headers,
      body: body?.toString(),
      redirect: 'manual',
    });
    if (res.status !== 200) throw new Error(`${path}: HTTP ${res.status}`);
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res.text();
  }
}

/** うぐいすネットの受付時間は 5:00〜翌1:59（日本時間）。時間外は問い合わせない。 */
export function assertServiceHours(now: Date): void {
  const hourJst = (now.getUTCHours() + 9) % 24;
  if (hourJst >= 2 && hourJst < 5) {
    throw new Error('うぐいすネットの受付時間外です（5:00〜翌1:59）');
  }
}

function parseDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`日付は YYYY-MM-DD 形式で指定してください: ${value}`);
  }
  return date;
}

function formatDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
