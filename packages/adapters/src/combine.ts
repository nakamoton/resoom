import type { AvailabilitySlot } from './types';

/**
 * 複数の部屋を合わせて1部屋として使う場合（合併利用）の空き状況を作る。
 * すべての部屋が空いているコマだけを空きとし、そうでなければ空いていない部屋の状態を返す。
 * 部屋によってコマの区切りが違う場合は判断できないので unknown とする。
 */
export function combineRooms(slots: readonly AvailabilitySlot[], parts: readonly string[], combinedName: string): AvailabilitySlot[] {
  const [first, ...rest] = parts;
  if (first === undefined) return [];
  const keyOf = (s: AvailabilitySlot): string => `${s.date} ${s.start}-${s.end}`;
  const byRoom = new Map<string, Map<string, AvailabilitySlot>>();
  for (const s of slots) {
    if (!byRoom.has(s.room)) byRoom.set(s.room, new Map());
    byRoom.get(s.room)?.set(keyOf(s), s);
  }

  return [...(byRoom.get(first)?.values() ?? [])].map((base) => {
    const all = [base, ...rest.map((room) => byRoom.get(room)?.get(keyOf(base)))];
    if (all.some((s) => s === undefined)) {
      return { ...base, room: combinedName, status: 'unknown' as const, rawLabel: '部屋によってコマの区切りが違います' };
    }
    const blocked = all.find((s) => s?.status !== 'available');
    return { ...base, room: combinedName, status: blocked?.status ?? 'available', rawLabel: blocked?.rawLabel ?? base.rawLabel };
  });
}
