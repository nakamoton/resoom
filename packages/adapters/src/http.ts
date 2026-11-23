export interface PoliteSessionOptions {
  /** 連続するリクエストの最小間隔（ミリ秒）。既定は2秒。 */
  minIntervalMs?: number;
  /** User-Agent。連絡先を入れるかどうかは運用側で決める。 */
  userAgent?: string;
  /** 1つのセッションが送れるリクエスト数の上限。暴走の歯止め。 */
  maxRequests?: number;
  fetchImpl?: typeof fetch;
  now?: () => Date;
  sleep?: (ms: number) => Promise<void>;
}

export interface SiteProfile {
  /** 例: https://www.yoyaku.city.ota.tokyo.jp */
  origin: string;
  /** サイトの名前。エラーメッセージに使う */
  name: string;
  /** サイトが止まる時間帯（日本時間）。from 時から to 時の手前まで問い合わせない */
  closedHours?: { from: number; to: number };
  /** ページの文字コード。既定は utf-8 */
  encoding?: string;
}

export interface RequestOptions {
  /** フォームとして送る内容（POST） */
  form?: URLSearchParams | string;
  /** JSON として送る内容（POST） */
  json?: unknown;
  headers?: Record<string, string>;
}

export interface SiteResponse {
  status: number;
  /** リダイレクトをたどった後の最終的なパス */
  path: string;
  text: string;
}

const MAX_REDIRECTS = 5;

/**
 * 自治体サイトに礼儀正しくアクセスするための共通部品。
 * リクエストは1件ずつ間隔を空けて送り、回数に上限を設け、サイトの停止時間帯には送らない。
 * Cookie を保持し、同じサイト内のリダイレクトをたどる。
 */
export class PoliteSession {
  private readonly minIntervalMs: number;
  private readonly userAgent: string;
  private readonly maxRequests: number;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => Date;
  private readonly sleep: (ms: number) => Promise<void>;
  private cookies = new Map<string, string>();
  private lastRequestAt = 0;
  private requestCount = 0;

  constructor(
    private readonly site: SiteProfile,
    options: PoliteSessionOptions = {},
  ) {
    this.minIntervalMs = options.minIntervalMs ?? 2000;
    this.userAgent = options.userAgent ?? 'Mozilla/5.0 (compatible; availability-checker/0.1)';
    this.maxRequests = options.maxRequests ?? 60;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.now = options.now ?? (() => new Date());
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  /** 現在時刻（テストで差し替えられる時計）。 */
  currentTime(): Date {
    return this.now();
  }

  /** あと何回リクエストを送れるか。 */
  get remainingRequests(): number {
    return Math.max(0, this.maxRequests - this.requestCount);
  }

  /** Cookie を捨てて、新しい訪問としてやり直す。 */
  clearCookies(): void {
    this.cookies.clear();
  }

  /** 1件のリクエストを送り、本文を文字列で返す。200番台以外はエラー。 */
  async request(path: string, options: RequestOptions = {}): Promise<SiteResponse> {
    let method = options.form !== undefined || options.json !== undefined ? 'POST' : 'GET';
    let body: string | undefined;
    const headers: Record<string, string> = { ...options.headers };
    if (options.json !== undefined) {
      body = JSON.stringify(options.json);
      headers['Content-Type'] ??= 'application/json';
    } else if (options.form !== undefined) {
      body = options.form.toString();
      headers['Content-Type'] ??= 'application/x-www-form-urlencoded';
    }

    let current = path;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop += 1) {
      const res = await this.send(current, method, headers, body);
      if (res.status >= 300 && res.status < 400) {
        const location = res.headers.get('location');
        if (!location) throw new Error(`${this.site.name} ${current}: 転送先のないリダイレクト（HTTP ${res.status}）`);
        const next = new URL(location, `${this.site.origin}${current}`);
        if (next.origin !== this.site.origin) {
          throw new Error(`${this.site.name} ${current}: 別のサイトへのリダイレクトです（${next.origin}）`);
        }
        current = `${next.pathname}${next.search}`;
        // リダイレクト先は GET で取り直す
        method = 'GET';
        body = undefined;
        delete headers['Content-Type'];
        continue;
      }
      if (res.status < 200 || res.status >= 300) throw new Error(`${this.site.name} ${current}: HTTP ${res.status}`);
      const bytes = await res.arrayBuffer();
      return { status: res.status, path: current, text: new TextDecoder(this.site.encoding ?? 'utf-8').decode(bytes) };
    }
    throw new Error(`${this.site.name} ${path}: リダイレクトが多すぎます`);
  }

  private async send(path: string, method: string, headers: Record<string, string>, body: string | undefined): Promise<Response> {
    this.assertOpen();
    if (this.requestCount >= this.maxRequests) {
      throw new Error(`リクエスト数の上限（${this.maxRequests}）に達しました`);
    }
    const wait = this.lastRequestAt + this.minIntervalMs - this.now().getTime();
    if (this.requestCount > 0 && wait > 0) await this.sleep(wait);

    this.requestCount += 1;
    this.lastRequestAt = this.now().getTime();
    const sent: Record<string, string> = { 'User-Agent': this.userAgent, 'Accept-Language': 'ja', ...headers };
    if (this.cookies.size > 0) sent.Cookie = [...this.cookies].map(([k, v]) => `${k}=${v}`).join('; ');

    const res = await this.fetchImpl(`${this.site.origin}${path}`, { method, headers: sent, body, redirect: 'manual' });
    for (const line of res.headers.getSetCookie()) {
      const pair = line.split(';', 1)[0] ?? '';
      const eq = pair.indexOf('=');
      if (eq > 0) this.cookies.set(pair.slice(0, eq).trim(), pair.slice(eq + 1).trim());
    }
    return res;
  }

  private assertOpen(): void {
    const closed = this.site.closedHours;
    if (!closed) return;
    const hour = (this.now().getUTCHours() + 9) % 24;
    const isClosed = closed.from <= closed.to ? hour >= closed.from && hour < closed.to : hour >= closed.from || hour < closed.to;
    if (isClosed) throw new Error(`${this.site.name}の受付時間外です（${closed.from}時〜${closed.to}時は停止）`);
  }
}

/** YYYY-MM-DD を UTC の日付として読む。形式や日付が不正ならエラー。 */
export function parseIsoDate(value: string): Date {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  const date = m ? new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]))) : null;
  if (!date || date.toISOString().slice(0, 10) !== value) {
    throw new Error(`日付は YYYY-MM-DD 形式で指定してください: ${value}`);
  }
  return date;
}

export function formatIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 86_400_000);
}
