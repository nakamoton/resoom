import { describe, expect, it } from 'vitest';
import { parseSearch } from './criteria';

const TODAY = '2026-11-23';
const CITIES = ['大田区', '渋谷区'];

describe('parseSearch', () => {
  it('何も指定しなければ、今日から31日間・すべての条件で検索する', () => {
    const { criteria, invalidDates, invalidPeople } = parseSearch({}, TODAY, CITIES);

    expect(criteria).toEqual({
      from: '2026-11-23',
      to: '2026-12-23',
      weekdays: null,
      timesOfDay: null,
      people: null,
      needs: [],
      includeUnknown: false,
      municipalities: null,
    });
    expect([invalidDates, invalidPeople]).toEqual([false, false]);
  });

  it('曜日・時間帯・人数・楽器・自治体を読む', () => {
    const { criteria } = parseSearch(
      { from: '2026-12-01', to: '2026-12-31', d: ['6', '0'], t: 'evening', people: '45', need: ['drum_set', 'piano'], unknown: '1', m: ['渋谷区', '横浜市'] },
      TODAY,
      CITIES,
    );

    expect(criteria).toEqual({
      from: '2026-12-01',
      to: '2026-12-31',
      weekdays: [0, 6],
      timesOfDay: ['evening'],
      people: 45,
      needs: ['drum_set'],
      includeUnknown: true,
      municipalities: ['渋谷区'],
    });
  });

  it.each([
    [{ from: '2026-12-31', to: '2026-12-01' }],
    [{ from: '2026-12-01', to: '2028-12-01' }],
    [{ from: '2026-02-30' }],
  ])('正しくない期間 %o は既定の期間に戻し、知らせる', (params) => {
    const { criteria, invalidDates } = parseSearch(params, TODAY, CITIES);

    expect(invalidDates).toBe(true);
    expect(criteria.to > criteria.from).toBe(true);
  });

  it('正しくない人数は絞らずに知らせ、入力欄には元の値を戻す', () => {
    const { criteria, form, invalidPeople } = parseSearch({ people: 'abc' }, TODAY, CITIES);

    expect([criteria.people, form.people, invalidPeople]).toEqual([null, 'abc', true]);
  });
});
