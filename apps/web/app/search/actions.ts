'use server';

import { revalidatePath } from 'next/cache';
import { failCrawlRequest, getDb, requestManualCrawl } from '@resoom/db';
import { triggerCrawlJob } from '@/lib/crawl-trigger';
import { memberWith } from '@/lib/session';

export type RefreshResult =
  | { status: 'idle' }
  | { status: 'started' }
  | { status: 'error'; code: 'forbidden' | 'running' | 'cooldown' | 'outside_hours' | 'daily_limit' | 'trigger_failed' };

/**
 * 「今すぐ最新を取得」。ログインした楽団員だけが使える。
 * 間隔・時間・回数・取得中でないことはサーバー側でも確かめる（ボタンを隠すだけでは防げないため）。
 */
export async function requestRefresh(_previous: RefreshResult): Promise<RefreshResult> {
  const member = await memberWith('viewCatalog');
  if (!member) return { status: 'error', code: 'forbidden' };
  const db = await getDb();
  const result = await requestManualCrawl(db, { requestedBy: member.name || member.email, now: new Date() });
  if (!result.ok) {
    const kind = result.availability.kind;
    return { status: 'error', code: kind === 'available' ? 'running' : kind };
  }
  try {
    await triggerCrawlJob();
  } catch (error) {
    console.error(error);
    await failCrawlRequest(db, result.id, error instanceof Error ? error.message : String(error), new Date());
    return { status: 'error', code: 'trigger_failed' };
  }
  revalidatePath('/search');
  return { status: 'started' };
}
