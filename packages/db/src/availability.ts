import { and, eq, gte, lte } from 'drizzle-orm';
import type { SlotStatus } from '@resoom/core';
import type { Db } from './client';
import { availabilitySlots, availabilitySnapshots, type AvailabilitySlotRow, type AvailabilitySnapshot } from './schema';

export interface SaveAvailabilityInput {
  roomId: string;
  /** 照会した最初の日（YYYY-MM-DD） */
  from: string;
  /** 照会を頼んだ最後の日（YYYY-MM-DD） */
  to: string;
  /** 実際に照会できた最後の日。照会できる期間がなければ null */
  coveredThrough: string | null;
  fetchedAt: Date;
  slots: { date: string; start: string; end: string; status: SlotStatus; rawLabel: string }[];
}

/**
 * 1部屋の取得結果を保存する。照会した期間（from〜to）の古いコマは置き換える。
 * 取得に成功したので、前回の失敗の記録は消す。
 */
export async function saveAvailability(db: Db, input: SaveAvailabilityInput): Promise<void> {
  await db.transaction(async (tx) => {
    await tx
      .delete(availabilitySlots)
      .where(and(eq(availabilitySlots.roomId, input.roomId), gte(availabilitySlots.date, input.from), lte(availabilitySlots.date, input.to)));
    const rows = input.slots
      .filter((s) => s.date >= input.from && s.date <= input.to)
      .map((s) => ({ roomId: input.roomId, date: s.date, start: s.start, end: s.end, status: s.status, rawLabel: s.rawLabel }));
    if (rows.length > 0) await tx.insert(availabilitySlots).values(rows).onConflictDoNothing();
    const snapshot = {
      coveredFrom: input.from,
      coveredThrough: input.coveredThrough,
      fetchedAt: input.fetchedAt,
      lastError: null,
      lastErrorAt: null,
    };
    await tx
      .insert(availabilitySnapshots)
      .values({ roomId: input.roomId, ...snapshot })
      .onConflictDoUpdate({ target: availabilitySnapshots.roomId, set: snapshot });
  });
}

/** 取得の失敗を記録する。保存済みのコマと前回の成功の記録は残す。 */
export async function recordAvailabilityError(db: Db, roomId: string, message: string, at: Date): Promise<void> {
  const error = { lastError: message.slice(0, 500), lastErrorAt: at };
  await db
    .insert(availabilitySnapshots)
    .values({ roomId, ...error })
    .onConflictDoUpdate({ target: availabilitySnapshots.roomId, set: error });
}

/** 期間内の保存済みのコマと、全部屋の取得の記録を読む。 */
export async function loadAvailability(
  db: Db,
  range: { from: string; to: string },
): Promise<{ slots: AvailabilitySlotRow[]; snapshots: AvailabilitySnapshot[] }> {
  const slots = await db
    .select()
    .from(availabilitySlots)
    .where(and(gte(availabilitySlots.date, range.from), lte(availabilitySlots.date, range.to)));
  const snapshots = await db.select().from(availabilitySnapshots);
  return { slots, snapshots };
}
