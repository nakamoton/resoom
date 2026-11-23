import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INSTRUMENT_CLASSES,
  INSTRUMENT_SHORT_LABELS,
  can,
  effectivePolicy,
  feeSummary,
  filterByCapacity,
  parsePeople,
} from '@resoom/core';
import { getDb, listMunicipalities, listRooms, type RoomWithEvidences } from '@resoom/db';
import { requirePermission } from '@/lib/session';
import { Bi, Municipality, RoomName, plain } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { StatusLegend, StatusMark } from './_components/StatusChip';

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
  const me = await requirePermission('viewCatalog', '/rooms');
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
        <div className="page-title">
          <h1>
            <Bi text={T.appName} />
          </h1>
          <p className="lead">
            <Bi text={T.catalogLead} />
          </p>
        </div>
        {can(me.role, 'editCatalog') ? (
          <Link href="/rooms/new" className="button small">
            <Bi text={T.addRoom} />
          </Link>
        ) : null}
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
          <StatusLegend />
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
                <Bi text={T.unknownCapacityHeading(unknown.length)} />
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
    <div className="table-wrap">
      <table className="list-table">
        <thead>
          <tr>
            <th scope="col">
              <Bi text={T.room} />
            </th>
            <th scope="col" className="num">
              <Bi text={T.capacity} />
            </th>
            <th scope="col" className="num">
              <Bi text={T.fee} />
            </th>
            {INSTRUMENT_CLASSES.map((cls) => (
              <th key={cls} scope="col" className="mark-col">
                <Bi text={INSTRUMENT_SHORT_LABELS[cls]} stack />
              </th>
            ))}
            <th scope="col">
              <Bi text={T.records} />
            </th>
          </tr>
        </thead>
        <tbody>
          {rooms.map((room) => {
            const policy = effectivePolicy(room.evidences);
            const latest = room.evidences[0];
            return (
              <tr key={room.id}>
                <td className="room-cell">
                  <Link href={`/rooms/${room.id}`} className="room-title">
                    <RoomName room={room} />
                  </Link>
                  {room.candidate ? (
                    <span className="badge">
                      <Bi text={T.candidateBadge} />
                    </span>
                  ) : null}
                  <span className="room-sub">
                    <Municipality name={room.municipality} />
                  </span>
                </td>
                <td className={`num capacity ${room.capacity === null ? 'unknown' : ''}`}>
                  {room.capacity ?? '—'}
                </td>
                <td className={`num fee ${room.fees ? '' : 'unknown'}`}>
                  {room.fees ? feeSummary(room.fees) : <Bi text={T.unknownShort} />}
                </td>
                {INSTRUMENT_CLASSES.map((cls) => (
                  <td key={cls} className="mark-col">
                    <StatusMark status={policy[cls].status} label={INSTRUMENT_SHORT_LABELS[cls]} />
                  </td>
                ))}
                <td className="records">
                  {latest ? (
                    <>
                      {room.evidences.length} · {latest.occurredOn}
                    </>
                  ) : (
                    '—'
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
