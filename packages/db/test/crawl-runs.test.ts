import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  beginCrawlRun,
  createRoom,
  disposeDb,
  failCrawlRequest,
  finishCrawlRun,
  listCrawlRuns,
  loadRefreshState,
  openDb,
  requestManualCrawl,
  saveAvailability,
  type Db,
} from '../src/index';

/** 日本時間の時刻。例: jst('2026-11-23 14:00') */
const jst = (text: string): Date => new Date(`${text.replace(' ', 'T')}:00+09:00`);
const minutes = (at: Date, n: number): Date => new Date(at.getTime() + n * 60_000);

let db: Db;
beforeEach(async () => {
  db = await openDb();
});
afterEach(async () => {
  await disposeDb(db);
});

describe('手動の取得の申し込み', () => {
  it('最初は申し込めて、申し込んだ人と時刻が「取得中」として読める', async () => {
    const now = jst('2026-11-23 14:00');

    const result = await requestManualCrawl(db, { requestedBy: '中本', now });

    expect(result.ok).toBe(true);
    expect((await loadRefreshState(db, now)).active).toEqual({ trigger: 'manual', requestedBy: '中本', since: now });
  });

  it('取得中は申し込めない', async () => {
    const now = jst('2026-11-23 14:00');
    await requestManualCrawl(db, { requestedBy: '中本', now });

    const second = await requestManualCrawl(db, { requestedBy: '別の人', now: minutes(now, 1) });

    expect(second).toMatchObject({ ok: false, availability: { kind: 'running', requestedBy: '中本' } });
  });

  it('取得が終わってから20分は申し込めず、20分たてば申し込める', async () => {
    const now = jst('2026-11-23 14:00');
    const run = await beginCrawlRun(db, now);
    await finishCrawlRun(db, run!.id, { ok: true }, minutes(now, 4));

    expect(await requestManualCrawl(db, { requestedBy: '中本', now: minutes(now, 19) })).toMatchObject({
      ok: false,
      availability: { kind: 'cooldown', availableAt: minutes(now, 20) },
    });
    expect((await requestManualCrawl(db, { requestedBy: '中本', now: minutes(now, 20) })).ok).toBe(true);
  });

  it('空き状況を保存した時刻も、前回の取得として数える', async () => {
    const roomId = await createRoom(db, {
      municipality: '大田区',
      facilityName: '大田区民プラザ',
      roomName: '第一音楽スタジオ',
      facilityNameEn: null,
      roomNameEn: null,
      capacity: 50,
      capacitySource: null,
      nearestStation: null,
    });
    const savedAt = jst('2026-11-23 13:20');
    await saveAvailability(db, { roomId, from: '2026-11-23', to: '2026-12-31', coveredThrough: '2026-12-31', fetchedAt: savedAt, slots: [] });

    expect((await loadRefreshState(db, jst('2026-11-23 13:30'))).lastFetchAt).toEqual(savedAt);
    expect((await requestManualCrawl(db, { requestedBy: '中本', now: jst('2026-11-23 13:30') })).ok).toBe(false);
  });

  it('受付時間外（22時以降）は申し込めない', async () => {
    expect(await requestManualCrawl(db, { requestedBy: '中本', now: jst('2026-11-23 22:10') })).toMatchObject({
      ok: false,
      availability: { kind: 'outside_hours' },
    });
    expect(await listCrawlRuns(db)).toHaveLength(0);
  });

  it('1日10回まで（始められなかった申し込みも数える）', async () => {
    let now = jst('2026-11-23 08:00');
    for (let i = 0; i < 10; i++) {
      const result = await requestManualCrawl(db, { requestedBy: '中本', now });
      if (!result.ok) throw new Error(`申し込めませんでした: ${JSON.stringify(result)}`);
      await failCrawlRequest(db, result.id, '起動できませんでした', now);
      now = minutes(now, 1);
    }

    expect(await requestManualCrawl(db, { requestedBy: '中本', now })).toMatchObject({ ok: false, availability: { kind: 'daily_limit' } });
    // 次の日（日本時間）はまた申し込める
    expect((await requestManualCrawl(db, { requestedBy: '中本', now: jst('2026-11-24 08:00') })).ok).toBe(true);
  });

  it('始まらないまま15分たった申し込みは失敗にして、次を申し込めるようにする', async () => {
    const now = jst('2026-11-23 14:00');
    await requestManualCrawl(db, { requestedBy: '中本', now });

    expect((await loadRefreshState(db, minutes(now, 16))).active).toBeNull();
    expect((await requestManualCrawl(db, { requestedBy: '別の人', now: minutes(now, 16) })).ok).toBe(true);
    expect((await listCrawlRuns(db)).map((r) => [r.requestedBy, r.status])).toEqual([
      ['別の人', 'requested'],
      ['中本', 'failed'],
    ]);
  });
});

describe('取得の処理の記録', () => {
  it('手動で申し込まれた取得があれば、それとして始めて終える', async () => {
    const now = jst('2026-11-23 14:00');
    await requestManualCrawl(db, { requestedBy: '中本', now });

    const run = await beginCrawlRun(db, minutes(now, 1));
    await finishCrawlRun(db, run!.id, { ok: false, message: '渋谷区で失敗' }, minutes(now, 5));

    expect(run?.trigger).toBe('manual');
    const [saved] = await listCrawlRuns(db);
    expect(saved).toMatchObject({ trigger: 'manual', status: 'failed', requestedBy: '中本', startedAt: minutes(now, 1), message: '渋谷区で失敗' });
  });

  it('申し込みがなければ定期の取得として始める', async () => {
    const run = await beginCrawlRun(db, jst('2026-11-23 13:15'));

    expect(run?.trigger).toBe('schedule');
    expect((await loadRefreshState(db, jst('2026-11-23 13:16'))).active).toMatchObject({ trigger: 'schedule', requestedBy: null });
  });

  it('別の取得が実行中なら始めない（重ならないように）', async () => {
    const now = jst('2026-11-23 13:15');
    await beginCrawlRun(db, now);

    expect(await beginCrawlRun(db, minutes(now, 2))).toBeNull();
  });

  it('70分たっても終わらない取得は失敗にして、次の取得を始められる', async () => {
    const now = jst('2026-11-23 10:15');
    await beginCrawlRun(db, now);

    expect(await beginCrawlRun(db, minutes(now, 180))).not.toBeNull();
    expect((await listCrawlRuns(db)).map((r) => r.status)).toEqual(['running', 'failed']);
  });
});
