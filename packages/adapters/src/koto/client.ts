import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { OUT_OF_PERIOD_STATUS, parseDay, parseMessage, parseTitle, type DayPage } from './parse';

const PATH = '/web';
/** メニュー画面（ログインなし）。題名は「認証画面」で、本文の見出しが〔メニュー画面〕。 */
const TITLE_MENU = '認証画面';
const TITLE_SEARCH = '予約申込画面';
const TITLE_AREA = '地域検索条件画面';
const TITLE_BUILDING = '館検索条件画面';
const TITLE_MONTH = '施設空き状況１ヶ月表示画面';
const TITLE_DAY = '施設空き状況画面';

/** 午前・午後・夜間の時刻（財団の施設利用料金の案内による。全館共通）。 */
const PERIODS: ReadonlyArray<[string, string]> = [
  ['09:00', '12:00'],
  ['13:00', '17:00'],
  ['18:00', '22:00'],
];
/** 音楽スタジオなど、2時間ごとの部屋の時刻。 */
const TWO_HOUR_SLOTS: ReadonlyArray<[string, string]> = [
  ['09:00', '11:00'],
  ['11:00', '13:00'],
  ['13:00', '15:00'],
  ['15:00', '17:00'],
  ['17:00', '19:00'],
  ['19:00', '21:00'],
];
/** 照会できる範囲を過ぎたと判断するまでの、続けて「受付期間外」の日数。 */
const OUT_OF_PERIOD_DAYS_TO_STOP = 7;
/** 日ごとの画面で日を移すときの transVacantMode と、移る日数（実サイトで確かめた）。 */
const MOVES = { nextDay: { mode: '13', days: 1 }, previousDay: { mode: '12', days: -1 }, nextWeek: { mode: '4', days: 7 } } as const;
type Move = (typeof MOVES)[keyof typeof MOVES];

/** delta 日先へ移るための、いちばん少ない移り方（「次の週」と「翌日」「前日」の組み合わせ）。 */
export function planMoves(delta: number): Move[] {
  if (delta <= 0) throw new Error(`先の日へだけ移れます（${delta}日）`);
  const weeks = Math.floor(delta / 7);
  const rest = delta - weeks * 7;
  // 「次の週」を1回多くして「前日」で戻るほうが少なければ、そちらにする
  if (rest > 0 && 1 + (7 - rest) < rest) {
    return [...Array<Move>(weeks + 1).fill(MOVES.nextWeek), ...Array<Move>(7 - rest).fill(MOVES.previousDay)];
  }
  return [...Array<Move>(weeks).fill(MOVES.nextWeek), ...Array<Move>(rest).fill(MOVES.nextDay)];
}

export type KotoClientOptions = PoliteSessionOptions;

interface Facility {
  areaCode: string;
  buildingCode: string;
  /** 館の一覧での順番（画面の selectBldNo） */
  buildingNo: string;
}

/**
 * 江東区文化コミュニティ財団の施設予約システム（区の文化センター等）の、ログイン不要の空き照会だけを使うクライアント。
 * facilityCode は「地域コード-館コード-館の順番」（例: 森下文化センター = 1010-1050-5）。
 *
 * 川崎市と同じ系統だが、画面の順路を飛ばすと「遷移情報に誤りがあります」と返るため、
 * メニュー → 空き状況の検索 → 地域 → 館 → 1か月表示 → 日ごとの表示 と順にたどり、あとは「翌日」で1日ずつ進む。
 * 1回の照会で送るリクエストは「6 + 日数」。日ごとの表示には館の全部屋が出るので、部屋数は関係ない。
 * wantsDate で日を絞ると、「次の週」「前日」も使って絞った日だけをたどる（土日祝だけなら、ほぼ1日1件）。
 */
export class KotoClient implements AvailabilityAdapter {
  readonly id = 'koto';
  readonly label = '江東区 文化センター施設予約';
  private readonly session: PoliteSession;

  constructor(options: KotoClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://sisetun.kcf.or.jp',
        name: '江東区文化コミュニティ財団 施設予約システム',
        encoding: 'shift_jis',
        // 毎日3時〜4時はメンテナンスで止まる
        closedHours: { from: 3, to: 4 },
      },
      // 財団の負担を考え、既定より長く空ける
      { ...options, minIntervalMs: options.minIntervalMs ?? 3000 },
    );
  }

  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    const facility = parseFacilityCode(facilityCode);
    const today = this.todayJst();
    const page = await this.openDay(facility, today);
    return page.rooms.map((room) => ({ key: room.key, facility: facilityCode, room: room.name, capacity: null }));
  }

  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const facility = parseFacilityCode(query.facilityCode);
    const today = this.todayJst();
    const wants = query.wantsDate ?? (() => true);
    const nextWanted = (after: string): string | null => {
      for (let d = after; d <= query.to; d = formatIsoDate(addDays(parseIsoDate(d), 1))) {
        if (d > after && wants(d)) return d;
      }
      return null;
    };
    const from = query.from < today ? today : query.from;
    const first = wants(from) ? from : nextWanted(from);
    if (first === null || first > query.to) {
      return { rooms: [], slots: [], coveredThrough: null, fetchedAt: this.session.currentTime().toISOString() };
    }

    let page = await this.openDay(facility, first);
    const rooms = query.rooms.map((name) => {
      const found = page.rooms.find((r) => r.name === name);
      if (!found) throw new Error(`部屋「${name}」が見つかりません。候補: ${page.rooms.map((r) => r.name).join('、')}`);
      return { key: found.key, facility: query.facilityCode, room: found.name, capacity: null } satisfies RoomInfo;
    });

    const slots: AvailabilitySlot[] = [];
    let coveredThrough: string | null = null;
    let outOfPeriodRun = 0;
    let expected = first;
    for (;;) {
      if (page.date !== expected) throw new Error(`想定外の日の表示です（期待: ${expected} / 実際: ${page.date}）`);
      const dayRooms = rooms.map((room) => page.rooms.find((r) => r.key === room.key));
      const allOutOfPeriod = dayRooms.every((r) => r?.cells.every((c) => c.status === OUT_OF_PERIOD_STATUS) ?? true);
      if (!allOutOfPeriod) {
        coveredThrough = page.date;
        outOfPeriodRun = 0;
      } else if (coveredThrough !== null) {
        outOfPeriodRun += 1;
      }
      if (wants(page.date)) {
        rooms.forEach((room, i) => {
          const cells = dayRooms[i]?.cells ?? [];
          const times = cells.length === TWO_HOUR_SLOTS.length ? TWO_HOUR_SLOTS : PERIODS;
          if (cells.length !== times.length) {
            throw new Error(`「${room.room}」のコマの数が想定と違います（${cells.length}コマ）`);
          }
          cells.forEach((cell, j) => {
            const [start, end] = times[j] ?? ['', ''];
            slots.push({ facility: query.facilityCode, room: room.room, date: page.date, start, end, status: cell.status, rawLabel: cell.rawLabel });
          });
        });
      }
      // 照会できる範囲を過ぎた（受付期間外が続く）か、指定の最後の日まで来たら終わる
      const next = nextWanted(page.date);
      if (next === null || outOfPeriodRun >= OUT_OF_PERIOD_DAYS_TO_STOP) break;
      const moves = planMoves(daysBetween(page.date, next));
      // 問い合わせの上限に届くなら、そこまでで返す
      if (this.session.remainingRequests < moves.length) break;
      for (const move of moves) {
        expected = formatIsoDate(addDays(parseIsoDate(page.date), move.days));
        page = await this.move(page, move);
        if (page.date !== expected) throw new Error(`想定外の日の表示です（期待: ${expected} / 実際: ${page.date}）`);
      }
      expected = next;
    }
    return { rooms, slots, coveredThrough, fetchedAt: this.session.currentTime().toISOString() };
  }

  /** 日本時間の今日（YYYY-MM-DD）。 */
  private todayJst(): string {
    return formatIsoDate(new Date(this.session.currentTime().getTime() + 9 * 3_600_000));
  }

  /** 画面の順路どおりに、指定の日の館の空き状況まで進む。 */
  private async openDay(facility: Facility, date: string): Promise<DayPage> {
    this.session.clearCookies();
    await this.session.request(`${PATH}/index.jsp`);
    await this.post('/rsvWTransUserAttestationAction.do', { displayNo: 'pawaa2000', dbInstanceNo: '1' }, TITLE_MENU);
    await this.post('/rsvWTransInstSrchVacantAction.do', { displayNo: 'pawab2000' }, TITLE_SEARCH);
    await this.post('/rsvWTransInstSrchAreaAction.do', { displayNo: 'prwaa1000', conditionMode: '1' }, TITLE_AREA);
    await this.post(
      '/rsvWTransInstSrchBuildAction.do',
      {
        displayNo: 'prwbb1000',
        selectAreaCd: facility.areaCode,
        selectPpsPpsdCd: '0',
        selectPpsCd: '0',
        selectMComCd: '0',
        selectPComCd: '0',
        selectCommunityManageCd: '0',
        selectCommunityPlaceCd: '0',
      },
      TITLE_BUILDING,
    );
    await this.post(
      '/rsvWInstSrchMonthVacantAction.do',
      {
        displayNo: 'prwbb2000',
        selectInstNo: '0',
        selectInstBldCd: '0',
        selectInstCd: '0',
        srchSelectYMD: '0',
        selectBldNo: facility.buildingNo,
        selectBldCd: facility.buildingCode,
        transVacantMode: '',
      },
      TITLE_MONTH,
    );
    // 1か月表示は今月から始まる。指定の日が来月以降なら、月を進める
    let shown = this.todayJst().slice(0, 7);
    while (shown < date.slice(0, 7)) {
      const next = formatIsoDate(new Date(Date.UTC(Number(shown.slice(0, 4)), Number(shown.slice(5, 7)), 1)));
      await this.post('/rsvWInstSrchMonthVacantAction.do', dayForm(next, '2'), TITLE_MONTH);
      shown = next.slice(0, 7);
    }
    return parseDay(await this.post('/rsvWInstSrchVacantAction.do', dayForm(date, '7'), TITLE_DAY));
  }

  /** 日ごとの表示から「翌日」「前日」「次の週」で日を移す。 */
  private async move(page: DayPage, move: Move): Promise<DayPage> {
    const html = await this.post(
      '/rsvWInstSrchVacantAction.do',
      { displayNo: 'prwca1000', transVacantMode: move.mode, srchSelectInstNo: page.srchSelectInstNo, selectBldNo: page.selectBldNo },
      TITLE_DAY,
    );
    return parseDay(html);
  }

  private async post(path: string, fields: Record<string, string> | URLSearchParams, expectedTitle: string): Promise<string> {
    const form = fields instanceof URLSearchParams ? fields : new URLSearchParams(fields);
    const { text } = await this.session.request(`${PATH}${path}`, { form });
    const title = parseTitle(text);
    if (!title.includes(expectedTitle)) {
      const message = parseMessage(text);
      throw new Error(`想定外の画面です（期待: ${expectedTitle} / 実際: ${message ?? (title || '空の応答')}）`);
    }
    return text;
  }
}

/** 1か月表示で日付を選ぶ（mode 7）・月を移る（mode 2 = 翌月）ときと同じ内容。 */
function dayForm(date: string, mode: string): URLSearchParams {
  const [y = '', m = '', d = ''] = date.split('-');
  return new URLSearchParams([
    ['displayNo', 'prwmn1000'],
    ['dispYY', y],
    ['dispMM', String(Number(m))],
    ['dispDD', String(Number(d))],
    ['selectYY', y],
    ['selectMM', String(Number(m))],
    ['selectDD', String(Number(d))],
    ['dispWeekNum', '0'],
    ...Array.from({ length: 8 }, (): [string, string] => ['dispWeek', '0']),
    ['submmitMode', '0'],
    ['wselectYY', '0'],
    ['wselectMM', '0'],
    ['wselectDD', '0'],
    ['e410150', '検索開始日を選択して下さい。'],
    ['srchSelectYMD', `${y}${m}${d}`],
    ['transVacantMode', mode],
  ]);
}

/** a から b まで何日か（YYYY-MM-DD）。 */
function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}

function parseFacilityCode(facilityCode: string): Facility {
  const m = /^(\d+)-(\d+)-(\d+)$/.exec(facilityCode);
  if (!m?.[1] || !m[2] || !m[3]) {
    throw new Error(`facilityCode は「地域コード-館コード-館の順番」の形式で指定してください（例: 1010-1050-5）: ${facilityCode}`);
  }
  return { areaCode: m[1], buildingCode: m[2], buildingNo: m[3] };
}
