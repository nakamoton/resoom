import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { OUT_OF_PERIOD_LABEL, parseRoomList, parseTitle, parseWeek, resolvePeriod } from './parse';

const PATH = '/web';
const TITLE_ROOM_LIST = '施設選択画面';
const TITLE_MONTH = '施設空き状況１ヶ月表示画面';
const TITLE_WEEK = '施設空き状況画面';
/** 施設空き状況画面で1回に取れる日数。 */
const DAYS_PER_PAGE = 7;
/**
 * 利用日の直前が「受付期間外」になる日数の見込み（インターネットの申込期限は最長で利用日の14日前）に余裕を持たせた値。
 * これより先の週が全コマ受付期間外なら、まだ受付が始まっていない期間と判断する。
 */
const HORIZON_MARGIN_DAYS = 31;
/** この日時（2027年3月12日17時・日本時間）で今のシステムは止まり、3月16日に新しいシステムへ替わる。 */
const SYSTEM_ENDS_AT = Date.parse('2027-03-12T17:00:00+09:00');

/** 画面のフォームが毎回送っている項目のうち、空き照会では既定値のままのもの。 */
const COMMON_FIELDS: ReadonlyArray<[string, string]> = [
  ['selectPpsdCd', '0'],
  ['selectPpsCd', '0'],
  ['selectPpsPpsdCd', '0'],
  ['dispWeekNum', '0'],
  ...Array.from({ length: 8 }, (): [string, string] => ['dispWeek', '0']),
  ['submmitMode', '0'],
  ['transVacantMode', '0'],
  ['conditionMode', '1'], // 「地域から」探す
  ['dispSelectInstBldCd', ''],
  ['dispSelectInstCd', ''],
  ['selectCommunityManageCd', '0'],
  ['selectCommunityPlaceCd', '0'],
];

export type KawasakiClientOptions = PoliteSessionOptions;

interface Facility {
  areaCode: string;
  buildingCode: string;
}

/**
 * 川崎市「ふれあいネット」（かんたん画面 /web/）の、ログイン不要の空き照会だけを使うクライアント。
 * facilityCode は「地域コード-館コード」（例: 中原市民館 = 14130504-1180）。
 * 1回の照会で送るリクエストは 3 + 部屋数 × 週数。空き状況は部屋ごと・7日ごとにしか取れない。
 */
export class KawasakiClient implements AvailabilityAdapter {
  readonly id = 'kawasaki';
  readonly label = '川崎市 ふれあいネット';
  private readonly session: PoliteSession;

  constructor(options: KawasakiClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://www.fureai-net.city.kawasaki.jp',
        name: 'ふれあいネット',
        // 空き状況の照会は24時間できる（予約・抽選の受付は7時〜24時）
        encoding: 'shift_jis',
      },
      // 市が負荷を理由にアクセスを止めることがあると明記しているので、既定より長く空ける
      { ...options, minIntervalMs: options.minIntervalMs ?? 3000 },
    );
  }

  /** 館の部屋一覧を取得する。館コードを 0 にすると、その地域の全館の部屋が返る。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    const facility = parseFacilityCode(facilityCode);
    await this.startSession();
    return this.searchFacility(facility);
  }

  /** 指定した館・部屋・期間の空き状況を取得する。 */
  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');
    const facility = parseFacilityCode(query.facilityCode);
    // 館コード 0（地域の全館）では同じ名前の部屋が複数の館にあり、部屋名だけでは決まらない
    if (facility.buildingCode === '0') throw new Error('空き状況の照会では、館コードを指定してください（0 は部屋一覧専用です）');

    await this.startSession();
    const all = await this.searchFacility(facility);
    const rooms = query.rooms.map((name) => {
      const found = all.find((r) => r.room === name);
      if (!found) {
        throw new Error(`部屋「${name}」が見つかりません。候補: ${all.map((r) => r.room).join('、')}`);
      }
      return found;
    });
    const first = rooms[0];
    if (!first) return { rooms, slots: [], coveredThrough: null, fetchedAt: this.session.currentTime().toISOString() };

    // 画面の順路どおり、1ヶ月表示を経てから7日間の表示へ進む
    const month = selectionForm('prwbb3000', facility, first.key);
    await this.post('/rsvWInstSrchMonthVacantAction.do', month, TITLE_MONTH);

    const todayJst = new Date(this.session.currentTime().getTime() + 9 * 3_600_000);
    const farAhead = formatIsoDate(addDays(todayJst, HORIZON_MARGIN_DAYS));
    const slots: AvailabilitySlot[] = [];
    let coveredThrough: string | null = null;
    for (const room of rooms) {
      const cells: AvailabilitySlot[] = [];
      let lastOpen: string | null = null;
      for (let start = from; start <= to; start = addDays(start, DAYS_PER_PAGE)) {
        // 照会したい日が1日もない週は問い合わせない
        if (query.wantsDate && !weekDates(start, to).some(query.wantsDate)) continue;
        const html = await this.post('/rsvWInstSrchVacantAction.do', weekForm(start, room.key), TITLE_WEEK);
        const page = parseWeek(html);
        const expected = `${room.facility}${room.room}空き状況`;
        if (page.caption.replace(/\s/g, '') !== expected.replace(/\s/g, '')) {
          throw new Error(`別の部屋の空き状況が返りました（期待: ${room.facility} ${room.room} / 実際: ${page.caption}）`);
        }
        if (page.dates[0] !== formatIsoDate(start)) {
          throw new Error(`指定と違う期間の空き状況が返りました（指定: ${formatIsoDate(start)} / 実際: ${page.dates[0] ?? '不明'}）`);
        }
        for (const cell of page.cells) {
          const { start: startTime, end } = resolvePeriod(facility.buildingCode, room.room, cell.period);
          cells.push({ facility: room.facility, room: room.room, date: cell.date, start: startTime, end, status: cell.status, rawLabel: cell.rawLabel });
          if (cell.rawLabel !== OUT_OF_PERIOD_LABEL && (lastOpen === null || cell.date > lastOpen)) lastOpen = cell.date;
        }
        // 受付が始まっていない先の期間を指定しても、サイトはエラーにせず全コマを「受付期間外」で返す。
        // 空き状況が出たあとで全コマが受付期間外の週に入ったら、照会できる範囲の終わりと判断して止める。
        // 利用日の直前（申込期限の後）も受付期間外になる館があるので、まだ何も出ていないうちは
        // 十分先の週（HORIZON_MARGIN_DAYS より先）に限って止める。
        const allOutOfPeriod = page.cells.every((cell) => cell.rawLabel === OUT_OF_PERIOD_LABEL);
        if (allOutOfPeriod && (lastOpen !== null || formatIsoDate(start) > farAhead)) break;
      }
      // 照会できた最後の日より後（受付期間外だけが並ぶ日）は返さない
      const through = lastOpen !== null && lastOpen > query.to ? query.to : lastOpen;
      if (through === null) continue;
      const inRange = cells.filter((s) => s.date >= query.from && s.date <= through && (query.wantsDate?.(s.date) ?? true));
      // 画面は時間帯ごとの行なので、日付順・時刻順に並べ直す
      slots.push(...inRange.sort((a, b) => a.date.localeCompare(b.date) || a.start.localeCompare(b.start)));
      if (coveredThrough === null || through > coveredThrough) coveredThrough = through;
    }

    return { rooms, slots, coveredThrough, fetchedAt: this.session.currentTime().toISOString() };
  }

  private async startSession(): Promise<void> {
    if (this.session.currentTime().getTime() >= SYSTEM_ENDS_AT) {
      throw new Error('ふれあいネットの現行システムは2027年3月12日17時で終了しました。新しいシステム用のアダプタが必要です');
    }
    this.session.clearCookies();
    await this.session.request(`${PATH}/index.jsp`);
  }

  private async searchFacility(facility: Facility): Promise<RoomInfo[]> {
    const body = selectionForm('prwbb2000', facility, '0');
    const html = await this.post('/rsvWTransInstSrchInstAction.do', body, TITLE_ROOM_LIST);
    const rooms = parseRoomList(html);
    if (rooms.length === 0) throw new Error(`館コード ${facility.buildingCode}（地域コード ${facility.areaCode}）の部屋が見つかりません`);
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

/** start から7日間のうち、to までの日付（YYYY-MM-DD）。 */
function weekDates(start: Date, to: Date): string[] {
  return Array.from({ length: DAYS_PER_PAGE }, (_, i) => addDays(start, i))
    .filter((date) => date <= to)
    .map(formatIsoDate);
}

function parseFacilityCode(facilityCode: string): Facility {
  const m = /^(\d+)-(\d+)$/.exec(facilityCode);
  if (!m?.[1] || !m[2]) {
    throw new Error(`facilityCode は「地域コード-館コード」の形式で指定してください（例: 14130504-1180）: ${facilityCode}`);
  }
  return { areaCode: m[1], buildingCode: m[2] };
}

/** 館選択・施設選択の画面が送る内容。displayNo は送り元の画面、instNo は部屋の番号。 */
function selectionForm(displayNo: string, facility: Facility, instNo: string): URLSearchParams {
  return new URLSearchParams([
    ['displayNo', displayNo],
    ['selectAreaCd', facility.areaCode],
    ['selectBldCd', facility.buildingCode],
    ['selectInstNo', instNo],
    ...COMMON_FIELDS,
  ]);
}

/** 1ヶ月表示の画面で日付を選んだときと同じ内容。指定日から7日間の空き状況が返る。 */
function weekForm(start: Date, roomKey: string): URLSearchParams {
  const year = String(start.getUTCFullYear());
  const month = String(start.getUTCMonth() + 1);
  const day = String(start.getUTCDate());
  return new URLSearchParams({
    displayNo: 'prwmn1000',
    dispYY: year,
    dispMM: month,
    dispDD: day,
    selectYY: year,
    selectMM: month,
    selectDD: day,
    srchSelectYMD: formatIsoDate(start).replaceAll('-', ''),
    srchSelectInstNo: roomKey,
    transVacantMode: '7',
  });
}
