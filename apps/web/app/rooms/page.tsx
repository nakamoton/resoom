import type { Metadata } from 'next';
import Link from 'next/link';
import { INSTRUMENT_CLASSES, capacityLabel, effectivePolicy, filterByCapacity, parsePeople, type InstrumentClass } from '@resoom/core';
import type { RoomWithEvidences } from '@resoom/db';
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

type SearchParams = { m?: string | string[]; people?: string | string[] };

/** 絞り込みの条件を保ったまま、一部だけ変えたURLを作る。 */
function roomsHref(params: { m?: string; people?: number | null }): string {
  const query = new URLSearchParams();
  if (params.m) query.set('m', params.m);
  if (params.people) query.set('people', String(params.people));
  const text = query.toString();
  return text ? `/rooms?${text}` : '/rooms';
}

export default async function RoomsPage({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { m, people: peopleParam } = await searchParams;
  const parsedPeople = parsePeople(typeof peopleParam === 'string' ? peopleParam : null);
  const people = parsedPeople ?? null;
  const db = await getDb();
  const municipalities = (await listMunicipalities(db)).sort(byMunicipality);
  const selected = typeof m === 'string' && municipalities.includes(m) ? m : undefined;
  const rooms = (await listRooms(db, { municipality: selected })).sort((a, b) => byMunicipality(a.municipality, b.municipality));
  const { fits, unknown, tooSmall } = filterByCapacity(rooms, people);

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
            <Link href={roomsHref({ people })} aria-current={selected ? undefined : 'page'}>
              すべて
            </Link>
          </li>
          {municipalities.map((name) => (
            <li key={name}>
              <Link href={roomsHref({ m: name, people })} aria-current={selected === name ? 'page' : undefined}>
                {name}
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form className="people-filter" action="/rooms" method="get">
        {selected ? <input type="hidden" name="m" value={selected} /> : null}
        <label htmlFor="people">人数</label>
        <input
          type="number"
          id="people"
          name="people"
          min={1}
          max={9999}
          inputMode="numeric"
          defaultValue={people ?? ''}
          aria-describedby="people-hint"
        />
        <span>人以上が入れる部屋</span>
        <button type="submit" className="button secondary">
          絞り込む
        </button>
        {people ? <Link href={roomsHref({ m: selected })}>人数の指定をやめる</Link> : null}
        <p className="hint" id="people-hint">
          {parsedPeople === undefined
            ? '人数は1〜9999の数字で入力してください。'
            : '施設の公式の定員で絞り込みます。定員が分からない部屋は、別にまとめて表示します。'}
        </p>
      </form>

      {rooms.length === 0 ? (
        <p className="empty">まだ部屋がありません。「部屋を追加」から登録してください。</p>
      ) : (
        <>
          {people ? (
            <p className="meta" role="status">
              定員 {people}人以上: {fits.length}部屋
              {tooSmall.length > 0 ? `（定員が足りない ${tooSmall.length}部屋を除きました）` : ''}
            </p>
          ) : null}
          {fits.length > 0 ? <RoomList rooms={fits} /> : <p className="empty">条件に合う部屋はありません。</p>}
          {unknown.length > 0 ? (
            <>
              <h2>定員が未登録の部屋（{unknown.length}部屋）</h2>
              <p className="hint">入れるかどうか判断できない部屋です。部屋のページで定員を登録できます。</p>
              <RoomList rooms={unknown} />
            </>
          ) : null}
        </>
      )}
    </>
  );
}

function RoomList({ rooms }: { rooms: RoomWithEvidences[] }) {
  return (
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
              <p className={`capacity ${room.capacity === null ? 'unknown' : ''}`}>{capacityLabel(room.capacity)}</p>
              <ul className="chips" aria-label="楽器ごとの可否">
                {INSTRUMENT_CLASSES.map((cls) => (
                  <li key={cls}>
                    <StatusChip status={policy[cls].status} prefix={SHORT_LABELS[cls]} />
                  </li>
                ))}
              </ul>
              <p className="meta">{latest ? `記録 ${room.evidences.length}件（最新 ${latest.occurredOn}）` : '記録なし'}</p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
