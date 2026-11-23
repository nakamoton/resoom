import * as cheerio from 'cheerio';
import type { SlotStatus } from '../types';

/**
 * 江東区文化コミュニティ財団の施設予約システム（川崎市「ふれあいネット」と同じ系統）の画面を読む。
 * 調査の結果は docs/koto-investigation.md。
 */

/** 画像の alt と状態の対応（凡例の文言）。 */
const LABEL_STATUS: Record<string, SlotStatus> = {
  空き: 'available',
  予約あり: 'reserved',
  音出予約: 'reserved', // 音を出す利用の予約。セルの alt は空で、画像（lw_sound）だけで示される
  休館日: 'closed',
  保守日: 'maintenance',
  受付期間外: 'not_bookable',
  期間外: 'not_bookable',
};

/** 受付が始まっていない日・過ぎた日のコマの表示。照会できる範囲の終わりの判定に使う。 */
export const OUT_OF_PERIOD_STATUS: SlotStatus = 'not_bookable';

const squash = (s: string): string => s.replace(/\s+/g, ' ').trim();
const pad2 = (n: number): string => String(n).padStart(2, '0');

/** ページの title。想定外の画面（エラー・順路の誤り）の検知に使う。 */
export function parseTitle(html: string): string {
  return squash(cheerio.load(html)('title').first().text());
}

/** 「遷移情報に誤りがあります」などのメッセージ画面なら、その文言。そうでなければ null。 */
export function parseMessage(html: string): string | null {
  const $ = cheerio.load(html);
  const text = squash($('body').text());
  const m = /〔メッセージ通知〕\s*(.*?)\s*このページでは/.exec(text);
  return m?.[1] ? squash(m[1].replace(/&nbsp;|<BR>/gi, ' ')) : null;
}

/** 画像（ファイル名と alt）から状態を決める。 */
function statusOf(src: string, alt: string): { status: SlotStatus; rawLabel: string } {
  const label = alt.trim() || (src.includes('lw_sound') ? '音出予約' : '');
  return { status: LABEL_STATUS[label] ?? 'unknown', rawLabel: label || src };
}

export interface DayRoom {
  /** 画面の部屋名（例: ＡＶ・ホール） */
  name: string;
  /** サイト内の部屋の番号（例: 1050030） */
  key: string;
  /** 左から順のコマ（午前・午後・夜間など） */
  cells: { status: SlotStatus; rawLabel: string }[];
}

export interface DayPage {
  /** 表示している日（YYYY-MM-DD） */
  date: string;
  /** 午前・午後・夜間の表の部屋 */
  rooms: DayRoom[];
  /** 「翌日」などの移動に使う値（画面の変数） */
  selectBldNo: string;
  srchSelectInstNo: string;
}

/**
 * 施設空き状況画面（時間帯貸し）を読む。1日分・館の全部屋が、部屋ごとの行で並ぶ。
 * コマの画像の name は「行_列_部屋の番号」（例: 3_0_1050030）。
 */
export function parseDay(html: string): DayPage {
  const $ = cheerio.load(html);
  const heading = squash($('tr[bgcolor="#98fb98"] td').first().text());
  const m = /(\d{4})\s*年\s*(\d{1,2})月(\d{1,2})日/.exec(heading);
  if (!m?.[1] || !m[2] || !m[3]) throw new Error(`日付が読めません（見出し: ${heading || 'なし'}）`);
  const date = `${m[1]}-${pad2(Number(m[2]))}-${pad2(Number(m[3]))}`;

  const rooms: DayRoom[] = [];
  $('tr').each((_, tr) => {
    const nameCell = $(tr).children('td[bgcolor="#E0FFFF"]').first();
    if (nameCell.length === 0) return;
    const images = $(tr)
      .find('img[name]')
      .toArray()
      .filter((img) => /^\d+_\d+_\d+$/.test($(img).attr('name') ?? ''));
    if (images.length === 0) return;
    const key = ($(images[0]).attr('name') ?? '').split('_')[2] ?? '';
    rooms.push({
      name: squash(nameCell.text()),
      key,
      cells: images.map((img) => statusOf($(img).attr('src') ?? '', $(img).attr('alt') ?? '')),
    });
  });

  const script = $('script')
    .toArray()
    .map((s) => $(s).text())
    .join('\n');
  const variable = (name: string): string => new RegExp(`var\\s+${name}\\s*=\\s*['"]?(\\d+)`).exec(script)?.[1] ?? '0';
  return { date, rooms, selectBldNo: variable('gSelectBldNo'), srchSelectInstNo: variable('gSrchSelectInstNo') };
}
