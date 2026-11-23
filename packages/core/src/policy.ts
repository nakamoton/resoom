import type { LocalizedText } from './i18n';

/** 音出し条件を記録する楽器の区分。 */
export const INSTRUMENT_CLASSES = ['wind', 'small_percussion', 'drum_set', 'large_percussion', 'taiko'] as const;
export type InstrumentClass = (typeof INSTRUMENT_CLASSES)[number];

export const INSTRUMENT_LABELS: Record<InstrumentClass, LocalizedText> = {
  wind: { en: 'Wind instruments', ja: '管楽器' },
  small_percussion: { en: 'Small percussion', ja: '小物打楽器' },
  drum_set: { en: 'Drum kit', ja: 'ドラムセット' },
  large_percussion: { en: 'Large percussion (timpani, bass drum)', ja: '大型打楽器' },
  taiko: { en: 'Taiko (Japanese drums)', ja: '和太鼓' },
};

/** 一覧など、場所が限られるところで使う短い楽器名。 */
export const INSTRUMENT_SHORT_LABELS: Record<InstrumentClass, LocalizedText> = {
  wind: { en: 'Winds', ja: '管楽器' },
  small_percussion: { en: 'Small perc.', ja: '小物' },
  drum_set: { en: 'Drum kit', ja: 'ドラム' },
  large_percussion: { en: 'Large perc.', ja: '大型' },
  taiko: { en: 'Taiko', ja: '和太鼓' },
};

/** 1件の記録が示す結果。 */
export const POLICY_RESULTS = ['allowed', 'conditional', 'prohibited'] as const;
export type PolicyResult = (typeof POLICY_RESULTS)[number];
/** 部屋の現在の状態。記録がなければ unknown。 */
export type PolicyStatus = PolicyResult | 'unknown';

export const STATUS_LABELS: Record<PolicyStatus, LocalizedText> = {
  allowed: { en: 'Allowed', ja: '可' },
  conditional: { en: 'Conditional', ja: '条件付き' },
  prohibited: { en: 'Not allowed', ja: '不可' },
  unknown: { en: 'Unknown', ja: '未確認' },
};

/** 記録の種類。 */
export const EVIDENCE_KINDS = ['usage', 'inquiry', 'document'] as const;
export type EvidenceKind = (typeof EVIDENCE_KINDS)[number];

export const EVIDENCE_KIND_LABELS: Record<EvidenceKind, LocalizedText> = {
  usage: { en: 'When we used the room', ja: '利用したときのこと' },
  inquiry: { en: 'Asked the facility', ja: '施設への問い合わせ' },
  document: { en: 'Official document', ja: '公式の資料' },
};

/** 状態の判定に必要な、記録の最小限の形。 */
export interface EvidenceLike {
  /** 出来事のあった日（YYYY-MM-DD） */
  occurredOn: string;
  /** 登録した日時。同じ日の記録の順序づけに使う */
  createdAt: Date;
  result: PolicyResult;
  /** 対象の楽器。空なら「楽器を限定しない（合奏全体）」記録 */
  instruments: readonly InstrumentClass[];
}

export interface ClassPolicy<E extends EvidenceLike> {
  status: PolicyStatus;
  /** その状態の根拠になった記録 */
  basis: E | null;
}

const isNewer = (a: EvidenceLike, b: EvidenceLike): boolean =>
  a.occurredOn !== b.occurredOn ? a.occurredOn > b.occurredOn : a.createdAt.getTime() > b.createdAt.getTime();

const latest = <E extends EvidenceLike>(items: E[]): E | null =>
  items.reduce<E | null>((best, e) => (best === null || isNewer(e, best) ? e : best), null);

/**
 * 記録の一覧から、楽器区分ごとの現在の状態を決める。
 *
 * - その楽器を名指しした記録があれば、その中で最も新しいものに従う。
 * - なければ、楽器を限定しない記録の中で最も新しいものに従う。
 * - どちらもなければ未確認。
 *
 * 「ドラムセットは不可」と言われた部屋が、後日ドラムなしで問題なく使えた記録によって
 * 「ドラムセット可」に戻ってしまわないよう、名指しの記録を優先する。
 */
export function effectivePolicy<E extends EvidenceLike>(evidences: readonly E[]): Record<InstrumentClass, ClassPolicy<E>> {
  const general = latest(evidences.filter((e) => e.instruments.length === 0));
  const entries = INSTRUMENT_CLASSES.map((cls) => {
    const basis = latest(evidences.filter((e) => e.instruments.includes(cls))) ?? general;
    return [cls, { status: basis?.result ?? 'unknown', basis }] as const;
  });
  return Object.fromEntries(entries) as Record<InstrumentClass, ClassPolicy<E>>;
}
