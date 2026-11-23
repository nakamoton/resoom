import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { parseAvailability, parseRoomList, parseTitle } from './parse';

const PATH = '/eshisetsu';
const TITLE_ROOM_LIST = '施設絞り込み';
const TITLE_AVAILABILITY = '予約対象区分選択';
/** 31日間表示で1回に取れる日数。 */
const DAYS_PER_PAGE = 31;

export type OtaClientOptions = PoliteSessionOptions;

/**
 * 大田区「うぐいすネット」の、ログイン不要の空き照会だけを使うクライアント。
 * facilityCode は会館コード（例: 大田区民プラザ = 131113_001_18）。
 */
export class OtaClient implements AvailabilityAdapter {
  readonly id = 'ota';
  readonly label = '大田区 うぐいすネット';
  private readonly session: PoliteSession;

  constructor(options: OtaClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://www.yoyaku.city.ota.tokyo.jp',
        name: 'うぐいすネット',
        // 受付時間は 5:00〜翌1:59
        closedHours: { from: 2, to: 5 },
      },
      options,
    );
  }

  /** 会館の部屋一覧を取得する。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    await this.startSession();
    return this.searchFacility(facilityCode);
  }

  /** 指定した会館・部屋・期間の空き状況を取得する。 */
  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');

    await this.startSession();
    const all = await this.searchFacility(query.facilityCode);
    const rooms = query.rooms.map((name) => {
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
      if (dates[0] !== formatIsoDate(start)) break;
      slots.push(...page);
      coveredThrough = dates.at(-1) ?? coveredThrough;
    }

    return {
      rooms,
      slots: slots.filter((s) => s.date >= query.from && s.date <= query.to && (query.wantsDate?.(s.date) ?? true)),
      coveredThrough: coveredThrough !== null && coveredThrough > query.to ? query.to : coveredThrough,
      fetchedAt: this.session.currentTime().toISOString(),
    };
  }

  private async startSession(): Promise<void> {
    this.session.clearCookies();
    await this.session.request(`${PATH}/menu/Welcome.cgi`);
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

  private async post(path: string, form: URLSearchParams, expectedTitle: string): Promise<string> {
    const { text } = await this.session.request(`${PATH}${path}`, { form });
    const title = parseTitle(text);
    if (!title.includes(expectedTitle)) {
      throw new Error(`想定外の画面です（期待: ${expectedTitle} / 実際: ${title || '不明'}）`);
    }
    return text;
  }
}
