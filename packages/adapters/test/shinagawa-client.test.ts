import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ShinagawaClient } from '../src/shinagawa/client';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/**
 * 実サイトは Shift_JIS（Windows-31J）で返すので、テストの応答も Shift_JIS のバイト列にして返す。
 * Node には Shift_JIS への変換がないため、TextDecoder の逆引き表を作って使う。
 */
const SJIS_BYTES = (() => {
  const decoder = new TextDecoder('shift_jis');
  const table = new Map<string, number[]>();
  for (let lead = 0x81; lead <= 0xfc; lead += 1) {
    if (lead >= 0xa0 && lead <= 0xdf) continue;
    for (let trail = 0x40; trail <= 0xfc; trail += 1) {
      const ch = decoder.decode(Uint8Array.of(lead, trail));
      if (ch.length === 1 && ch !== '�' && !table.has(ch)) table.set(ch, [lead, trail]);
    }
  }
  return table;
})();

function encodeShiftJis(text: string): Uint8Array<ArrayBuffer> {
  const bytes: number[] = [];
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    const mapped = code < 0x80 ? [code] : SJIS_BYTES.get(ch);
    if (!mapped) throw new Error(`Shift_JIS にない文字です: ${ch}`);
    bytes.push(...mapped);
  }
  return Uint8Array.from(bytes);
}

interface Call {
  path: string;
  method: string;
  body: URLSearchParams | null;
  cookie: string | null;
}

const PATH_ROOMS = '/rsvWOpeUnreservedSearchBuildAjaxAction.do';
const PATH_SEARCH = '/rsvWOpeInstSrchVacantAction.do';
const PATH_WEEK = '/rsvWOpeInstSrchVacantAjaxAction.do';
const PERIODS: ReadonlyArray<[number, string, number, number]> = [
  [10, '午前', 900, 1200],
  [20, '午後', 1300, 1630],
  [30, '夜間', 1730, 2130],
];
const ICONS: Record<string, [string, number]> = {
  空き: ['available', 0],
  予約あり: ['full', 210],
  休館日: ['closed', 2],
  受付期間外: ['non-operatingtime', 700],
};
const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

/** 指定日から7日間の週表示の応答を、実サイトと同じ構造で作る。 */
function renderWeek(start: string, labelOf: (date: string) => string): string {
  const first = new Date(`${start}T00:00:00Z`);
  const days = Array.from({ length: 7 }, (_, i) => new Date(first.getTime() + i * 86_400_000));
  const ymd = (d: Date): number => Number(isoOf(d).replaceAll('-', ''));
  return JSON.stringify({
    result: PERIODS.map(([tzoneNo, tzoneName, startTime, endTime]) => ({
      tzoneNo,
      tzoneName,
      timeResult: days.map((d) => {
        const alt = labelOf(isoOf(d));
        const [icon, status] = ICONS[alt] ?? ['unknown', 999];
        return { imgURL: `image/calendar/svg/calendar_${icon}_outline.svg`, rsvNum: 0, selectNum: 0, alt, startTime, endTime, useDay: ymd(d), status };
      }),
    })),
    weekDay: days.map((d) => ({ dispMonth: `${d.getUTCMonth() + 1}月`, dispDay: `${d.getUTCDate()}日`, holidayFlg: 1, useDay: ymd(d) })),
    dayNum: 7,
    lendType: 1,
    title: '時間帯',
    imstRsvMediaFlg: 3,
    equipFg: 0,
  });
}

interface FakeSiteOptions {
  /** 日付ごとの表示。既定はすべて「空き」 */
  labelOf?: (date: string) => string;
  /** 週表示の応答を差し替える（想定外の応答の再現用） */
  week?: (start: string) => string;
  /** ホーム画面を差し替える */
  home?: string;
}

/**
 * 自治体サイトの代わりに、決まった応答を Shift_JIS で返す fetch。
 * 実サイトと同じく、空き状況検索を経ていない週表示の問い合わせにはエラーを返す。
 */
function fakeSite(options: FakeSiteOptions = {}) {
  const calls: Call[] = [];
  let searched = false;
  const respond = (text: string, type: string, headers = new Headers()): Response => {
    headers.set('content-type', `${type};charset=Windows-31J`);
    return new Response(encodeShiftJis(text), { headers });
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace('/shinagawa/web', '');
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ path, method: init?.method ?? 'GET', body, cookie: new Headers(init?.headers).get('cookie') });
    if (path === '/index.jsp') {
      searched = false;
      const headers = new Headers();
      headers.append('set-cookie', 'FJNADDSPID=AbCdEf; path=/');
      headers.append('set-cookie', 'JSESSIONID=abc123.sample_web_instance; Path=/shinagawa/web; HttpOnly; SameSite=Lax');
      return respond(options.home ?? fixture('shinagawa-home.html'), 'text/html', headers);
    }
    if (path === PATH_ROOMS) return respond(fixture('shinagawa-rooms.json'), 'application/json');
    if (path === PATH_SEARCH) {
      searched = true;
      return respond('<html><head><title>サンプル区施設予約システム&nbsp;空き状況画面（施設ごと）</title></head></html>', 'text/html');
    }
    if (path === PATH_WEEK && body && searched) {
      const ymd = body.get('useDay') ?? '';
      const start = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
      return respond(options.week?.(start) ?? renderWeek(start, options.labelOf ?? (() => '空き')), 'application/json');
    }
    return respond('{"ErrManager":{"message":"システム異常が発生しました。"}}', 'application/json');
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const FACILITY = '9100_9010';
const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const clientFor = (site: { fetchImpl: typeof fetch }, extra: object = {}) =>
  new ShinagawaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, ...extra });
/** 週表示への問い合わせを「施設コード@開始日」で並べる。 */
const weekCalls = (calls: Call[]): string[] =>
  calls.filter((c) => c.path === PATH_WEEK).map((c) => `${c.body?.get('instCd')}@${c.body?.get('useDay')}`);

describe('ShinagawaClient.fetchAvailability', () => {
  it('ログインせずに、ホーム→施設一覧→空き状況検索→週表示の順で問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-30', to: '2027-01-02' });

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /index.jsp',
      `POST ${PATH_ROOMS}`,
      `POST ${PATH_SEARCH}`,
      `POST ${PATH_WEEK}`,
    ]);
    const [, rooms, search, week] = site.calls;
    expect(Object.fromEntries(rooms?.body ?? [])).toEqual({ displayNo: 'prwre1000', selectAreaBcd: '9100_9010' });
    expect(rooms?.cookie).toBe('FJNADDSPID=AbCdEf; JSESSIONID=abc123.sample_web_instance');
    expect(Object.fromEntries(search?.body ?? [])).toEqual({
      date: '3',
      daystart: '2026-11-23', // 日本時間の今日
      days: '7',
      dayofweekClearFlg: '1',
      timezoneClearFlg: '1',
      selectAreaBcd: '9100_9010',
      selectIcd: '90100020',
      selectPpsClPpscd: '31000000_31004500',
      displayNo: 'pawab2000',
      displayNoFrm: 'pawab2000',
    });
    expect(Object.fromEntries(week?.body ?? [])).toEqual({
      displayNo: 'prwrc2000',
      useDay: '20261230',
      bldCd: '9010',
      instCd: '90100020',
      transVacantMode: '11',
      clearFlag: '0',
    });
    expect(result.rooms).toEqual([{ key: '90100020', facility: 'サンプル産業センター', room: '音楽室', capacity: null }]);
    expect(result.fetchedAt).toBe('2026-11-23T03:00:00.000Z');
  });

  it('利用者番号やパスワードを送らない', async () => {
    const site = fakeSite();

    await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-30', to: '2027-01-02' });

    const names = site.calls.flatMap((c) => [...(c.body?.keys() ?? [])]);
    expect(names.filter((name) => /user|login|pass|pwd/i.test(name))).toEqual([]);
    expect(site.calls.some((c) => /Login|Attestation/i.test(c.path))).toBe(false);
  });

  it('指定した期間のコマだけを、年またぎも含めて返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date === '2027-01-01' ? '休館日' : date === '2026-12-31' ? '予約あり' : '空き') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-30', to: '2027-01-02' });

    expect(result.slots).toHaveLength(4 * 3);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(result.slots.find((s) => s.date === '2026-12-30' && s.start === '13:00')).toEqual({
      facility: 'サンプル産業センター',
      room: '音楽室',
      date: '2026-12-30',
      start: '13:00',
      end: '16:30',
      status: 'available',
      rawLabel: '空き',
    });
    expect(result.slots.filter((s) => s.date === '2026-12-31').map((s) => s.status)).toEqual(['reserved', 'reserved', 'reserved']);
    expect(result.slots.filter((s) => s.date === '2027-01-01').map((s) => s.rawLabel)).toEqual(['休館日', '休館日', '休館日']);
    expect(result.coveredThrough).toBe('2027-01-02');
  });

  it('期間が7日を超えるときは、7日ごとに分けて問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-01', to: '2026-12-20' });

    expect(weekCalls(site.calls)).toEqual(['90100020@20261201', '90100020@20261208', '90100020@20261215']);
    expect(result.slots).toHaveLength(20 * 3);
    expect(new Set(result.slots.map((s) => `${s.date} ${s.start}`)).size).toBe(result.slots.length);
    expect(result.slots.every((s) => s.date >= '2026-12-01' && s.date <= '2026-12-20')).toBe(true);
    expect(result.coveredThrough).toBe('2026-12-20');
  });

  it('複数の部屋は、施設を指定せずに検索してから部屋ごとに週表示を取る', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['音楽室', '和室＜全面＞'],
      from: '2026-12-01',
      to: '2026-12-10',
    });

    expect(site.calls.find((c) => c.path === PATH_SEARCH)?.body?.get('selectIcd')).toBe('0');
    expect(site.calls.filter((c) => c.path === PATH_SEARCH)).toHaveLength(1);
    expect(weekCalls(site.calls)).toEqual(['90100020@20261201', '90100020@20261208', '90100030@20261201', '90100030@20261208']);
    expect(result.rooms.map((r) => r.room)).toEqual(['音楽室', '和室＜全面＞']);
    expect(result.slots.filter((s) => s.room === '音楽室')).toHaveLength(10 * 3);
    expect(result.slots.filter((s) => s.room === '和室＜全面＞')).toHaveLength(10 * 3);
  });

  it('受付が始まっていない先の期間に入ったら、そこで止めて受付期間外の日を返さない', async () => {
    const site = fakeSite({ labelOf: (date) => (date <= '2027-03-31' ? '空き' : '受付期間外') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-03-18', to: '2027-05-31' });

    // 3/18〜24、3/25〜31、4/1〜7（全コマ受付期間外）で止まる
    expect(weekCalls(site.calls)).toEqual(['90100020@20270318', '90100020@20270325', '90100020@20270401']);
    expect(result.slots).toHaveLength(14 * 3);
    expect(result.slots.some((s) => s.rawLabel === '受付期間外')).toBe(false);
    expect(result.slots.at(-1)?.date).toBe('2027-03-31');
    expect(result.coveredThrough).toBe('2027-03-31');
  });

  it('照会できる範囲の終わりが週の途中にあるときは、最後に照会できた日までを返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date <= '2027-03-31' ? '空き' : '受付期間外') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-03-29', to: '2027-04-30' });

    expect(weekCalls(site.calls)).toEqual(['90100020@20270329', '90100020@20270405']);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2027-03-29', '2027-03-30', '2027-03-31']);
    expect(result.coveredThrough).toBe('2027-03-31');
  });

  it('最初から受付が始まっていない期間なら、1回の問い合わせで空の結果を返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date <= '2027-03-31' ? '空き' : '受付期間外') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-06-01', to: '2027-06-30' });

    expect(weekCalls(site.calls)).toEqual(['90100020@20270601']);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('当日の受付期間外は、そのまま予約申込対象外のコマとして返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date === '2026-11-23' ? '受付期間外' : '空き') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-11-23', to: '2026-11-25' });

    expect(result.slots.filter((s) => s.date === '2026-11-23').map((s) => s.status)).toEqual(['not_bookable', 'not_bookable', 'not_bookable']);
    expect(result.slots.filter((s) => s.date === '2026-11-24').map((s) => s.status)).toEqual(['available', 'available', 'available']);
    expect(result.coveredThrough).toBe('2026-11-25');
  });

  it('利用日の直前が受付期間外の館でも、近い週なら先の週まで確かめる', async () => {
    // 今日（11/23）から14日間は申込期限を過ぎていて受付期間外、という館
    const site = fakeSite({ labelOf: (date) => (date < '2026-12-07' ? '受付期間外' : '空き') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-11-23', to: '2026-12-13' });

    expect(weekCalls(site.calls)).toEqual(['90100020@20261123', '90100020@20261130', '90100020@20261207']);
    expect(result.slots).toHaveLength(21 * 3);
    expect(result.slots.filter((s) => s.status === 'not_bookable')).toHaveLength(14 * 3);
    expect(result.coveredThrough).toBe('2026-12-13');
  });

  it('部屋名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['大ホール'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('部屋「大ホール」が見つかりません。候補: 大会議室、音楽室、和室＜全面＞');
    expect(site.calls).toHaveLength(2);
  });

  it('館コードがホーム画面の選択肢になければエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: '9100_9999', rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('館コード 9100_9999 がホーム画面の選択肢にありません');
    expect(site.calls).toHaveLength(1);
  });

  it('facilityCode の形式が違えば、問い合わせずにエラーにする', async () => {
    const site = fakeSite();
    const client = clientFor(site);

    for (const facilityCode of ['9010', '9100-9010', '9100_0', '']) {
      await expect(client.fetchAvailability({ facilityCode, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' })).rejects.toThrow(
        'facilityCode は「地域コード_館コード」の形式で指定してください',
      );
    }
    expect(site.calls).toHaveLength(0);
  });

  it('日付の指定が不正なら、問い合わせずにエラーにする', async () => {
    const site = fakeSite();
    const client = clientFor(site);

    await expect(client.fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-10', to: '2027-01-02' })).rejects.toThrow(
      'to は from 以降の日付にしてください',
    );
    await expect(client.fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027/01/01', to: '2027-01-02' })).rejects.toThrow(
      '日付は YYYY-MM-DD 形式で指定してください',
    );
    expect(site.calls).toHaveLength(0);
  });

  it('想定外の画面が返ったらエラーにする', async () => {
    const site = fakeSite({ home: '<html><head><title>サンプル区施設予約システム&nbsp;エラー画面</title></head></html>' });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('想定外の画面です（期待: ホーム画面 / 実際: サンプル区施設予約システム エラー画面）');
    expect(site.calls).toHaveLength(1);
  });

  it('週表示でサイトがエラーを返したら、その内容でエラーにする', async () => {
    const site = fakeSite({ week: () => '{"ErrManager":{"message":"システム異常が発生しました。"}}' });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-20' }),
    ).rejects.toThrow('サイトがエラーを返しました: システム異常が発生しました。');
    expect(weekCalls(site.calls)).toHaveLength(1);
  });

  it('指定と違う期間が返ったら、取り違えないようにエラーにする', async () => {
    const site = fakeSite({ week: () => renderWeek('2026-11-23', () => '空き') });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('指定と違う期間の空き状況が返りました（指定: 2027-01-01 / 実際: 2026-11-23）');
  });

  it('部屋を指定しなければ、検索も週表示も送らずに空の結果を返す', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: [], from: '2027-01-01', to: '2027-01-02' });

    expect(site.calls).toHaveLength(2);
    expect(result).toMatchObject({ rooms: [], slots: [], coveredThrough: null });
  });

  it('リクエストの間隔を空ける', async () => {
    const site = fakeSite();
    const waits: number[] = [];

    await clientFor(site, { sleep: async (ms: number) => void waits.push(ms), minIntervalMs: 2000 }).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['音楽室'],
      from: '2026-12-01',
      to: '2026-12-10',
    });

    expect(waits).toEqual([2000, 2000, 2000, 2000]);
  });

  it('リクエスト数の上限を超えたら止まる', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site, { maxRequests: 4 }).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-01', to: '2026-12-31' }),
    ).rejects.toThrow('リクエスト数の上限（4）に達しました');
    expect(site.calls).toHaveLength(4);
  });

  it('夜間（0時〜5時）は問い合わせない', async () => {
    const site = fakeSite();
    const client = clientFor(site, { now: () => new Date('2026-11-22T18:00:00Z') }); // 日本時間 3:00

    await expect(client.fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' })).rejects.toThrow('受付時間外');
    expect(site.calls).toHaveLength(0);
  });
});

describe('ShinagawaClient.listRooms', () => {
  it('館の部屋一覧を、Shift_JIS の応答から読み取って返す', async () => {
    const site = fakeSite();

    const rooms = await clientFor(site).listRooms(FACILITY);

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /index.jsp', `POST ${PATH_ROOMS}`]);
    expect(rooms).toEqual([
      { key: '90100010', facility: 'サンプル産業センター', room: '大会議室', capacity: null },
      { key: '90100020', facility: 'サンプル産業センター', room: '音楽室', capacity: null },
      { key: '90100030', facility: 'サンプル産業センター', room: '和室＜全面＞', capacity: null },
    ]);
  });

  it('呼ぶたびに Cookie を捨てて、新しい訪問としてやり直す', async () => {
    const site = fakeSite();
    const client = clientFor(site);

    await client.listRooms(FACILITY);
    await client.listRooms(FACILITY);

    expect(site.calls.filter((c) => c.path === '/index.jsp').map((c) => c.cookie)).toEqual([null, null]);
  });
});

describe('ShinagawaClient', () => {
  it('台帳の adapterId と表示名を持つ', () => {
    const client = new ShinagawaClient();

    expect(client.id).toBe('shinagawa');
    expect(client.label).toBe('品川区 施設予約システム');
  });
});
