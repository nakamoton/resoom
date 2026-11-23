import { sql } from 'drizzle-orm';
import { boolean, check, date, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import type { CrawlTrigger, EvidenceKind, InstrumentClass, MemberRole, PolicyResult, RoomFees, SlotStatus } from '@resoom/core';

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
    /**
     * まだ使ったことのない部屋（候補）。予約システムの「器楽」などの目的で出てくる音楽向けの部屋から選んで台帳に入れたもの。
     * 空き状況は1日1回・土日祝だけ取得し、検索ページでは別の欄に出す
     */
    candidate: boolean('candidate').notNull().default(false),
    /** 利用料金（割引のない一般の料金と出典）。分からなければ null。初期データ（data/seed/rooms.json）から取り込む */
    fees: jsonb('fees').$type<RoomFees>(),
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

/**
 * 楽団員の名簿。ここに載っているメールアドレスの Google アカウントだけがログインできる（招待制）。
 * メールアドレスは小文字にそろえて保存する。
 */
export type CrawlRunStatus = 'requested' | 'running' | 'succeeded' | 'failed';

/**
 * 空き状況の取得（定期・手動）の記録。「今すぐ最新を取得」の間隔と回数の確認、取得の重なりの防止に使う。
 * 申し込み済み・実行中の取得は、同時に1件までにする（部分ユニーク索引）。
 */
export const crawlRuns = pgTable(
  'crawl_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    trigger: text('trigger').$type<CrawlTrigger>().notNull(),
    status: text('status').$type<CrawlRunStatus>().notNull(),
    /** 手動の取得を申し込んだ楽団員の名前。定期の取得は null。ログインした楽団員にだけ見せる */
    requestedBy: text('requested_by'),
    requestedAt: timestamp('requested_at', { withTimezone: true }).notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    /** 失敗したときの内容など */
    message: text('message'),
  },
  (t) => [
    check('crawl_runs_trigger', sql`${t.trigger} in ('schedule', 'manual')`),
    check('crawl_runs_status', sql`${t.status} in ('requested', 'running', 'succeeded', 'failed')`),
    uniqueIndex('crawl_runs_one_active').on(sql`(true)`).where(sql`${t.status} in ('requested', 'running')`),
    index('crawl_runs_requested_at').on(t.requestedAt),
  ],
);

export type CrawlRun = typeof crawlRuns.$inferSelect;

export const members = pgTable(
  'members',
  {
    email: text('email').primaryKey(),
    role: text('role').$type<MemberRole>().notNull(),
    /** 招待した人のメールアドレス。最初の管理者（環境変数から登録）は null */
    invitedBy: text('invited_by'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [check('members_role', sql`${t.role} in ('admin', 'editor', 'member')`)],
);

// ---- ログイン（Better Auth）のテーブル。項目は Better Auth の定義に合わせる ----

export const authUsers = pgTable('auth_users', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').notNull().default(false),
  image: text('image'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const authSessions = pgTable(
  'auth_sessions',
  {
    id: text('id').primaryKey(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    token: text('token').notNull().unique(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
    ipAddress: text('ip_address'),
    userAgent: text('user_agent'),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
  },
  (t) => [index('auth_sessions_user').on(t.userId)],
);

export const authAccounts = pgTable(
  'auth_accounts',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => authUsers.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
  },
  (t) => [index('auth_accounts_user').on(t.userId)],
);

export const authVerifications = pgTable('auth_verifications', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export type Room = typeof rooms.$inferSelect;
export type PolicyEvidence = typeof policyEvidences.$inferSelect;
export type AvailabilitySlotRow = typeof availabilitySlots.$inferSelect;
export type AvailabilitySnapshot = typeof availabilitySnapshots.$inferSelect;
export type Member = typeof members.$inferSelect;
