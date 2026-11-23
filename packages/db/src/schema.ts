import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { EvidenceKind, InstrumentClass, PolicyResult } from '@resoom/core';

/** 施設台帳の部屋。 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    municipality: text('municipality').notNull(),
    facilityName: text('facility_name').notNull(),
    roomName: text('room_name').notNull(),
    capacity: integer('capacity'),
    nearestStation: text('nearest_station'),
    /** 空き状況を取得するアダプタ（例: ota）。未対応の部屋は null */
    adapterId: text('adapter_id'),
    /** アダプタ側での会館コード */
    adapterFacilityCode: text('adapter_facility_code'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('rooms_identity').on(t.municipality, t.facilityName, t.roomName)],
);

/** 音出し条件の記録（利用実績・問い合わせ・公式資料）。部屋の現在の状態はここから導く。 */
export const policyEvidences = pgTable(
  'policy_evidences',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    kind: text('kind').$type<EvidenceKind>().notNull(),
    occurredOn: date('occurred_on', { mode: 'string' }).notNull(),
    result: text('result').$type<PolicyResult>().notNull(),
    /** 対象の楽器。空配列は「楽器を限定しない」 */
    instruments: text('instruments').array().$type<InstrumentClass[]>().notNull().default(sql`'{}'::text[]`),
    note: text('note').notNull(),
    sourceUrl: text('source_url'),
    reportedBy: text('reported_by').notNull(),
    /** 初期データの取り込みを繰り返しても重複しないための鍵 */
    seedKey: text('seed_key').unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index('policy_evidences_room').on(t.roomId),
    check('policy_evidences_kind', sql`${t.kind} in ('usage', 'inquiry', 'document')`),
    check('policy_evidences_result', sql`${t.result} in ('allowed', 'conditional', 'prohibited')`),
  ],
);

export type Room = typeof rooms.$inferSelect;
export type PolicyEvidence = typeof policyEvidences.$inferSelect;
