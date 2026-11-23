import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { EVIDENCE_KIND_LABELS, INSTRUMENT_CLASSES, INSTRUMENT_LABELS, can, capacityLabel, effectivePolicy, feeLabel, yenText, type RoomFees } from '@resoom/core';
import { getDb, getRoom } from '@resoom/db';
import { getCurrentMember, requirePermission } from '@/lib/session';
import { Bi, Municipality, RoomName } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import { EvidenceForm } from '../_components/EvidenceForm';
import { RoomBasicsForm } from '../_components/RoomBasicsForm';
import { StatusChip } from '../_components/StatusChip';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  // 部屋の名前も楽団員にだけ見せる
  if (!(await getCurrentMember())) return { title: `${T.signInTitle.en} · ${T.signInTitle.ja}` };
  const room = await getRoom(await getDb(), (await params).id);
  if (!room) return { title: `${T.notFoundTitle.en} · ${T.notFoundTitle.ja}` };
  const en = [room.facilityNameEn, room.roomNameEn].filter(Boolean).join(' ');
  return { title: `${en ? `${en} · ` : ''}${room.facilityName} ${room.roomName}` };
}

export default async function RoomPage({ params }: Props) {
  const { id } = await params;
  const me = await requirePermission('viewCatalog', `/rooms/${id}`);
  const canEdit = can(me.role, 'editCatalog');
  const room = await getRoom(await getDb(), id);
  if (!room) notFound();

  const policy = effectivePolicy(room.evidences);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const hasEnglishName = Boolean(room.facilityNameEn || room.roomNameEn);

  return (
    <>
      <Link href="/rooms" className="back">
        <Bi text={T.backToCatalog} />
      </Link>
      <h1>
        <RoomName room={room} stack />
      </h1>
      <p className="lead room-sub">
        <Municipality name={room.municipality} />
        <span>
          <Bi text={capacityLabel(room.capacity)} />
        </span>
      </p>

      <h2>
        <Bi text={T.basicInfo} />
      </h2>
      <div className="card">
        <dl className="facts">
          <div>
            <dt>
              <Bi text={T.capacity} />
            </dt>
            <dd>
              <Bi text={room.capacity === null ? T.unknown : T.capacityPeople(room.capacity)} />
              {room.capacitySource ? (
                <span className="source">
                  <Bi text={T.source} />: {room.capacitySource}
                </span>
              ) : null}
            </dd>
          </div>
          <div>
            <dt>
              <Bi text={T.nearestStation} />
            </dt>
            <dd>{room.nearestStation ?? <Bi text={T.unknown} />}</dd>
          </div>
        </dl>
        {canEdit ? (
        <details className="edit">
          <summary>
            <Bi text={T.editBasics} />
          </summary>
          <RoomBasicsForm
            roomId={room.id}
            facilityNameEn={room.facilityNameEn}
            roomNameEn={room.roomNameEn}
            capacity={room.capacity}
            capacitySource={room.capacitySource}
            nearestStation={room.nearestStation}
          />
        </details>
        ) : null}
      </div>
      <p className="hint">
        <Bi text={T.capacityCaution} />
      </p>
      {hasEnglishName ? (
        <p className="hint">
          <Bi text={T.englishNameNote} />
        </p>
      ) : null}

      <h2>
        <Bi text={T.fees} />
      </h2>
      <div className="card">
        <FeeTable fees={room.fees} />
      </div>

      <h2>
        <Bi text={T.currentStatus} />
      </h2>
      <div className="card">
        <table className="status-table">
          <tbody>
            {INSTRUMENT_CLASSES.map((cls) => {
              const { status, basis } = policy[cls];
              return (
                <tr key={cls}>
                  <th scope="row">
                    <Bi text={INSTRUMENT_LABELS[cls]} />
                  </th>
                  <td className="status">
                    <StatusChip status={status} />
                  </td>
                  <td className="basis">
                    {basis ? (
                      <>
                        <span className="basis-head">
                          {basis.occurredOn} · <Bi text={EVIDENCE_KIND_LABELS[basis.kind]} />
                        </span>
                        <span className="note">{basis.note}</span>
                      </>
                    ) : (
                      <Bi text={T.noRecordsYet} />
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        <Bi text={T.statusRule} />
      </p>

      {canEdit ? (
        // 記録の追加はときどきしか使わないので、たたんでおく（ページを短くして一覧しやすくするため）
        <details className="card add-record">
          <summary>
            <Bi text={T.addRecord} />
          </summary>
          <EvidenceForm roomId={room.id} today={today} defaultReporter={me.name} />
        </details>
      ) : (
        <p className="notice">
          <Bi text={T.readOnlyNote} />
        </p>
      )}

      <h2>
        <Bi text={T.history(room.evidences.length)} />
      </h2>
      {room.evidences.length === 0 ? (
        <p className="empty">
          <Bi text={T.noRecordsYet} />
        </p>
      ) : (
        <ol className="history">
          {room.evidences.map((e) => (
            <li key={e.id} className="card">
              <div className="head">
                <time dateTime={e.occurredOn}>{e.occurredOn}</time>
                <Bi text={EVIDENCE_KIND_LABELS[e.kind]} />
                <StatusChip
                  status={e.result}
                  prefix={
                    e.instruments.length > 0
                      ? {
                          en: e.instruments.map((cls) => INSTRUMENT_LABELS[cls].en).join(', '),
                          ja: e.instruments.map((cls) => INSTRUMENT_LABELS[cls].ja).join('・'),
                        }
                      : T.wholeEnsemble
                  }
                />
              </div>
              <p className="note">{e.note}</p>
              <p className="by">
                <Bi text={T.recordedBy} />: {e.reportedBy}
                {e.sourceUrl ? (
                  <>
                    {' · '}
                    <a href={e.sourceUrl} rel="noopener noreferrer" target="_blank">
                      <Bi text={T.referenceUrl} />
                    </a>
                  </>
                ) : null}
              </p>
            </li>
          ))}
        </ol>
      )}
    </>
  );
}

/** 料金表。土日祝で料金が違えば、平日と土日祝を並べる。分からなければ「不明」。 */
function FeeTable({ fees }: { fees: RoomFees | null }) {
  if (!fees) {
    return (
      <p className="empty">
        <Bi text={T.feeUnknown} />
      </p>
    );
  }
  const holiday = fees.holidaySlots && fees.holidaySlots.length > 0 ? fees.holidaySlots : null;
  return (
    <>
      <table className="fee-table">
        <thead>
          <tr>
            <th scope="col">
              <Bi text={T.feeSlot} />
            </th>
            <th scope="col">
              <Bi text={T.feeTime} />
            </th>
            <th scope="col">
              <Bi text={holiday ? T.feeWeekday : T.feeAllDays} />
            </th>
            {holiday ? (
              <th scope="col">
                <Bi text={T.feeHoliday} />
              </th>
            ) : null}
          </tr>
        </thead>
        <tbody>
          {fees.slots.map((slot, i) => (
            <tr key={`${slot.start}-${slot.end}`}>
              <th scope="row">
                <Bi text={feeLabel(slot.label)} />
              </th>
              <td>
                {slot.start}–{slot.end}
              </td>
              <td className="yen">
                {yenText(slot.yen)}
                {fees.unit === 'hour' ? (
                  <>
                    {' '}
                    <Bi text={T.feePerHour} />
                  </>
                ) : null}
              </td>
              {holiday ? <td className="yen">{holiday[i] ? yenText(holiday[i].yen) : '—'}</td> : null}
            </tr>
          ))}
        </tbody>
      </table>
      {fees.note ? (
        <p className="fee-meta">
          <Bi text={fees.note} />
        </p>
      ) : null}
      <p className="fee-meta">
        <Bi text={T.feeGeneral} /> <Bi text={T.feeChecked(fees.checkedOn)} />
      </p>
      <p className="fee-meta">
        <Bi text={T.feeSources} />:{' '}
        {fees.sources.map((url, i) => (
          <span key={url}>
            {i > 0 ? ' · ' : null}
            <a href={url} rel="noopener noreferrer" target="_blank">
              {new URL(url).hostname}
              {new URL(url).pathname.length > 1 ? '/…' : ''}
            </a>
          </span>
        ))}
      </p>
    </>
  );
}
