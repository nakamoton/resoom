import type { RoomClosure } from '@resoom/core';
import { Bi } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';

/** 閉館・休館の印。内容は title で見られる。 */
export function ClosureBadge({ closure }: { closure: RoomClosure | null }) {
  if (!closure) return null;
  return (
    <span className={`badge closure ${closure.status}`} title={`${closure.note.en} / ${closure.note.ja}`}>
      <Bi text={closure.status === 'closed' ? T.closedBadge : T.suspendedBadge} />
    </span>
  );
}

/** 部屋のページ向けの、閉館・休館の案内（内容と出典）。 */
export function ClosureNotice({ closure }: { closure: RoomClosure | null }) {
  if (!closure) return null;
  return (
    <p className={`notice closure-notice ${closure.status}`}>
      <strong>
        <Bi text={closure.status === 'closed' ? T.closedBadge : T.suspendedBadge} />
      </strong>{' '}
      <Bi text={closure.note} />{' '}
      {closure.sources.map((url) => (
        <a key={url} href={url} rel="noopener noreferrer" target="_blank">
          <Bi text={T.feeSources} /> ↗
        </a>
      ))}
    </p>
  );
}
