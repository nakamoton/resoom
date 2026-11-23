import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  EVIDENCE_KIND_LABELS,
  INSTRUMENT_CLASSES,
  INSTRUMENT_LABELS,
  effectivePolicy,
} from '@resoom/core';
import { getDb, getRoom } from '@resoom/db';
import { EvidenceForm } from '../_components/EvidenceForm';
import { StatusChip } from '../_components/StatusChip';

export const dynamic = 'force-dynamic';

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const room = await getRoom(await getDb(), (await params).id);
  return { title: room ? `${room.facilityName} ${room.roomName}` : '部屋が見つかりません' };
}

export default async function RoomPage({ params }: Props) {
  const room = await getRoom(await getDb(), (await params).id);
  if (!room) notFound();

  const policy = effectivePolicy(room.evidences);
  const today = new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
  const facts = [room.municipality, room.capacity ? `定員 ${room.capacity}人` : null, room.nearestStation ? `最寄駅 ${room.nearestStation}` : null];

  return (
    <>
      <Link href="/rooms" className="back">
        ← 施設台帳へ戻る
      </Link>
      <h1>
        {room.facilityName} {room.roomName}
      </h1>
      <p className="lead">{facts.filter(Boolean).join('・')}</p>

      <h2>現在の状態</h2>
      <div className="card">
        <table className="status-table">
          <tbody>
            {INSTRUMENT_CLASSES.map((cls) => {
              const { status, basis } = policy[cls];
              return (
                <tr key={cls}>
                  <th scope="row">{INSTRUMENT_LABELS[cls]}</th>
                  <td className="status">
                    <StatusChip status={status} />
                  </td>
                  <td className="basis">
                    {basis ? `${basis.occurredOn} ${EVIDENCE_KIND_LABELS[basis.kind]}: ${basis.note}` : 'まだ記録がありません'}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="hint">
        その楽器を名指しした記録があれば、その中で最も新しいものを表示します。なければ、楽器を限定しない最も新しい記録を表示します。
      </p>

      <h2>記録を追加</h2>
      <div className="card">
        <EvidenceForm roomId={room.id} today={today} />
      </div>

      <h2>記録の履歴（{room.evidences.length}件）</h2>
      {room.evidences.length === 0 ? (
        <p className="empty">まだ記録がありません。</p>
      ) : (
        <ol className="history">
          {room.evidences.map((e) => (
            <li key={e.id} className="card">
              <div className="head">
                <time dateTime={e.occurredOn}>{e.occurredOn}</time>
                <span>{EVIDENCE_KIND_LABELS[e.kind]}</span>
                <StatusChip
                  status={e.result}
                  prefix={e.instruments.length > 0 ? e.instruments.map((cls) => INSTRUMENT_LABELS[cls]).join('・') : '合奏全体'}
                />
              </div>
              <p className="note">{e.note}</p>
              <p className="by">
                記録者: {e.reportedBy}
                {e.sourceUrl ? (
                  <>
                    {' '}
                    ・{' '}
                    <a href={e.sourceUrl} rel="noopener noreferrer" target="_blank">
                      参考URL
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
