import { describe, expect, it } from 'vitest';
import { combineRooms } from '../src/combine';
import type { AvailabilitySlot, SlotStatus } from '../src/types';

const slot = (room: string, start: string, status: SlotStatus, rawLabel = ''): AvailabilitySlot => ({
  facility: 'サンプル会館',
  room,
  date: '2027-01-16',
  start,
  end: start === '13:00' ? '17:00' : '21:00',
  status,
  rawLabel,
});

describe('combineRooms', () => {
  it('すべての部屋が空いているコマだけを空きにする', () => {
    const combined = combineRooms(
      [
        slot('第1学習室', '13:00', 'available'),
        slot('第2学習室', '13:00', 'available'),
        slot('第1学習室', '18:00', 'available'),
        slot('第2学習室', '18:00', 'reserved', '予約済みです'),
      ],
      ['第1学習室', '第2学習室'],
      '第１・第２学習室合併',
    );

    expect(combined.map((s) => [s.room, s.start, s.status, s.rawLabel])).toEqual([
      ['第１・第２学習室合併', '13:00', 'available', ''],
      ['第１・第２学習室合併', '18:00', 'reserved', '予約済みです'],
    ]);
  });

  it('1部屋だけなら、名前を付け替えるだけ', () => {
    const combined = combineRooms([slot('音楽室', '13:00', 'closed', '休館日です')], ['音楽室'], '音楽室（台帳名）');

    expect(combined).toEqual([{ ...slot('音楽室', '13:00', 'closed', '休館日です'), room: '音楽室（台帳名）' }]);
  });

  it('関係のない部屋のコマは混ぜない', () => {
    const combined = combineRooms(
      [slot('第1学習室', '13:00', 'available'), slot('第2学習室', '13:00', 'available'), slot('和室', '13:00', 'reserved')],
      ['第1学習室', '第2学習室'],
      '合併',
    );

    expect(combined).toHaveLength(1);
    expect(combined[0]?.status).toBe('available');
  });

  it('部屋によってコマの区切りが違えば unknown にする', () => {
    const combined = combineRooms([slot('第1学習室', '13:00', 'available'), slot('第2学習室', '18:00', 'available')], ['第1学習室', '第2学習室'], '合併');

    expect(combined.map((s) => s.status)).toEqual(['unknown']);
  });

  it('部屋の指定が空なら空の結果', () => {
    expect(combineRooms([slot('音楽室', '13:00', 'available')], [], '合併')).toEqual([]);
  });
});
