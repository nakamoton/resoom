import { describe, expect, it } from 'vitest';
import { japanHour, refreshAvailability, startOfJapanDay, type RefreshState } from '../src/refresh';

/** 日本時間の時刻を Date にする。例: jst('2026-11-23 14:00') */
const jst = (text: string): Date => new Date(`${text.replace(' ', 'T')}:00+09:00`);

const state = (overrides: Partial<RefreshState> = {}): RefreshState => ({
  lastFetchAt: jst('2026-11-23 13:15'),
  active: null,
  manualToday: 0,
  ...overrides,
});

describe('refreshAvailability', () => {
  it('前回の取得から20分たっていれば使える', () => {
    expect(refreshAvailability(state(), jst('2026-11-23 13:35'))).toEqual({ kind: 'available' });
  });

  it('20分たっていなければ、使えるようになる時刻を返す', () => {
    expect(refreshAvailability(state(), jst('2026-11-23 13:34'))).toEqual({ kind: 'cooldown', availableAt: jst('2026-11-23 13:35') });
  });

  it('まだ一度も取得していなければ使える', () => {
    expect(refreshAvailability(state({ lastFetchAt: null }), jst('2026-11-23 13:00'))).toEqual({ kind: 'available' });
  });

  it('取得中は使えず、誰がいつ始めたかを返す', () => {
    const active = { trigger: 'manual' as const, requestedBy: '中本', since: jst('2026-11-23 14:00') };
    expect(refreshAvailability(state({ active, lastFetchAt: null }), jst('2026-11-23 14:01'))).toEqual({ kind: 'running', ...active });
  });

  it.each([
    ['06:59', 'outside_hours'],
    ['07:00', 'available'],
    ['21:59', 'available'],
    ['22:00', 'outside_hours'],
    ['02:00', 'outside_hours'],
  ])('日本時間 %s は %s', (time, kind) => {
    expect(refreshAvailability(state({ lastFetchAt: null }), jst(`2026-11-23 ${time}`)).kind).toBe(kind);
  });

  it('今日すでに10回申し込まれていれば使えない', () => {
    expect(refreshAvailability(state({ manualToday: 9 }), jst('2026-11-23 15:00')).kind).toBe('available');
    expect(refreshAvailability(state({ manualToday: 10 }), jst('2026-11-23 15:00')).kind).toBe('daily_limit');
  });
});

describe('日本時間の計算', () => {
  it('時と、その日の0時', () => {
    expect(japanHour(new Date('2026-11-23T15:30:00Z'))).toBe(0);
    expect(startOfJapanDay(new Date('2026-11-23T15:30:00Z'))).toEqual(jst('2026-11-24 00:00'));
    expect(startOfJapanDay(jst('2026-11-23 23:59'))).toEqual(jst('2026-11-23 00:00'));
  });
});
