import { describe, expect, it } from 'vitest';
import { capacityLabel, filterByCapacity, parsePeople } from '../src/capacity';

const rooms = [
  { name: '大練習室', capacity: 70 },
  { name: '練習室３', capacity: 30 },
  { name: 'リハーサル室', capacity: null },
  { name: '音楽室', capacity: 45 },
];

describe('filterByCapacity', () => {
  it('人数の指定がなければ、すべて fits にする', () => {
    expect(filterByCapacity(rooms, null)).toEqual({ fits: rooms, unknown: [], tooSmall: [] });
  });

  it('定員が人数以上・分からない・足りない、に分ける（ちょうどの定員は入れる）', () => {
    const result = filterByCapacity(rooms, 45);

    expect(result.fits.map((r) => r.name)).toEqual(['大練習室', '音楽室']);
    expect(result.unknown.map((r) => r.name)).toEqual(['リハーサル室']);
    expect(result.tooSmall.map((r) => r.name)).toEqual(['練習室３']);
  });
});

describe('parsePeople', () => {
  it.each([
    ['', null],
    [undefined, null],
    [' 45 ', 45],
    ['0', undefined],
    ['四十五', undefined],
    ['12345', undefined],
  ])('%s → %s', (value, expected) => {
    expect(parsePeople(value)).toBe(expected);
  });
});

describe('capacityLabel', () => {
  it('定員があれば人数を、なければ「未登録」と表示する', () => {
    expect(capacityLabel(50)).toBe('定員 50人');
    expect(capacityLabel(null)).toBe('定員 未登録');
  });
});
