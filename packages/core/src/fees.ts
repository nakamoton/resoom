import { isJapaneseHoliday } from './holidays';
import type { LocalizedText } from './i18n';

/**
 * 施設の利用料金（割引のない一般の料金）。公式の料金表から写したもの。
 * 区内・区外で違う場合は区内の料金を入れ、区外の加算は note に書く。
 */
export interface FeeSlot {
  /** 料金表の区分の名前（例: 午前、夜間1） */
  label: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  /** 円（税込み） */
  yen: number;
}

export interface RoomFees {
  /** slot: 区分ごとの料金。hour: 1時間あたりの料金（slots に1つだけ入れる） */
  unit: 'slot' | 'hour';
  /** 平日の料金（曜日で変わらなければ、すべての日の料金） */
  slots: FeeSlot[];
  /** 土・日・祝日の料金。平日と違うときだけ */
  holidaySlots?: FeeSlot[];
  /** 区外の加算など、料金についての注意 */
  note?: LocalizedText | null;
  /** 公式の出典（URL） */
  sources: string[];
  /** 出典を確認した日（YYYY-MM-DD） */
  checkedOn: string;
}

const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const minutes = (hhmm: string): number => {
  const [h = '0', m = '0'] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
};

/** その日に使う料金表（土日祝で料金が違えば土日祝のもの）。 */
export function feeTableFor(fees: RoomFees, date: string): FeeSlot[] {
  const offDay = weekdayOf(date) === 0 || weekdayOf(date) === 6 || isJapaneseHoliday(date);
  return offDay && fees.holidaySlots && fees.holidaySlots.length > 0 ? fees.holidaySlots : fees.slots;
}

/**
 * 空きコマ1つの料金。区分の時刻がコマと同じならその料金、1時間あたりの料金ならコマの長さで計算する。
 * 対応する区分がなければ null（料金表の区分とコマの区切りが違う場合など）。
 */
export function feeForSlot(fees: RoomFees, date: string, start: string, end: string): number | null {
  const table = feeTableFor(fees, date);
  if (fees.unit === 'hour') {
    const rate = table[0];
    if (!rate) return null;
    const length = minutes(end) - minutes(start);
    return length > 0 && length % 60 === 0 ? (rate.yen * length) / 60 : null;
  }
  return table.find((slot) => slot.start === start && slot.end === end)?.yen ?? null;
}

/** 円の表記（例: ¥2,500）。 */
export const yenText = (yen: number): string => `¥${yen.toLocaleString('en-US')}`;

/**
 * 料金のまとめ（一覧向け）。例: 「¥1,900–2,600」「¥3,800」「¥1,100/h」。
 * 土日祝で違う場合は、平日と土日祝を合わせた幅にする。
 */
export function feeSummary(fees: RoomFees): string {
  const all = [...fees.slots, ...(fees.holidaySlots ?? [])].map((slot) => slot.yen);
  if (all.length === 0) return '';
  const low = Math.min(...all);
  const high = Math.max(...all);
  const range = low === high ? yenText(low) : `${yenText(low)}–${high.toLocaleString('en-US')}`;
  return fees.unit === 'hour' ? `${range}/h` : range;
}

const LABEL_EN: ReadonlyArray<[string, string]> = [
  ['午前', 'Morning'],
  ['午後', 'Afternoon'],
  ['夕方', 'Early evening'],
  ['夜間', 'Evening'],
  ['全日', 'All day'],
  ['1時間', '1 hour'],
  ['2時間', '2 hours'],
];

/** 料金表の区分の名前を英語と日本語にする（例: 午後1 → Afternoon 1）。知らない名前は日本語のまま。 */
export function feeLabel(label: string): LocalizedText {
  for (const [ja, en] of LABEL_EN) {
    if (label.startsWith(ja)) {
      const rest = label.slice(ja.length).trim();
      return { en: rest ? `${en} ${rest}` : en, ja: label };
    }
  }
  return { en: label, ja: label };
}

/**
 * 施設の閉館・休館。closed は閉館（検索の対象から外す）、suspended は改修などによる一時的な休館。
 * どちらも空き状況は取得しない。
 */
export interface RoomClosure {
  status: 'closed' | 'suspended';
  /** 閉館・休館の内容（いつから、再開の見込みなど） */
  note: LocalizedText;
  /** 公式の出典（URL） */
  sources: string[];
  /** 出典を確認した日（YYYY-MM-DD） */
  checkedOn: string;
}
