import { describe, expect, it } from 'vitest';
import { feeForSlot, feeLabel, feeSummary, feeTableFor, yenText, type RoomFees } from '../src/fees';

const morishita: RoomFees = {
  unit: 'slot',
  slots: [
    { label: '午前', start: '09:00', end: '12:00', yen: 5000 },
    { label: '午後', start: '13:00', end: '17:00', yen: 10200 },
    { label: '夜間', start: '18:00', end: '22:00', yen: 12650 },
  ],
  holidaySlots: [
    { label: '午前', start: '09:00', end: '12:00', yen: 6000 },
    { label: '午後', start: '13:00', end: '17:00', yen: 12050 },
    { label: '夜間', start: '18:00', end: '22:00', yen: 14900 },
  ],
  sources: ['https://www.kcf.or.jp/morishita/shisetsu/fee/'],
  checkedOn: '2026-11-23',
};

describe('料金', () => {
  it('土・日・祝日は土日祝の料金表、平日は平日の料金表を使う', () => {
    expect(feeTableFor(morishita, '2026-11-24')[0]?.yen).toBe(5000); // 火
    expect(feeTableFor(morishita, '2026-11-28')[0]?.yen).toBe(6000); // 土
    expect(feeTableFor(morishita, '2026-11-23')[0]?.yen).toBe(6000); // 月・勤労感謝の日
  });

  it('空きコマの時刻と同じ区分の料金を返し、ない区分は null', () => {
    expect(feeForSlot(morishita, '2026-11-24', '18:00', '22:00')).toBe(12650);
    expect(feeForSlot(morishita, '2026-11-29', '18:00', '22:00')).toBe(14900);
    expect(feeForSlot(morishita, '2026-11-24', '18:00', '21:00')).toBeNull();
  });

  it('1時間あたりの料金は、コマの長さで計算する', () => {
    const hourly: RoomFees = { unit: 'hour', slots: [{ label: '1時間', start: '09:00', end: '22:00', yen: 1100 }], sources: [], checkedOn: '2026-11-23' };
    expect(feeForSlot(hourly, '2026-11-24', '18:00', '21:00')).toBe(3300);
    expect(feeForSlot(hourly, '2026-11-24', '18:00', '20:30')).toBeNull();
  });

  it('まとめの表記', () => {
    expect(feeSummary(morishita)).toBe('¥5,000–14,900');
    expect(feeSummary({ unit: 'slot', slots: [{ label: '2時間', start: '09:30', end: '11:30', yen: 3800 }], sources: [], checkedOn: '2026-11-23' })).toBe('¥3,800');
    expect(feeSummary({ unit: 'hour', slots: [{ label: '1時間', start: '09:00', end: '22:00', yen: 1100 }], sources: [], checkedOn: '2026-11-23' })).toBe('¥1,100/h');
    expect(yenText(12650)).toBe('¥12,650');
  });

  it('区分の名前を英語と日本語にする', () => {
    expect(feeLabel('午前')).toEqual({ en: 'Morning', ja: '午前' });
    expect(feeLabel('午後1')).toEqual({ en: 'Afternoon 1', ja: '午後1' });
    expect(feeLabel('午後A')).toEqual({ en: 'Afternoon A', ja: '午後A' });
    expect(feeLabel('夕方')).toEqual({ en: 'Early evening', ja: '夕方' });
    expect(feeLabel('第1部')).toEqual({ en: '第1部', ja: '第1部' });
    expect(feeLabel('第3区分')).toEqual({ en: 'Slot 3', ja: '第3区分' });
  });
});
