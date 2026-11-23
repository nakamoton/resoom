/** 人数で部屋を絞った結果。 */
export interface CapacityFilterResult<R> {
  /** 定員が人数以上の部屋 */
  fits: R[];
  /** 定員が分からない部屋（入れるかどうか判断できないので、除外せずに分けて返す） */
  unknown: R[];
  /** 定員が人数より少ない部屋 */
  tooSmall: R[];
}

/**
 * 人数で部屋を分ける。people が null なら絞らない（すべて fits）。
 * 定員は公式の「定員」で、楽器や譜面台を置いたときに実際に入れる人数とは限らない。
 */
export function filterByCapacity<R extends { capacity: number | null }>(rooms: readonly R[], people: number | null): CapacityFilterResult<R> {
  if (people === null) return { fits: [...rooms], unknown: [], tooSmall: [] };
  const result: CapacityFilterResult<R> = { fits: [], unknown: [], tooSmall: [] };
  for (const room of rooms) {
    if (room.capacity === null) result.unknown.push(room);
    else if (room.capacity >= people) result.fits.push(room);
    else result.tooSmall.push(room);
  }
  return result;
}

/** 画面やコマンドから受け取った人数を読む。空なら null、正しくなければ undefined。 */
export function parsePeople(value: string | null | undefined): number | null | undefined {
  const text = (value ?? '').trim();
  if (text === '') return null;
  if (!/^\d{1,4}$/.test(text) || Number(text) < 1) return undefined;
  return Number(text);
}

/** 例: 「定員 50人」「定員 未登録」 */
export function capacityLabel(capacity: number | null): string {
  return capacity === null ? '定員 未登録' : `定員 ${capacity}人`;
}
