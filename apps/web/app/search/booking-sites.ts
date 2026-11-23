/** 自治体ごとの公式の予約サイト（空き照会の入口）。 */
export const BOOKING_SITES: Record<string, string> = {
  大田区: 'https://www.yoyaku.city.ota.tokyo.jp/',
  川崎市: 'https://www.fureai-net.city.kawasaki.jp/',
  渋谷区: 'https://www.yoyaku.city.shibuya.tokyo.jp/',
  江戸川区: 'https://www.shisetsuyoyaku.city.edogawa.tokyo.jp/user/Home',
  品川区: 'https://www.cm9.eprs.jp/shinagawa/web/',
  目黒区: 'https://resv.city.meguro.tokyo.jp/web/Home',
  世田谷区: 'https://setagaya.keyakinet.net/Web/',
  文京区: 'https://www.shisetsu.city.bunkyo.lg.jp/user/Home',
  // 財団の案内ページ（利用規約に同意してから予約システムへ進む）
  江東区: 'https://www.kcf.or.jp/yoyaku/shisetsu/',
};
