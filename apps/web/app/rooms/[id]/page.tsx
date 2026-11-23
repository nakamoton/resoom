import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  EVIDENCE_KIND_LABELS,
  INSTRUMENT_CLASSES,
  INSTRUMENT_LABELS,
  capacityLabel,
  effectivePolicy,
} from '@resoom/core';
import { getDb, getRoom } from '@resoom/db';
import { EvidenceForm } from '../_components/EvidenceForm';
import { RoomBasicsForm } from '../_components/RoomBasicsForm';
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
  const facts = [room.municipality, capacityLabel(room.capacity), room.nearestStation ? `最寄駅 ${room.nearestStation}` : null];

  return (
    <>
      <Link href="/rooms" className="back">
        ← 施設台帳へ戻る
      </Link>
      <h1>
        {room.facilityName} {room.roomName}
      </h1>
      <p className="lead">{facts.filter(Boolean).join('・')}</p>

      <h2>基本情報</h2>
      <div className="card">
        <dl className="facts">
          <div>
            <dt>定員</dt>
            <dd>
              {room.capacity === null ? '未登録' : `${room.capacity}人`}
              {room.capacitySource ? <span className="source">出典: {room.capacitySource}</span> : null}
            </dd>
          </div>
          <div>
            <dt>最寄駅</dt>
            <dd>{room.nearestStation ?? '未登録'}</dd>
          </div>
        </dl>
        <details className="edit">
          <summary>基本情報を直す</summary>
          <RoomBasicsForm
            roomId={room.id}
            capacity={room.capacity}
            capacitySource={room.capacitySource}
            nearestStation={room.nearestStation}
          />
        </details>
      </div>
      <p className="hint">
        施設の公式の定員は、楽器や譜面台を置いたときに実際に入れる人数とは限りません。どこで確かめた人数かは出典で確認してください。
      </p>

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
