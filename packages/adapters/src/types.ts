/** 自治体をまたいで共通の、空き状況の状態。 */
export type SlotStatus =
  | 'available' // 空き
  | 'reserved' // 予約済み
  | 'not_bookable' // 予約申込対象外（受付期間外など）
  | 'closed' // 休館日
  | 'maintenance' // 保守点検
  | 'suspended' // 利用中止
  | 'unavailable' // 利用不可
  | 'unknown'; // 解析できなかった

/** 1部屋・1日・1コマの空き状況。時刻は日本時間。 */
export interface AvailabilitySlot {
  facility: string;
  room: string;
  /** YYYY-MM-DD */
  date: string;
  /** HH:MM */
  start: string;
  /** HH:MM */
  end: string;
  status: SlotStatus;
  /** 自治体サイトの表示そのまま（解析結果の検証用） */
  rawLabel: string;
}

/** 自治体サイトの部屋一覧の1行。 */
export interface RoomInfo {
  /** 自治体サイト内での部屋の識別子 */
  key: string;
  facility: string;
  room: string;
  capacity: number | null;
}
