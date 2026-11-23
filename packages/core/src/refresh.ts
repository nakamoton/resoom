/**
 * 検索ページの「今すぐ最新を取得」の決まり。
 * 自治体サイトに負担をかけないよう、ログインした楽団員だけが、間隔を空けて、受付時間内に使える。
 * 画面の表示（ボタンを出すか）とサーバー側の確認の両方で、この判定を使う。
 */
export const REFRESH_RULES = {
  /** 前回の取得（定期・手動とも）から、これだけ空ける */
  cooldownMinutes: 20,
  /** 使える時間（日本時間）。from 時から until 時の前まで */
  fromHour: 7,
  untilHour: 22,
  /** 1日（日本時間）に申し込める回数 */
  dailyLimit: 10,
} as const;

export type CrawlTrigger = 'schedule' | 'manual';

export interface RefreshState {
  /** いちばん最近の取得の時刻（始まった時刻か、空き状況を保存した時刻の新しいほう）。まだなければ null */
  lastFetchAt: Date | null;
  /** 申し込み済み、または実行中の取得。なければ null */
  active: { trigger: CrawlTrigger; requestedBy: string | null; since: Date } | null;
  /** 今日（日本時間）申し込まれた手動の取得の回数 */
  manualToday: number;
}

export type RefreshAvailability =
  | { kind: 'available' }
  | { kind: 'running'; trigger: CrawlTrigger; requestedBy: string | null; since: Date }
  | { kind: 'cooldown'; availableAt: Date }
  | { kind: 'outside_hours' }
  | { kind: 'daily_limit' };

const JST_OFFSET_MS = 9 * 3_600_000;

/** 日本時間の時（0〜23）。 */
export const japanHour = (at: Date): number => new Date(at.getTime() + JST_OFFSET_MS).getUTCHours();

/** 日本時間で、その日の0時の時刻。 */
export function startOfJapanDay(at: Date): Date {
  const day = new Date(at.getTime() + JST_OFFSET_MS).toISOString().slice(0, 10);
  return new Date(Date.parse(`${day}T00:00:00Z`) - JST_OFFSET_MS);
}

/** いま「今すぐ最新を取得」を使えるか。使えなければ、その理由。 */
export function refreshAvailability(state: RefreshState, now: Date): RefreshAvailability {
  if (state.active) return { kind: 'running', ...state.active };
  const hour = japanHour(now);
  if (hour < REFRESH_RULES.fromHour || hour >= REFRESH_RULES.untilHour) return { kind: 'outside_hours' };
  if (state.manualToday >= REFRESH_RULES.dailyLimit) return { kind: 'daily_limit' };
  if (state.lastFetchAt) {
    const availableAt = new Date(state.lastFetchAt.getTime() + REFRESH_RULES.cooldownMinutes * 60_000);
    if (now < availableAt) return { kind: 'cooldown', availableAt };
  }
  return { kind: 'available' };
}
