import { sql } from 'drizzle-orm';
import { check, date, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { EvidenceKind, InstrumentClass, PolicyResult, SlotStatus } from '@resoom/core';

/** 施設台帳の部屋。 */
export const rooms = pgTable(
  'rooms',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    municipality: text('municipality').notNull(),
    facilityName: text('facility_name').notNull(),
    roomName: text('room_name').notNull(),
    /** 施設名の英語表記（楽団での訳）。null なら日本語だけを表示する */
    facilityNameEn: text('facility_name_en'),
    /** 部屋名の英語表記（楽団での訳） */
    roomNameEn: text('room_name_en'),
    capacity: integer('capacity'),
    /** 定員の出典（例: 「うぐいすネットの部屋一覧（2026-11-23）」）。定員が分からなければ null */
    capacitySource: text('capacity_source'),
    nearestStation: text('nearest_station'),
    /** 空き状況を取得するアダプタ（例: ota）。未対応の部屋は null */
    adapterId: text('adapter_id'),
    /** アダプタ側での会館コード */
    adapterFacilityCode: text('adapter_facility_code'),
    /**
     * 自治体サイトでの部屋名。台帳の部屋名と違う場合や、複数の部屋を合わせて使う場合に指定する。
     * null なら台帳の部屋名をそのまま使う
     */
    adapterRoomNames: text('adapter_room_names').array(),
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

/** 定期実行の取得処理が保存した、部屋ごとの空き状況（1日・1コマ）。検索ページはこれだけを読む。 */
export const availabilitySlots = pgTable(
  'availability_slots',
  {
    roomId: uuid('room_id')
      .notNull()
      .references(() => rooms.id, { onDelete: 'cascade' }),
    date: date('date', { mode: 'string' }).notNull(),
    /** HH:MM */
    start: text('start_time').notNull(),
    /** HH:MM */
    end: text('end_time').notNull(),
    status: text('status').$type<SlotStatus>().notNull(),
    /** 自治体サイトの表示そのまま */
    rawLabel: text('raw_label').notNull(),
  },
  (t) => [primaryKey({ columns: [t.roomId, t.date, t.start] }), index('availability_slots_date').on(t.date)],
);

/** 部屋ごとの、最後に取得した空き状況の範囲と時刻、失敗の記録。 */
export const availabilitySnapshots = pgTable('availability_snapshots', {
  roomId: uuid('room_id')
    .primaryKey()
    .references(() => rooms.id, { onDelete: 'cascade' }),
  /** 最後に成功した取得で照会した最初の日 */
  coveredFrom: date('covered_from', { mode: 'string' }),
  /** 最後に成功した取得で照会できた最後の日。照会できる期間がなければ null */
  coveredThrough: date('covered_through', { mode: 'string' }),
  /** 最後に成功した取得の時刻 */
  fetchedAt: timestamp('fetched_at', { withTimezone: true }),
  /** 最後の取得が失敗したときのメッセージ。成功したら null に戻す */
  lastError: text('last_error'),
  lastErrorAt: timestamp('last_error_at', { withTimezone: true }),
});

export type Room = typeof rooms.$inferSelect;
export type PolicyEvidence = typeof policyEvidences.$inferSelect;
export type AvailabilitySlotRow = typeof availabilitySlots.$inferSelect;
export type AvailabilitySnapshot = typeof availabilitySnapshots.$inferSelect;
