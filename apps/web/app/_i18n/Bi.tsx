import { ERROR_MESSAGES, municipalityName, type ErrorCode, type LocalizedText } from '@resoom/core';

/**
 * 英語を主に、日本語を併記して表示する。
 * stack を付けると日本語を次の行に出す（見出し向け）。
 */
export function Bi({ text, stack = false }: { text: LocalizedText; stack?: boolean }) {
  return (
    <span className={stack ? 'bi stack' : 'bi'}>
      <span lang="en">{text.en}</span> <span lang="ja" className="ja">{text.ja}</span>
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
  return <Bi text={{ en: `${room.facilityNameEn ?? room.facilityName} ${room.roomNameEn ?? room.roomName}`, ja }} stack={stack} />;
}

/** 自治体名。英語表記があれば併記する。 */
export function Municipality({ name }: { name: string }) {
  const { en, ja } = municipalityName(name);
  return en ? <Bi text={{ en, ja }} /> : <span lang="ja">{ja}</span>;
}

/** 自治体名を文字列で（属性向け）。 */
export const municipalityPlain = (name: string): string => {
  const { en, ja } = municipalityName(name);
  return en ? `${en} / ${ja}` : ja;
};
