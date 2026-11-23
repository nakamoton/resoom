import type { PoliteSessionOptions } from './http';
import { OtaClient } from './ota/client';
import type { AvailabilityAdapter } from './types';

const FACTORIES: Record<string, (options?: PoliteSessionOptions) => AvailabilityAdapter> = {
  ota: (options) => new OtaClient(options),
};

/** 対応している adapterId の一覧。 */
export const ADAPTER_IDS: readonly string[] = Object.keys(FACTORIES);

/** 台帳の adapterId から、その自治体の空き照会を作る。未対応なら null。 */
export function createAdapter(id: string, options?: PoliteSessionOptions): AvailabilityAdapter | null {
  return FACTORIES[id]?.(options) ?? null;
}
