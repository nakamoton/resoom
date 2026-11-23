import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseRoomList, parseTitle, parseWeek, resolvePeriod } from '../src/kawasaki/parse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseTitle', () => {
  it('title の空白（&nbsp; を含む）を1つにまとめる', () => {
    expect(parseTitle(fixture('kawasaki-rooms.html'))).toBe('サンプル市公共施設利用予約システム 施設選択画面');
  });
});

describe('parseRoomList', () => {
  it('一覧での番号・館名・部屋名を取り出し、「すべて」は含めない', () => {
    expect(parseRoomList(fixture('kawasaki-rooms.html'))).toEqual([
      { key: '0', facility: 'サンプル市民館', room: '大ホール', capacity: null },
      { key: '1', facility: 'サンプル市民館', room: '第１会議室', capacity: null },
      { key: '2', facility: 'サンプル市民館', room: '第１・第２会議室合併', capacity: null },
      { key: '3', facility: 'サンプル市民館', room: '視聴覚室', capacity: null },
      { key: '4', facility: 'サンプル市民館', room: '音楽室', capacity: null },
    ]);
  });

  it('部屋の一覧がない画面では空の配列を返す', () => {
    expect(parseRoomList('<html><body>エラー</body></html>')).toEqual([]);
  });
});

describe('parseWeek', () => {
  const page = parseWeek(fixture('kawasaki-week.html'));
  const find = (date: string, period: string) => page.cells.find((c) => c.date === date && c.period === period);

  it('表の見出しを、館名と部屋名をつなげた形で返す', () => {
    expect(page.caption).toBe('サンプル市民館音楽室 空き状況');
  });

  it('年をまたぐ表示では、1月以降を翌年として扱う', () => {
    expect(page.dates).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
  });

  it('日付×時間帯の数だけコマを返し、凡例の画像は数えない', () => {
    expect(page.cells).toHaveLength(4 * 4);
  });

  it('画像の説明文の末尾から、表示と状態を取り出す', () => {
    expect(find('2026-12-30', '午前')).toEqual({ date: '2026-12-30', period: '午前', status: 'available', rawLabel: '空き' });
    expect(find('2027-01-02', '午前')).toMatchObject({ status: 'reserved', rawLabel: '予約あり' });
  });

  it('凡例の表示を状態に対応づける', () => {
    expect(find('2026-12-31', '午前')).toMatchObject({ status: 'closed', rawLabel: '休館日' });
    expect(find('2027-01-01', '午前')).toMatchObject({ status: 'maintenance', rawLabel: '保守日・主催事業' });
    expect(find('2026-12-31', '午後')).toMatchObject({ status: 'unavailable', rawLabel: '一般開放' });
    expect(find('2027-01-01', '午後')).toMatchObject({ status: 'suspended', rawLabel: '雨天' });
    expect(find('2026-12-30', '夜間')).toMatchObject({ status: 'unavailable', rawLabel: '時間外' });
    expect(find('2026-12-31', '夜間')).toMatchObject({ status: 'reserved', rawLabel: '取消処理中' });
    expect(find('2027-01-01', '夜間')).toMatchObject({ status: 'not_bookable', rawLabel: '開放予定' });
    expect(find('2027-01-02', '夜間')).toMatchObject({ status: 'not_bookable', rawLabel: '受付期間外' });
  });

  it('知らない表示は unknown とし、日付と時間帯を除いた元の表示を残す', () => {
    expect(find('2026-12-30', '深夜')).toMatchObject({ status: 'unknown', rawLabel: '新しい表示' });
  });

  it('空き状況画面でなければエラーにする', () => {
    expect(() => parseWeek('<html><body>別の画面</body></html>')).toThrow('空き状況画面ではありません');
  });

  it('日付の列とコマの列の数が合わなければエラーにする', () => {
    const broken = fixture('kawasaki-week.html').replace('<th scope="col" class="rsvakitable3">1月2日<br />土曜日</th>', '');
    expect(() => parseWeek(broken)).toThrow('列数とコマの列数が合いません');
  });
});

describe('resolvePeriod', () => {
  it('市民館の会議室などは、条例の区分で時刻に直す', () => {
    expect(resolvePeriod('1180', '音楽室', '午前')).toEqual({ start: '09:00', end: '12:00' });
    expect(resolvePeriod('1190', '第１音楽室', '午後')).toEqual({ start: '13:00', end: '17:00' });
    expect(resolvePeriod('1230', '大会議室', '夜間')).toEqual({ start: '17:30', end: '21:00' });
  });

  it('カルッツかわさきの音楽練習室は、館の利用規程の区分で時刻に直す', () => {
    expect(resolvePeriod('5510', '音楽練習室１', '午後')).toEqual({ start: '13:00', end: '16:30' });
    expect(resolvePeriod('5510', '音楽練習室１', '夜間')).toEqual({ start: '17:30', end: '21:30' });
  });

  it('見出しに時刻があれば、それを HH:MM にそろえて使う', () => {
    expect(resolvePeriod('0000', 'テニスコート１', '9:00～10:30')).toEqual({ start: '09:00', end: '10:30' });
  });

  it('プラザ大師（1140）は市民館と同じ時間区分で読む', () => {
    expect(resolvePeriod('1140', '第１・第２学習室合併', '午後')).toEqual({ start: '13:00', end: '17:00' });
    expect(resolvePeriod('1140', '第１・第２学習室合併', '夜間')).toEqual({ start: '17:30', end: '21:00' });
  });

  it('区分が違うホールや、時刻を登録していない館・時間帯はエラーにする', () => {
    expect(() => resolvePeriod('1180', '多目的ホール', '午前')).toThrow('時間帯「午前」の時刻が分かりません（館コード 1180）');
    expect(() => resolvePeriod('5510', '大体育室（全面）', '午後①')).toThrow('時刻が分かりません');
    expect(() => resolvePeriod('1095', '大広間', '午前')).toThrow('時刻が分かりません');
    expect(() => resolvePeriod('1180', '音楽室', '深夜')).toThrow('時刻が分かりません');
  });
});
