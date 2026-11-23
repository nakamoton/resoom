import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { OUT_OF_PERIOD_LABEL, parseFacilityName, parseRoomList, parseTitle, parseWeek } from './parse';

const PATH = '/shinagawa/web';
const TITLE_HOME = 'ホーム画面';
const TITLE_AVAILABILITY = '空き状況画面';
/** 週表示で1回に取れる日数。 */
const DAYS_PER_PAGE = 7;
/**
 * 空き状況検索の「何をする」に入れる利用目的（楽器演奏）。画面が必須にしているので送る。
 * 利用目的は検索結果に出る施設の絞り込みに使われるだけで、週表示の中身は変わらない
 * （中小企業センター音楽室の同じ週を、楽器練習と楽器演奏の両方で検索して確認した）。
 */
const PURPOSE_CODE = '31000000_31004500';
/**
 * 利用日の直前が「受付期間外」になる日数の見込みに余裕を持たせた値
 * （インターネットの申込期限が利用日の14日前までの館がある）。
 * これより先の週が全コマ受付期間外なら、まだ受付が始まっていない期間と判断する。
 */
const HORIZON_MARGIN_DAYS = 31;

export type ShinagawaClientOptions = PoliteSessionOptions;

interface Facility {
  /** 画面の「どこで」の値そのまま（地域コード_館コード） */
  code: string;
  buildingCode: string;
}

/**
 * 品川区施設予約システムの、ログイン不要の空き状況検索だけを使うクライアント。
 * facilityCode は「地域コード_館コード」（例: 中小企業センター = 1400_2400）。ホーム画面の「どこで」の選択肢の値と同じ。
 * 1回の照会で送るリクエストは 3 + 部屋数 × 週数。空き状況は部屋ごと・7日ごとにしか取れない。
 * サイトは、抽選の申込期間中でまだ先着予約ができない月のコマも「空き」と表示する。
 * 今すぐ申し込めるかどうかは、このクライアントでは判断しない。
 */
export class ShinagawaClient implements AvailabilityAdapter {
  readonly id = 'shinagawa';
  readonly label = '品川区 施設予約システム';
  private readonly session: PoliteSession;

  constructor(options: ShinagawaClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://www.cm9.eprs.jp',
        name: '品川区施設予約システム',
        // 稼働時間の明記は見つかっていない。インターネット予約の受付が5時〜24時と案内されている館があるので、
        // 空き照会も 0時〜5時は送らないことにしている（夜間に照会できるかは未確認）
        closedHours: { from: 0, to: 5 },
        encoding: 'shift_jis',
      },
      options,
    );
  }

  /** 館の部屋一覧を取得する。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    const facility = parseFacilityCode(facilityCode);
    const name = await this.startSession(facility);
    return this.fetchRooms(facility, name);
  }

  /** 指定した館・部屋・期間の空き状況を取得する。 */
  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');
    const facility = parseFacilityCode(query.facilityCode);

    const name = await this.startSession(facility);
    const all = await this.fetchRooms(facility, name);
    const rooms = query.rooms.map((roomName) => {
      const found = all.find((r) => r.room === roomName);
      if (!found) {
        throw new Error(`部屋「${roomName}」が見つかりません。候補: ${all.map((r) => r.room).join('、')}`);
      }
      return found;
    });
    const [first, ...rest] = rooms;
    if (!first) return { rooms, slots: [], coveredThrough: null, fetchedAt: this.session.currentTime().toISOString() };

    const today = formatIsoDate(new Date(this.session.currentTime().getTime() + 9 * 3_600_000));
    // 画面の順路どおり、空き状況検索を経てから週表示を取る（検索を経ないと週表示はエラーになる）
    await this.search(facility, rest.length === 0 ? first.key : '0', today);

    const farAhead = formatIsoDate(addDays(parseIsoDate(today), HORIZON_MARGIN_DAYS));
    const slots: AvailabilitySlot[] = [];
    let coveredThrough: string | null = null;
    for (const room of rooms) {
      const cells: AvailabilitySlot[] = [];
      let lastOpen: string | null = null;
      for (let start = from; start <= to; start = addDays(start, DAYS_PER_PAGE)) {
        // 照会したい日が1日もない週は問い合わせない
        if (query.wantsDate && !weekDates(start, to).some(query.wantsDate)) continue;
        const page = parseWeek(await this.postJson('/rsvWOpeInstSrchVacantAjaxAction.do', weekForm(facility, room.key, start)));
        if (page.dates[0] !== formatIsoDate(start)) {
          throw new Error(`指定と違う期間の空き状況が返りました（指定: ${formatIsoDate(start)} / 実際: ${page.dates[0] ?? '不明'}）`);
        }
        for (const cell of page.cells) {
          cells.push({ facility: room.facility, room: room.room, ...cell });
          if (cell.rawLabel !== OUT_OF_PERIOD_LABEL && (lastOpen === null || cell.date > lastOpen)) lastOpen = cell.date;
        }
        // 受付が始まっていない先の期間を指定しても、サイトはエラーにせず全コマを「受付期間外」で返す。
        // 空き状況が出たあとで全コマが受付期間外の週に入ったら、照会できる範囲の終わりと判断して止める。
        // 当日（館によっては利用日の直前）も受付期間外になるので、まだ何も出ていないうちは
        // 十分先の週（HORIZON_MARGIN_DAYS より先）に限って止める。
        const allOutOfPeriod = page.cells.every((cell) => cell.rawLabel === OUT_OF_PERIOD_LABEL);
        if (allOutOfPeriod && (lastOpen !== null || formatIsoDate(start) > farAhead)) break;
      }
      // 照会できた最後の日より後（受付期間外だけが並ぶ日）は返さない
      const through = lastOpen !== null && lastOpen > query.to ? query.to : lastOpen;
      if (through === null) continue;
      slots.push(...cells.filter((s) => s.date >= query.from && s.date <= through && (query.wantsDate?.(s.date) ?? true)));
      if (coveredThrough === null || through > coveredThrough) coveredThrough = through;
    }

    return { rooms, slots, coveredThrough, fetchedAt: this.session.currentTime().toISOString() };
  }

  /** ホーム画面を開いてセッションを始め、館の名前を返す。 */
  private async startSession(facility: Facility): Promise<string> {
    this.session.clearCookies();
    const { text } = await this.session.request(`${PATH}/index.jsp`);
    assertTitle(text, TITLE_HOME);
    const name = parseFacilityName(text, facility.code);
    if (name === null) throw new Error(`館コード ${facility.code} がホーム画面の選択肢にありません`);
    return name;
  }

  /** ホーム画面で館を選んだときと同じ問い合わせで、部屋の一覧を取る。 */
  private async fetchRooms(facility: Facility, facilityName: string): Promise<RoomInfo[]> {
    const body = new URLSearchParams({ displayNo: 'prwre1000', selectAreaBcd: facility.code });
    const rooms = parseRoomList(await this.postJson('/rsvWOpeUnreservedSearchBuildAjaxAction.do', body), facilityName);
    if (rooms.length === 0) throw new Error(`館コード ${facility.code} の部屋が見つかりません`);
    return rooms;
  }

  /** ホーム画面の「検索」と同じ内容を送る（今日から1週間・曜日と時間帯は指定なし）。roomKey が 0 なら施設は指定なし。 */
  private async search(facility: Facility, roomKey: string, today: string): Promise<void> {
    const body = new URLSearchParams({
      date: '3', // 「1週間」
      daystart: today,
      days: '7',
      dayofweekClearFlg: '1',
      timezoneClearFlg: '1',
      selectAreaBcd: facility.code,
      selectIcd: roomKey,
      selectPpsClPpscd: PURPOSE_CODE,
      displayNo: 'pawab2000',
      displayNoFrm: 'pawab2000',
    });
    const { text } = await this.session.request(`${PATH}/rsvWOpeInstSrchVacantAction.do`, { form: body });
    assertTitle(text, TITLE_AVAILABILITY);
  }

  private async postJson(path: string, form: URLSearchParams): Promise<string> {
    const { text } = await this.session.request(`${PATH}${path}`, { form });
    return text;
  }
}

function assertTitle(html: string, expected: string): void {
  const title = parseTitle(html);
  if (!title.includes(expected)) {
    throw new Error(`想定外の画面です（期待: ${expected} / 実際: ${title || '不明'}）`);
  }
}

/** start から7日間のうち、to までの日付（YYYY-MM-DD）。 */
function weekDates(start: Date, to: Date): string[] {
  return Array.from({ length: DAYS_PER_PAGE }, (_, i) => addDays(start, i))
    .filter((date) => date <= to)
    .map(formatIsoDate);
}

function parseFacilityCode(facilityCode: string): Facility {
  const m = /^\d+_(\d+)$/.exec(facilityCode);
  // 館コード 0 は「地区(すべて)」で、館を特定しない
  if (!m?.[1] || Number(m[1]) === 0) {
    throw new Error(`facilityCode は「地域コード_館コード」の形式で指定してください（例: 1400_2400）: ${facilityCode}`);
  }
  return { code: facilityCode, buildingCode: m[1] };
}

/** 週表示で画面が送る内容。指定日から7日間の空き状況が返る（transVacantMode=11 は日付指定）。 */
function weekForm(facility: Facility, roomKey: string, start: Date): URLSearchParams {
  return new URLSearchParams({
    displayNo: 'prwrc2000',
    useDay: formatIsoDate(start).replaceAll('-', ''),
    bldCd: facility.buildingCode,
    instCd: roomKey,
    transVacantMode: '11',
    clearFlag: '0',
  });
}
