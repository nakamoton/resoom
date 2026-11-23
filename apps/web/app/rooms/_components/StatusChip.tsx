import { STATUS_LABELS, type LocalizedText, type PolicyStatus } from '@resoom/core';

/** 一覧で使う記号。色だけに頼らないよう、形でも見分けられるようにする。 */
export const STATUS_MARKS: Record<PolicyStatus, string> = {
  allowed: '✓',
  conditional: '△',
  prohibited: '✕',
  unknown: '?',
};

/** 可・条件付き・不可・未確認を、色と文字（英語と日本語）の両方で示す。 */
export function StatusChip({ status, prefix }: { status: PolicyStatus; prefix?: LocalizedText }) {
  const label = STATUS_LABELS[status];
  return (
    <span className={`chip ${status}`}>
      <span lang="en">{prefix ? `${prefix.en}: ${label.en}` : label.en}</span>{' '}
      <span lang="ja" className="ja">
        {prefix ? `${prefix.ja} ${label.ja}` : label.ja}
      </span>
    </span>
  );
}

/**
 * 一覧向けの小さな表示。楽器名（label）と記号だけを出し、状態の文字は読み上げ用に持つ。
 * label を省くと記号だけ（表の列見出しに楽器名があるとき）。
 */
export function StatusMark({ status, label }: { status: PolicyStatus; label?: LocalizedText }) {
  const text = STATUS_LABELS[status];
  const title = label ? `${label.en}: ${text.en} / ${label.ja} ${text.ja}` : `${text.en} / ${text.ja}`;
  return (
    <span className={`mark ${status}`} title={title}>
      {label ? (
        <span className="mark-label" aria-hidden="true">
          {label.en}
        </span>
      ) : null}
      <span className="mark-symbol" aria-hidden="true">
        {STATUS_MARKS[status]}
      </span>
      <span className="sr-only">{title}</span>
    </span>
  );
}

/** 記号の凡例。 */
export function StatusLegend() {
  return (
    <p className="legend">
      {(Object.keys(STATUS_MARKS) as PolicyStatus[]).map((status) => (
        <span key={status} className="legend-item">
          <span className={`mark ${status}`} aria-hidden="true">
            <span className="mark-symbol">{STATUS_MARKS[status]}</span>
          </span>{' '}
          <span lang="en">{STATUS_LABELS[status].en}</span>{' '}
          <span lang="ja" className="ja">
            {STATUS_LABELS[status].ja}
          </span>
        </span>
      ))}
    </p>
  );
}
