import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseAvailability, parseRoomList } from '../src/ota/parse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseRoomList', () => {
  it('部屋の識別子・会館名・部屋名・定員を取り出す', () => {
    expect(parseRoomList(fixture('ota-rooms.html'))).toEqual([
      { key: '999999_001_01_01_01', facility: 'サンプル会館', room: 'リハーサル室', capacity: 54 },
      { key: '999999_001_01_02_01', facility: 'サンプル会館', room: '体育室', capacity: null },
      { key: '999999_001_01_03_01', facility: 'サンプル会館', room: '第一音楽スタジオ', capacity: 50 },
    ]);
  });

  it('部屋の表がない画面では空の配列を返す', () => {
    expect(parseRoomList('<html><body>エラー</body></html>')).toEqual([]);
  });
});

describe('parseAvailability', () => {
  const slots = parseAvailability(fixture('ota-availability.html'));
  const find = (room: string, date: string, start: string) =>
    slots.find((s) => s.room === room && s.date === date && s.start === start);

  it('部屋×日付×コマの数だけ結果を返す', () => {
    expect(slots).toHaveLength(2 * 4 + 1 * 4);
  });

  it('会館名と部屋名を付ける', () => {
    expect(find('第一音楽スタジオ', '2026-12-30', '09:30')).toMatchObject({
      facility: 'サンプル会館',
      end: '11:30',
      status: 'available',
      rawLabel: '空いています',
    });
  });

  it('年をまたぐ表示では、1月以降を翌年として扱う', () => {
    expect(find('第一音楽スタジオ', '2027-01-02', '12:00')?.status).toBe('available');
    expect(find('第一音楽スタジオ', '2027-01-02', '09:30')?.status).toBe('reserved');
    expect(slots.some((s) => s.date.startsWith('2026-01'))).toBe(false);
  });

  it('アイコンの種類を状態に対応づける', () => {
    expect(find('第一音楽スタジオ', '2026-12-31', '09:30')?.status).toBe('closed');
    expect(find('第一音楽スタジオ', '2026-12-30', '12:00')?.status).toBe('maintenance');
    expect(find('リハーサル室', '2026-12-30', '09:00')?.status).toBe('not_bookable');
    expect(find('リハーサル室', '2026-12-31', '09:00')?.status).toBe('suspended');
    expect(find('リハーサル室', '2027-01-01', '09:00')?.status).toBe('unavailable');
  });

  it('知らないアイコンは unknown とし、元の表示を残す', () => {
    expect(find('リハーサル室', '2027-01-02', '09:00')).toMatchObject({
      status: 'unknown',
      rawLabel: '新しい表示',
    });
  });

  it('1桁の時刻を HH:MM にそろえる', () => {
    expect(find('リハーサル室', '2026-12-30', '09:00')?.end).toBe('12:00');
  });

  it('空き照会画面でなければエラーにする', () => {
    expect(() => parseAvailability('<html><body>別の画面</body></html>')).toThrow('空き照会画面ではありません');
  });
});
