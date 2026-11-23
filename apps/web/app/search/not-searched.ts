import { municipalityName, type LocalizedText } from '@resoom/core';

/** 空き状況を自動で集めていない理由。 */
export type NotSearchedReason = 'robots' | 'paused' | 'unsupported' | 'unavailable';

export const NOT_SEARCHED_REASONS: Record<NotSearchedReason, LocalizedText> = {
  robots: {
    en: 'The booking site does not allow automated access (robots.txt).',
    ja: '予約サイトが機械的なアクセスを認めていません（robots.txt）。',
  },
  paused: {
    en: 'Paused until the new booking system starts in March 2027.',
    ja: '2027年3月に予約システムが新しくなるまで止めています。',
  },
  unsupported: {
    en: 'Not supported yet.',
    ja: 'まだ対応していません。',
  },
  unavailable: {
    en: 'No data right now (not collected yet, or the last update failed).',
    ja: '今はデータがありません（まだ集めていないか、前回の取得に失敗しました）。',
  },
};

/** 自治体ごとの理由。調査の結果は docs/*-investigation.md と設計書 10.1 を参照。 */
const REASON_BY_MUNICIPALITY: Record<string, NotSearchedReason> = {
  江戸川区: 'robots',
  目黒区: 'robots',
  川崎市: 'paused',
  文京区: 'unsupported',
  江東区: 'unsupported',
};

export interface NotSearchedCity<R> {
  municipality: string;
  reason: NotSearchedReason;
  rooms: R[];
}

/**
 * 空き状況を自動で集めていない部屋を、自治体ごとにまとめる。
 * 理由が決まっていない自治体（自動で集めているはずの自治体）は「今はデータがない」とする。
 */
export function groupNotSearched<R extends { municipality: string }>(rooms: readonly R[]): NotSearchedCity<R>[] {
  const byCity = new Map<string, R[]>();
  for (const room of rooms) byCity.set(room.municipality, [...(byCity.get(room.municipality) ?? []), room]);
  const order: NotSearchedReason[] = ['robots', 'paused', 'unsupported', 'unavailable'];
  return [...byCity.entries()]
    .map(([municipality, cityRooms]) => ({ municipality, reason: REASON_BY_MUNICIPALITY[municipality] ?? 'unavailable', rooms: cityRooms }))
    .sort((a, b) => order.indexOf(a.reason) - order.indexOf(b.reason) || a.municipality.localeCompare(b.municipality, 'ja'));
}

/** 理由ごとに自治体をまとめる（ページ上部の案内を短くするため）。groupNotSearched の並び順を保つ。 */
export function byReason<R>(cities: readonly NotSearchedCity<R>[]): { reason: NotSearchedReason; cities: NotSearchedCity<R>[] }[] {
  const groups: { reason: NotSearchedReason; cities: NotSearchedCity<R>[] }[] = [];
  for (const city of cities) {
    const last = groups.at(-1);
    if (last?.reason === city.reason) last.cities.push(city);
    else groups.push({ reason: city.reason, cities: [city] });
  }
  return groups;
}

/**
 * 空き状況を自動で集めている自治体（検索の絞り込みの選択肢）。
 * 集めた空き状況がある部屋が1つでもある自治体だけを、英語名の順に返す。
 * 集めていない自治体は選んでも結果が出ず紛らわしいので、選択肢に出さない。
 */
export function searchableMunicipalities(
  rooms: readonly { id: string; municipality: string }[],
  trackedRoomIds: ReadonlySet<string>,
): string[] {
  const cities = new Set(rooms.filter((room) => trackedRoomIds.has(room.id)).map((room) => room.municipality));
  const label = (name: string): string => municipalityName(name).en ?? name;
  return [...cities].sort((a, b) => label(a).localeCompare(label(b), 'en'));
}
