import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INSTRUMENT_CLASSES,
  INSTRUMENT_SHORT_LABELS,
  capacityLabel,
  effectivePolicy,
  filterByCapacity,
  parsePeople,
} from '@resoom/core';
import { getDb, listMunicipalities, listRooms, type RoomWithEvidences } from '@resoom/db';
import { Bi, Municipality, RoomName, plain } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { StatusChip } from './_components/StatusChip';

export const metadata: Metadata = { title: `${T.appName.en} · ${T.appName.ja}` };
export const dynamic = 'force-dynamic';

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
          <h1>
            <Bi text={T.appName} stack />
          </h1>
          <p className="lead">
            <Bi text={T.catalogLead} />
          </p>
        </div>
        <Link href="/rooms/new" className="button">
          <Bi text={T.addRoom} />
        </Link>
      </div>

      <nav aria-label={plain(T.filterByMunicipality)}>
        <ul className="tabs">
          <li>
            <Link href={roomsHref({ people })} aria-current={selected ? undefined : 'page'}>
              <Bi text={T.all} />
            </Link>
          </li>
          {municipalities.map((name) => (
            <li key={name}>
              <Link href={roomsHref({ m: name, people })} aria-current={selected === name ? 'page' : undefined}>
                <Municipality name={name} />
              </Link>
            </li>
          ))}
        </ul>
      </nav>

      <form className="people-filter" action="/rooms" method="get">
        {selected ? <input type="hidden" name="m" value={selected} /> : null}
        <label htmlFor="people">
          <Bi text={T.people} />
        </label>
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
        <span>
          <Bi text={T.peopleOrMore} />
        </span>
        <button type="submit" className="button secondary">
          <Bi text={T.filter} />
        </button>
        {people ? (
          <Link href={roomsHref({ m: selected })}>
            <Bi text={T.clearPeople} />
          </Link>
        ) : null}
        <p className="hint" id="people-hint">
          <Bi text={parsedPeople === undefined ? T.peopleInvalid : T.peopleHint} />
        </p>
      </form>

      {rooms.length === 0 ? (
        <p className="empty">
          <Bi text={T.noRooms} />
        </p>
      ) : (
        <>
          {people ? (
            <p className="meta" role="status">
              <Bi text={T.peopleResult(people, fits.length, tooSmall.length)} />
            </p>
          ) : null}
          {fits.length > 0 ? (
            <RoomList rooms={fits} />
          ) : (
            <p className="empty">
              <Bi text={T.noMatch} />
            </p>
          )}
          {unknown.length > 0 ? (
            <>
              <h2>
                <Bi text={T.unknownCapacityHeading(unknown.length)} stack />
              </h2>
              <p className="hint">
                <Bi text={T.unknownCapacityHint} />
              </p>
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
                <RoomName room={room} stack />
              </p>
              <p className="room-sub">
                <Municipality name={room.municipality} />
                <span className={`capacity ${room.capacity === null ? 'unknown' : ''}`}>
                  <Bi text={capacityLabel(room.capacity)} />
                </span>
              </p>
              <ul className="chips" aria-label={plain(T.instrumentsAria)}>
                {INSTRUMENT_CLASSES.map((cls) => (
                  <li key={cls}>
                    <StatusChip status={policy[cls].status} prefix={INSTRUMENT_SHORT_LABELS[cls]} />
                  </li>
                ))}
              </ul>
              <p className="meta">
                <Bi text={latest ? T.recordCount(room.evidences.length, latest.occurredOn) : T.noRecordsShort} />
              </p>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
