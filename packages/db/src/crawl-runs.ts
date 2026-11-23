import { and, count, desc, eq, gte, inArray, isNotNull, lt, max, or, sql } from 'drizzle-orm';
import { refreshAvailability, startOfJapanDay, type CrawlTrigger, type RefreshAvailability, type RefreshState } from '@resoom/core';
import type { Db } from './client';
import { availabilitySnapshots, crawlRuns } from './schema';

/** 申し込んでからこれだけたっても始まらない取得は、失敗とみなす（ジョブはふつう1分以内に始まる）。 */
const STALE_REQUESTED_MS = 15 * 60_000;
/** 始まってからこれだけたっても終わらない取得は、失敗とみなす（ジョブの制限時間は60分）。 */
const STALE_RUNNING_MS = 70 * 60_000;

const ACTIVE = ['requested', 'running'] as const;

/** 終わらないまま残った取得を失敗にする（同時に1件までの決まりで、次の取得が止まらないように）。 */
async function expireStaleRuns(db: Db, now: Date): Promise<void> {
  await db
    .update(crawlRuns)
    .set({ status: 'failed', finishedAt: now, message: '取得が始まりませんでした' })
    .where(and(eq(crawlRuns.status, 'requested'), lt(crawlRuns.requestedAt, new Date(now.getTime() - STALE_REQUESTED_MS))));
  await db
    .update(crawlRuns)
    .set({ status: 'failed', finishedAt: now, message: '時間内に終わりませんでした' })
    .where(and(eq(crawlRuns.status, 'running'), lt(crawlRuns.startedAt, new Date(now.getTime() - STALE_RUNNING_MS))));
}

/** 「今すぐ最新を取得」の判定に使う、いまの状態を読む（書き込みはしない）。 */
export async function loadRefreshState(db: Db, now: Date): Promise<RefreshState> {
  const [active] = await db
    .select()
    .from(crawlRuns)
    .where(
      and(
        inArray(crawlRuns.status, [...ACTIVE]),
        // 終わらないまま残った取得は数えない
        or(
          and(eq(crawlRuns.status, 'requested'), gte(crawlRuns.requestedAt, new Date(now.getTime() - STALE_REQUESTED_MS))),
          and(eq(crawlRuns.status, 'running'), gte(crawlRuns.startedAt, new Date(now.getTime() - STALE_RUNNING_MS))),
        ),
      ),
    )
    .orderBy(desc(crawlRuns.requestedAt))
    .limit(1);
  const [{ lastStarted } = { lastStarted: null }] = await db
    .select({ lastStarted: max(crawlRuns.startedAt) })
    .from(crawlRuns)
    .where(isNotNull(crawlRuns.startedAt));
  const [{ lastSaved } = { lastSaved: null }] = await db.select({ lastSaved: max(availabilitySnapshots.fetchedAt) }).from(availabilitySnapshots);
  const [{ manualToday } = { manualToday: 0 }] = await db
    .select({ manualToday: count() })
    .from(crawlRuns)
    .where(and(eq(crawlRuns.trigger, 'manual'), gte(crawlRuns.requestedAt, startOfJapanDay(now))));

  const times = [lastStarted, lastSaved].filter((t): t is Date => t instanceof Date);
  return {
    lastFetchAt: times.length > 0 ? new Date(Math.max(...times.map((t) => t.getTime()))) : null,
    active: active
      ? { trigger: active.trigger, requestedBy: active.requestedBy, since: active.startedAt ?? active.requestedAt }
      : null,
    manualToday: Number(manualToday),
  };
}

/**
 * 手動の取得を申し込む。決まり（間隔・時間・回数・取得中でないこと）を確かめてから記録する。
 * 申し込めたら記録の id、できなければその理由を返す。
 */
export async function requestManualCrawl(
  db: Db,
  input: { requestedBy: string; now: Date },
): Promise<{ ok: true; id: string } | { ok: false; availability: RefreshAvailability }> {
  await expireStaleRuns(db, input.now);
  const state = await loadRefreshState(db, input.now);
  const availability = refreshAvailability(state, input.now);
  if (availability.kind !== 'available') return { ok: false, availability };
  // 同時に押されたときは、部分ユニーク索引で1件だけが入る
  const [created] = await db
    .insert(crawlRuns)
    .values({ trigger: 'manual', status: 'requested', requestedBy: input.requestedBy, requestedAt: input.now })
    .onConflictDoNothing()
    .returning({ id: crawlRuns.id });
  if (!created) return { ok: false, availability: refreshAvailability(await loadRefreshState(db, input.now), input.now) };
  return { ok: true, id: created.id };
}

/** 申し込んだ取得を始められなかったときに、失敗として記録する。 */
export async function failCrawlRequest(db: Db, id: string, message: string, now: Date): Promise<void> {
  await db
    .update(crawlRuns)
    .set({ status: 'failed', finishedAt: now, message })
    .where(and(eq(crawlRuns.id, id), eq(crawlRuns.status, 'requested')));
}

/**
 * 取得を始める（取得の処理の最初に呼ぶ）。手動で申し込まれた取得があれば、それとして始める。
 * 別の取得が実行中なら null（重ならないよう、呼び出し側は取得をしない）。
 */
export async function beginCrawlRun(db: Db, now: Date): Promise<{ id: string; trigger: CrawlTrigger } | null> {
  await expireStaleRuns(db, now);
  const [claimed] = await db
    .update(crawlRuns)
    .set({ status: 'running', startedAt: now })
    .where(eq(crawlRuns.status, 'requested'))
    .returning({ id: crawlRuns.id, trigger: crawlRuns.trigger });
  if (claimed) return claimed;
  const [created] = await db
    .insert(crawlRuns)
    .values({ trigger: 'schedule', status: 'running', requestedAt: now, startedAt: now })
    .onConflictDoNothing()
    .returning({ id: crawlRuns.id, trigger: crawlRuns.trigger });
  return created ?? null;
}

/** 取得を終える。 */
export async function finishCrawlRun(db: Db, id: string, result: { ok: boolean; message?: string }, now: Date): Promise<void> {
  await db
    .update(crawlRuns)
    .set({ status: result.ok ? 'succeeded' : 'failed', finishedAt: now, message: result.message ?? null })
    .where(eq(crawlRuns.id, id));
}

/** 確認用: 取得の記録を新しい順に読む。 */
export async function listCrawlRuns(db: Db, limit = 20) {
  return db.select().from(crawlRuns).orderBy(desc(crawlRuns.requestedAt), sql`${crawlRuns.id}`).limit(limit);
}
