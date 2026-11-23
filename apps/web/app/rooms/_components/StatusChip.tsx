import { STATUS_LABELS, type LocalizedText, type PolicyStatus } from '@resoom/core';

/** 可・条件付き・不可・未確認を、色と文字（英語と日本語）の両方で示す。 */
export function StatusChip({ status, prefix }: { status: PolicyStatus; prefix?: LocalizedText }) {
  const label = STATUS_LABELS[status];
  return (
    <span className={`chip ${status}`}>
      <span lang="en">{prefix ? `${prefix.en}: ${label.en}` : label.en}</span>
      <span lang="ja" className="ja">
        {prefix ? `${prefix.ja} ${label.ja}` : label.ja}
      </span>
    </span>
  );
}
