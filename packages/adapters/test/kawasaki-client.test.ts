import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { KawasakiClient } from '../src/kawasaki/client';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

/**
 * 実サイトは Shift_JIS で返すので、テストの画面も Shift_JIS のバイト列にして返す。
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

const PERIODS = ['午前', '午後', '夜間'];
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const ROOM_NAMES = ['大ホール', '第１会議室', '第１・第２会議室合併', '視聴覚室', '音楽室'];
const isoOf = (date: Date): string => date.toISOString().slice(0, 10);

/** 指定日から7日間の施設空き状況画面を、実サイトと同じ構造で作る。 */
function renderWeek(room: string, start: string, labelOf: (date: string) => string): string {
  const first = new Date(`${start}T00:00:00Z`);
  const days = Array.from({ length: 7 }, (_, i) => new Date(first.getTime() + i * 86_400_000));
  const dayLabel = (d: Date): string => `${d.getUTCMonth() + 1}月${d.getUTCDate()}日`;
  const head = days
    .map((d) => `<th scope="col" class="rsvakitable3">${dayLabel(d)}<br />${WEEKDAYS[d.getUTCDay()]}曜日</th>`)
    .join('');
  const rows = PERIODS.map((period, row) => {
    const cells = days
      .map((d, col) => {
        const alt = `${dayLabel(d)}${WEEKDAYS[d.getUTCDay()]}曜日${period}${labelOf(isoOf(d))}`;
        return `<td class="rsvakitable"><img src="image/lw_sample.gif" id="${row}_${col}" alt="${alt}"></td>`;
      })
      .join('');
    return `<tr><th scope="row" class="rsvakitable2">${period}<a id="${row}"></a></th>${cells}</tr>`;
  }).join('');
  return `<!DOCTYPE html><html lang="ja"><head><meta charset="Shift_JIS"><title>サンプル市公共施設利用予約システム&nbsp;施設空き状況画面時間帯貸し</title></head><body>
<table class="rsvakitable"><caption><a href="http://www.example.jp/sample.html" target="new_window">サンプル市民館</a>${room}&nbsp;空き状況</caption>
<tr><th scope="row" class="rsvakitable">${first.getUTCFullYear()}年</th>${head}</tr>${rows}</table>
<div id="rsvaki4"><ul><li><img src="image/lw_emptybs_sample.gif" alt="空きのマーク">空き</li></ul></div></body></html>`;
}

interface FakeSiteOptions {
  /** 日付ごとの表示。既定はすべて「空き」 */
  labelOf?: (date: string) => string;
  /** 7日間表示の応答を差し替える（想定外の応答の再現用） */
  week?: (room: string, start: string) => string;
}

/** 自治体サイトの代わりに、決まった画面を Shift_JIS で返す fetch。 */
function fakeSite(options: FakeSiteOptions = {}) {
  const calls: Call[] = [];
  const page = (html: string, headers = new Headers()): Response => {
    headers.set('content-type', 'text/html;charset=Windows-31J');
    return new Response(encodeShiftJis(html), { headers });
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace('/web', '');
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ path, method: init?.method ?? 'GET', body, cookie: new Headers(init?.headers).get('cookie') });
    if (path === '/index.jsp') {
      const headers = new Headers();
      headers.append('set-cookie', 'FJNADDSPID=AbCdEf; expires=Mon, 22-Feb-2027 02:19:42 GMT; path=/');
      headers.append('set-cookie', 'JSESSIONID=abc123.sample_cluster_001; Path=/web; HttpOnly');
      return page('<html><head><title>サンプル市公共施設利用予約システム&nbsp;認証画面</title></head></html>', headers);
    }
    if (path === '/rsvWTransInstSrchInstAction.do') return page(fixture('kawasaki-rooms.html'));
    if (path === '/rsvWInstSrchMonthVacantAction.do') {
      return page('<html><head><title>サンプル市公共施設利用予約システム&nbsp;施設空き状況１ヶ月表示画面</title></head></html>');
    }
    if (path === '/rsvWInstSrchVacantAction.do' && body) {
      const ymd = body.get('srchSelectYMD') ?? '';
      const start = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
      const room = ROOM_NAMES[Number(body.get('srchSelectInstNo'))] ?? '不明';
      return page(options.week?.(room, start) ?? renderWeek(room, start, options.labelOf ?? (() => '空き')));
    }
    return page('<html><head><title>サンプル市公共施設利用予約システム&nbsp;エラー画面</title></head></html>');
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const FACILITY = '14130504-1180';
const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const clientFor = (site: { fetchImpl: typeof fetch }, extra: object = {}) =>
  new KawasakiClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, ...extra });
/** 7日間表示への問い合わせを「部屋の番号@開始日」で並べる。 */
const weekCalls = (calls: Call[]): string[] =>
  calls
    .filter((c) => c.path === '/rsvWInstSrchVacantAction.do')
    .map((c) => `${c.body?.get('srchSelectInstNo')}@${c.body?.get('srchSelectYMD')}`);

describe('KawasakiClient.fetchAvailability', () => {
  it('ログインせずに、施設選択→1ヶ月表示→7日間表示の順で問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-30', to: '2027-01-02' });

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual([
      'GET /index.jsp',
      'POST /rsvWTransInstSrchInstAction.do',
      'POST /rsvWInstSrchMonthVacantAction.do',
      'POST /rsvWInstSrchVacantAction.do',
    ]);
    const [, search, month, week] = site.calls;
    expect(search?.body?.get('selectAreaCd')).toBe('14130504');
    expect(search?.body?.get('selectBldCd')).toBe('1180');
    expect(search?.body?.get('conditionMode')).toBe('1');
    expect(search?.cookie).toBe('FJNADDSPID=AbCdEf; JSESSIONID=abc123.sample_cluster_001');
    expect(month?.body?.get('selectInstNo')).toBe('4');
    expect(Object.fromEntries(week?.body ?? [])).toEqual({
      displayNo: 'prwmn1000',
      dispYY: '2026',
      dispMM: '12',
      dispDD: '30',
      selectYY: '2026',
      selectMM: '12',
      selectDD: '30',
      srchSelectYMD: '20261230',
      srchSelectInstNo: '4',
      transVacantMode: '7',
    });
    for (const call of site.calls) {
      expect(call.body?.has('userId') ?? false).toBe(false);
      expect(call.body?.has('password') ?? false).toBe(false);
      expect(call.body?.has('securityNo') ?? false).toBe(false);
    }
    expect(result.rooms).toEqual([{ key: '4', facility: 'サンプル市民館', room: '音楽室', capacity: null }]);
  });

  it('指定した期間のコマだけを、年またぎも含めて、時刻を付けて返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date === '2027-01-01' ? '休館日' : '空き') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-12-30', to: '2027-01-02' });

    expect([...new Set(result.slots.map((s) => s.date))].sort()).toEqual(['2026-12-30', '2026-12-31', '2027-01-01', '2027-01-02']);
    expect(result.slots.filter((s) => s.date === '2026-12-30')).toEqual([
      { facility: 'サンプル市民館', room: '音楽室', date: '2026-12-30', start: '09:00', end: '12:00', status: 'available', rawLabel: '空き' },
      { facility: 'サンプル市民館', room: '音楽室', date: '2026-12-30', start: '13:00', end: '17:00', status: 'available', rawLabel: '空き' },
      { facility: 'サンプル市民館', room: '音楽室', date: '2026-12-30', start: '17:30', end: '21:00', status: 'available', rawLabel: '空き' },
    ]);
    expect(result.slots.filter((s) => s.date === '2027-01-01').map((s) => s.status)).toEqual(['closed', 'closed', 'closed']);
    expect(result.slots.map((s) => `${s.date} ${s.start}`)).toEqual([...result.slots.map((s) => `${s.date} ${s.start}`)].sort());
    expect(result.coveredThrough).toBe('2027-01-02');
  });

  it('期間が7日を超えるときは7日ごとに分け、部屋ごとに問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['音楽室', '視聴覚室'],
      from: '2026-12-25',
      to: '2027-01-08',
    });

    expect(weekCalls(site.calls)).toEqual(['4@20261225', '4@20270101', '4@20270108', '3@20261225', '3@20270101', '3@20270108']);
    expect(site.calls.filter((c) => c.path === '/rsvWInstSrchMonthVacantAction.do')).toHaveLength(1);
    expect(result.slots).toHaveLength(2 * 15 * 3);
    expect(new Set(result.slots.map((s) => `${s.room} ${s.date} ${s.start}`)).size).toBe(result.slots.length);
    expect(result.coveredThrough).toBe('2027-01-08');
  });

  it('wantsDate が true を返す日のない週は問い合わせず、false の日のコマは返さない', async () => {
    const site = fakeSite();
    const wanted = new Set(['2026-12-26', '2027-01-09']);

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['音楽室'],
      from: '2026-12-25',
      to: '2027-01-14',
      wantsDate: (date) => wanted.has(date),
    });

    expect(weekCalls(site.calls)).toEqual(['4@20261225', '4@20270108']);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-12-26', '2027-01-09']);
  });

  it('受付期間外だけの週に入ったら止め、空き状況が出た最後の日までを返す', async () => {
    const site = fakeSite({ labelOf: (date) => (date <= '2027-03-31' ? '予約あり' : '受付期間外') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-03-22', to: '2027-04-30' });

    expect(weekCalls(site.calls)).toEqual(['4@20270322', '4@20270329', '4@20270405']);
    expect(result.slots).toHaveLength(10 * 3);
    expect(result.slots.at(-1)?.date).toBe('2027-03-31');
    expect(result.slots.some((s) => s.rawLabel === '受付期間外')).toBe(false);
    expect(result.coveredThrough).toBe('2027-03-31');
  });

  it('まだ受付が始まっていない先の期間なら、1回で止めて空の結果を返す', async () => {
    const site = fakeSite({ labelOf: () => '受付期間外' });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-06-01', to: '2027-06-30' });

    expect(weekCalls(site.calls)).toEqual(['4@20270601']);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('利用日の直前が受付期間外でも止めず、その先の空き状況まで取得する', async () => {
    // 今日（2026-11-23）から14日先までは申込期限を過ぎていて受付期間外、という館
    const site = fakeSite({ labelOf: (date) => (date < '2026-12-07' ? '受付期間外' : '空き') });

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2026-11-24', to: '2026-12-10' });

    expect(weekCalls(site.calls)).toEqual(['4@20261124', '4@20261201', '4@20261208']);
    expect(result.slots.find((s) => s.date === '2026-11-24')).toMatchObject({ status: 'not_bookable', rawLabel: '受付期間外' });
    expect(result.slots.find((s) => s.date === '2026-12-07')).toMatchObject({ status: 'available', rawLabel: '空き' });
    expect(result.slots).toHaveLength(17 * 3);
    expect(result.coveredThrough).toBe('2026-12-10');
  });

  it('部屋によって照会できる範囲が違うときは、部屋ごとの範囲までを返す', async () => {
    const site = fakeSite({
      week: (room, start) => renderWeek(room, start, (date) => (date <= (room === '音楽室' ? '2027-01-31' : '2027-02-03') ? '空き' : '受付期間外')),
    });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['音楽室', '視聴覚室'],
      from: '2027-01-29',
      to: '2027-02-20',
    });

    const lastDateOf = (room: string) => result.slots.filter((s) => s.room === room).at(-1)?.date;
    expect(lastDateOf('音楽室')).toBe('2027-01-31');
    expect(lastDateOf('視聴覚室')).toBe('2027-02-03');
    expect(result.coveredThrough).toBe('2027-02-03');
  });

  it('部屋名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['第１音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('部屋「第１音楽室」が見つかりません。候補: 大ホール、第１会議室、第１・第２会議室合併、視聴覚室、音楽室');
    expect(site.calls).toHaveLength(2);
  });

  it('想定外の画面が返ったらエラーにする', async () => {
    const fetchImpl = (async () =>
      new Response(encodeShiftJis('<html><head><title>サンプル市公共施設利用予約システム&nbsp;エラー画面</title></head></html>'))) as typeof fetch;

    await expect(clientFor({ fetchImpl }).listRooms(FACILITY)).rejects.toThrow('想定外の画面です（期待: 施設選択画面 / 実際: サンプル市公共施設利用予約システム エラー画面）');
  });

  it('指定と違う期間の表が返ったらエラーにする', async () => {
    const site = fakeSite({ week: (room) => renderWeek(room, '2026-11-23', () => '空き') });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('指定と違う期間の空き状況が返りました（指定: 2027-01-01 / 実際: 2026-11-23）');
  });

  it('別の部屋の表が返ったらエラーにする', async () => {
    const site = fakeSite({ week: (_room, start) => renderWeek('第１音楽室', start, () => '空き') });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('別の部屋の空き状況が返りました');
  });

  it('時間帯の時刻を登録していない館はエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: '14130502-1095', rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('音楽室 の時間帯「午前」の時刻が分かりません（館コード 1095）');
  });

  it('facilityCode の形式が違えば、問い合わせずにエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: '1180', rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('facilityCode は「地域コード-館コード」の形式で指定してください');
    expect(site.calls).toHaveLength(0);
  });

  it('館コードが 0（地域の全館）なら、問い合わせずにエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: '14130504-0', rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('館コードを指定してください');
    expect(site.calls).toHaveLength(0);
  });

  it('リクエスト数の上限を超えたら止まる', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site, { maxRequests: 3 }).fetchAvailability({ facilityCode: FACILITY, rooms: ['音楽室'], from: '2027-01-01', to: '2027-01-02' }),
    ).rejects.toThrow('リクエスト数の上限（3）に達しました');
    expect(site.calls).toHaveLength(3);
  });

  it('現行システムの終了（2027年3月12日17時）より後は問い合わせない', async () => {
    const site = fakeSite();
    const client = clientFor(site, { now: () => new Date('2027-03-12T08:00:00Z') }); // 日本時間 17:00

    await expect(client.listRooms(FACILITY)).rejects.toThrow('現行システムは2027年3月12日17時で終了しました');
    expect(site.calls).toHaveLength(0);
  });
});

describe('KawasakiClient.listRooms', () => {
  it('館の部屋一覧を、Shift_JIS の画面から読み取って返す', async () => {
    const site = fakeSite();

    const rooms = await clientFor(site).listRooms(FACILITY);

    expect(site.calls.map((c) => `${c.method} ${c.path}`)).toEqual(['GET /index.jsp', 'POST /rsvWTransInstSrchInstAction.do']);
    expect(rooms.map((r) => `${r.key}:${r.facility} ${r.room}`)).toEqual([
      '0:サンプル市民館 大ホール',
      '1:サンプル市民館 第１会議室',
      '2:サンプル市民館 第１・第２会議室合併',
      '3:サンプル市民館 視聴覚室',
      '4:サンプル市民館 音楽室',
    ]);
  });

  it('リクエストの間隔は、既定で3秒空ける', async () => {
    const site = fakeSite();
    const waits: number[] = [];
    const client = clientFor(site, { sleep: async (ms: number) => void waits.push(ms) });

    await client.listRooms(FACILITY);

    expect(waits).toEqual([3000]);
  });
});
