import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseFacilityName, parseRoomList, parseTitle, parseWeek } from '../src/shinagawa/parse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseTitle', () => {
  it('画面の title を、空白をそろえて返す', () => {
    expect(parseTitle(fixture('shinagawa-home.html'))).toBe('サンプル区施設予約システム ホーム画面');
  });
});

describe('parseFacilityName', () => {
  const html = fixture('shinagawa-home.html');

  it('「どこで」の選択肢から、館コードに対応する館の名前を取り出す', () => {
    expect(parseFacilityName(html, '9100_9010')).toBe('サンプル産業センター');
    expect(parseFacilityName(html, '9200_9030')).toBe('サンプル体育館');
  });

  it('選択肢にない館コードは null を返す', () => {
    expect(parseFacilityName(html, '9100_9999')).toBeNull();
    expect(parseFacilityName('<html><body>別の画面</body></html>', '9100_9010')).toBeNull();
  });
});

describe('parseRoomList', () => {
  it('施設コード・館名・部屋名を取り出す（定員は一覧にないので null）', () => {
    expect(parseRoomList(fixture('shinagawa-rooms.json'), 'サンプル産業センター')).toEqual([
      { key: '90100010', facility: 'サンプル産業センター', room: '大会議室', capacity: null },
      { key: '90100020', facility: 'サンプル産業センター', room: '音楽室', capacity: null },
      { key: '90100030', facility: 'サンプル産業センター', room: '和室＜全面＞', capacity: null },
    ]);
  });

  it('該当する施設がなければ空の配列を返す', () => {
    expect(parseRoomList('{"results":[]}', 'サンプル産業センター')).toEqual([]);
  });

  it('サイトがエラーを返していればエラーにする', () => {
    expect(() => parseRoomList('{"ErrManager":{"message":"システム異常が発生しました。"}}', 'サンプル産業センター')).toThrow(
      'サイトがエラーを返しました: システム異常が発生しました。',
    );
  });

  it('JSON でない応答はエラーにする', () => {
    expect(() => parseRoomList('<html><body>エラー</body></html>', 'サンプル産業センター')).toThrow('想定外の応答です');
    expect(() => parseRoomList('{"other":1}', 'サンプル産業センター')).toThrow('施設の一覧がありません');
  });
});

describe('parseWeek', () => {
  const page = parseWeek(fixture('shinagawa-week.json'));
  const find = (date: string, start: string) => page.cells.find((c) => c.date === date && c.start === start);

  it('見出しの7日間を、年またぎも含めて YYYY-MM-DD で返す', () => {
    expect(page.dates).toEqual(['2026-12-28', '2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('時間帯×日付の数だけコマを返す', () => {
    expect(page.cells).toHaveLength(3 * 7);
  });

  it('数値の時刻を HH:MM にそろえる', () => {
    expect(find('2026-12-28', '09:00')).toEqual({ date: '2026-12-28', start: '09:00', end: '12:00', status: 'available', rawLabel: '空き' });
    expect(find('2026-12-28', '13:00')?.end).toBe('16:30');
    expect(find('2026-12-28', '17:30')?.end).toBe('21:30');
  });

  it('アイコンの種類を状態に対応づけ、画面の表示を残す', () => {
    expect(find('2026-12-29', '09:00')).toMatchObject({ status: 'reserved', rawLabel: '予約あり' });
    expect(find('2026-12-30', '09:00')).toMatchObject({ status: 'closed', rawLabel: '休館日' });
    expect(find('2027-01-02', '09:00')).toMatchObject({ status: 'maintenance', rawLabel: '保守' });
    expect(find('2027-01-03', '09:00')).toMatchObject({ status: 'not_bookable', rawLabel: '受付期間外' });
    expect(find('2026-12-28', '13:00')).toMatchObject({ status: 'unavailable', rawLabel: '時間外' });
    expect(find('2026-12-29', '13:00')).toMatchObject({ status: 'suspended', rawLabel: '雨天' });
    expect(find('2026-12-30', '13:00')).toMatchObject({ status: 'reserved', rawLabel: '取消処理中' });
    expect(find('2026-12-31', '13:00')).toMatchObject({ status: 'unavailable', rawLabel: '一般開放' });
    expect(find('2027-01-01', '13:00')).toMatchObject({ status: 'not_bookable', rawLabel: '電話問合せ' });
  });

  it('知らないアイコンは unknown とし、元の表示を残す', () => {
    expect(find('2027-01-02', '13:00')).toMatchObject({ status: 'unknown', rawLabel: '新しい表示' });
  });

  it('アイコンがなくても、状態コードが 0 なら空きとする', () => {
    expect(find('2027-01-03', '13:00')).toMatchObject({ status: 'available', rawLabel: '空き' });
  });

  it('サイトがエラーを返していればエラーにする', () => {
    expect(() => parseWeek('{"ErrManager":{"message":"システム異常が発生しました。"}}')).toThrow(
      'サイトがエラーを返しました: システム異常が発生しました。',
    );
  });

  it('空き状況の応答でなければエラーにする', () => {
    expect(() => parseWeek('{"results":[]}')).toThrow('空き状況の応答ではありません');
    expect(() => parseWeek('<html><body>別の画面</body></html>')).toThrow('想定外の応答です');
  });

  it('日付や時刻が読めないコマはエラーにする', () => {
    const broken = (patch: object): string =>
      JSON.stringify({
        weekDay: [{ useDay: 20261228 }],
        result: [{ tzoneNo: 10, timeResult: [{ imgURL: '', alt: '空き', startTime: 900, endTime: 1200, useDay: 20261228, status: 0, ...patch }] }],
      });
    expect(() => parseWeek(broken({ startTime: 960 }))).toThrow('時刻を解析できません: 960');
    expect(() => parseWeek(broken({ useDay: '12/28' }))).toThrow('日付を解析できません: 12/28');
    expect(() => parseWeek(broken({ useDay: 20261229 }))).toThrow('見出しにない日付のコマがあります: 2026-12-29');
  });
});
