import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShibuyaClient } from '../src/shibuya/client';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const FRAMES = '/api/reservations/facilities/room_areas/reservable_frames';
const FACILITY = 'サンプル文化センター（練習室）';
const ROOM_NAMES: Record<number, string> = { 90011: '第一練習室', 90012: '第二練習室', 90013: '屋外広場' };

interface FramesBody {
  use_type_code?: string;
  facility_id?: number;
  room_area_id?: number;
  use_month?: string;
  use_date?: string;
  start_time?: string;
  end_time?: string;
}

interface Call {
  method: string;
  /** パスとクエリ */
  path: string;
  body: FramesBody | null;
  xsrf: string | null;
  cookie: string | null;
}

/** 部屋ID → 日付（YYYY-MM-DD）→ 空きコマ（開始, 終了）。 */
type Vacancies = Record<number, Record<string, [string, string][]>>;

const envelope = (content: unknown): string => JSON.stringify({ messages: [], errors: [], warns: [], content });
const slash = (date: string): string => date.replaceAll('-', '/');

/** from〜to の毎日に同じ空きコマを置く。 */
function everyDay(from: string, to: string, frames: [string, string][]): Record<string, [string, string][]> {
  const days: Record<string, [string, string][]> = {};
  for (let d = new Date(`${from}T00:00:00Z`); d <= new Date(`${to}T00:00:00Z`); d = new Date(d.getTime() + 86_400_000)) {
    days[d.toISOString().slice(0, 10)] = frames;
  }
  return days;
}

/**
 * 自治体サイトの代わりに、決まったJSONを返す fetch。
 * 実サイトと同じく、空きのある日・空いているコマだけを返す。利用月の一覧にない先の月を聞かれても、
 * 実サイトと同じように（抽選前のコマを空きとして）答える。
 */
function fakeSite(options: { vacancies?: Vacancies; months?: string[]; override?: (call: Call) => Response | undefined } = {}) {
  const calls: Call[] = [];
  const vacancies = options.vacancies ?? {};
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    const body = init?.body ? (JSON.parse(String(init.body)) as FramesBody) : null;
    const call: Call = {
      method: init?.method ?? 'GET',
      path: `${url.pathname}${url.search}`,
      body,
      xsrf: headers.get('x-xsrf-token'),
      cookie: headers.get('cookie'),
    };
    calls.push(call);
    const overridden = options.override?.(call);
    if (overridden) return overridden;

    const json = (text: string): Response => new Response(text, { headers: { 'content-type': 'application/json' } });
    if (url.pathname === '/api/csrf') {
      const res = new Headers({ 'content-type': 'application/json' });
      res.append('set-cookie', 'AWSALB=lb+1/abc=; Expires=Mon, 30 Nov 2026 02:00:00 GMT; Path=/');
      res.append('set-cookie', 'XSRF-TOKEN=tok-1; Path=/;Secure');
      return new Response(JSON.stringify({ token: 'tok-1', parameter_name: '_csrf', header_name: 'X-XSRF-TOKEN' }), { headers: res });
    }
    if (url.pathname === '/api/use_types/facilities/reservation') return json(fixture('shibuya-facilities.json'));
    if (url.pathname === '/api/reservations/facilities/90001/room_areas') return json(fixture('shibuya-rooms.json'));
    if (url.pathname === '/api/reservations/facilities/reservable_month') {
      return json(options.months ? envelope(options.months.map(slash)) : fixture('shibuya-months.json'));
    }
    if (url.pathname === FRAMES && call.method === 'POST' && body) {
      const roomIds = body.room_area_id === undefined ? Object.keys(vacancies).map(Number) : [body.room_area_id];
      if (body.use_date === '') {
        // 月の照会: 空きのある日だけを、新しい順に返す
        const dates = new Set<string>();
        for (const id of roomIds) {
          for (const date of Object.keys(vacancies[id] ?? {})) if (slash(date).startsWith(`${body.use_month}/`)) dates.add(date);
        }
        const stubs = [...dates].sort().reverse().map((date) => ({
          use_date: slash(date),
          facility_id: null,
          facility_name: null,
          reservable: false,
          room_area_id: null,
          room_area_name: null,
          reservable_frames: null,
          reservable_period: false,
        }));
        return json(envelope(stubs));
      }
      // 日の照会: 空いているコマだけを、部屋ごとに返す
      const date = (body.use_date ?? '').replaceAll('/', '-');
      const entries = roomIds
        .filter((id) => (vacancies[id]?.[date] ?? []).length > 0)
        .map((id) => ({
          use_date: body.use_date,
          facility_id: 90001,
          facility_name: FACILITY,
          reservable: true,
          tel: '00-0000-0000',
          room_area_id: id,
          room_area_name: ROOM_NAMES[id],
          reservable_frames: (vacancies[id]?.[date] ?? []).map(([start, end], i) => ({
            id: 800 + i,
            start_time: start,
            end_time: end,
            room_area_code_names: null,
            usage_fee: 1000,
            vacancy_amount: 1,
          })),
          reservable_period: true,
        }));
      return json(envelope(entries));
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const frameCalls = (calls: Call[]): string[] =>
  calls
    .filter((c) => c.path === FRAMES)
    .map((c) => `${c.body?.use_date || c.body?.use_month}${c.body?.room_area_id === undefined ? '' : ` room=${c.body.room_area_id}`}`);
const newClient = (site: { fetchImpl: typeof fetch }, extra: { maxRequests?: number } = {}): ShibuyaClient =>
  new ShibuyaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, ...extra });

describe('ShibuyaClient.fetchAvailability', () => {
  it('ログインせずに、トークン取得→施設→部屋→利用月→月の照会→日の照会の順で問い合わせる', async () => {
    const site = fakeSite({ vacancies: { 90011: { '2027-01-16': [['9:00', '12:00']] } } });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-10',
      to: '2027-01-20',
    });

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/csrf',
      'GET /api/use_types/facilities/reservation?code=900010',
      'GET /api/reservations/facilities/90001/room_areas?code=900010',
      'GET /api/reservations/facilities/reservable_month?code=900010&facility_id=90001',
      `POST ${FRAMES}`,
      `POST ${FRAMES}`,
    ]);
    const [csrf, facilities, , , month, day] = site.calls;
    // トークンは最初の応答で受け取り、以降のリクエストに Cookie とヘッダーの両方で付ける
    expect(csrf?.xsrf).toBeNull();
    expect(csrf?.cookie).toBeNull();
    expect(facilities?.xsrf).toBe('tok-1');
    expect(facilities?.cookie).toBe('AWSALB=lb+1/abc=; XSRF-TOKEN=tok-1');
    expect(month?.xsrf).toBe('tok-1');
    expect(month?.body).toEqual({
      use_type_code: '900010',
      facility_id: 90001,
      room_area_id: 90011,
      use_month: '2027/01',
      use_date: '',
      start_time: '',
      end_time: '',
    });
    expect(day?.body).toEqual({
      use_type_code: '900010',
      facility_id: 90001,
      room_area_id: 90011,
      use_month: '2027/01',
      use_date: '2027/01/16',
      start_time: '',
      end_time: '',
    });
    // ログインや申込みのAPIには触れない
    expect(site.calls.some((c) => /login|account|keep|apply|lotter/.test(c.path))).toBe(false);
    expect(result.rooms).toEqual([{ key: '90011', facility: FACILITY, room: '第一練習室', capacity: 60 }]);
    expect(result.slots).toEqual([
      { facility: FACILITY, room: '第一練習室', date: '2027-01-16', start: '09:00', end: '12:00', status: 'available', rawLabel: '空き時間' },
    ]);
    expect(result.coveredThrough).toBe('2027-01-20');
    expect(result.fetchedAt).toBe('2026-11-23T03:00:00.000Z');
  });

  it('目的コードを省いた施設コードは、器楽（120010）で照会する', async () => {
    const site = fakeSite();
    const client = newClient(site);

    await client.fetchAvailability({ facilityCode: '90001', rooms: ['第一練習室'], from: '2027-01-10', to: '2027-01-20' });

    expect(site.calls[1]?.path).toBe('/api/use_types/facilities/reservation?code=120010');
    expect(site.calls[2]?.path).toBe('/api/reservations/facilities/90001/room_areas?code=120010');
    expect(site.calls[4]?.body?.use_type_code).toBe('120010');
  });

  it('指定した期間のコマだけを返し、空きのない日は問い合わせない', async () => {
    const site = fakeSite({
      vacancies: {
        90011: {
          '2027-01-09': [['9:00', '12:00']],
          '2027-01-10': [['18:00', '22:00'], ['9:00', '12:00']],
          '2027-01-20': [['13:00', '17:00']],
          '2027-01-21': [['13:00', '17:00']],
        },
      },
    });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-10',
      to: '2027-01-20',
    });

    expect(frameCalls(site.calls)).toEqual(['2027/01 room=90011', '2027/01/10 room=90011', '2027/01/20 room=90011']);
    expect(result.slots.map((s) => `${s.date} ${s.start}-${s.end}`)).toEqual([
      '2027-01-10 09:00-12:00',
      '2027-01-10 18:00-22:00',
      '2027-01-20 13:00-17:00',
    ]);
    expect(result.coveredThrough).toBe('2027-01-20');
  });

  it('wantsDate が false を返す日は、問い合わせも結果も省く', async () => {
    const site = fakeSite({
      vacancies: {
        90011: {
          '2027-01-15': [['9:00', '12:00']], // 金
          '2027-01-16': [['13:00', '17:00']], // 土
          '2027-01-17': [['13:00', '17:00']], // 日
          '2027-01-23': [['18:00', '22:00']], // 土
        },
      },
    });
    const client = newClient(site);
    const isSaturday = (date: string): boolean => new Date(`${date}T00:00:00Z`).getUTCDay() === 6;

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-01',
      to: '2027-01-31',
      wantsDate: isSaturday,
    });

    expect(frameCalls(site.calls)).toEqual(['2027/01 room=90011', '2027/01/16 room=90011', '2027/01/23 room=90011']);
    expect(result.slots.map((s) => s.date)).toEqual(['2027-01-16', '2027-01-23']);
    expect(result.coveredThrough).toBe('2027-01-31');
  });

  it('期間が月をまたぐときは、月ごとに分けて問い合わせる', async () => {
    const site = fakeSite({
      vacancies: { 90011: { '2026-12-28': [['9:00', '12:00']], '2027-01-04': [['9:00', '12:00']], '2027-02-11': [['9:00', '12:00']] } },
    });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2026-12-15',
      to: '2027-02-10',
    });

    expect(frameCalls(site.calls)).toEqual([
      '2026/12 room=90011',
      '2026/12/28 room=90011',
      '2027/01 room=90011',
      '2027/01/04 room=90011',
      '2027/02 room=90011',
    ]);
    expect(result.slots.map((s) => s.date)).toEqual(['2026-12-28', '2027-01-04']);
    expect(result.coveredThrough).toBe('2027-02-10');
  });

  it('複数の部屋は、月の照会を部屋ごとに、日の照会を施設全体で1回ずつ送る', async () => {
    const site = fakeSite({
      vacancies: {
        90011: { '2027-01-16': [['9:00', '12:00']], '2027-01-23': [['13:00', '17:00']] },
        90012: { '2027-01-16': [['9:00', '12:00']], '2027-01-17': [['18:00', '22:00']] },
        90013: { '2027-01-16': [['9:00', '12:00']], '2027-01-18': [['9:00', '12:00']] },
      },
    });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第二練習室', '第一練習室'],
      from: '2027-01-01',
      to: '2027-01-31',
    });

    // 頼んでいない部屋（屋外広場）だけが空いている 1/18 は問い合わせない
    expect(frameCalls(site.calls)).toEqual(['2027/01 room=90012', '2027/01 room=90011', '2027/01/16', '2027/01/17', '2027/01/23']);
    expect(result.rooms.map((r) => r.room)).toEqual(['第二練習室', '第一練習室']);
    // 日付順、同じ日の中は指定した部屋の順
    expect(result.slots.map((s) => `${s.date} ${s.room} ${s.start}`)).toEqual([
      '2027-01-16 第二練習室 09:00',
      '2027-01-16 第一練習室 09:00',
      '2027-01-17 第二練習室 18:00',
      '2027-01-23 第一練習室 13:00',
    ]);
    expect(new Set(result.slots.map((s) => `${s.date} ${s.room} ${s.start}`)).size).toBe(result.slots.length);
  });

  it('画面が選ばせない先の月は、APIが答えるとしても問い合わせず、そこまでで止める', async () => {
    const site = fakeSite({
      months: ['2026-11', '2026-12', '2027-01', '2027-02'],
      vacancies: { 90011: { '2027-02-27': [['9:00', '12:00']], ...everyDay('2027-03-01', '2027-04-30', [['9:00', '12:00']]) } },
    });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-02-01',
      to: '2027-04-30',
    });

    expect(frameCalls(site.calls)).toEqual(['2027/02 room=90011', '2027/02/27 room=90011']);
    expect(result.slots.map((s) => s.date)).toEqual(['2027-02-27']);
    expect(result.coveredThrough).toBe('2027-02-28');
  });

  it('最初から照会できない先の期間なら、空の結果を返す', async () => {
    const site = fakeSite({ vacancies: { 90011: everyDay('2027-06-01', '2027-06-30', [['9:00', '12:00']]) } });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-06-01',
      to: '2027-06-30',
    });

    expect(site.calls).toHaveLength(4);
    expect(frameCalls(site.calls)).toEqual([]);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('過去の月から始まる期間は、照会できる最初の月から問い合わせる', async () => {
    const site = fakeSite({ vacancies: { 90011: { '2026-11-27': [['18:00', '22:00']] } } });
    const client = newClient(site);

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2026-10-01',
      to: '2026-11-30',
    });

    expect(frameCalls(site.calls)).toEqual(['2026/11 room=90011', '2026/11/27 room=90011']);
    expect(result.slots.map((s) => s.date)).toEqual(['2026-11-27']);
    expect(result.coveredThrough).toBe('2026-11-30');
  });

  it('リクエスト数の上限に届いたら、取得できた日までを返す', async () => {
    const site = fakeSite({ vacancies: { 90011: everyDay('2027-01-05', '2027-01-25', [['9:00', '12:00']]) } });
    // 準備4回 + 月の照会1回 + 日の照会3回
    const client = newClient(site, { maxRequests: 8 });

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-01',
      to: '2027-02-28',
    });

    expect(site.calls).toHaveLength(8);
    expect(result.slots.map((s) => s.date)).toEqual(['2027-01-05', '2027-01-06', '2027-01-07']);
    expect(result.coveredThrough).toBe('2027-01-07');
  });

  it('月の照会を送る余裕がなければ、前の月までを返す', async () => {
    const site = fakeSite({ vacancies: { 90011: { '2027-01-05': [['9:00', '12:00']], '2027-02-05': [['9:00', '12:00']] } } });
    // 準備4回 + 1月の照会1回 + 日の照会1回で使い切る
    const client = newClient(site, { maxRequests: 6 });

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-01',
      to: '2027-02-28',
    });

    expect(site.calls).toHaveLength(6);
    expect(result.slots.map((s) => s.date)).toEqual(['2027-01-05']);
    expect(result.coveredThrough).toBe('2027-01-31');
  });

  it('1日も取得できないまま上限に届いたら、coveredThrough は null になる', async () => {
    const site = fakeSite({ vacancies: { 90011: { '2027-01-01': [['9:00', '12:00']] } } });
    const client = newClient(site, { maxRequests: 5 });

    const result = await client.fetchAvailability({
      facilityCode: '90001:900010',
      rooms: ['第一練習室'],
      from: '2027-01-01',
      to: '2027-01-31',
    });

    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('準備の途中でリクエスト数の上限を超えたら止まる', async () => {
    const site = fakeSite();
    const client = newClient(site, { maxRequests: 3 });

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('リクエスト数の上限（3）に達しました');
    expect(site.calls).toHaveLength(3);
  });

  it('部屋名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['大ホール'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('部屋「大ホール」が見つかりません。候補: 第一練習室、第二練習室、屋外広場');
    expect(site.calls).toHaveLength(3);
  });

  it('その目的で照会できない施設なら、候補を示してエラーにする', async () => {
    const site = fakeSite();
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '12345:900010', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('施設ID 12345 は目的コード 900010 では照会できません。候補: 90001=サンプル文化センター（練習室）、7=サンプル社会教育館');
    expect(site.calls).toHaveLength(2);
  });

  it('施設コードの形式が違えば、問い合わせずにエラーにする', async () => {
    const site = fakeSite();
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: 'owada', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('施設コードは「施設ID」または「施設ID:目的コード」の形式で指定してください: owada');
    expect(site.calls).toHaveLength(0);
  });

  it('JSONでない応答（メンテナンス画面など）が返ったらエラーにする', async () => {
    const site = fakeSite({
      override: (call) =>
        call.path.startsWith('/api/reservations/facilities/reservable_month')
          ? new Response('<html><body><h1 align="center">【システムメンテナンス中です】</h1></body></html>')
          : undefined,
    });
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('想定外の応答です（利用月一覧: JSONではありません）');
  });

  it('照会した日と違う日のコマが返ったらエラーにする', async () => {
    const site = fakeSite({
      vacancies: { 90011: { '2027-01-16': [['9:00', '12:00']] } },
      override: (call) =>
        call.body?.use_date === '2027/01/16' ? new Response(fixture('shibuya-day-frames.json').replaceAll('2027/01/16', '2027/01/15')) : undefined,
    });
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-31' }),
    ).rejects.toThrow('2027-01-16 を照会したのに 2027-01-15 が返りました');
  });

  it('サイトが認証エラー（403）を返したらエラーにする', async () => {
    const site = fakeSite({
      override: (call) => (call.path === FRAMES ? new Response('<html>sorry</html>', { status: 403 }) : undefined),
    });
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('HTTP 403');
  });

  it('to が from より前ならエラーにする', async () => {
    const site = fakeSite();
    const client = newClient(site);

    await expect(
      client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-02', to: '2027-01-01' }),
    ).rejects.toThrow('to は from 以降の日付にしてください');
    expect(site.calls).toHaveLength(0);
  });

  it('リクエストの間隔を空ける', async () => {
    const site = fakeSite({ vacancies: { 90011: { '2027-01-16': [['9:00', '12:00']] } } });
    const waits: number[] = [];
    const client = new ShibuyaClient({
      fetchImpl: site.fetchImpl,
      now: noon,
      sleep: async (ms) => void waits.push(ms),
      minIntervalMs: 2000,
    });

    await client.fetchAvailability({ facilityCode: '90001:900010', rooms: ['第一練習室'], from: '2027-01-10', to: '2027-01-20' });

    expect(waits).toEqual([2000, 2000, 2000, 2000, 2000]);
  });
});

describe('ShibuyaClient.listRooms', () => {
  it('トークン取得→施設→部屋の順で問い合わせ、部屋の一覧を返す', async () => {
    const site = fakeSite();
    const client = newClient(site);

    const rooms = await client.listRooms('90001:900010');

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /api/csrf',
      'GET /api/use_types/facilities/reservation?code=900010',
      'GET /api/reservations/facilities/90001/room_areas?code=900010',
    ]);
    expect(rooms).toEqual([
      { key: '90011', facility: FACILITY, room: '第一練習室', capacity: 60 },
      { key: '90012', facility: FACILITY, room: '第二練習室', capacity: 8 },
      { key: '90013', facility: FACILITY, room: '屋外広場', capacity: null },
    ]);
  });

  it('トークンを受け取れなければエラーにする', async () => {
    const site = fakeSite({
      override: (call) => (call.path === '/api/csrf' ? new Response('<!doctype html><html><body><div id="root"></div></body></html>') : undefined),
    });
    const client = newClient(site);

    await expect(client.listRooms('90001:900010')).rejects.toThrow('想定外の応答です（CSRFトークン: JSONではありません）');
    expect(site.calls).toHaveLength(1);
  });
});
