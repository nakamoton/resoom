import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { dayStatus, parseDayView, parseFacilityList, parseForm, parseTimeView } from '../src/setagaya/parse';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

describe('parseForm', () => {
  it('送信先と、ブラウザが送るのと同じ項目を取り出す', () => {
    const form = parseForm(fixture('setagaya-top.html'));

    expect(form.action).toBe('/Web/Home/WgR_ModeSelect');
    expect(form.fields).toEqual([
      ['__RequestVerificationToken', 'TOKEN+top/abc=='],
      ['__EVENTTARGET', ''],
      ['__EVENTARGUMENT', ''],
      ['radioPurposeLarge', '01'],
      ['radioShisetsuLarge', '01'],
      ['shisetsuNameTxt', ''],
      ['dummy', ''],
    ]);
  });

  it('ボタン、無効な項目、チェックのない選択肢は送らない', () => {
    const names = parseForm(fixture('setagaya-top.html')).fields.map(([name]) => name);

    expect(names).not.toContain('command');
    expect(names).not.toContain('doui');
    expect(names).not.toContain('checkPurposeMiddle');
  });

  it('ダイアログの中の項目は送らない（ブラウザではフォームの外へ移される）', () => {
    expect(parseForm(fixture('setagaya-top.html')).fields.map(([name]) => name)).not.toContain('kiyaku');
    expect(parseForm(fixture('setagaya-days.html')).fields.map(([name]) => name)).not.toContain('spinnerStayDays');
  });

  it('チェック済みの選択肢と、選ばれているラジオボタンを送る', () => {
    const fields = parseForm(fixture('setagaya-days.html')).fields;

    expect(fields.filter(([name]) => name === 'checkdate')).toEqual([['checkdate', '2026123000101   0']]);
    expect(fields.filter(([name]) => name === 'radioPeriod')).toEqual([['radioPeriod', '1週間']]);
    expect(fields).toContainEqual(['hyoujiOpenCloseFlg', 'close']);
  });

  it('select と textarea の値を送る', () => {
    const html = `<form id="form1" action="/Web/X"><select name="s"><option value="a">A</option><option value="b" selected>B</option></select>
      <select name="t"><option value="x">X</option></select><textarea name="memo">メモ</textarea></form>`;

    expect(parseForm(html).fields).toEqual([
      ['s', 'b'],
      ['t', 'x'],
      ['memo', 'メモ'],
    ]);
  });

  it('フォームがない画面では、送信先を空にする', () => {
    expect(parseForm('<html><body>エラー</body></html>')).toEqual({ action: '', fields: [] });
  });
});

describe('parseFacilityList', () => {
  it('施設コードと施設名を取り出す', () => {
    expect(parseFacilityList(fixture('setagaya-facilities.html'))).toEqual({
      facilities: [
        { code: '999001', name: 'サンプル区民センター' },
        { code: '999002', name: 'サンプル区民センター別館' },
      ],
      hasMore: false,
    });
  });

  it('「さらに読み込む」があれば、続きがあると分かる', () => {
    const html = fixture('setagaya-facilities.html').replace('</table>', '</table><div id="nextpage"><a href="#">さらに読み込む</a></div>');

    expect(parseFacilityList(html).hasMore).toBe(true);
  });

  it('施設の表がない画面では空の配列を返す', () => {
    expect(parseFacilityList('<html><body>エラー</body></html>')).toEqual({ facilities: [], hasMore: false });
  });
});

describe('parseDayView', () => {
  const view = parseDayView(fixture('setagaya-days.html'));
  const row = (room: string) => view.rows.find((r) => r.room === room);

  it('年をまたぐ表示では、日が小さくなったところから翌月・翌年として扱う', () => {
    expect(view.dates).toEqual(['2026-12-29', '2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02', '2027-01-03']);
  });

  it('部屋名・部屋コード・定員・施設名を取り出す', () => {
    expect(view.rows.map((r) => ({ facility: r.facility, room: r.room, key: r.key, capacity: r.capacity }))).toEqual([
      { facility: 'サンプル区民センター', room: '第１音楽室', key: '00101', capacity: 30 },
      { facility: 'サンプル区民センター', room: '第２音楽室', key: '00102', capacity: 30 },
      { facility: 'サンプル区民センター', room: '和室', key: '和室', capacity: null },
    ]);
  });

  it('表の途中に入る見出し行は部屋として数えない', () => {
    expect(view.rows).toHaveLength(3);
  });

  it('日ごとの記号と、選択用の値を取り出す', () => {
    expect(row('第１音楽室')?.cells).toEqual([
      { date: '2026-12-29', symbol: '○', value: '2026122900101   0' },
      { date: '2026-12-30', symbol: '△', value: '2026123000101   0' },
      { date: '2026-12-31', symbol: '休館', value: null },
      { date: '2027-01-01', symbol: '休館', value: null },
      { date: '2027-01-02', symbol: '×', value: '2027010200101   0' },
      { date: '2027-01-03', symbol: '－', value: null },
    ]);
    expect(row('第２音楽室')?.cells.map((c) => c.symbol)).toEqual(['×', '○', '休館', '休館', '＊', '－']);
  });

  it('1回に選べるマスの数を読む', () => {
    expect(view.maxSelect).toBe(10);
  });

  it('見出しの日付と選択用の値が食い違えばエラーにする', () => {
    const broken = fixture('setagaya-days.html').replace('2026122900101   0', '2026122800101   0');

    expect(() => parseDayView(broken)).toThrow('見出しの日付と選択肢の値');
  });

  it('日付の列数とマスの列数が合わなければエラーにする', () => {
    const broken = fixture('setagaya-days.html').replace('<td class="closed"><label>＊</label></td>', '');

    expect(() => parseDayView(broken)).toThrow('第２音楽室: 日付の列数とマスの列数が合いません');
  });

  it('施設別空き状況の画面でなければエラーにする', () => {
    expect(() => parseDayView(fixture('setagaya-times.html'))).toThrow('施設別空き状況の画面ではありません');
    expect(() => parseDayView('<html><body>別の画面</body></html>')).toThrow('施設別空き状況の画面ではありません');
  });
});

describe('parseTimeView', () => {
  const slots = parseTimeView(fixture('setagaya-times.html'));
  const find = (room: string, date: string, start: string) =>
    slots.find((s) => s.room === room && s.date === date && s.start === start);

  it('部屋×日×コマの数だけ結果を返す', () => {
    expect(slots).toHaveLength(5 + 2);
  });

  it('施設名・部屋名・日付を付け、時刻を HH:MM にそろえる', () => {
    expect(find('第１音楽室', '2026-12-29', '09:00')).toEqual({
      facility: 'サンプル区民センター',
      room: '第１音楽室',
      date: '2026-12-29',
      start: '09:00',
      end: '12:00',
      status: 'reserved',
      rawLabel: '×',
    });
    expect(find('第２音楽室', '2027-01-04', '13:00')).toMatchObject({ end: '17:00', status: 'available', rawLabel: '○' });
  });

  it('記号を状態に対応づける', () => {
    expect(find('第１音楽室', '2026-12-29', '12:30')).toMatchObject({ status: 'available', rawLabel: '○' });
    expect(find('第１音楽室', '2026-12-29', '15:00')).toMatchObject({ status: 'not_bookable', rawLabel: '－' });
  });

  it('アイコンで示される「取消処理中」は、凡例の文言を残して予約申込対象外とする', () => {
    expect(find('第１音楽室', '2026-12-29', '17:30')).toMatchObject({ status: 'not_bookable', rawLabel: '取消処理中' });
  });

  it('知らない記号は unknown とし、元の表示を残す', () => {
    expect(find('第１音楽室', '2026-12-29', '20:00')).toMatchObject({ status: 'unknown', rawLabel: '☆' });
  });

  it('表ごとに違う時間帯の区切りを、そのまま読む', () => {
    expect(slots.filter((s) => s.room === '第２音楽室').map((s) => `${s.start}-${s.end}`)).toEqual(['09:00-12:00', '13:00-17:00']);
  });

  it('時間帯別空き状況の画面でなければエラーにする', () => {
    expect(() => parseTimeView(fixture('setagaya-days.html'))).toThrow('時間帯別空き状況の画面ではありません');
    expect(() => parseTimeView('<html><body>別の画面</body></html>')).toThrow('時間帯別空き状況の画面ではありません');
  });
});

describe('dayStatus', () => {
  it('日単位の記号を状態に対応づける', () => {
    expect(dayStatus('×')).toBe('reserved');
    expect(dayStatus('休館')).toBe('closed');
    expect(dayStatus('－')).toBe('not_bookable');
    expect(dayStatus('＊')).toBe('unavailable');
    expect(dayStatus('？')).toBe('unknown');
  });
});
