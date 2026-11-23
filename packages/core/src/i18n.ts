/** 英語と日本語を対にした文言。画面では英語を主に、日本語を併記する。 */
export interface LocalizedText {
  en: string;
  ja: string;
}

/** 自治体名の英語表記（各区市の公式の英語表記に合わせる）。 */
const MUNICIPALITY_EN: Record<string, string> = {
  大田区: 'Ota City',
  川崎市: 'Kawasaki City',
  渋谷区: 'Shibuya City',
  江戸川区: 'Edogawa City',
  品川区: 'Shinagawa City',
  目黒区: 'Meguro City',
  世田谷区: 'Setagaya City',
  文京区: 'Bunkyo City',
  江東区: 'Koto City',
};

/** 自治体名を英語と日本語の対で返す。英語表記が分からなければ en は null。 */
export function municipalityName(ja: string): { en: string | null; ja: string } {
  return { en: MUNICIPALITY_EN[ja] ?? null, ja };
}
