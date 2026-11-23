import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type PoliteSessionOptions } from '../http';
import type { AvailabilityAdapter, AvailabilityQuery, AvailabilityResult, AvailabilitySlot, RoomInfo } from '../types';
import { dayStatus, parseDayView, parseFacilityList, parseForm, parseTimeView, type DayRow } from './parse';

/** 入口。Cookie の確認を経て、トップページ（空き照会の検索フォーム）へ転送される。 */
const ENTRY = '/Web/';

interface Screen {
  /** 画面のフォームの送信先。どの画面が返ったかの判定に使う */
  path: string;
  name: string;
}
const TOP: Screen = { path: '/Web/Home/WgR_ModeSelect', name: 'トップページ' };
const SEARCH: Screen = { path: '/Web/Yoyaku/WgR_ShisetsuKensaku', name: '施設検索' };
const DAYS: Screen = { path: '/Web/Yoyaku/WgR_ShisetsubetsuAkiJoukyou', name: '施設別空き状況' };
const TIMES: Screen = { path: '/Web/Yoyaku/WgR_JikantaibetsuAkiJoukyou', name: '時間帯別空き状況' };
const SCREENS = [TOP, SEARCH, DAYS, TIMES];

/** 1つのクライアントが送るリクエスト数の既定の上限（PoliteSession の既定と同じ）。 */
const DEFAULT_MAX_REQUESTS = 60;
/** 施設別空き状況で1回に選べるマスの数（画面の上限と同じ）。 */
const MAX_SELECT = 10;
/** 画面を移る送信1回にかかるリクエスト数（POST と、転送先の GET）。 */
const COST_MOVE = 2;
/** 表示期間の切り替え1回にかかるリクエスト数（POST の応答がそのまま画面）。 */
const COST_SHOW = 1;
/** コマ単位の画面で確かめる日単位の記号（○ 空き、△ 一部空き）。 */
const HAS_VACANCY = new Set(['○', '△']);
/** 受付期間の中でしか表示されない日単位の記号。 */
const VIEWABLE = new Set(['○', '△', '×']);
/** 申込期間外（まだ受付が始まっていない日など）。 */
const OUT_OF_PERIOD = '－';

export type SetagayaClientOptions = PoliteSessionOptions;

type Fields = [string, string][];

/** 指定した名前の項目を取り除く。 */
const without = (fields: Fields, ...names: string[]): Fields => fields.filter(([name]) => !names.includes(name));

/** 項目の値を差し替える（並び順は変えない）。なければ末尾に追加する。 */
function withValue(fields: Fields, name: string, value: string): Fields {
  if (!fields.some(([n]) => n === name)) return [...fields, [name, value]];
  return fields.map(([n, v]) => [n, n === name ? value : v]);
}

/** 日本時間での今日（UTC の日付として表す）。 */
const todayInJapan = (now: Date): Date => parseIsoDate(formatIsoDate(new Date(now.getTime() + 9 * 3_600_000)));

const dayDiff = (a: string, b: string): number => Math.abs(parseIsoDate(a).getTime() - parseIsoDate(b).getTime());

/**
 * ある画面で、指定した部屋について照会できた日数（先頭から数える）と、受付期間の終わりに達したかを返す。
 * 受付が始まっていない日は、休館日を除いてすべて「－」になる。○・△・× のいずれかが出ている最後の日
 * （その直後に続く休館日などを含む）までを照会できた範囲とし、その後に「－」が残れば期間の終わりと判断する。
 */
function coveredDays(dates: string[], rows: DayRow[]): { count: number; ended: boolean } {
  const symbolsAt = (index: number): string[] => rows.map((row) => row.cells[index]?.symbol ?? '');
  let last = -1;
  dates.forEach((_, i) => {
    if (symbolsAt(i).some((s) => VIEWABLE.has(s))) last = i;
  });
  let end = last;
  while (end + 1 < dates.length && !symbolsAt(end + 1).includes(OUT_OF_PERIOD)) end += 1;
  const ended = end + 1 < dates.length;
  // 照会できる日が1日もないまま「－」に行き当たったら、先頭の休館日なども照会できた日には数えない
  return last === -1 && ended ? { count: 0, ended } : { count: end + 1, ended };
}

/**
 * 世田谷区「けやきネット」の、ログイン不要の空き照会だけを使うクライアント。
 *
 * facilityCode は施設名（例: 弦巻区民センター）。けやきネットの表示名と完全一致で指定する。
 * 施設名の検索で施設を選ぶため、名前で指定する（システム内の施設コードは、弦巻区民センター = 112003）。
 *
 * 画面の流れは「トップページ → 施設検索 → 施設別空き状況（日単位）→ 時間帯別空き状況（コマ単位）」。
 * その先の詳細申請（ログインが必要）には進まない。
 *
 * コマ単位の画面は1回に10マス（部屋×日）までしか選べないので、日単位で ○（空き）・△（一部空き）の日だけを
 * コマ単位で確かめる。×（空きなし）・休館・－（申込期間外）・＊（公開対象外）の日は、その部屋の近い日の
 * 時間帯の区切りを当てはめ、日単位の記号を全コマの状態として返す（rawLabel は日単位の記号）。
 * 照会期間に ○・△ の日が1日もない部屋は時間帯の区切りが分からないので、コマを返さない。
 * ○・△ なのに画面で選べない日があれば、コマの内訳を確かめられないので unknown として返す。
 *
 * 受付が始まっていない先の日は、照会できた範囲（coveredThrough）に含めず、コマも返さない。
 *
 * リクエスト数の目安は、施設を開くまでに7回、1か月分の表示に1回、コマ単位の確認が10マスごとに2回
 * （続けて確認するときは、前の画面へ戻るのにさらに2回）。長い期間や複数の部屋を照会して
 * リクエスト数の上限に届いたときは、エラーにせず、取得できた日までを coveredThrough として返す。
 */
export class SetagayaClient implements AvailabilityAdapter {
  readonly id = 'setagaya';
  readonly label = '世田谷区 けやきネット';
  private readonly session: PoliteSession;

  constructor(options: SetagayaClientOptions = {}) {
    this.session = new PoliteSession(
      {
        origin: 'https://setagaya.keyakinet.net',
        name: 'けやきネット',
        // 利用時間は 7:00〜24:00（年中無休）
        closedHours: { from: 0, to: 7 },
      },
      { ...options, maxRequests: options.maxRequests ?? DEFAULT_MAX_REQUESTS },
    );
  }

  /** 施設の部屋一覧を取得する。 */
  async listRooms(facilityCode: string): Promise<RoomInfo[]> {
    return this.toRooms(await this.openFacility(facilityCode), facilityCode);
  }

  /** 指定した施設・部屋・期間の空き状況を取得する。 */
  async fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult> {
    const from = parseIsoDate(query.from);
    const to = parseIsoDate(query.to);
    if (to < from) throw new Error('to は from 以降の日付にしてください');

    let html = await this.openFacility(query.facilityCode);
    const all = this.toRooms(html, query.facilityCode);
    const rooms = query.rooms.map((name) => {
      const found = all.find((r) => r.room === name);
      if (!found) {
        throw new Error(`部屋「${name}」が見つかりません。候補: ${all.map((r) => r.room).join('、')}`);
      }
      return found;
    });
    const order = new Map(rooms.map((room, index) => [room.room, index]));

    /** コマ単位の画面で確かめたコマ。 */
    const detailed: AvailabilitySlot[] = [];
    /** コマ単位では確かめていない日（部屋ごと）。あとで時間帯の区切りを当てはめる。 */
    const dayOnly: { facility: string; room: string; date: string; symbol: string }[] = [];
    let coveredThrough: string | null = null;
    /** いま時間帯別空き状況の画面にいるか（期間の切り替えや次の選択の前に、前の画面へ戻る必要がある）。 */
    let onTimes = false;

    // 過去の日は照会しない（予約のための画面なので、今日より前は対象にならない）
    const today = todayInJapan(this.session.currentTime());
    let start = from < today ? today : from;

    while (start <= to) {
      if (this.remaining() < (onTimes ? COST_MOVE : 0) + COST_SHOW) break;
      if (onTimes) html = await this.postBack(html, 'back', DAYS, (f) => without(f, 'checktime'));
      onTimes = false;
      html = await this.postBack(html, 'hyouji', DAYS, (f) => {
        let fields = without(f, 'checkdate', 'checkYobi');
        fields = withValue(fields, 'textDate', formatIsoDate(start).replaceAll('-', '/'));
        fields = withValue(fields, 'radioPeriod', '1ヶ月');
        fields = withValue(fields, 'radioDisplay', 'false'); // 横表示
        return withValue(fields, 'radioJikan', 'all'); // 全日
      });
      const view = parseDayView(html);
      // 指定した開始日から始まっていなければ、サイトが別の期間を表示している。日付を取り違えないよう、ここで止める。
      if (view.dates[0] !== formatIsoDate(start)) break;
      const lastShown = view.dates.at(-1) ?? formatIsoDate(start);

      const rows = rooms.map((room) => {
        const row = view.rows.find((r) => r.room === room.room);
        if (!row) throw new Error(`施設別空き状況に部屋「${room.room}」がありません`);
        return row;
      });
      const dates = view.dates.filter((date) => date <= query.to);
      const covered = coveredDays(dates, rows);
      const coveredDates = dates.slice(0, covered.count);

      // コマ単位で確かめるマス（日付順、同じ日の中では指定された部屋の順）
      const targets: { room: string; date: string; value: string }[] = [];
      coveredDates.forEach((date, i) => {
        // 照会したい日でなければ、コマ単位の確認（リクエストが要る）を省く
        if (query.wantsDate && !query.wantsDate(date)) return;
        for (const row of rows) {
          const cell = row.cells[i];
          if (cell && cell.value !== null && HAS_VACANCY.has(cell.symbol)) targets.push({ room: row.room, date, value: cell.value });
        }
      });

      const batchSize = view.maxSelect > 0 ? Math.min(view.maxSelect, MAX_SELECT) : MAX_SELECT;
      /** リクエスト数の上限で確かめられなかった最初の日。 */
      let cutAt: string | null = null;
      for (let offset = 0; offset < targets.length; offset += batchSize) {
        const batch = targets.slice(offset, offset + batchSize);
        if (this.remaining() < (onTimes ? COST_MOVE : 0) + COST_MOVE) {
          cutAt = batch[0]?.date ?? null;
          break;
        }
        if (onTimes) html = await this.postBack(html, 'back', DAYS, (f) => without(f, 'checktime'));
        html = await this.postBack(html, 'next', TIMES, (f) => [
          ...without(f, 'checkdate'),
          ...batch.map((t): [string, string] => ['checkdate', t.value]),
        ]);
        onTimes = true;
        const slots = parseTimeView(html);
        for (const target of batch) {
          const found = slots.filter((s) => s.room === target.room && s.date === target.date);
          if (found.length === 0) throw new Error(`時間帯別空き状況に ${target.room}（${target.date}）がありません`);
          detailed.push(...found);
        }
      }

      for (const [i, date] of coveredDates.entries()) {
        if (cutAt !== null && date >= cutAt) break;
        coveredThrough = date;
        for (const row of rows) {
          const cell = row.cells[i];
          if (cell && !(cell.value !== null && HAS_VACANCY.has(cell.symbol))) {
            dayOnly.push({ facility: row.facility, room: row.room, date, symbol: cell.symbol });
          }
        }
      }

      if (cutAt !== null || covered.ended) break;
      start = addDays(parseIsoDate(lastShown), 1);
    }

    const through = coveredThrough ?? '';
    const slots = [...detailed, ...this.fillDayOnly(dayOnly, detailed)]
      .filter((s) => s.date >= query.from && s.date <= query.to && s.date <= through && (query.wantsDate?.(s.date) ?? true))
      .sort(
        (a, b) => a.date.localeCompare(b.date) || (order.get(a.room) ?? 0) - (order.get(b.room) ?? 0) || a.start.localeCompare(b.start),
      );
    return { rooms, slots, coveredThrough, fetchedAt: this.session.currentTime().toISOString() };
  }

  /**
   * コマ単位で確かめていない日に、同じ部屋のいちばん近い日の時間帯の区切りを当てはめる。
   * 状態と rawLabel は日単位の記号から決める。時間帯の区切りが分からない部屋の日は返さない。
   */
  private fillDayOnly(
    dayOnly: { facility: string; room: string; date: string; symbol: string }[],
    detailed: AvailabilitySlot[],
  ): AvailabilitySlot[] {
    const layouts = new Map<string, Map<string, { start: string; end: string }[]>>();
    for (const slot of detailed) {
      const byDate = layouts.get(slot.room) ?? new Map<string, { start: string; end: string }[]>();
      layouts.set(slot.room, byDate);
      byDate.set(slot.date, [...(byDate.get(slot.date) ?? []), { start: slot.start, end: slot.end }]);
    }
    const filled: AvailabilitySlot[] = [];
    for (const day of dayOnly) {
      const byDate = layouts.get(day.room);
      if (!byDate) continue;
      const nearest = [...byDate.keys()].sort((a, b) => dayDiff(a, day.date) - dayDiff(b, day.date) || a.localeCompare(b))[0];
      for (const time of (nearest === undefined ? undefined : byDate.get(nearest)) ?? []) {
        filled.push({
          facility: day.facility,
          room: day.room,
          date: day.date,
          start: time.start,
          end: time.end,
          status: dayStatus(day.symbol),
          rawLabel: day.symbol,
        });
      }
    }
    return filled;
  }

  /** あと何回リクエストを送れるか。 */
  private remaining(): number {
    return this.session.remainingRequests;
  }

  /**
   * 新しい訪問として入口から入り、施設名で検索して、その施設の施設別空き状況（今日から2週間）を開く。
   * 利用者IDやパスワードは送らない。
   */
  private async openFacility(facilityCode: string): Promise<string> {
    const name = facilityCode.trim();
    if (!name) throw new Error('施設名を指定してください（例: 弦巻区民センター）');

    this.session.clearCookies();
    const top = await this.session.request(ENTRY);
    this.expect(top.text, TOP);

    const searched = await this.postBack(top.text, 'searchShisetsuName', SEARCH, (f) => withValue(f, 'shisetsuNameTxt', name));
    const { facilities, hasMore } = parseFacilityList(searched);
    const facility = facilities.find((f) => f.name === name);
    if (!facility) {
      const candidates = facilities.map((f) => f.name).join('、') || 'なし';
      throw new Error(`施設「${name}」が見つかりません。候補: ${candidates}${hasMore ? ' ほか' : ''}`);
    }
    return this.postBack(searched, 'next', DAYS, (f) => [...without(f, 'checkShisetsu'), ['checkShisetsu', facility.code]]);
  }

  private toRooms(html: string, facilityCode: string): RoomInfo[] {
    const rooms = parseDayView(html).rows.map((row) => ({ key: row.key, facility: row.facility, room: row.room, capacity: row.capacity }));
    if (rooms.length === 0) throw new Error(`施設「${facilityCode.trim()}」の部屋が見つかりません`);
    return rooms;
  }

  /**
   * 画面のリンクやボタンと同じ送信をする（画面のフォームの項目に、押したボタンの名前を添えて送る）。
   * 送信する項目は、いまの画面のフォームから取り出したものを edit で手直しして使う。
   */
  private async postBack(html: string, target: string, expected: Screen, edit: (fields: Fields) => Fields): Promise<string> {
    const form = parseForm(html);
    if (!form.action.startsWith('/Web/')) throw new Error(`想定外の画面です（フォームの送信先: ${form.action || '不明'}）`);
    let fields = edit(form.fields);
    fields = withValue(fields, '__EVENTTARGET', target);
    fields = withValue(fields, '__EVENTARGUMENT', '');
    const { text } = await this.session.request(form.action, { form: new URLSearchParams(fields) });
    this.expect(text, expected);
    return text;
  }

  /** 返ってきた画面が想定どおりかを、フォームの送信先で確かめる（エラー画面やログイン画面なら止まる）。 */
  private expect(html: string, expected: Screen): void {
    const action = parseForm(html).action;
    if (action === expected.path) return;
    const actual = SCREENS.find((s) => s.path === action)?.name ?? (action || '不明');
    throw new Error(`想定外の画面です（期待: ${expected.name} / 実際: ${actual}）`);
  }
}
