import { describe, expect, it } from 'vitest';
import { KotoClient, planMoves } from '../src/koto/client';

/** 実サイトは Shift_JIS で返すので、テストの画面も Shift_JIS のバイト列にする（TextDecoder の逆引き表を使う）。 */
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

const TITLE = '公益財団法人江東区文化コミュニティ財団　施設予約・講座管理システム　';
const WEEKDAYS = ['日', '月', '火', '水', '木', '金', '土'];
const IMAGE: Record<string, string> = { 空き: 'lw_emptybs', 予約あり: 'lw_finishs', 受付期間外: 'lw_kikangai', 休館日: 'lw_2' };

/** 施設空き状況画面（時間帯貸し）を、実サイトと同じ構造で作る。labels は [AV・ホールの午前・午後・夜間]。 */
function renderDay(date: string, labels: string[]): string {
  const d = new Date(`${date}T00:00:00Z`);
  const row = (index: number, name: string, key: string, cells: string[]) =>
    `<tr><td bgcolor="#E0FFFF" width="150" height="50" align="center">${name}</td>${cells
      .map((label, col) => `<td nowrap align="center" colspan="2"><img src="image/${IMAGE[label] ?? 'lw_x'}.gif" name="${index}_${col}_${key}" border="0" alt="${label}"></td>`)
      .join('')}</tr>`;
  return `<html><head><title>${TITLE}施設空き状況画面時間帯貸し</title></head><body>
<script>var gSelectBldNo = 5;\nvar gSrchSelectInstNo = 0;</script>
<table><tr bgcolor="#98fb98" align="center"><td>${d.getUTCFullYear()} 年<br/>${d.getUTCMonth() + 1}月${d.getUTCDate()}日(${WEEKDAYS[d.getUTCDay()]})</td><td>午前</td><td>午後</td><td>夜間</td></tr>
${row(0, '多目的ホール', '1050010', ['予約あり', '予約あり', '予約あり'])}
${row(3, 'ＡＶ・ホール', '1050030', labels)}
</table></body></html>`;
}

const page = (title: string): string => `<html><head><title>${TITLE}${title}</title></head><body></body></html>`;

interface Call {
  path: string;
  body: URLSearchParams | null;
}

/** 自治体サイトの代わり。日ごとの表示は、最後に開いた日を覚えて「翌日」で進める。 */
function fakeSite(labelOf: (date: string) => string[] = () => ['空き', '予約あり', '空き']) {
  const calls: Call[] = [];
  let current = '';
  const respond = (html: string, headers = new Headers()) => {
    headers.set('content-type', 'text/html;charset=Shift_JIS');
    return new Response(encodeShiftJis(html), { headers });
  };
  const fetchImpl = (async (input: string | URL | Request, init?: RequestInit) => {
    const path = new URL(String(input)).pathname.replace('/web', '');
    const body = init?.body ? new URLSearchParams(String(init.body)) : null;
    calls.push({ path, body });
    switch (path) {
      case '/index.jsp': {
        const headers = new Headers();
        headers.append('set-cookie', 'JSESSIONID=sample123; Path=/web; Secure; HttpOnly');
        return respond('<html><head></head><body><form action="/web/rsvWTransUserAttestationAction.do"></form></body></html>', headers);
      }
      case '/rsvWTransUserAttestationAction.do':
        return respond(page('認証画面').replace('</body>', '〔メニュー画面〕</body>'));
      case '/rsvWTransInstSrchVacantAction.do':
        return respond(page('予約申込画面'));
      case '/rsvWTransInstSrchAreaAction.do':
        return respond(page('地域検索条件画面'));
      case '/rsvWTransInstSrchBuildAction.do':
        return respond(page('館検索条件画面'));
      case '/rsvWInstSrchMonthVacantAction.do':
        return respond(page('施設空き状況１ヶ月表示画面'));
      case '/rsvWInstSrchVacantAction.do': {
        const step = { '13': 1, '12': -1, '4': 7 }[body?.get('transVacantMode') ?? ''];
        if (step !== undefined) {
          current = new Date(Date.parse(`${current}T00:00:00Z`) + step * 86_400_000).toISOString().slice(0, 10);
        } else {
          const ymd = body?.get('srchSelectYMD') ?? '';
          current = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
        }
        return respond(renderDay(current, labelOf(current)));
      }
      default:
        return respond('<html><head><title></title></head><body>〔メッセージ通知〕 遷移情報に誤りがあります。 このページでは</body></html>');
    }
  }) as typeof fetch;
  return { calls, fetchImpl };
}

const noon = () => new Date('2026-11-23T03:00:00Z'); // 日本時間 12:00
const clientFor = (site: { fetchImpl: typeof fetch }, extra: object = {}) =>
  new KotoClient({ fetchImpl: site.fetchImpl, now: noon, sleep: async () => {}, ...extra });
const FACILITY = '1010-1050-5';

describe('KotoClient.fetchAvailability', () => {
  it('画面の順路どおりに進み、あとは「翌日」で1日ずつ進む', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2026-11-28', to: '2026-11-30' });

    expect(site.calls.map((c) => c.path)).toEqual([
      '/index.jsp',
      '/rsvWTransUserAttestationAction.do',
      '/rsvWTransInstSrchVacantAction.do',
      '/rsvWTransInstSrchAreaAction.do',
      '/rsvWTransInstSrchBuildAction.do',
      '/rsvWInstSrchMonthVacantAction.do',
      '/rsvWInstSrchVacantAction.do',
      '/rsvWInstSrchVacantAction.do',
      '/rsvWInstSrchVacantAction.do',
    ]);
    const build = site.calls[4]?.body;
    const month = site.calls[5]?.body;
    const firstDay = site.calls[6]?.body;
    const next = site.calls[7]?.body;
    expect([build?.get('selectAreaCd'), month?.get('selectBldCd'), month?.get('selectBldNo')]).toEqual(['1010', '1050', '5']);
    expect([firstDay?.get('srchSelectYMD'), firstDay?.get('transVacantMode'), firstDay?.get('dispMM'), firstDay?.get('dispDD')]).toEqual(['20261128', '7', '11', '28']);
    expect(Object.fromEntries(next ?? [])).toEqual({ displayNo: 'prwca1000', transVacantMode: '13', srchSelectInstNo: '0', selectBldNo: '5' });

    expect(result.rooms).toEqual([{ key: '1050030', facility: FACILITY, room: 'ＡＶ・ホール', capacity: null }]);
    expect(result.slots.filter((s) => s.date === '2026-11-28')).toEqual([
      { facility: FACILITY, room: 'ＡＶ・ホール', date: '2026-11-28', start: '09:00', end: '12:00', status: 'available', rawLabel: '空き' },
      { facility: FACILITY, room: 'ＡＶ・ホール', date: '2026-11-28', start: '13:00', end: '17:00', status: 'reserved', rawLabel: '予約あり' },
      { facility: FACILITY, room: 'ＡＶ・ホール', date: '2026-11-28', start: '18:00', end: '22:00', status: 'available', rawLabel: '空き' },
    ]);
    expect(result.slots).toHaveLength(9);
    expect(result.coveredThrough).toBe('2026-11-30');
  });

  it('翌月以降から始めるときは、1か月表示の月を進めてから日を選ぶ', async () => {
    const site = fakeSite();

    await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2027-01-05', to: '2027-01-05' });

    const months = site.calls.filter((c) => c.path === '/rsvWInstSrchMonthVacantAction.do').map((c) => c.body?.get('srchSelectYMD'));
    expect(months).toEqual(['0', '20261201', '20270101']);
  });

  it('受付期間外が7日続いたら、そこで照会できる範囲が終わったとみなして止める', async () => {
    const site = fakeSite((date) => (date <= '2026-12-02' ? ['空き', '空き', '空き'] : ['受付期間外', '受付期間外', '受付期間外']));

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2026-11-30', to: '2027-02-21' });

    expect(result.coveredThrough).toBe('2026-12-02');
    expect(site.calls.filter((c) => c.path === '/rsvWInstSrchVacantAction.do')).toHaveLength(3 + 7);
  });

  it('問い合わせの上限に近づいたら、そこまでの結果を返す', async () => {
    const site = fakeSite();

    const result = await clientFor(site, { maxRequests: 10 }).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2026-11-28', to: '2027-02-21' });

    expect(site.calls).toHaveLength(10);
    expect(result.coveredThrough).toBe('2026-12-01');
  });

  it('wantsDate が false の日のコマは返さない', async () => {
    const site = fakeSite();

    const result = await clientFor(site).fetchAvailability({
      facilityCode: FACILITY,
      rooms: ['ＡＶ・ホール'],
      from: '2026-11-28',
      to: '2026-11-30',
      wantsDate: (date) => date !== '2026-11-29',
    });

    expect([...new Set(result.slots.map((s) => s.date))]).toEqual(['2026-11-28', '2026-11-30']);
  });

  it('台帳の部屋が画面にないときは、候補を添えて失敗する', async () => {
    await expect(clientFor(fakeSite()).fetchAvailability({ facilityCode: FACILITY, rooms: ['大ホール'], from: '2026-11-28', to: '2026-11-28' })).rejects.toThrow(
      '部屋「大ホール」が見つかりません。候補: 多目的ホール、ＡＶ・ホール',
    );
  });

  it('順路の誤りの画面が返ったら、その文言を添えて失敗する', async () => {
    const site = fakeSite();
    const broken = (async (input: string | URL | Request, init?: RequestInit) => {
      if (String(input).includes('rsvWTransInstSrchAreaAction')) {
        return new Response(encodeShiftJis('<html><head><title></title></head><body>〔メッセージ通知〕 遷移情報に誤りがあります。 このページでは</body></html>'), {
          headers: { 'content-type': 'text/html;charset=Shift_JIS' },
        });
      }
      return site.fetchImpl(input, init);
    }) as typeof fetch;

    await expect(clientFor({ fetchImpl: broken }).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2026-11-28', to: '2026-11-28' })).rejects.toThrow(
      '想定外の画面です（期待: 地域検索条件画面 / 実際: 遷移情報に誤りがあります。）',
    );
  });

  it('facilityCode の形式が違えば失敗する', async () => {
    await expect(clientFor(fakeSite()).fetchAvailability({ facilityCode: '1010-1050', rooms: ['ＡＶ・ホール'], from: '2026-11-28', to: '2026-11-28' })).rejects.toThrow('地域コード-館コード-館の順番');
  });

  it('土日祝だけを指定すると、「次の週」「前日」も使って、ほぼ1日1件でたどる', async () => {
    const site = fakeSite();
    const weekend = (date: string) => [0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay()) || date === '2026-12-23';

    const result = await clientFor(site).fetchAvailability({ facilityCode: FACILITY, rooms: ['ＡＶ・ホール'], from: '2026-11-23', to: '2026-12-31', wantsDate: weekend });

    const visited = site.calls.filter((c) => c.path === '/rsvWInstSrchVacantAction.do');
    expect([...new Set(result.slots.map((s) => s.date))]).toEqual([
      '2026-11-28', '2026-11-29', '2026-12-05', '2026-12-06', '2026-12-12', '2026-12-13', '2026-12-19', '2026-12-20', '2026-12-23', '2026-12-26', '2026-12-27',
    ]);
    // 11日分を18件でたどる（全日なら39件）。平日の祝日（12/23 水）を挟む分だけ多くなる
    expect(visited).toHaveLength(18);
    expect(visited.map((c) => c.body?.get('transVacantMode'))).toContain('4');
  });
});

describe('planMoves', () => {
  it('「次の週」と「翌日」「前日」をいちばん少なく組み合わせる', () => {
    const modes = (delta: number) => planMoves(delta).map((m) => m.days);
    expect(modes(1)).toEqual([1]);
    expect(modes(6)).toEqual([7, -1]);
    expect(modes(7)).toEqual([7]);
    expect(modes(8)).toEqual([7, 1]);
    expect(modes(13)).toEqual([7, 7, -1]);
    expect(() => planMoves(0)).toThrow();
  });
});
