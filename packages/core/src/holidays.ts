import type { LocalizedText } from './i18n';

/**
 * 日本の祝日（「国民の祝日に関する法律」）。振替休日と国民の休日を含む。
 *
 * - 2020年以降の規則で計算する（検索で使うのは今日から先の日付だけのため）。
 * - 春分の日・秋分の日は毎年2月の官報で決まるが、1980〜2099年は下の計算式と一致する。
 * - 法改正や特例（2020・2021年の東京オリンピックによる移動など）は SPECIAL に書く。
 */

const t = (en: string, ja: string): LocalizedText => ({ en, ja });

const NAMES = {
  newYear: t("New Year's Day", '元日'),
  comingOfAge: t('Coming of Age Day', '成人の日'),
  foundation: t('National Foundation Day', '建国記念の日'),
  emperor: t("Emperor's Birthday", '天皇誕生日'),
  vernal: t('Vernal Equinox Day', '春分の日'),
  showa: t('Showa Day', '昭和の日'),
  constitution: t('Constitution Memorial Day', '憲法記念日'),
  greenery: t('Greenery Day', 'みどりの日'),
  children: t("Children's Day", 'こどもの日'),
  marine: t('Marine Day', '海の日'),
  mountain: t('Mountain Day', '山の日'),
  aged: t('Respect for the Aged Day', '敬老の日'),
  autumnal: t('Autumnal Equinox Day', '秋分の日'),
  sports: t('Sports Day', 'スポーツの日'),
  culture: t('Culture Day', '文化の日'),
  labor: t('Labor Thanksgiving Day', '勤労感謝の日'),
  substitute: t('Substitute holiday', '振替休日'),
  citizens: t("Citizens' holiday", '国民の休日'),
} as const;

type NameKey = keyof typeof NAMES;

/** 年ごとの特例。キーの祝日を、その年だけ指定の日（MM-DD）に移す。 */
const SPECIAL: Record<number, Partial<Record<NameKey, string>>> = {
  2020: { marine: '07-23', sports: '07-24', mountain: '08-10' },
  2021: { marine: '07-22', sports: '07-23', mountain: '08-08' },
};

const pad = (n: number): string => String(n).padStart(2, '0');
const iso = (year: number, month: number, day: number): string => `${year}-${pad(month)}-${pad(day)}`;
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const addDays = (date: string, days: number): string =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** その月の第 n 月曜日。 */
function nthMonday(year: number, month: number, n: number): string {
  const first = weekdayOf(iso(year, month, 1));
  const day = 1 + ((8 - first) % 7) + (n - 1) * 7;
  return iso(year, month, day);
}

/** 春分の日・秋分の日（1980〜2099年の計算式）。 */
function equinox(year: number, base: number): number {
  return Math.floor(base + 0.242194 * (year - 1980) - Math.floor((year - 1980) / 4));
}

/** その年の「国民の祝日」（振替休日・国民の休日を除く）。 */
function nationalHolidays(year: number): Map<string, LocalizedText> {
  const special = SPECIAL[year] ?? {};
  const rules: [NameKey, string][] = [
    ['newYear', iso(year, 1, 1)],
    ['comingOfAge', nthMonday(year, 1, 2)],
    ['foundation', iso(year, 2, 11)],
    ['emperor', iso(year, 2, 23)],
    ['vernal', iso(year, 3, equinox(year, 20.8431))],
    ['showa', iso(year, 4, 29)],
    ['constitution', iso(year, 5, 3)],
    ['greenery', iso(year, 5, 4)],
    ['children', iso(year, 5, 5)],
    ['marine', nthMonday(year, 7, 3)],
    ['mountain', iso(year, 8, 11)],
    ['aged', nthMonday(year, 9, 3)],
    ['autumnal', iso(year, 9, equinox(year, 23.2488))],
    ['sports', nthMonday(year, 10, 2)],
    ['culture', iso(year, 11, 3)],
    ['labor', iso(year, 11, 23)],
  ];
  const map = new Map<string, LocalizedText>();
  for (const [key, date] of rules) {
    const moved = special[key];
    map.set(moved ? `${year}-${moved}` : date, NAMES[key]);
  }
  return map;
}

const cache = new Map<number, Map<string, LocalizedText>>();

/** その年の祝日・振替休日・国民の休日。 */
function holidaysOf(year: number): Map<string, LocalizedText> {
  const cached = cache.get(year);
  if (cached) return cached;
  const national = nationalHolidays(year);
  const all = new Map(national);
  // 国民の休日: 前日と翌日が国民の祝日である、祝日でない平日
  for (const date of national.keys()) {
    const between = addDays(date, 1);
    if (!national.has(between) && national.has(addDays(date, 2)) && weekdayOf(between) !== 0) {
      all.set(between, NAMES.citizens);
    }
  }
  // 振替休日: 国民の祝日が日曜日なら、その後のいちばん近い祝日でない日
  for (const date of [...national.keys()].sort()) {
    if (weekdayOf(date) !== 0) continue;
    let next = addDays(date, 1);
    while (national.has(next)) next = addDays(next, 1);
    if (next.startsWith(`${year}-`)) all.set(next, NAMES.substitute);
  }
  cache.set(year, all);
  return all;
}

/** 日本の祝日なら、その名前（英語と日本語）。祝日でなければ null。date は YYYY-MM-DD。 */
export function japaneseHoliday(date: string): LocalizedText | null {
  const year = Number(date.slice(0, 4));
  if (!Number.isInteger(year) || year < 2020 || year > 2099) return null;
  return holidaysOf(year).get(date) ?? null;
}

/** 日本の祝日（振替休日・国民の休日を含む）か。 */
export const isJapaneseHoliday = (date: string): boolean => japaneseHoliday(date) !== null;
