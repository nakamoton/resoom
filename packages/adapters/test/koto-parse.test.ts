import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { parseDay, parseMessage, parseTitle } from '../src/koto/parse';

const fixture = (name: string): string => readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('江東区: 施設空き状況画面（時間帯貸し）', () => {
  const page = parseDay(fixture('koto-day.html'));

  it('表示している日と、移動に使う値を読む', () => {
    expect(page.date).toBe('2026-11-28');
    expect([page.selectBldNo, page.srchSelectInstNo]).toEqual(['5', '0']);
  });

  it('部屋ごとに午前・午後・夜間の状態を読む', () => {
    expect(page.rooms.find((r) => r.name === 'ＡＶ・ホール')).toEqual({
      name: 'ＡＶ・ホール',
      key: '1050030',
      cells: [
        { status: 'reserved', rawLabel: '予約あり' },
        { status: 'reserved', rawLabel: '予約あり' },
        { status: 'reserved', rawLabel: '予約あり' },
      ],
    });
    expect(page.rooms.find((r) => r.name === '第１研修室')?.cells.map((c) => c.status)).toEqual(['available', 'reserved', 'available']);
  });

  it('「音出予約」（alt が空で画像だけ）は予約ありとして読む', () => {
    expect(page.rooms.find((r) => r.name === '第１会議室')?.cells).toEqual([
      { status: 'reserved', rawLabel: '音出予約' },
      { status: 'reserved', rawLabel: '音出予約' },
      { status: 'available', rawLabel: '空き' },
    ]);
  });

  it('館の全部屋（音楽スタジオは2時間ごとの6コマ）を読む', () => {
    expect(page.rooms).toHaveLength(18);
    expect(page.rooms.find((r) => r.name === '音楽スタジオ')?.cells).toHaveLength(6);
  });

  it('題名を読む', () => {
    expect(parseTitle(fixture('koto-day.html'))).toContain('施設空き状況画面時間帯貸し');
  });
});

describe('江東区: メッセージ画面', () => {
  it('順路の誤りのメッセージを読む', () => {
    const html = '<html><head><title></title></head><body>公益財団法人江東区文化コミュニティ財団 〔メッセージ通知〕 &nbsp; 遷移情報に誤りがあります。&lt;BR&gt;再度、認証を行って下さい。 このページではJavaScriptを使用しています</body></html>';
    expect(parseMessage(html)).toBe('遷移情報に誤りがあります。 再度、認証を行って下さい。');
    expect(parseMessage(fixture('koto-day.html'))).toBeNull();
  });
});
