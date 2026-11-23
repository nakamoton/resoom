import { describe, expect, it } from 'vitest';
import { isJapaneseHoliday, japaneseHoliday } from '../src/holidays';

/** その年の祝日を、日付と日本語の名前の一覧にする。 */
function holidaysIn(year: number): string[] {
  const out: string[] = [];
  for (let t = Date.parse(`${year}-01-01T00:00:00Z`); t <= Date.parse(`${year}-12-31T00:00:00Z`); t += 86_400_000) {
    const date = new Date(t).toISOString().slice(0, 10);
    const name = japaneseHoliday(date);
    if (name) out.push(`${date.slice(5)} ${name.ja}`);
  }
  return out;
}

describe('日本の祝日', () => {
  // 内閣府「国民の祝日について」の一覧と同じになること
  it('2025年（振替休日が3回ある年）', () => {
    expect(holidaysIn(2025)).toEqual([
      '01-01 元日',
      '01-13 成人の日',
      '02-11 建国記念の日',
      '02-23 天皇誕生日',
      '02-24 振替休日',
      '03-20 春分の日',
      '04-29 昭和の日',
      '05-03 憲法記念日',
      '05-04 みどりの日',
      '05-05 こどもの日',
      '05-06 振替休日',
      '07-21 海の日',
      '08-11 山の日',
      '09-15 敬老の日',
      '09-23 秋分の日',
      '10-13 スポーツの日',
      '11-03 文化の日',
      '11-23 勤労感謝の日',
      '11-24 振替休日',
    ]);
  });

  it('2026年（国民の休日がある年）', () => {
    expect(holidaysIn(2026)).toEqual([
      '01-01 元日',
      '01-12 成人の日',
      '02-11 建国記念の日',
      '02-23 天皇誕生日',
      '03-20 春分の日',
      '04-29 昭和の日',
      '05-03 憲法記念日',
      '05-04 みどりの日',
      '05-05 こどもの日',
      '05-06 振替休日',
      '07-20 海の日',
      '08-11 山の日',
      '09-21 敬老の日',
      '09-22 国民の休日',
      '09-23 秋分の日',
      '10-12 スポーツの日',
      '11-03 文化の日',
      '11-23 勤労感謝の日',
    ]);
  });

  it('2027年', () => {
    expect(holidaysIn(2027)).toEqual([
      '01-01 元日',
      '01-11 成人の日',
      '02-11 建国記念の日',
      '02-23 天皇誕生日',
      '03-21 春分の日',
      '03-22 振替休日',
      '04-29 昭和の日',
      '05-03 憲法記念日',
      '05-04 みどりの日',
      '05-05 こどもの日',
      '07-19 海の日',
      '08-11 山の日',
      '09-20 敬老の日',
      '09-23 秋分の日',
      '10-11 スポーツの日',
      '11-03 文化の日',
      '11-23 勤労感謝の日',
    ]);
  });

  it('2021年の東京オリンピックによる移動', () => {
    expect([japaneseHoliday('2021-07-22')?.ja, japaneseHoliday('2021-07-23')?.ja, japaneseHoliday('2021-08-08')?.ja, japaneseHoliday('2021-08-09')?.ja]).toEqual([
      '海の日',
      'スポーツの日',
      '山の日',
      '振替休日',
    ]);
    expect(isJapaneseHoliday('2021-07-19')).toBe(false);
    expect(isJapaneseHoliday('2021-10-11')).toBe(false);
  });

  it('英語の名前もある', () => {
    expect(japaneseHoliday('2026-11-03')).toEqual({ en: 'Culture Day', ja: '文化の日' });
  });

  it('祝日でない日と、範囲外の日は祝日ではない', () => {
    expect(isJapaneseHoliday('2026-11-24')).toBe(false);
    expect(isJapaneseHoliday('2019-01-01')).toBe(false);
    expect(isJapaneseHoliday('not-a-date')).toBe(false);
  });
});
