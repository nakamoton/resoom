import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { SetagayaClient } from '../src/setagaya/client';

const fixture = (name: string): string =>
  readFileSync(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

const TOP = '/Web/Home/WgR_ModeSelect';
const SEARCH = '/Web/Yoyaku/WgR_ShisetsuKensaku';
const DAYS = '/Web/Yoyaku/WgR_ShisetsubetsuAkiJoukyou';
const TIMES = '/Web/Yoyaku/WgR_JikantaibetsuAkiJoukyou';

const FACILITY = 'サンプル区民センター';
const ROOMS = [
  { code: '00101', name: '第１音楽室', info: '（定員30）' },
  { code: '00102', name: '第２音楽室', info: '（定員30）' },
  { code: '00103', name: '和室', info: '（21畳）' },
];
const TIME_HEADS = ['9:00<span>～</span>12:00', '13:00<span>～</span>17:00', '18:00<span>～</span>22:00'];
/** 日単位の記号ごとの、コマ単位の表示。 */
const SLOT_SYMBOLS: Record<string, string[]> = { '○': ['○', '○', '○'], '△': ['○', '×', '○'], '×': ['×', '×', '×'] };

interface Call {
  path: string;
  method: string;
  body: URLSearchParams | null;
  cookie: string | null;
}

interface SiteOptions {
  /** 受付期間の最後の日。これより先は「－」になる */
  lastBookable?: string;
  /** 休館日 */
  closed?: string[];
  /** 日単位の記号を決める（受付期間内・開館日のみ）。既定は日付で決まる ○・△・× */
  daySymbol?: (room: string, date: string) => string;
  /** 表示開始日の指定を無視して、今日からの表示を返し続ける */
  ignoreDate?: boolean;
  /** 時間帯別空き状況の代わりに返す画面 */
  timesPage?: string;
}

const iso = (d: Date): string => d.toISOString().slice(0, 10);
const utc = (date: string): Date => new Date(`${date}T00:00:00Z`);
const compact = (date: string): string => date.replaceAll('-', '');

function formHead(action: string, token: string): string {
  return `<form action="${action}" id="form1" method="post">
<input name="__RequestVerificationToken" type="hidden" value="${token}" />
<input type="hidden" name="__EVENTTARGET" id="__EVENTTARGET" value="" />
<input type="hidden" name="__EVENTARGUMENT" id="__EVENTARGUMENT" value="" />`;
}

/** 自治体サイトの代わりに、実サイトと同じ構造の画面を返す fetch。今日は 2026-11-23。 */
function fakeSite(options: SiteOptions = {}) {
  const today = '2026-11-23';
  const lastBookable = options.lastBookable ?? '2027-01-31';
  const closed = new Set(options.closed ?? []);
  const calls: Call[] = [];
  let view = { start: today, count: 14 };
  let selected: string[] = [];

  const symbolOf = (room: string, date: string): string => {
    if (closed.has(date)) return '休館';
    if (date > lastBookable) return '－';
    if (options.daySymbol) return options.daySymbol(room, date);
    const day = Number(date.slice(8));
    return day % 4 === 0 ? '×' : day % 4 === 1 ? '○' : '△';
  };

  /** 施設別空き状況。見出しには日だけが並び、部屋2つごとに見出し行がもう一度入る。 */
  const renderDays = (): string => {
    const dates = Array.from({ length: view.count }, (_, i) => iso(new Date(utc(view.start).getTime() + i * 86_400_000)));
    const headRow = `<tr><th class="shisetsu"><ul class="pagination"><li class="month">${Number(view.start.slice(0, 4))}年${Number(view.start.slice(5, 7))}月</li></ul></th>${dates
      .map((d) => `<th class="day "><span>${Number(d.slice(8))}</span><span class="week">月</span></th>`)
      .join('')}</tr>`;
    let id = 0;
    const rows = ROOMS.map((room, index) => {
      const cells = dates
        .map((date) => {
          id += 1;
          const symbol = symbolOf(room.name, date);
          if (symbol === '休館') return '<td class="closed chars2"><label>休館</label></td>';
          if (symbol === '－' || symbol === '＊') return `<td class="closed"><label>${symbol}</label></td>`;
          const value = `${compact(date)}${room.code}   0`;
          const checked = selected.includes(value) ? 'checked' : '';
          return `<td><input type="checkbox" name="checkdate" id="checkdate${id}" value="${value}" ${checked} ><label for="checkdate${id}" class="switch-off">${symbol}</label></td>`;
        })
        .join('');
      return `${index === 2 ? headRow : ''}<tr><td class="shisetsu">\n${room.name}\n\n<span class="info">${room.info}</span></td>${cells}</tr>`;
    }).join('\n');
    const [y, m, d] = view.start.split('-');
    return `<html><head><title>けやきネット</title><script type="text/javascript">var maxCnt = 10;</script></head><body>
${formHead(DAYS, 'TOKEN+days/abc==')}
<input type="text" name="textDate" value="${y}/${Number(m)}/${Number(d)}" id="dpStartDate" />
<input type="radio" name="radioPeriod" value="1週間" /><input type="radio" name="radioPeriod" value="2週間" ${view.count === 14 ? 'checked' : ''}/><input type="radio" name="radioPeriod" value="1ヶ月" ${view.count === 14 ? '' : 'checked'}/>
<input type="radio" name="radioDisplay" value="false" checked/><input type="radio" name="radioDisplay" value="true" />
<input type="radio" name="radioJikan" value="am" /><input type="radio" name="radioJikan" value="all" checked/>
<input type="checkbox" name="checkYobi" value="sat" />
<input id="btnHyoji" type="button" onclick="__doPostBack('hyouji','');" value="表示">
<div class="item_body"><div class="item clearfix">
<h3><a href="javascript:void(0)">${FACILITY}</a><span class="info">《サンプル児童館併設》</span></h3>
<div class="scroll-div clearfix"><table class="calendar horizon toggle"><thead>${headRow}</thead><tbody>
${rows}
</tbody></table></div></div></div>
<input type="hidden" name="staydate" id="staydate" value="" />
<input type="hidden" name="hyoujiOpenCloseFlg" id="hyoujiOpenCloseFlg" value="close"/>
<div class="remodal stay"><input type="text" name="spinnerStayDays" value="0"></div>
</form></body></html>`;
  };

  /** 時間帯別空き状況。選ばれたマス（部屋×日）ごとに表が1つ。 */
  const renderTimes = (): string => {
    const tables = selected
      .map((value) => {
        const date = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
        const room = ROOMS.find((r) => r.code === value.slice(8, 13));
        if (!room) return '';
        const symbols = SLOT_SYMBOLS[symbolOf(room.name, date)] ?? [];
        const cells = symbols
          .map((s, i) =>
            s === '○'
              ? `<td><input type="checkbox" name="checktime" id="checktime${i}" value="${room.code}${compact(date)}  x"  ><label for="checktime${i}" class="switch-off">○</label></td>`
              : `<td class=" readonly"><label>${s}</label></td>`,
          )
          .join('');
        const heading = `${Number(date.slice(0, 4))}年${Number(date.slice(5, 7))}月${Number(date.slice(8))}日(月)`;
        return `<h4>\n${room.name}<span class="info">${room.info}</span></h4>
<div class="scroll-div clearfix"><table class="calendar horizon toggle"><thead><tr><th class="shisetsu">${heading}</th>${TIME_HEADS.map((t) => `<th>${t}</th>`).join('')}</tr></thead>
<tbody><tr ><td class="shisetsu">${room.name}</td>${cells}</tr></tbody></table></div>`;
      })
      .join('\n');
    return `<html><head><title>けやきネット</title></head><body>
${formHead(TIMES, 'TOKEN+times/abc==')}
<div class="example clearfix"><ul><li><span>○</span>空きあり</li><li><span>×</span>空きなし</li><li><span>－</span>申込対象外</li><li><span><i class="fa fa-refresh"></i></span>取消処理中</li></ul></div>
<div class="item_body"><div class="item clearfix"><h3><a href="javascript:void(0)">\n${FACILITY}\n</a><span class="info">《サンプル児童館併設》</span></h3>
${tables}
</div></div></form></body></html>`;
  };

  const redirect = (location: string, cookie?: string): Response => {
    const headers = new Headers({ location });
    if (cookie) headers.append('set-cookie', cookie);
    return new Response('<html><head><title>Object moved</title></head></html>', { status: 302, headers });
  };

  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const url = new URL(String(input));
    const path = `${url.pathname}${url.search}`;
    const method = init?.method ?? 'GET';
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ path, method, body, cookie: new Headers(init?.headers).get('cookie') });
    const target = body?.get('__EVENTTARGET') ?? '';

    if (method === 'GET') {
      if (path === '/Web/') return redirect('https://setagaya.keyakinet.net/Web/?CookieCheck=true', 'ASP.NET_SessionId=sess1; path=/; HttpOnly');
      if (path === '/Web/?CookieCheck=true') return redirect(TOP);
      if (path === TOP) {
        const headers = new Headers({ 'content-type': 'text/html; charset=utf-8' });
        headers.append('set-cookie', '__RequestVerificationToken_L1dlYg__=ck+tok/en==; path=/; HttpOnly');
        return new Response(fixture('setagaya-top.html'), { headers });
      }
      if (path === SEARCH) return new Response(fixture('setagaya-facilities.html'));
      if (path === DAYS) return new Response(renderDays());
      if (path === TIMES) return new Response(options.timesPage ?? renderTimes());
    } else if (body) {
      if (path === TOP && target === 'searchShisetsuName') return redirect(SEARCH);
      if (path === SEARCH && target === 'next') {
        view = { start: today, count: 14 };
        selected = [];
        return redirect(DAYS);
      }
      if (path === DAYS && target === 'hyouji') {
        if (!options.ignoreDate) {
          const start = utc((body.get('textDate') ?? '').replaceAll('/', '-'));
          // 「1ヶ月」は、開始日から翌月の同じ日の前日まで
          const count = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 0)).getUTCDate();
          view = { start: iso(start), count };
        }
        selected = [];
        return new Response(renderDays());
      }
      if (path === DAYS && target === 'next') {
        selected = body.getAll('checkdate');
        return redirect(TIMES);
      }
      if (path === TIMES && target === 'back') return redirect(DAYS);
    }
    return new Response('<html><head><title>けやきネット</title></head><body>エラーが発生しました。</body></html>');
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const steps = (calls: Call[]): string[] =>
  calls.map((c) => `${c.method} ${c.path}${c.body ? ` [${c.body.get('__EVENTTARGET')}]` : ''}`);
const shown = (calls: Call[]): (string | null)[] =>
  calls.filter((c) => c.body?.get('__EVENTTARGET') === 'hyouji').map((c) => c.body?.get('textDate') ?? null);
const picked = (calls: Call[]): string[][] =>
  calls.filter((c) => c.path === DAYS && c.body?.get('__EVENTTARGET') === 'next').map((c) => c.body?.getAll('checkdate') ?? []);

function clientFor(site: { fetchImpl: typeof fetch }, extra: { maxRequests?: number } = {}): SetagayaClient {
  return new SetagayaClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, ...extra });
}

describe('SetagayaClient.fetchAvailability', () => {
  it('ログインせずに、入口→施設名検索→施設選択→1か月表示→時間帯別の順で問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2026-12-03',
    });

    expect(steps(site.calls)).toEqual([
      'GET /Web/',
      'GET /Web/?CookieCheck=true',
      `GET ${TOP}`,
      `POST ${TOP} [searchShisetsuName]`,
      `GET ${SEARCH}`,
      `POST ${SEARCH} [next]`,
      `GET ${DAYS}`,
      `POST ${DAYS} [hyouji]`,
      `POST ${DAYS} [next]`,
      `GET ${TIMES}`,
    ]);
    const [, , , search, , select, , show, next] = site.calls;
    expect(search?.body?.get('shisetsuNameTxt')).toBe(FACILITY);
    expect(search?.body?.get('__RequestVerificationToken')).toBe('TOKEN+top/abc==');
    expect(search?.body?.get('__EVENTARGUMENT')).toBe('');
    expect(search?.cookie).toBe('ASP.NET_SessionId=sess1; __RequestVerificationToken_L1dlYg__=ck+tok/en==');
    expect(select?.body?.getAll('checkShisetsu')).toEqual(['999001']);
    expect(select?.body?.get('__RequestVerificationToken')).toBe('TOKEN+search/abc==');
    expect(show?.body?.get('textDate')).toBe('2026/12/01');
    expect(show?.body?.get('radioPeriod')).toBe('1ヶ月');
    expect(show?.body?.get('radioDisplay')).toBe('false');
    expect(show?.body?.get('radioJikan')).toBe('all');
    expect(show?.body?.has('checkdate')).toBe(false);
    expect(next?.body?.getAll('checkdate')).toEqual(['2026120100102   0', '2026120200102   0', '2026120300102   0']);
    expect(result.rooms).toEqual([{ key: '00102', facility: FACILITY, room: '第２音楽室', capacity: 30 }]);
  });

  it('利用者IDやパスワードは送らず、ログインや申込の画面には進まない', async () => {
    const site = fakeSite();

    await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['第２音楽室'], from: '2026-12-01', to: '2026-12-20' });

    const targets = new Set(site.calls.map((c) => c.body?.get('__EVENTTARGET')).filter((t) => t != null));
    expect([...targets].sort()).toEqual(['back', 'hyouji', 'next', 'searchShisetsuName']);
    const names = new Set(site.calls.flatMap((c) => (c.body ? [...c.body.keys()] : [])));
    expect([...names].filter((n) => /pass|user|login|riyosha|checktime/i.test(n))).toEqual([]);
    // 「次へ進む」を送るのは施設検索と施設別空き状況だけ（時間帯別空き状況の先は詳細申請）
    expect(site.calls.filter((c) => c.path === TIMES && c.method === 'POST').map((c) => c.body?.get('__EVENTTARGET'))).toEqual(['back']);
  });

  it('指定した期間のコマだけを、時刻をそろえて返す', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2026-12-03',
    });

    expect(result.slots).toHaveLength(3 * 3);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-12-01', '2026-12-02', '2026-12-03']);
    expect(result.slots.filter((s) => s.date === '2026-12-02')).toEqual([
      { facility: FACILITY, room: '第２音楽室', date: '2026-12-02', start: '09:00', end: '12:00', status: 'available', rawLabel: '○' },
      { facility: FACILITY, room: '第２音楽室', date: '2026-12-02', start: '13:00', end: '17:00', status: 'reserved', rawLabel: '×' },
      { facility: FACILITY, room: '第２音楽室', date: '2026-12-02', start: '18:00', end: '22:00', status: 'available', rawLabel: '○' },
    ]);
    expect(result.coveredThrough).toBe('2026-12-03');
    expect(result.fetchedAt).toBe('2026-11-23T03:00:00.000Z');
  });

  it('空きのない日と休館日は時間帯別の画面を開かず、近い日の時間帯の区切りで埋める', async () => {
    const site = fakeSite({ closed: ['2026-12-07'] });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-04',
      to: '2026-12-08',
    });

    // 12/4 と 12/8 は ×、12/7 は休館。選ぶのは ○ の 12/5 と △ の 12/6 だけ
    expect(picked(site.calls)).toEqual([['2026120500102   0', '2026120600102   0']]);
    expect(result.slots).toHaveLength(5 * 3);
    expect(result.slots.filter((s) => s.date === '2026-12-04').map((s) => `${s.start}-${s.end} ${s.status} ${s.rawLabel}`)).toEqual([
      '09:00-12:00 reserved ×',
      '13:00-17:00 reserved ×',
      '18:00-22:00 reserved ×',
    ]);
    expect(result.slots.filter((s) => s.date === '2026-12-07').map((s) => `${s.status} ${s.rawLabel}`)).toEqual([
      'closed 休館',
      'closed 休館',
      'closed 休館',
    ]);
    expect(result.coveredThrough).toBe('2026-12-08');
  });

  it('wantsDate が false を返す日は、時間帯別の画面で確かめず、結果にも含めない', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-04',
      to: '2026-12-08',
      wantsDate: (date) => date === '2026-12-06',
    });

    // ○ の 12/5 は対象外なので選ばず、△ の 12/6 だけを選ぶ
    expect(picked(site.calls)).toEqual([['2026120600102   0']]);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-12-06']);
    expect(result.coveredThrough).toBe('2026-12-08');
  });

  it('10マスを超えるときは、前の画面に戻ってから次の10マスを選ぶ', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2026-12-20',
    });

    expect(steps(site.calls).slice(7)).toEqual([
      `POST ${DAYS} [hyouji]`,
      `POST ${DAYS} [next]`,
      `GET ${TIMES}`,
      `POST ${TIMES} [back]`,
      `GET ${DAYS}`,
      `POST ${DAYS} [next]`,
      `GET ${TIMES}`,
    ]);
    const batches = picked(site.calls);
    expect(batches.map((b) => b.length)).toEqual([10, 5]);
    // 戻った画面には前に選んだマスのチェックが残るが、次の送信には含めない
    expect(batches[1]?.some((v) => batches[0]?.includes(v))).toBe(false);
    expect(result.slots).toHaveLength(20 * 3);
    expect(new Set(result.slots.map((s) => `${s.date} ${s.start}`)).size).toBe(result.slots.length);
  });

  it('期間が1か月を超えるときは、表示期間を切り替えて続きを問い合わせる（年またぎを含む）', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2027-01-10',
    });

    expect(shown(site.calls)).toEqual(['2026/12/01', '2027/01/01']);
    expect(result.slots).toHaveLength((31 + 10) * 3);
    expect(new Set(result.slots.map((s) => `${s.date} ${s.start}`)).size).toBe(result.slots.length);
    expect(result.slots.at(0)?.date).toBe('2026-12-01');
    expect(result.slots.at(-1)?.date).toBe('2027-01-10');
    expect(result.coveredThrough).toBe('2027-01-10');
  });

  it('受付が始まっていない期間は照会できた範囲に含めず、そこで止める', async () => {
    // 2月8日は受付期間外の休館日。照会できた日には数えない
    const site = fakeSite({ lastBookable: '2027-01-31', closed: ['2027-02-08'] });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2027-01-25',
      to: '2027-03-31',
    });

    expect(shown(site.calls)).toEqual(['2027/01/25']);
    expect(result.coveredThrough).toBe('2027-01-31');
    expect(result.slots).toHaveLength(7 * 3);
    expect(result.slots.some((s) => s.date > '2027-01-31')).toBe(false);
    expect(result.slots.some((s) => s.rawLabel === '－')).toBe(false);
  });

  it('受付期間の最後が休館日なら、その日までを照会できた範囲とする', async () => {
    const site = fakeSite({ lastBookable: '2027-01-31', closed: ['2027-01-31'] });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2027-01-29',
      to: '2027-02-05',
    });

    expect(result.coveredThrough).toBe('2027-01-31');
    expect([...new Set(result.slots.map((s) => `${s.date} ${s.status}`))]).toContain('2027-01-31 closed');
  });

  it('最初から受付期間外なら、空の結果を返す', async () => {
    const site = fakeSite({ closed: ['2027-06-01'] });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2027-06-01',
      to: '2027-07-31',
    });

    expect(shown(site.calls)).toEqual(['2027/06/01']);
    expect(picked(site.calls)).toEqual([]);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('過去の日は照会せず、今日から問い合わせる', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-11-01',
      to: '2026-11-25',
    });

    expect(shown(site.calls)).toEqual(['2026/11/23']);
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-11-23', '2026-11-24', '2026-11-25']);
    expect(result.coveredThrough).toBe('2026-11-25');
  });

  it('期間がすべて過去なら、表示期間を切り替えずに空の結果を返す', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-11-01',
      to: '2026-11-22',
    });

    expect(site.calls).toHaveLength(7);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('複数の部屋をまとめて照会し、日付・指定した部屋の順・時刻で並べて返す', async () => {
    // 第１音楽室の 12/2 は空きなし
    const site = fakeSite({ daySymbol: (room, date) => (room === '第１音楽室' && date === '2026-12-02' ? '×' : '△') });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室', '第１音楽室'],
      from: '2026-12-01',
      to: '2026-12-02',
    });

    expect(picked(site.calls)).toEqual([['2026120100102   0', '2026120100101   0', '2026120200102   0']]);
    expect(result.rooms.map((r) => r.room)).toEqual(['第２音楽室', '第１音楽室']);
    expect(result.slots.map((s) => `${s.date} ${s.room} ${s.start} ${s.rawLabel}`)).toEqual([
      '2026-12-01 第２音楽室 09:00 ○',
      '2026-12-01 第２音楽室 13:00 ×',
      '2026-12-01 第２音楽室 18:00 ○',
      '2026-12-01 第１音楽室 09:00 ○',
      '2026-12-01 第１音楽室 13:00 ×',
      '2026-12-01 第１音楽室 18:00 ○',
      '2026-12-02 第２音楽室 09:00 ○',
      '2026-12-02 第２音楽室 13:00 ×',
      '2026-12-02 第２音楽室 18:00 ○',
      '2026-12-02 第１音楽室 09:00 ×',
      '2026-12-02 第１音楽室 13:00 ×',
      '2026-12-02 第１音楽室 18:00 ×',
    ]);
  });

  it('空きのある日が1日もない部屋は時間帯の区切りが分からないので、コマを返さない', async () => {
    const site = fakeSite({ daySymbol: () => '×' });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2026-12-05',
    });

    expect(picked(site.calls)).toEqual([]);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBe('2026-12-05');
  });

  it('サイトが指定と違う期間を返したら、日付を取り違えないよう何も返さない', async () => {
    const site = fakeSite({ ignoreDate: true });

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-10',
      to: '2026-12-12',
    });

    expect(picked(site.calls)).toEqual([]);
    expect(result.slots).toEqual([]);
    expect(result.coveredThrough).toBeNull();
  });

  it('部屋名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['大ホール'], from: '2026-12-01', to: '2026-12-02' }),
    ).rejects.toThrow('部屋「大ホール」が見つかりません。候補: 第１音楽室、第２音楽室、和室');
    expect(site.calls).toHaveLength(7);
  });

  it('施設名が見つからなければ、候補を示してエラーにする', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: 'サンプル', rooms: ['第２音楽室'], from: '2026-12-01', to: '2026-12-02' }),
    ).rejects.toThrow('施設「サンプル」が見つかりません。候補: サンプル区民センター、サンプル区民センター別館');
    expect(site.calls).toHaveLength(5);
  });

  it('to が from より前ならエラーにし、問い合わせない', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['第２音楽室'], from: '2026-12-02', to: '2026-12-01' }),
    ).rejects.toThrow('to は from 以降の日付にしてください');
    expect(site.calls).toHaveLength(0);
  });

  it('時間帯別空き状況の代わりに別の画面（ログインなど）が返ったらエラーにする', async () => {
    const login = `<html><body>${formHead('/Web/Home/WgR_Login', 'TOKEN')}<input type="password" name="password"></form></body></html>`;
    const site = fakeSite({ timesPage: login });

    await expect(
      clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['第２音楽室'], from: '2026-12-01', to: '2026-12-02' }),
    ).rejects.toThrow('想定外の画面です（期待: 時間帯別空き状況 / 実際: /Web/Home/WgR_Login）');
    // ログイン画面には何も送らない
    expect(site.calls.at(-1)?.method).toBe('GET');
  });

  it('リクエスト数の上限に近づいたら、取得できた日までを返す', async () => {
    const site = fakeSite();

    const result = await clientFor(site, { maxRequests: 12 }).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['第２音楽室'],
      from: '2026-12-01',
      to: '2026-12-20',
    });

    // 入口から1か月表示までで8回、最初の10マスで2回。次の10マス（戻る2回+進む2回）は送れない
    expect(site.calls).toHaveLength(10);
    expect(picked(site.calls).map((b) => b.length)).toEqual([10]);
    // 11マス目は 12/14。その前日までを照会できた範囲とする
    expect(result.coveredThrough).toBe('2026-12-13');
    expect(result.slots).toHaveLength(13 * 3);
    expect(result.slots.at(-1)?.date).toBe('2026-12-13');
  });

  it('施設を開く前に上限を超えたら、エラーで止まる', async () => {
    const site = fakeSite();

    await expect(
      clientFor(site, { maxRequests: 3 }).fetchAvailability({ facilityCode: FACILITY, rooms: ['第２音楽室'], from: '2026-12-01', to: '2026-12-02' }),
    ).rejects.toThrow('リクエスト数の上限（3）に達しました');
    expect(site.calls).toHaveLength(3);
  });
});

describe('SetagayaClient.listRooms', () => {
  it('施設の部屋一覧を、部屋コード・定員つきで返す', async () => {
    const site = fakeSite();

    const rooms = await clientFor(site).listRooms(FACILITY);

    expect(rooms).toEqual([
      { key: '00101', facility: FACILITY, room: '第１音楽室', capacity: 30 },
      { key: '00102', facility: FACILITY, room: '第２音楽室', capacity: 30 },
      { key: '00103', facility: FACILITY, room: '和室', capacity: null },
    ]);
    expect(steps(site.calls)).toEqual([
      'GET /Web/',
      'GET /Web/?CookieCheck=true',
      `GET ${TOP}`,
      `POST ${TOP} [searchShisetsuName]`,
      `GET ${SEARCH}`,
      `POST ${SEARCH} [next]`,
      `GET ${DAYS}`,
    ]);
  });

  it('想定外の画面が返ったらエラーにする', async () => {
    const fetchImpl = (async () =>
      new Response('<html><head><title>けやきネット</title></head><body>エラーが発生しました。</body></html>')) as typeof fetch;
    const client = new SetagayaClient({ fetchImpl, now: noon, sleep: async () => {} });

    await expect(client.listRooms(FACILITY)).rejects.toThrow('想定外の画面です（期待: トップページ / 実際: 不明）');
  });

  it('施設名が空ならエラーにし、問い合わせない', async () => {
    const site = fakeSite();

    await expect(clientFor(site).listRooms('  ')).rejects.toThrow('施設名を指定してください');
    expect(site.calls).toHaveLength(0);
  });

  it('リクエストの間隔を空ける', async () => {
    const site = fakeSite();
    const waits: number[] = [];
    const client = new SetagayaClient({
      fetchImpl: site.fetchImpl,
      now: noon,
      sleep: async (ms) => void waits.push(ms),
      minIntervalMs: 2000,
    });

    await client.listRooms(FACILITY);

    expect(waits).toEqual([2000, 2000, 2000, 2000, 2000, 2000]);
  });

  it('受付時間外（0時〜7時）は問い合わせない', async () => {
    const site = fakeSite();
    const client = new SetagayaClient({
      fetchImpl: site.fetchImpl,
      now: () => new Date('2026-11-22T20:00:00Z'), // 日本時間 5:00
      sleep: async () => {},
    });

    await expect(client.listRooms(FACILITY)).rejects.toThrow('受付時間外');
    expect(site.calls).toHaveLength(0);
  });
});
