import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { OtaClient, assertServiceHours } from '../src/ota/client';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

interface Call {
  path: string;
  method: string;
  body: URLSearchParams | null;
  cookie: string | null;
}

/** 開始日から31日分の空き照会画面を、実サイトと同じ構造で作る。 */
function renderAvailability(start: string): string {
  const first = new Date(`${start}T00:00:00Z`);
  const days = Array.from({ length: 31 }, (_, i) => new Date(first.getTime() + i * 86_400_000));
  const head = days
    .map((d) => `<th><p class="day">${d.getUTCMonth() + 1}<span>月</span>${d.getUTCDate()}<span>日</span></p></th>`)
    .join('');
  const cells = days
    .map(() => '<td><img src="../img/std/common/icn_scche_ok.png" alt="空いています" /></td>')
    .join('');
  const [year, month, day] = start.split('-');
  return `<html><head><title>公共施設予約システム（予約対象区分選択）</title></head><body>
<input type="hidden" name="optYear" value="${year}" /><input type="hidden" name="optMonth" value="${month}" />
<input type="hidden" name="optDay" value="${day}" />
<h3><a href="#">サンプル会館</a></h3><div class="box_order"><ul class="box_schedule">
<li><div class="box_title"><h4>第一音楽スタジオ</h4></div><table class="box_calendar"><tbody>
<tr class="date"><th class="th_sticky"></th>${head}</tr>
<tr><th class="th_sticky">13:00 - 17:00</th>${cells}</tr>
</tbody></table></li></ul></div></body></html>`;
}

/**
 * 自治体サイトの代わりに、決まった画面を返す fetch。
 * lastStart より後の開始日を指定されると、実サイトと同じく直前の表示をそのまま返す。
 */
function fakeSite(options: { lastStart?: string } = {}) {
  const calls: Call[] = [];
  let displayed = '2026-11-23';
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace('/eshisetsu', '');
    const headers = new Headers(init?.headers);
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ path, method: init?.method ?? 'GET', body, cookie: headers.get('cookie') });
    if (path === '/menu/Welcome.cgi') {
      const res = new Headers({ 'content-type': 'text/html' });
      res.append('set-cookie', 'JSESSIONID=abc123; Path=/eshisetsu; Secure; HttpOnly');
      res.append('set-cookie', 'secure;HttpOnly;SameSite=Lax');
      return new Response('<html><head><title>公共施設予約システム（トップページ）</title></head></html>', { headers: res });
    }
    if (path === '/menu/Login.cgi') return new Response(fixture('ota-rooms.html'));
    if (path === '/yoyaku/CalendarStatusSelect.cgi' && body) {
      const requested = `${body.get('optYear')}-${body.get('optMonth')}-${body.get('optDay')}`;
      if (!options.lastStart || requested <= options.lastStart) displayed = requested;
    }
    return new Response(renderAvailability(displayed));
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const calendarStarts = (calls: Call[]): string[] =>
  calls
    .filter((c) => c.path === '/yoyaku/CalendarStatusSelect.cgi')
    .map((c) => `${c.body?.get('optYear')}-${c.body?.get('optMonth')}-${c.body?.get('optDay')}`);

describe('OtaClient.fetchAvailability', () => {
  it('ログインせずに、会館検索→部屋選択→31日間表示の順で問い合わせる', async () => {
    const site = fakeSite();
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    const result = await client.fetchAvailability({
      facilityCode: '999999_001_01',
      rooms: ['第一音楽スタジオ'],
      from: '2026-12-30',
      to: '2027-01-02',
    });

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /menu/Welcome.cgi',
      'POST /menu/Login.cgi',
      'POST /yoyaku/ShisetsuMultiSelect.cgi',
      'POST /yoyaku/CalendarStatusSelect.cgi',
    ]);
    const [, search, select, calendar] = site.calls;
    expect(search?.body?.get('chkSearchItemsKaikan')).toBe('999999_001_01');
    expect(search?.body?.get('loginBtn')).toBe('1');
    expect(search?.body?.has('txtPassWord')).toBe(false);
    expect(search?.cookie).toBe('JSESSIONID=abc123');
    expect(select?.body?.getAll('checkMeisaiUniqKey')).toEqual(['999999_001_01_03_01']);
    expect(calendar?.body?.get('radioshow')).toBe('month');
    expect(calendarStarts(site.calls)).toEqual(['2026-12-30']);
    expect(result.rooms).toEqual([
      { key: '999999_001_01_03_01', facility: 'サンプル会館', room: '第一音楽スタジオ', capacity: 50 },
    ]);
  });

  it('指定した期間のコマだけを、年またぎも含めて返す', async () => {
    const site = fakeSite();
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    const result = await client.fetchAvailability({
      facilityCode: '999999_001_01',
      rooms: ['第一音楽スタジオ'],
      from: '2026-12-30',
      to: '2027-01-02',
    });

    expect(result.slots.map((s) => s.date)).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(result.coveredThrough).toBe('2027-01-02');
  });

  it('期間が31日を超えるときは、31日ごとに分けて問い合わせる', async () => {
    const site = fakeSite();
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    const result = await client.fetchAvailability({
      facilityCode: '999999_001_01',
      rooms: ['第一音楽スタジオ'],
      from: '2027-01-01',
      to: '2027-03-31',
    });

    expect(calendarStarts(site.calls)).toEqual(['2027-01-01', '2027-02-01', '2027-03-04']);
    expect(result.slots).toHaveLength(31 + 28 + 31);
    expect(new Set(result.slots.map((s) => s.date)).size).toBe(result.slots.length);
    expect(result.coveredThrough).toBe('2027-03-31');
  });

  it('サイトが先の期間を表示しないときは、そこで止めて重複を返さない', async () => {
    const site = fakeSite({ lastStart: '2027-01-31' });
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    const result = await client.fetchAvailability({
      facilityCode: '999999_001_01',
      rooms: ['第一音楽スタジオ'],
      from: '2027-01-01',
      to: '2027-03-31',
    });

    expect(calendarStarts(site.calls)).toEqual(['2027-01-01', '2027-02-01']);
    expect(result.slots).toHaveLength(31);
    expect(result.coveredThrough).toBe('2027-01-31');
  });

  it('最初から表示されない期間なら、空の結果を返す', async () => {
    const site = fakeSite({ lastStart: '2027-01-31' });
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    const result = await client.fetchAvailability({
      facilityCode: '999999_001_01',
      rooms: ['第一音楽スタジオ'],
      from: '2027-06-01',
      to: '2027-06-30',
    });

    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('部屋名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {} });

    await expect(
      client.fetchAvailability({ facilityCode: '999999_001_01', rooms: ['大ホール'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('部屋「大ホール」が見つかりません。候補: リハーサル室、体育室、第一音楽スタジオ');
    expect(site.calls).toHaveLength(2);
  });

  it('想定外の画面が返ったらエラーにする', async () => {
    const fetchImpl = (async () =>
      new Response('<html><head><title>公共施設予約システム（エラー）</title></head></html>')) as typeof fetch;
    const client = new OtaClient({ fetchImpl, now: noon, sleep: async () => {} });

    await expect(client.listRooms('999999_001_01')).rejects.toThrow('想定外の画面です');
  });

  it('リクエストの間隔を空ける', async () => {
    const site = fakeSite();
    const waits: number[] = [];
    const client = new OtaClient({
      fetchImpl: site.fetchImpl,
      now: noon,
      sleep: async (ms) => void waits.push(ms),
      minIntervalMs: 2000,
    });

    await client.listRooms('999999_001_01');

    expect(waits).toEqual([2000]);
  });

  it('リクエスト数の上限を超えたら止まる', async () => {
    const site = fakeSite();
    const client = new OtaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, maxRequests: 3 });

    await expect(
      client.fetchAvailability({ facilityCode: '999999_001_01', rooms: ['第一音楽スタジオ'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('リクエスト数の上限（3）に達しました');
    expect(site.calls).toHaveLength(3);
  });

  it('受付時間外は問い合わせない', async () => {
    const site = fakeSite();
    const client = new OtaClient({
      fetchImpl: site.fetchImpl,
      now: () => new Date('2026-11-22T18:00:00Z'), // 日本時間 3:00
      sleep: async () => {},
    });

    await expect(client.listRooms('999999_001_01')).rejects.toThrow('受付時間外');
    expect(site.calls).toHaveLength(0);
  });
});

describe('assertServiceHours', () => {
  it.each([
    ['2026-11-22T16:59:00Z', true], // 日本時間 1:59
    ['2026-11-22T17:00:00Z', false], // 2:00
    ['2026-11-22T19:59:00Z', false], // 4:59
    ['2026-11-22T20:00:00Z', true], // 5:00
  ])('%s', (iso, ok) => {
    const run = () => assertServiceHours(new Date(iso));
    if (ok) expect(run).not.toThrow();
    else expect(run).toThrow();
  });
});
