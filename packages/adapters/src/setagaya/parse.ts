import * as cheerio from 'cheerio';
import type { AvailabilitySlot, SlotStatus } from '../types';

/** 時間帯別空き状況（コマ単位）の記号と状態の対応。 */
const SLOT_STATUS: Record<string, SlotStatus> = {
  '○': 'available', // 空きあり
  '×': 'reserved', // 空きなし
  '－': 'not_bookable', // 申込対象外
  // 取り消された枠が再び予約できるようになるまでの待ち（利用日の8日以上前の取消は翌日12時に空く）
  取消処理中: 'not_bookable',
};

/** 施設別空き状況（日単位）の記号と状態の対応。○ と △ はコマ単位の画面で確かめるので、ここにはない。 */
const DAY_STATUS: Record<string, SlotStatus> = {
  '×': 'reserved', // 空きなし
  '－': 'not_bookable', // 申込期間外
  '＊': 'unavailable', // 公開対象外
  休館: 'closed',
};

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** 日単位の記号（×・休館・－・＊ など）を状態に直す。知らない記号は unknown。 */
export function dayStatus(symbol: string): SlotStatus {
  return DAY_STATUS[symbol] ?? 'unknown';
}

/** 画面のフォーム（form1）。けやきネットの画面遷移は、すべてこのフォームの送信で行われる。 */
export interface PageForm {
  /** 送信先のパス（例: /Web/Yoyaku/WgR_ShisetsubetsuAkiJoukyou）。どの画面かの判定にも使う。フォームがなければ空文字 */
  action: string;
  /** ブラウザが何も操作せずに送信したときに送る項目（名前と値）。偽造防止トークンもここに含まれる */
  fields: [string, string][];
}

/** 画面のフォームから、送信先と、ブラウザが送るのと同じ入力項目を取り出す。 */
export function parseForm(html: string): PageForm {
  const $ = cheerio.load(html);
  const form = $('form#form1').first();
  const fields: [string, string][] = [];
  form.find('input, select, textarea').each((_, el) => {
    const item = $(el);
    const name = item.attr('name');
    if (!name || item.attr('disabled') !== undefined) return;
    if (item.is('select')) {
      const selected = item.find('option[selected]').first();
      fields.push([name, (selected.length > 0 ? selected : item.find('option').first()).attr('value') ?? '']);
      return;
    }
    if (item.is('textarea')) {
      fields.push([name, item.text()]);
      return;
    }
    const type = (item.attr('type') ?? 'text').toLowerCase();
    // ボタンの類はスクリプトから送信するだけで、項目としては送られない
    if (['button', 'submit', 'image', 'reset', 'file'].includes(type)) return;
    if ((type === 'checkbox' || type === 'radio') && item.attr('checked') === undefined) return;
    fields.push([name, item.attr('value') ?? (type === 'checkbox' || type === 'radio' ? 'on' : '')]);
  });
  return { action: form.attr('action') ?? '', fields };
}

/** 施設検索の結果の1行。 */
export interface FacilityChoice {
  /** 施設コード（例: 弦巻区民センター = 112003） */
  code: string;
  name: string;
}

/** 施設検索の画面から、選べる施設の一覧を取り出す。hasMore は「さらに読み込む」（続きがある）の有無。 */
export function parseFacilityList(html: string): { facilities: FacilityChoice[]; hasMore: boolean } {
  const $ = cheerio.load(html);
  const facilities: FacilityChoice[] = [];
  $('input[name="checkShisetsu"]').each((_, el) => {
    const code = $(el).attr('value');
    if (!code) return;
    facilities.push({ code, name: squash($(el).nextAll('label').first().text()) });
  });
  return { facilities, hasMore: $('#nextpage').length > 0 };
}

/** 施設別空き状況の1マス（1部屋・1日）。 */
export interface DayCell {
  /** YYYY-MM-DD */
  date: string;
  /** 画面の表示そのまま（○・△・×・－・＊・休館） */
  symbol: string;
  /** 選択用チェックボックスの値。休館や申込期間外で選べない日は null */
  value: string | null;
}

/** 施設別空き状況の1行（1部屋）。 */
export interface DayRow {
  facility: string;
  room: string;
  /** 部屋コード（チェックボックスの値から。例: 00310）。表示中の期間に選べる日が1日もなければ部屋名で代用する */
  key: string;
  capacity: number | null;
  /** 表示中の日付と同じ並び */
  cells: DayCell[];
}

export interface DayView {
  /** 表示中の日付（YYYY-MM-DD、昇順） */
  dates: string[];
  rows: DayRow[];
  /** 1回に選べるマスの数（画面のスクリプトが決めている上限。無制限なら 0） */
  maxSelect: number;
}

/**
 * 施設別空き状況（横表示）の画面から、部屋ごと・日ごとの記号を取り出す。
 * 見出しには日しかないので、年月は表の左上の表示月から補い、日が小さくなったら翌月と判断する。
 */
export function parseDayView(html: string): DayView {
  const $ = cheerio.load(html);
  const rows: DayRow[] = [];
  const tableDates: string[][] = [];

  $('table.calendar').each((_, table) => {
    const head = $(table).find('thead tr').first();
    const month = /(\d{4})\s*年\s*(\d{1,2})\s*月/.exec(head.find('li.month').text());
    if (!month) return;
    let year = Number(month[1]);
    let monthNo = Number(month[2]);
    let prevDay = 0;
    const dates: string[] = [];
    head.find('th.day').each((_, th) => {
      const day = Number(squash($(th).children('span').first().text()));
      if (!Number.isInteger(day) || day < 1) throw new Error(`日付の見出しを解析できません: ${squash($(th).text())}`);
      if (day < prevDay) {
        monthNo += 1;
        if (monthNo > 12) {
          monthNo = 1;
          year += 1;
        }
      }
      prevDay = day;
      dates.push(`${year}-${pad2(monthNo)}-${pad2(day)}`);
    });
    tableDates.push(dates);

    const item = $(table).closest('div.item');
    const title = item.find('h3').first();
    const facility = squash(title.find('a').first().text()) || squash(title.clone().find('span').remove().end().text());

    // 部屋が多いと表の途中に見出し行がもう一度入るので、部屋名のセルがある行だけを読む
    $(table)
      .find('tbody tr')
      .each((_, tr) => {
        const nameCell = $(tr).children('td.shisetsu').first();
        if (nameCell.length === 0) return;
        const room = squash(nameCell.clone().find('span.info').remove().end().text());
        const capacity = /定員\s*(\d+)/.exec(nameCell.find('span.info').text());
        const cellNodes = $(tr).children('td').not('.shisetsu');
        if (cellNodes.length !== dates.length) throw new Error(`${room}: 日付の列数とマスの列数が合いません`);
        let key = '';
        const cells: DayCell[] = [];
        cellNodes.each((i, td) => {
          const date = dates[i] ?? '';
          const value = $(td).find('input[name="checkdate"]').attr('value') ?? null;
          if (value !== null) {
            // 値は「日付8桁 + 部屋コード + …」。見出しから組み立てた日付と食い違えば解析の誤り
            const m = /^(\d{8})(\S+)/.exec(value);
            if (!m || m[1] !== date.replaceAll('-', '')) throw new Error(`${room} ${date}: 見出しの日付と選択肢の値（${value}）が合いません`);
            key ||= m[2] ?? '';
          }
          cells.push({ date, symbol: squash($(td).find('label').last().text()) || squash($(td).text()), value });
        });
        rows.push({ facility, room, key: key || room, capacity: capacity ? Number(capacity[1]) : null, cells });
      });
  });

  const dates = tableDates[0];
  if (!dates) throw new Error('施設別空き状況の画面ではありません（表示月が見つかりません）');
  const maxSelect = /var\s+maxCnt\s*=\s*(\d+)/.exec(html);
  return { dates, rows, maxSelect: maxSelect ? Number(maxSelect[1]) : 0 };
}

/**
 * 時間帯別空き状況の画面から、コマごとの空き状況を取り出す。
 * 表は「部屋 × 日」ごとに1つあり、見出しの左端に日付、その右にコマの時間帯が並ぶ。
 */
export function parseTimeView(html: string): AvailabilitySlot[] {
  const $ = cheerio.load(html);

  // 記号の代わりにアイコンで示される状態（取消処理中）は、凡例から文言を引く
  const iconLabels = new Map<string, string>();
  $('div.example li').each((_, li) => {
    const icon = iconClass($(li).find('span i').first().attr('class'));
    if (icon) iconLabels.set(icon, squash($(li).clone().children('span').remove().end().text()));
  });

  const slots: AvailabilitySlot[] = [];
  let tables = 0;
  $('table.calendar').each((_, table) => {
    const head = $(table).find('thead tr').first();
    const dateText = squash(head.children('th.shisetsu').first().text());
    const d = /(\d{4})\s*年\s*(\d{1,2})\s*月\s*(\d{1,2})\s*日/.exec(dateText);
    if (!d) return;
    tables += 1;
    const date = `${d[1]}-${pad2(Number(d[2]))}-${pad2(Number(d[3]))}`;

    const times: { start: string; end: string }[] = [];
    head
      .children('th')
      .not('.shisetsu')
      .each((_, th) => {
        const t = /(\d{1,2}):(\d{2})\s*～\s*(\d{1,2}):(\d{2})/.exec(squash($(th).text()));
        if (!t) throw new Error(`時間帯の見出しを解析できません: ${squash($(th).text())}`);
        times.push({ start: `${pad2(Number(t[1]))}:${t[2]}`, end: `${pad2(Number(t[3]))}:${t[4]}` });
      });

    const item = $(table).closest('div.item');
    const title = item.find('h3').first();
    const facility = squash(title.find('a').first().text()) || squash(title.clone().find('span').remove().end().text());

    $(table)
      .find('tbody tr')
      .each((_, tr) => {
        const nameCell = $(tr).children('td.shisetsu').first();
        if (nameCell.length === 0) return;
        const room = squash(nameCell.clone().find('span.info').remove().end().text());
        const cellNodes = $(tr).children('td').not('.shisetsu');
        if (cellNodes.length !== times.length) throw new Error(`${room} ${date}: 時間帯の列数とコマの列数が合いません`);
        cellNodes.each((i, td) => {
          const time = times[i];
          if (!time) return;
          const label = $(td).find('label').last();
          const icon = iconClass(label.find('i').first().attr('class'));
          const rawLabel = squash(label.text()) || (icon ? (iconLabels.get(icon) ?? icon) : squash($(td).text()));
          slots.push({ facility, room, date, start: time.start, end: time.end, status: SLOT_STATUS[rawLabel] ?? 'unknown', rawLabel });
        });
      });
  });

  if (tables === 0) throw new Error('時間帯別空き状況の画面ではありません（日付の見出しが見つかりません）');
  return slots;
}

/** Font Awesome のアイコン指定（例: "fa fa-refresh"）から、種類を表すクラス名を取り出す。 */
function iconClass(value: string | undefined): string {
  return (value ?? '').split(/\s+/).find((c) => c.startsWith('fa-')) ?? '';
}
