'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useEffect } from 'react';
import { Bi } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { requestRefresh, type RefreshResult } from './actions';

/** 画面に出す状態（時刻は日本時間の HH:MM にしてから渡す）。 */
export type RefreshView =
  | { kind: 'available' }
  | { kind: 'running'; since: string; requestedBy: string | null; manual: boolean }
  | { kind: 'cooldown'; availableAt: string }
  | { kind: 'outside_hours' }
  | { kind: 'daily_limit' };

/** 取得中は、終わったかどうかをこの間隔で確かめる。 */
const POLL_MS = 20_000;

const ERRORS: Record<Extract<RefreshResult, { status: 'error' }>['code'], { en: string; ja: string }> = {
  forbidden: T.refreshForbidden,
  running: T.refreshAlreadyRunning,
  cooldown: T.refreshTooSoon,
  outside_hours: T.refreshOutsideHours,
  daily_limit: T.refreshDailyLimit,
  trigger_failed: T.refreshFailed,
};

/**
 * 「今すぐ最新を取得」（ログインした楽団員にだけ出す）。
 * 前回の取得から20分たっていて、受付時間内で、今日の上限に達していないときだけボタンを出す。
 */
export function RefreshControl({ view }: { view: RefreshView }) {
  const router = useRouter();
  const [state, action, pending] = useActionState(requestRefresh, { status: 'idle' } as RefreshResult);

  // 取得中は、終わるまでときどき表示を更新する
  useEffect(() => {
    if (view.kind !== 'running') return;
    const timer = setInterval(() => router.refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [view.kind, router]);

  return (
    <span className="refresh">
      {view.kind === 'available' ? (
        <form action={action} className="refresh-form">
          <button type="submit" className="button secondary small" disabled={pending}>
            <Bi text={pending ? T.refreshStarting : T.refreshNow} />
          </button>
          <span className="hint">
            <Bi text={T.refreshNote} />
          </span>
        </form>
      ) : null}
      {view.kind === 'running' ? (
        <span className="refresh-running" role="status">
          <Bi text={view.manual && view.requestedBy ? T.refreshRunningManual(view.since, view.requestedBy) : T.refreshRunningScheduled(view.since)} />
        </span>
      ) : null}
      {view.kind === 'cooldown' ? (
        <span className="hint">
          <Bi text={T.refreshAvailableAt(view.availableAt)} />
        </span>
      ) : null}
      {view.kind === 'outside_hours' ? (
        <span className="hint">
          <Bi text={T.refreshOutsideHours} />
        </span>
      ) : null}
      {view.kind === 'daily_limit' ? (
        <span className="hint">
          <Bi text={T.refreshDailyLimit} />
        </span>
      ) : null}
      {state.status === 'error' && view.kind === 'available' ? (
        <span className="field-error" role="alert">
          <Bi text={ERRORS[state.code]} />
        </span>
      ) : null}
    </span>
  );
}
