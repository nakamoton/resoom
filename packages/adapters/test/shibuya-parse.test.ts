import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import {
  parseCsrf,
  parseDayFrames,
  parseFacilities,
  parseReservableMonths,
  parseRoomList,
  parseVacantDates,
} from '../src/shibuya/parse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');
const envelope = (content: unknown, errors: unknown[] = []): string =>
  JSON.stringify({ messages: [], errors, warns: [], content });
const MAINTENANCE_HTML = '<html><body><h1 align="center">【システムメンテナンス中です】</h1></body></html>';

describe('parseCsrf', () => {
  it('トークンと、それを載せるヘッダー名を取り出す', () => {
    const text = JSON.stringify({ token: 'tok-1', parameter_name: '_csrf', header_name: 'X-XSRF-TOKEN' });
    expect(parseCsrf(text)).toEqual({ headerName: 'X-XSRF-TOKEN', token: 'tok-1' });
  });

  it('トークンがなければエラーにする', () => {
    expect(() => parseCsrf(JSON.stringify({ parameter_name: '_csrf' }))).toThrow('想定外の応答です（CSRFトークン');
  });

  it('JSONでない応答（メンテナンス画面など）はエラーにする', () => {
    expect(() => parseCsrf(MAINTENANCE_HTML)).toThrow('JSONではありません');
  });
});

describe('parseFacilities', () => {
  it('施設のIDと名前を取り出す', () => {
    expect(parseFacilities(fixture('shibuya-facilities.json'))).toEqual([
      { id: 90001, name: 'サンプル文化センター（練習室）' },
      { id: 7, name: 'サンプル社会教育館' },
    ]);
  });

  it('サイトがエラーを返したら、その文言を添えてエラーにする', () => {
    const text = envelope(null, [{ message: '目的を選択してください', description: '' }]);
    expect(() => parseFacilities(text)).toThrow('サイトがエラーを返しました（施設一覧）: 目的を選択してください');
  });

  it('content が配列でなければエラーにする', () => {
    expect(() => parseFacilities(envelope(null))).toThrow('content が配列ではありません');
  });
});

describe('parseRoomList', () => {
  it('部屋の識別子・部屋名・定員を取り出し、渡された施設名を付ける', () => {
    expect(parseRoomList(fixture('shibuya-rooms.json'), 'サンプル文化センター（練習室）')).toEqual([
      { key: '90011', facility: 'サンプル文化センター（練習室）', room: '第一練習室', capacity: 60 },
      { key: '90012', facility: 'サンプル文化センター（練習室）', room: '第二練習室', capacity: 8 },
      { key: '90013', facility: 'サンプル文化センター（練習室）', room: '屋外広場', capacity: null },
    ]);
  });

  it('部屋がなければ空の配列を返す', () => {
    expect(parseRoomList(envelope([]), 'サンプル文化センター')).toEqual([]);
  });

  it('JSONでない応答はエラーにする', () => {
    expect(() => parseRoomList(MAINTENANCE_HTML, 'サンプル文化センター')).toThrow('想定外の応答です（部屋一覧: JSONではありません）');
  });
});

describe('parseReservableMonths', () => {
  it('利用月を YYYY-MM にそろえる', () => {
    expect(parseReservableMonths(fixture('shibuya-months.json'))).toEqual(['2026-11', '2026-12', '2027-01', '2027-02']);
  });

  it('月として読めない値はエラーにする', () => {
    expect(() => parseReservableMonths(envelope(['2027年1月']))).toThrow('日付を解析できません');
  });
});

describe('parseVacantDates', () => {
  it('空きのある日を YYYY-MM-DD の昇順で返す', () => {
    expect(parseVacantDates(fixture('shibuya-month-frames.json'), '2027-01')).toEqual(['2027-01-05', '2027-01-16', '2027-01-30']);
  });

  it('同じ日が重なっていても1つにまとめる', () => {
    const text = envelope([{ use_date: '2027/01/16' }, { use_date: '2027/01/05' }, { use_date: '2027/01/16' }]);
    expect(parseVacantDates(text, '2027-01')).toEqual(['2027-01-05', '2027-01-16']);
  });

  it('空きのある日がなければ空の配列を返す', () => {
    expect(parseVacantDates(envelope([]), '2027-01')).toEqual([]);
  });

  it('照会した月と違う日が返ったらエラーにする', () => {
    expect(() => parseVacantDates(fixture('shibuya-month-frames.json'), '2027-02')).toThrow(
      '2027-02 を照会したのに 2027-01-30 が返りました',
    );
  });
});

describe('parseDayFrames', () => {
  const slots = parseDayFrames(fixture('shibuya-day-frames.json'), '2027-01-16');

  it('部屋×空きコマの数だけ結果を返す', () => {
    expect(slots).toHaveLength(2 + 1 + 1);
    expect(slots.every((s) => s.date === '2027-01-16')).toBe(true);
  });

  it('施設名・部屋名・部屋の識別子を付け、時刻を HH:MM にそろえる', () => {
    expect(slots[0]).toEqual({
      roomKey: '90011',
      facility: 'サンプル文化センター（練習室）',
      room: '第一練習室',
      date: '2027-01-16',
      start: '09:00',
      end: '12:00',
      status: 'available',
      rawLabel: '空き時間',
    });
    expect(slots[1]).toMatchObject({ roomKey: '90011', start: '18:00', end: '22:00', status: 'available' });
  });

  it('予約の受付期間外と印が付いた空きコマは not_bookable とする', () => {
    expect(slots[2]).toMatchObject({
      roomKey: '90012',
      room: '第二練習室',
      start: '13:00',
      end: '17:00',
      status: 'not_bookable',
      rawLabel: '空き時間（予約受付期間外 reservable=true reservable_period=false）',
    });
  });

  it('Webから申し込めない空きコマ（当日分など）は空きとし、その旨を表示に残す', () => {
    expect(slots[3]).toMatchObject({
      roomKey: '90013',
      room: '屋外広場',
      start: '18:00',
      end: '21:00',
      status: 'available',
      rawLabel: '空き時間（Web申込不可 reservable=false reservable_period=true）',
    });
  });

  it('フラグが読めない空きコマは unknown とし、元の値を残す', () => {
    const text = envelope([
      { use_date: '2027/01/16', room_area_id: 90011, room_area_name: '第一練習室', reservable_frames: [{ id: 801, start_time: '9:00', end_time: '12:00' }] },
    ]);
    expect(parseDayFrames(text, '2027-01-16')).toMatchObject([
      { status: 'unknown', rawLabel: '空き時間（reservable=undefined reservable_period=undefined）' },
    ]);
  });

  it('空きがない日は空の配列を返す', () => {
    expect(parseDayFrames(envelope([]), '2027-01-17')).toEqual([]);
  });

  it('照会した日と違う日が返ったらエラーにする', () => {
    expect(() => parseDayFrames(fixture('shibuya-day-frames.json'), '2027-01-17')).toThrow(
      '2027-01-17 を照会したのに 2027-01-16 が返りました',
    );
  });

  it('時刻として読めないコマはエラーにする', () => {
    const text = envelope([
      {
        use_date: '2027/01/16',
        room_area_id: 90011,
        room_area_name: '第一練習室',
        reservable: true,
        reservable_period: true,
        reservable_frames: [{ id: 801, start_time: '午前', end_time: '12:00' }],
      },
    ]);
    expect(() => parseDayFrames(text, '2027-01-16')).toThrow('時刻を解析できません');
  });

  it('JSONでない応答はエラーにする', () => {
    expect(() => parseDayFrames(MAINTENANCE_HTML, '2027-01-16')).toThrow('想定外の応答です（日の空き状況: JSONではありません）');
  });
});
