import type { PoliteSessionOptions } from './http';
import { KawasakiClient } from './kawasaki/client';
import { KotoClient } from './koto/client';
import { OtaClient } from './ota/client';
import { SetagayaClient } from './setagaya/client';
import { ShibuyaClient } from './shibuya/client';
import { ShinagawaClient } from './shinagawa/client';
import type { AvailabilityAdapter } from './types';

interface AdapterEntry {
  create: (options?: PoliteSessionOptions) => AvailabilityAdapter;
  /** 何も指定しないときの検索対象に含めるか */
  enabledByDefault: boolean;
  /** 使うときの注意 */
  note?: string;
}

const ENTRIES: Record<string, AdapterEntry> = {
  kawasaki: {
    create: (options) => new KawasakiClient(options),
    // 送信元のIPアドレスがリクエストごとに変わる環境では、画面遷移の途中で前の画面に戻されて失敗する。
    // 固定のIPアドレスから動かせる環境で、明示的に指定して使う。
    enabledByDefault: false,
    note: '送信元のIPアドレスが変わる環境では失敗します。固定のIPアドレスから使ってください',
  },
  // robots.txt なし（404）。ログインなしの空き照会は財団が「どなたでも」と案内している。docs/koto-investigation.md
  koto: { create: (options) => new KotoClient(options), enabledByDefault: true },
  ota: { create: (options) => new OtaClient(options), enabledByDefault: true },
  // robots.txt は 403（空）。RFC 9309 では 4xx は「robots.txt なし（制限なし）」として扱う
  setagaya: { create: (options) => new SetagayaClient(options), enabledByDefault: true },
  shibuya: { create: (options) => new ShibuyaClient(options), enabledByDefault: true },
  // robots.txt はサーバーエラー（502）で取得できない。共用サーバーで robots.txt が置かれていないと判断し、
  // 楽団の判断（2026-11-23）で既定で有効にした。経緯は docs/shinagawa-investigation.md
  shinagawa: { create: (options) => new ShinagawaClient(options), enabledByDefault: true },
};

/** 対応している adapterId の一覧。 */
export const ADAPTER_IDS: readonly string[] = Object.keys(ENTRIES);

/** 何も指定しないときに検索対象にする adapterId の一覧。 */
export const DEFAULT_ADAPTER_IDS: readonly string[] = ADAPTER_IDS.filter((id) => ENTRIES[id]?.enabledByDefault);

/** 台帳の adapterId から、その自治体の空き照会を作る。未対応なら null。 */
export function createAdapter(id: string, options?: PoliteSessionOptions): AvailabilityAdapter | null {
  return ENTRIES[id]?.create(options) ?? null;
}

/** そのアダプタを使うときの注意。なければ null。 */
export function adapterNote(id: string): string | null {
  return ENTRIES[id]?.note ?? null;
}
