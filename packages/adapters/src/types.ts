/** 自治体をまたいで共通の、空き状況の状態。 */
export type SlotStatus =
  | 'available' // 空き
  | 'reserved' // 予約済み
  | 'not_bookable' // 予約申込対象外（受付期間外、抽選期間中など）
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

export interface AvailabilityQuery {
  /** 自治体サイト内での施設（会館）の識別子 */
  facilityCode: string;
  /** 部屋名。自治体サイトの表示名と完全一致で指定する */
  rooms: string[];
  /** YYYY-MM-DD（この日を含む） */
  from: string;
  /** YYYY-MM-DD（この日を含む） */
  to: string;
  /**
   * 照会したい日だけ true を返す関数（引数は YYYY-MM-DD）。省略するとすべての日。
   * アダプタは false の日のコマを返さず、その日のための問い合わせも省く。
   */
  wantsDate?: (date: string) => boolean;
}

export interface AvailabilityResult {
  rooms: RoomInfo[];
  slots: AvailabilitySlot[];
  /**
   * 実際に照会できた最後の日（YYYY-MM-DD）。受付開始前などでサイトが表示しない期間は含まない。
   * 1日も照会できなかった場合は null。
   */
  coveredThrough: string | null;
  fetchedAt: string;
}

/**
 * 自治体ごとの空き照会。ログイン不要の公開された照会だけを使うこと。
 * 実装は PoliteSession を通してリクエストを送り、サイトに負荷をかけない。
 */
export interface AvailabilityAdapter {
  /** 台帳の adapterId と対応する識別子（例: ota） */
  readonly id: string;
  /** 画面やログに出す名前（例: 大田区 うぐいすネット） */
  readonly label: string;
  listRooms(facilityCode: string): Promise<RoomInfo[]>;
  fetchAvailability(query: AvailabilityQuery): Promise<AvailabilityResult>;
}
