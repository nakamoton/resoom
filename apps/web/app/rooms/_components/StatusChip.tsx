import { STATUS_LABELS, type PolicyStatus } from '@resoom/core';

/** 可・条件付き・不可・未確認を、色と文字の両方で示す。 */
export function StatusChip({ status, prefix }: { status: PolicyStatus; prefix?: string }) {
  return (
    <span className={`chip ${status}`}>
      {prefix ? `${prefix} ` : ''}
      {STATUS_LABELS[status]}
    </span>
  );
}
