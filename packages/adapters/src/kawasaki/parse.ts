import * as cheerio from 'cheerio';
import type { RoomInfo, SlotStatus } from '../types';

/**
 * ふれあいネット（かんたん画面）の空き状況の表示と状態の対応。
 * キーは画面の凡例の文言。実際のコマで確認できたのは「空き」「予約あり」「受付期間外」で、
 * ほかは凡例からの対応づけ。
 */
const LABEL_STATUS: Record<string, SlotStatus> = {
  空き: 'available',
  予約あり: 'reserved',
  休館日: 'closed',
  '保守日・主催事業': 'maintenance',
  一般開放: 'unavailable', // 個人利用への開放で、団体の予約はできない
  雨天: 'suspended',
  受付期間外: 'not_bookable',
  時間外: 'unavailable',
  取消処理中: 'reserved', // 取消の手続き中で、まだ空きになっていない
  開放予定: 'not_bookable',
};
/** 長い文言から先に照合する。 */
const LABELS = Object.keys(LABEL_STATUS).sort((a, b) => b.length - a.length);

/** 受付が始まっていない日・過ぎた日のコマに出る表示。照会できる範囲の終わりの判定に使う。 */
export const OUT_OF_PERIOD_LABEL = '受付期間外';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ページの title。想定外の画面（エラー・セッション切れ）の検知に使う。 */
export function parseTitle(html: string): string {
  return squash(cheerio.load(html)('title').first().text());
}

/**
 * 施設選択画面から部屋の一覧を取り出す。
 * key は一覧での順番（0始まり）で、サイトが部屋の指定に使う番号。先頭の「すべて」は含めない。
 */
export function parseRoomList(html: string): RoomInfo[] {
  const $ = cheerio.load(html);
  const rooms: RoomInfo[] = [];
  $('a[href*="sendInstNo("]').each((_, a) => {
    const key = /sendInstNo\([^,]+,[^,]+,\s*'(\d+)'\s*\)/.exec($(a).attr('href') ?? '')?.[1];
    // 「館名<br>部屋名」の形。改行のない「すべて」は部屋ではない
    const lines = $(a)
      .contents()
      .toArray()
      .filter((node) => node.type === 'text')
      .map((node) => squash($(node).text()))
      .filter((text) => text !== '');
    const [facility, room] = lines;
    if (key === undefined || facility === undefined || room === undefined) return;
    rooms.push({ key, facility, room, capacity: null });
  });
  return rooms;
}

/** 週表示の1コマ。period は画面の行見出し（例: 午前、9:00～10:00）。 */
export interface WeekCell {
  /** YYYY-MM-DD */
  date: string;
  period: string;
  status: SlotStatus;
  rawLabel: string;
}

export interface WeekPage {
  /** 表の見出し（例: 「中原市民館音楽室 空き状況」）。別の部屋の表でないことの確認に使う */
  caption: string;
  /** 表示されている日付（YYYY-MM-DD）。左から順 */
  dates: string[];
  cells: WeekCell[];
}

/**
 * 施設空き状況画面（指定日から7日間）を読む。
 * 見出しの年は左端の日付のもので、月が小さくなったら年をまたいだと判断する。
 */
export function parseWeek(html: string): WeekPage {
  const $ = cheerio.load(html);
  const table = $('table.rsvakitable').first();
  const rows = table.find('tr').toArray();
  const head = rows[0];
  const startYear = Number(/(\d{4})\s*年/.exec(head ? $(head).children('th').first().text() : '')?.[1]);
  if (!head || !Number.isInteger(startYear)) {
    throw new Error('空き状況画面ではありません（日付の見出しが見つかりません）');
  }

  const dates: string[] = [];
  let year = startYear;
  let prevMonth = 0;
  $(head)
    .children('th')
    .slice(1)
    .each((_, th) => {
      const m = /(\d+)\s*月\s*(\d+)\s*日/.exec($(th).text());
      if (!m) throw new Error(`日付の見出しを解析できません: ${squash($(th).text())}`);
      const month = Number(m[1]);
      if (month < prevMonth) year += 1;
      prevMonth = month;
      dates.push(`${year}-${pad2(month)}-${pad2(Number(m[2]))}`);
    });

  const cells: WeekCell[] = [];
  for (const tr of rows.slice(1)) {
    const period = squash($(tr).children('th').first().text());
    const tds = $(tr).children('td');
    if (period === '' || tds.length === 0) continue;
    tds.each((i, td) => {
      const date = dates[i];
      if (!date) throw new Error(`${period}: 日付の列数とコマの列数が合いません`);
      // alt は「11月23日月曜日午前空き」の形。末尾が凡例の文言
      const alt = squash($(td).find('img').first().attr('alt') ?? $(td).text());
      const label = LABELS.find((l) => alt.endsWith(l));
      const rest = alt.replace(/^\d+月\d+日.曜日/, '');
      cells.push({
        date,
        period,
        status: label ? (LABEL_STATUS[label] ?? 'unknown') : 'unknown',
        rawLabel: label ?? (rest.startsWith(period) ? rest.slice(period.length) : rest),
      });
    });
  }
  return { caption: squash(table.find('caption').text()), dates, cells };
}

/** 行見出しに時刻が入っていない時間帯の、開始と終了（HH:MM）。 */
type PeriodTable = Readonly<Record<string, readonly [string, string]>>;

interface PeriodRule {
  /** 館コード */
  buildings: readonly string[];
  /** この区分が当てはまる部屋かどうか */
  appliesTo: (room: string) => boolean;
  periods: PeriodTable;
}

/**
 * 館・部屋ごとの時間区分。画面には「午前・午後・夜間」としか出ないので、公式の資料で確認できたものだけを載せる。
 * 同じ館でも部屋の種類で区分が違う（市民館のホールは午前が11時30分まで、カルッツの体育室は4区分、など）。
 */
const PERIOD_RULES: readonly PeriodRule[] = [
  {
    // 幸・中原・高津・宮前・多摩・麻生の各市民館の、ホールとリハーサル室を除く部屋。
    // 出典: 川崎市市民館条例 別表（使用料の表の区分）
    // 1140 はプラザ大師（川崎市民館の分館）。午後と夜間は楽団の予約実績（13:00〜17:00、17:30〜21:00）と一致する。
    // 午前は公式の資料で確認できておらず、市民館と同じと見なしている。
    buildings: ['1140', '1160', '1180', '1190', '1210', '1230', '1240'],
    appliesTo: (room) => !/ホール|リハーサル/.test(room),
    periods: { 午前: ['09:00', '12:00'], 午後: ['13:00', '17:00'], 夜間: ['17:30', '21:00'] },
  },
  {
    // カルッツかわさきの音楽練習室。出典: カルッツかわさき「利用のご案内（利用規程）」2026年9月1日改定版
    buildings: ['5510'],
    appliesTo: (room) => room.startsWith('音楽練習室'),
    periods: { 午前: ['09:00', '12:00'], 午後: ['13:00', '16:30'], 夜間: ['17:30', '21:30'] },
  },
];

/**
 * 画面の行見出しを、開始・終了の時刻（HH:MM）に直す。
 * 見出しに時刻があればそれを使い、なければ館・部屋ごとの時間区分から引く。分からなければエラー。
 */
export function resolvePeriod(buildingCode: string, room: string, period: string): { start: string; end: string } {
  const m = /(\d{1,2})[:：](\d{2})\s*[-－～〜~]\s*(\d{1,2})[:：](\d{2})/.exec(period);
  if (m) return { start: `${pad2(Number(m[1]))}:${m[2]}`, end: `${pad2(Number(m[3]))}:${m[4]}` };

  const rule = PERIOD_RULES.find((r) => r.buildings.includes(buildingCode) && r.appliesTo(room));
  const times = rule?.periods[period];
  if (!times) {
    throw new Error(
      `${room} の時間帯「${period}」の時刻が分かりません（館コード ${buildingCode}）。` +
        'ふれあいネットの画面には時間帯の名前しか出ないため、館・部屋ごとの時刻を登録する必要があります',
    );
  }
  return { start: times[0], end: times[1] };
}
