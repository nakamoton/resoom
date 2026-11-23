import { ERROR_MESSAGES, municipalityName, type ErrorCode, type LocalizedText } from '@resoom/core';

/**
 * 画面の文言。英語を主に、日本語は英語が苦手な人向けの補助として小さく控えめに添える。
 * stack を付けると日本語を次の行に出す（狭い場所向け）。
 */
export function Bi({ text, stack = false }: { text: LocalizedText; stack?: boolean }) {
  return (
    <span className={stack ? 'bi stack' : 'bi'}>
      <span lang="en">{text.en}</span> <span lang="ja" className="ja">{text.ja}</span>
    </span>
  );
}

/**
 * 固有の名称（施設名・部屋名・自治体名）。日本語は予約サイトの正式な表記なので、文言の日本語より目立つように出す。
 */
function Name({ en, ja, stack = false }: { en: string; ja: string; stack?: boolean }) {
  return (
    <span className={stack ? 'name stack' : 'name'}>
      <span lang="en">{en}</span> <span lang="ja" className="name-ja">{ja}</span>
    </span>
  );
}

/** 属性（placeholder や aria-label）のように、文字列しか入れられないところ向け。 */
export const plain = (text: LocalizedText): string => `${text.en} / ${text.ja}`;

/** 入力エラーを英語と日本語で表示する。 */
export function FieldError({ id, code }: { id: string; code: ErrorCode | undefined }) {
  if (!code) return null;
  return (
    <p className="field-error" id={id}>
      <Bi text={ERROR_MESSAGES[code]} />
    </p>
  );
}

/**
 * 施設名と部屋名。英語名があれば英語を主にして日本語の正式名を併記し、なければ日本語だけを出す。
 * 片方だけ英語名がある場合は、ない方を日本語のまま英語の行に入れる。
 */
export function RoomName({
  room,
  stack = false,
}: {
  room: { facilityName: string; roomName: string; facilityNameEn: string | null; roomNameEn: string | null };
  stack?: boolean;
}) {
  const ja = `${room.facilityName} ${room.roomName}`;
  if (!room.facilityNameEn && !room.roomNameEn) return <span lang="ja">{ja}</span>;
  return <Name en={`${room.facilityNameEn ?? room.facilityName} ${room.roomNameEn ?? room.roomName}`} ja={ja} stack={stack} />;
}

/** 自治体名。英語表記があれば併記する。 */
export function Municipality({ name }: { name: string }) {
  const { en, ja } = municipalityName(name);
  return en ? <Name en={en} ja={ja} /> : <span lang="ja">{ja}</span>;
}

/** 自治体名を文字列で（属性向け）。 */
export const municipalityPlain = (name: string): string => {
  const { en, ja } = municipalityName(name);
  return en ? `${en} / ${ja}` : ja;
};
