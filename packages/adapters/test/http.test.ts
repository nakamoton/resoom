import { describe, expect, it } from 'vitest';
import { PoliteSession, addDays, formatIsoDate, parseIsoDate, type SiteProfile } from '../src/http';

const SITE: SiteProfile = { origin: 'https://example.test', name: 'テストサイト' };
const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00

interface Sent {
  url: string;
  method: string;
  headers: Headers;
  body: string | null;
}

/** 決まった応答を順に返す fetch。送られたリクエストを記録する。 */
function fakeFetch(responses: Array<Response | (() => Response)>) {
  const sent: Sent[] = [];
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    sent.push({
      url: String(input),
      method: init?.method ?? 'GET',
      headers: new Headers(init?.headers),
      body: typeof init?.body === 'string' ? init.body : null,
    });
    const next = responses[Math.min(sent.length - 1, responses.length - 1)];
    if (!next) throw new Error('応答が用意されていません');
    return typeof next === 'function' ? next() : next.clone();
  }) as typeof fetch;
  return { sent, fetchImpl };
}

const quiet = { now: noon, sleep: async () => {} };

describe('PoliteSession', () => {
  it('GET の本文とパスを返す', async () => {
    const { sent, fetchImpl } = fakeFetch([new Response('こんにちは')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    expect(await session.request('/top')).toEqual({ status: 200, path: '/top', text: 'こんにちは' });
    expect(sent[0]).toMatchObject({ url: 'https://example.test/top', method: 'GET', body: null });
  });

  it('フォームは POST で送る', async () => {
    const { sent, fetchImpl } = fakeFetch([new Response('ok')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    await session.request('/search', { form: new URLSearchParams({ q: '音楽室' }) });

    expect(sent[0]?.method).toBe('POST');
    expect(sent[0]?.headers.get('content-type')).toBe('application/x-www-form-urlencoded');
    expect(new URLSearchParams(sent[0]?.body ?? '').get('q')).toBe('音楽室');
  });

  it('JSON は POST で送る', async () => {
    const { sent, fetchImpl } = fakeFetch([new Response('{}')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    await session.request('/api', { json: { room: 1 } });

    expect(sent[0]?.headers.get('content-type')).toBe('application/json');
    expect(sent[0]?.body).toBe('{"room":1}');
  });

  it('受け取った Cookie を次のリクエストで送り、clearCookies で捨てる', async () => {
    const withCookie = () => {
      const headers = new Headers();
      headers.append('set-cookie', 'SID=abc; Path=/; HttpOnly');
      headers.append('set-cookie', 'secure;HttpOnly');
      return new Response('1', { headers });
    };
    const { sent, fetchImpl } = fakeFetch([withCookie, new Response('2'), new Response('3')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    await session.request('/a');
    await session.request('/b');
    session.clearCookies();
    await session.request('/c');

    expect(sent.map((s) => s.headers.get('cookie'))).toEqual([null, 'SID=abc', null]);
  });

  it('同じサイト内のリダイレクトを、Cookie を保ったまま GET でたどる', async () => {
    const redirect = () => {
      const headers = new Headers({ location: '/menu/Welcome.cgi' });
      headers.append('set-cookie', 'SID=xyz; Path=/');
      return new Response(null, { status: 302, headers });
    };
    const { sent, fetchImpl } = fakeFetch([redirect, new Response('着いた')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    const res = await session.request('/login', { form: new URLSearchParams({ a: '1' }) });

    expect(res).toEqual({ status: 200, path: '/menu/Welcome.cgi', text: '着いた' });
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      'POST https://example.test/login',
      'GET https://example.test/menu/Welcome.cgi',
    ]);
    expect(sent[1]?.headers.get('cookie')).toBe('SID=xyz');
    expect(sent[1]?.body).toBeNull();
  });

  it('別のサイトへのリダイレクトはたどらない', async () => {
    const { sent, fetchImpl } = fakeFetch([new Response(null, { status: 302, headers: { location: 'https://evil.test/' } })]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    await expect(session.request('/a')).rejects.toThrow('別のサイトへのリダイレクト');
    expect(sent).toHaveLength(1);
  });

  it('200番台以外はエラーにする', async () => {
    const { fetchImpl } = fakeFetch([new Response('ng', { status: 503 })]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl });

    await expect(session.request('/a')).rejects.toThrow('テストサイト /a: HTTP 503');
  });

  it('指定した文字コードで本文を読む', async () => {
    const shiftJis = new Uint8Array([0x89, 0xb9, 0x8a, 0x79]); // 「音楽」
    const { fetchImpl } = fakeFetch([() => new Response(shiftJis)]);
    const session = new PoliteSession({ ...SITE, encoding: 'shift_jis' }, { ...quiet, fetchImpl });

    expect((await session.request('/a')).text).toBe('音楽');
  });

  it('2件目以降は、前のリクエストから最小間隔が空くまで待つ', async () => {
    const { fetchImpl } = fakeFetch([new Response('ok')]);
    const waits: number[] = [];
    const session = new PoliteSession(SITE, { now: noon, sleep: async (ms) => void waits.push(ms), fetchImpl, minIntervalMs: 3000 });

    await session.request('/a');
    await session.request('/b');
    await session.request('/c');

    expect(waits).toEqual([3000, 3000]);
  });

  it('リクエスト数の上限を超えたら送らない', async () => {
    const { sent, fetchImpl } = fakeFetch([new Response('ok')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl, maxRequests: 2 });

    await session.request('/a');
    await session.request('/b');

    await expect(session.request('/c')).rejects.toThrow('リクエスト数の上限（2）に達しました');
    expect(sent).toHaveLength(2);
  });

  it('残りのリクエスト数が分かる', async () => {
    const { fetchImpl } = fakeFetch([new Response('ok')]);
    const session = new PoliteSession(SITE, { ...quiet, fetchImpl, maxRequests: 3 });

    expect(session.remainingRequests).toBe(3);
    await session.request('/a');
    await session.request('/b');
    expect(session.remainingRequests).toBe(1);
  });

  it.each([
    ['2026-11-22T16:59:00Z', true], // 日本時間 1:59
    ['2026-11-22T17:00:00Z', false], // 2:00
    ['2026-11-22T19:59:00Z', false], // 4:59
    ['2026-11-22T20:00:00Z', true], // 5:00
  ])('停止時間帯（2時〜5時）の %s', async (iso, open) => {
    const { sent, fetchImpl } = fakeFetch([new Response('ok')]);
    const session = new PoliteSession({ ...SITE, closedHours: { from: 2, to: 5 } }, { fetchImpl, now: () => new Date(iso), sleep: async () => {} });

    if (open) await expect(session.request('/a')).resolves.toMatchObject({ status: 200 });
    else await expect(session.request('/a')).rejects.toThrow('テストサイトの受付時間外です');
    expect(sent).toHaveLength(open ? 1 : 0);
  });

  it.each([
    ['2026-11-22T14:30:00Z', false], // 日本時間 23:30
    ['2026-11-22T21:30:00Z', false], // 6:30
    ['2026-11-22T22:00:00Z', true], // 7:00
  ])('日付をまたぐ停止時間帯（23時〜7時）の %s', async (iso, open) => {
    const { fetchImpl } = fakeFetch([new Response('ok')]);
    const session = new PoliteSession({ ...SITE, closedHours: { from: 23, to: 7 } }, { fetchImpl, now: () => new Date(iso), sleep: async () => {} });

    if (open) await expect(session.request('/a')).resolves.toMatchObject({ status: 200 });
    else await expect(session.request('/a')).rejects.toThrow('受付時間外');
  });
});

describe('日付の補助関数', () => {
  it('YYYY-MM-DD を読み書きし、日数を足せる', () => {
    expect(formatIsoDate(addDays(parseIsoDate('2026-12-30'), 3))).toBe('2027-01-02');
  });

  it.each(['2027-02-30', '2027/01/01', '27-01-01', ''])('不正な日付 %s はエラー', (value) => {
    expect(() => parseIsoDate(value)).toThrow('YYYY-MM-DD');
  });
});
