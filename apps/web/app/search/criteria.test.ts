import { describe, expect, it } from 'vitest';
import { parseSearch } from './criteria';

const TODAY = '2026-11-23';
const CITIES = ['大田区', '渋谷区'];

describe('parseSearch', () => {
  it('何も指定しなければ、今日から92日間・50人・土日祝・和太鼓以外の楽器・可否が未確認の部屋も含め・全自治体で検索する', () => {
    const { criteria, form, invalidDates, invalidPeople } = parseSearch({}, TODAY, CITIES);

    expect(criteria).toEqual({
      from: '2026-11-23',
      to: '2027-02-22',
      weekdays: [0, 6],
      holidays: true,
      timesOfDay: null,
      people: 50,
      needs: ['wind', 'small_percussion', 'drum_set', 'large_percussion'],
      includeUnknown: true,
      municipalities: null,
    });
    expect([invalidDates, invalidPeople]).toEqual([false, false]);
    // 入力欄では、土・日・祝とすべての自治体にチェックが入る
    expect([form.days, form.holidays, form.municipalities, form.people]).toEqual([[0, 6], true, ['大田区', '渋谷区'], '50']);
  });

  it('フォームから人数を空欄で送ったときは、人数で絞らない', () => {
    const { criteria, form, invalidPeople } = parseSearch({ s: '1', people: '' }, TODAY, CITIES);

    expect([criteria.people, form.people, invalidPeople]).toEqual([null, '', false]);
  });

  it('フォームから送られたときは、曜日・祝日・自治体をすべて外した状態をそのまま読む（すべての日・自治体が対象）', () => {
    const { criteria, form } = parseSearch({ s: '1' }, TODAY, CITIES);

    expect([criteria.weekdays, criteria.holidays, criteria.municipalities]).toEqual([null, false, null]);
    expect([form.days, form.holidays, form.municipalities]).toEqual([[], false, []]);
  });

  it('祝日だけ・自治体を1つだけ選んだ指定を読む', () => {
    const { criteria } = parseSearch({ s: '1', d: 'h', m: '渋谷区' }, TODAY, CITIES);

    expect([criteria.weekdays, criteria.holidays, criteria.municipalities]).toEqual([null, true, ['渋谷区']]);
  });

  it('自治体をすべて選んだときは、自治体で絞らない', () => {
    const { criteria, form } = parseSearch({ s: '1', m: ['大田区', '渋谷区'] }, TODAY, CITIES);

    expect([criteria.municipalities, form.municipalities]).toEqual([null, ['大田区', '渋谷区']]);
  });

  it('フォームから送られたときは、楽器をすべて外した・未確認を含めない、をそのまま読む', () => {
    const { criteria, form } = parseSearch({ s: '1', d: '6' }, TODAY, CITIES);

    expect([criteria.needs, criteria.includeUnknown]).toEqual([[], false]);
    expect([form.needs, form.includeUnknown]).toEqual([[], false]);
  });

  it('フォームから送られたときも、選んだ楽器と未確認を含めるは読む', () => {
    const { criteria } = parseSearch({ s: '1', need: ['taiko'], unknown: '1' }, TODAY, CITIES);

    expect([criteria.needs, criteria.includeUnknown]).toEqual([['taiko'], true]);
  });

  it('楽器だけを指定したリンクでは、未確認を含めるは既定のまま', () => {
    const { criteria } = parseSearch({ need: 'drum_set' }, TODAY, CITIES);

    expect([criteria.needs, criteria.includeUnknown]).toEqual([['drum_set'], true]);
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
      holidays: false,
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
