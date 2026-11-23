import type { PoliteSessionOptions } from './http';
import { KawasakiClient } from './kawasaki/client';
import { OtaClient } from './ota/client';
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
  ota: { create: (options) => new OtaClient(options), enabledByDefault: true },
  shibuya: { create: (options) => new ShibuyaClient(options), enabledByDefault: true },
  shinagawa: {
    create: (options) => new ShinagawaClient(options),
    // サイトの robots.txt がサーバーエラー（502）で取得できず、機械的なアクセスの可否を確認できていない。
    // 使うかどうかの判断がつくまで、明示的に指定したときだけ使う。
    enabledByDefault: false,
    note: 'robots.txt が取得できず（502）、機械的なアクセスの可否を確認できていません',
  },
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
