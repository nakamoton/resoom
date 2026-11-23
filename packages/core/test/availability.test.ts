import { describe, expect, it } from 'vitest';
import { dayMatches, roomMatches, searchAvailability, timeOfDayOf, type SearchCriteria, type SearchSlot } from '../src/availability';
import type { EvidenceLike } from '../src/policy';

const evidence = (result: EvidenceLike['result'], instruments: EvidenceLike['instruments'] = []): EvidenceLike => ({
  occurredOn: '2026-01-01',
  createdAt: new Date('2026-01-01T00:00:00Z'),
  result,
  instruments,
});

const rooms = [
  { id: 'plaza', municipality: '大田区', capacity: 50, evidences: [evidence('allowed')] },
  { id: 'minemachi', municipality: '大田区', capacity: 60, evidences: [evidence('allowed', ['wind']), evidence('prohibited', ['drum_set'])] },
  { id: 'owada', municipality: '渋谷区', capacity: 70, evidences: [evidence('allowed')] },
  { id: 'small', municipality: '渋谷区', capacity: 30, evidences: [evidence('allowed')] },
  { id: 'funabori', municipality: '江戸川区', capacity: null, evidences: [evidence('allowed')] },
];
const snapshots = ['plaza', 'minemachi', 'owada', 'small'].map((roomId) => ({ roomId, coveredFrom: '2026-12-01', coveredThrough: '2027-01-31' }));

const slot = (roomId: string, date: string, start: string, status: SearchSlot['status'] = 'available'): SearchSlot => ({
  roomId,
  date,
  start,
  end: start === '09:00' ? '12:00' : start === '13:00' ? '17:00' : '21:30',
  status,
});

const criteria = (overrides: Partial<SearchCriteria> = {}): SearchCriteria => ({
  from: '2026-12-01',
  to: '2026-12-31',
  weekdays: null,
  holidays: false,
  timesOfDay: null,
  people: null,
  needs: [],
  includeUnknown: false,
  municipalities: null,
  ...overrides,
});

describe('timeOfDayOf', () => {
  it.each([
    ['09:00', 'morning'],
    ['11:59', 'morning'],
    ['12:00', 'afternoon'],
    ['12:30', 'afternoon'],
    ['16:59', 'afternoon'],
    ['17:00', 'evening'],
    ['18:30', 'evening'],
  ])('%s は %s', (start, expected) => {
    expect(timeOfDayOf(start)).toBe(expected);
  });
});

describe('dayMatches', () => {
  // 2026-11-21 土、11-22 日、11-23 月（勤労感謝の日）、11-24 火
  it('曜日も祝日も指定がなければ、すべての日が合う', () => {
    expect(['2026-11-21', '2026-11-23', '2026-11-24'].every((d) => dayMatches(d, { weekdays: null, holidays: false }))).toBe(true);
  });

  it('土・日・祝を選ぶと、土日と祝日（月曜の祝日を含む）が合い、平日は合わない', () => {
    const c = { weekdays: [6, 0], holidays: true };
    expect(['2026-11-21', '2026-11-22', '2026-11-23', '2026-11-24'].map((d) => dayMatches(d, c))).toEqual([true, true, true, false]);
  });

  it('祝日だけを選ぶと、祝日だけが合う', () => {
    const c = { weekdays: null, holidays: true };
    expect(['2026-11-21', '2026-11-23', '2026-05-06'].map((d) => dayMatches(d, c))).toEqual([false, true, true]);
  });

  it('祝日を選ばなければ、祝日でも曜日で決まる', () => {
    expect(dayMatches('2026-11-23', { weekdays: [6, 0], holidays: false })).toBe(false);
    expect(dayMatches('2026-11-23', { weekdays: [1], holidays: false })).toBe(true);
  });
});

describe('roomMatches', () => {
  it('定員が人数より少ない部屋は除き、定員が未登録の部屋は残す', () => {
    expect(roomMatches(rooms[3]!, criteria({ people: 45 }))).toBe(false);
    expect(roomMatches(rooms[0]!, criteria({ people: 50 }))).toBe(true);
    expect(roomMatches(rooms[4]!, criteria({ people: 45 }))).toBe(true);
  });

  it('使いたい楽器が不可の部屋は除く', () => {
    expect(roomMatches(rooms[1]!, criteria({ needs: ['drum_set'] }))).toBe(false);
    expect(roomMatches(rooms[0]!, criteria({ needs: ['drum_set', 'large_percussion'] }))).toBe(true);
  });

  it('未確認の部屋は、指定したときだけ含める', () => {
    const unknownTimpani = { ...rooms[1]!, evidences: [evidence('allowed', ['wind'])] };
    expect(roomMatches(unknownTimpani, criteria({ needs: ['large_percussion'] }))).toBe(false);
    expect(roomMatches(unknownTimpani, criteria({ needs: ['large_percussion'], includeUnknown: true }))).toBe(true);
  });

  it('自治体で絞る', () => {
    expect(roomMatches(rooms[2]!, criteria({ municipalities: ['大田区'] }))).toBe(false);
  });
});

describe('searchAvailability', () => {
  const slots = [
    slot('plaza', '2026-12-19', '13:00'),
    slot('plaza', '2026-12-19', '18:00', 'reserved'),
    slot('owada', '2026-12-19', '09:00'),
    slot('small', '2026-12-19', '18:00'),
    slot('minemachi', '2026-12-16', '18:00'),
    slot('plaza', '2026-12-26', '09:00'),
    slot('plaza', '2027-01-09', '13:00'),
  ];

  it('空いているコマだけを、日付ごと・部屋ごとにまとめて返す', () => {
    const result = searchAvailability(rooms, slots, snapshots, criteria());

    expect(result.days.map((d) => [d.date, d.rooms.map((r) => `${r.room.id} ${r.slots.map((s) => s.start).join(',')}`)])).toEqual([
      ['2026-12-16', ['minemachi 18:00']],
      ['2026-12-19', ['plaza 13:00', 'owada 09:00', 'small 18:00']],
      ['2026-12-26', ['plaza 09:00']],
    ]);
  });

  it('曜日・時間帯・人数で絞る', () => {
    const result = searchAvailability(rooms, slots, snapshots, criteria({ weekdays: [6], timesOfDay: ['afternoon', 'evening'], people: 45 }));

    expect(result.days.map((d) => [d.date, d.rooms.map((r) => r.room.id)])).toEqual([['2026-12-19', ['plaza']]]);
  });

  it('空き状況を自動で取得していない部屋は manual に分ける', () => {
    const result = searchAvailability(rooms, slots, snapshots, criteria());

    expect(result.manual.map((r) => r.id)).toEqual(['funabori']);
    expect(result.automatic.map((r) => r.id)).toEqual(['plaza', 'minemachi', 'owada', 'small']);
  });

  it('照会できる期間がない部屋（coveredThrough が null）も manual に分ける', () => {
    const result = searchAvailability(rooms, slots, [...snapshots.slice(1), { roomId: 'plaza', coveredFrom: '2026-12-01', coveredThrough: null }], criteria());

    expect(result.manual.map((r) => r.id)).toContain('plaza');
    expect(result.days.flatMap((d) => d.rooms.map((r) => r.room.id))).not.toContain('plaza');
  });

  it('条件に合わない部屋のコマは出さない', () => {
    const result = searchAvailability(rooms, slots, snapshots, criteria({ needs: ['drum_set'] }));

    expect(result.days.flatMap((d) => d.rooms.map((r) => r.room.id))).not.toContain('minemachi');
  });
});
