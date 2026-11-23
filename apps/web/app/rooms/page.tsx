import type { Metadata } from 'next';
import Link from 'next/link';
import { INSTRUMENT_CLASSES, effectivePolicy, type InstrumentClass } from '@resoom/core';
import { getDb, listMunicipalities, listRooms } from '@resoom/db';
import { StatusChip } from './_components/StatusChip';

export const metadata: Metadata = { title: '施設台帳' };
export const dynamic = 'force-dynamic';

/** 一覧では場所を取らないよう、楽器名を短く表示する。 */
const SHORT_LABELS: Record<InstrumentClass, string> = {
  wind: '管楽器',
  small_percussion: '小物',
  drum_set: 'ドラム',
  large_percussion: '大型',
  taiko: '和太鼓',
};

/** よく使う自治体を先に並べる。 */
const PRIMARY_MUNICIPALITIES = ['大田区', '川崎市', '渋谷区', '江戸川区'];
const rank = (name: string): number => {
  const i = PRIMARY_MUNICIPALITIES.indexOf(name);
  return i === -1 ? PRIMARY_MUNICIPALITIES.length : i;
};
const byMunicipality = (a: string, b: string): number => rank(a) - rank(b) || a.localeCompare(b, 'ja');

export default async function RoomsPage({ searchParams }: { searchParams: Promise<{ m?: string | string[] }> }) {
  const { m } = await searchParams;
  const db = await getDb();
  const municipalities = (await listMunicipalities(db)).sort(byMunicipality);
  const selected = typeof m === 'string' && municipalities.includes(m) ? m : undefined;
  const rooms = (await listRooms(db, { municipality: selected })).sort((a, b) => byMunicipality(a.municipality, b.municipality));

  return (
    <>
      <div className="page-head">
        <div>
          <h1>施設台帳</h1>
          <p className="lead">部屋ごとに、楽器の可否とその根拠を記録します。部屋を選ぶと記録を追加できます。</p>
        </div>
        <Link href="/rooms/new" className="button">
          部屋を追加
        </Link>
      </div>

      <nav aria-label="自治体で絞り込む">
        <ul className="tabs">
          <li>
            <Link href="/rooms" aria-current={selected ? undefined : 'page'}>
              すべて
            </Link>
          </li>
          {municipalities.map((name) => (
            <li key={name}>
              <Link href={`/rooms?m=${encodeURIComponent(name)}`} aria-current={selected === name ? 'page' : undefined}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      {rooms.length === 0 ? (
        <p className="empty">まだ部屋がありません。「部屋を追加」から登録してください。</p>
      ) : (
        <ul className="room-list">
          {rooms.map((room) => {
            const policy = effectivePolicy(room.evidences);
            const latest = room.evidences[0];
            return (
              <li key={room.id}>
                <Link href={`/rooms/${room.id}`} className="card">
                  <p className="room-title">
                    {room.facilityName} {room.roomName}
                    <small>{room.municipality}</small>
                  </p>
                  <ul className="chips" aria-label="楽器ごとの可否">
                    {INSTRUMENT_CLASSES.map((cls) => (
                      <li key={cls}>
                        <StatusChip status={policy[cls].status} prefix={SHORT_LABELS[cls]} />
                      </li>
                    ))}
                  </ul>
                  <p className="meta">
                    {room.capacity ? `定員 ${room.capacity}人・` : ''}
                    {latest ? `記録 ${room.evidences.length}件（最新 ${latest.occurredOn}）` : '記録なし'}
                  </p>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
