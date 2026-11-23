import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INSTRUMENT_CLASSES,
  INSTRUMENT_LABELS,
  INSTRUMENT_SHORT_LABELS,
  TIMES_OF_DAY,
  capacityLabel,
  effectivePolicy,
  searchAvailability,
  timeOfDayOf,
  type InstrumentClass,
  type LocalizedText,
  type TimeOfDay,
} from '@resoom/core';
import { getDb, listRooms, loadAvailability, type AvailabilitySnapshot, type RoomWithEvidences } from '@resoom/db';
import { Bi, Municipality, RoomName, plain } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { StatusChip } from '../rooms/_components/StatusChip';
import { BOOKING_SITES } from './booking-sites';
import { parseSearch, type RawParams } from './criteria';

export const metadata: Metadata = { title: `${T.searchTitle.en} · ${T.searchTitle.ja}` };
export const dynamic = 'force-dynamic';

/** 画面に並べる順（月曜はじまり）。値は 0 = 日曜。 */
const WEEKDAYS: { value: number; label: LocalizedText }[] = [
  { value: 1, label: { en: 'Mon', ja: '月' } },
  { value: 2, label: { en: 'Tue', ja: '火' } },
  { value: 3, label: { en: 'Wed', ja: '水' } },
  { value: 4, label: { en: 'Thu', ja: '木' } },
  { value: 5, label: { en: 'Fri', ja: '金' } },
  { value: 6, label: { en: 'Sat', ja: '土' } },
  { value: 0, label: { en: 'Sun', ja: '日' } },
];

const TIME_LABELS: Record<TimeOfDay, LocalizedText> = {
  morning: { en: 'Morning (before 12:00)', ja: '午前（12時まで）' },
  afternoon: { en: 'Afternoon (12:00–17:00)', ja: '午後（12〜17時）' },
  evening: { en: 'Evening (after 17:00)', ja: '夜間（17時以降）' },
};

const TIME_SHORT: Record<TimeOfDay, LocalizedText> = {
  morning: { en: 'Morning', ja: '午前' },
  afternoon: { en: 'Afternoon', ja: '午後' },
  evening: { en: 'Evening', ja: '夜間' },
};

/** 結果に添える楽器（指定がなければ打楽器の3区分）。 */
const DEFAULT_SHOWN: InstrumentClass[] = ['small_percussion', 'drum_set', 'large_percussion'];

const todayInJapan = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dateText = (date: string): LocalizedText => {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    en: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d),
    ja: new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(d),
  };
};
const timestampText = (at: Date | null): string =>
  at
    ? `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at)} JST`
    : '—';

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const db = await getDb();
  const rooms = await listRooms(db);
  const today = todayInJapan();
  const municipalityOptions = [...new Set(rooms.map((r) => r.municipality))].sort((a, b) => a.localeCompare(b, 'ja'));
  const { criteria, form, invalidDates, invalidPeople } = parseSearch(params, today, municipalityOptions);
  const { slots, snapshots } = await loadAvailability(db, { from: criteria.from, to: criteria.to });
  const result = searchAvailability(rooms, slots, snapshots, criteria);
  const snapshotOf = new Map<string, AvailabilitySnapshot>(snapshots.map((s) => [s.roomId, s]));
  const shown = criteria.needs.length > 0 ? criteria.needs : DEFAULT_SHOWN;
  const hasData = snapshots.some((s) => s.coveredThrough !== null);

  return (
    <>
      <h1>
        <Bi text={T.searchTitle} stack />
      </h1>
      <p className="lead">
        <Bi text={T.searchLead} />
      </p>

      <form className="card search-form" action="/search" method="get">
        {invalidDates ? (
          <p className="notice error" role="status">
            <Bi text={T.searchInvalidDates} />
          </p>
        ) : null}
        <div className="date-range">
          <div className="field">
            <label className="label" htmlFor="from">
              <Bi text={T.fromDate} />
            </label>
            <input type="date" id="from" name="from" defaultValue={form.from} />
          </div>
          <div className="field">
            <label className="label" htmlFor="to">
              <Bi text={T.toDate} />
            </label>
            <input type="date" id="to" name="to" defaultValue={form.to} />
          </div>
          <div className="field">
            <label className="label" htmlFor="people">
              <Bi text={T.people} />
              <span className="optional">
                <Bi text={T.optional} />
              </span>
            </label>
            <input type="number" id="people" name="people" min={1} max={9999} inputMode="numeric" defaultValue={form.people} aria-describedby="people-hint" />
            <p className="hint" id="people-hint">
              <Bi text={invalidPeople ? T.peopleInvalid : T.peopleHint} />
            </p>
          </div>
        </div>

        <fieldset className="field">
          <legend>
            <Bi text={T.daysOfWeek} />
          </legend>
          <div className="choices compact">
            {WEEKDAYS.map((d) => (
              <label key={d.value}>
                <input type="checkbox" name="d" value={d.value} defaultChecked={form.days.includes(d.value)} />
                <Bi text={d.label} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field">
          <legend>
            <Bi text={T.timeOfDay} />
          </legend>
          <div className="choices">
            {TIMES_OF_DAY.map((time) => (
              <label key={time}>
                <input type="checkbox" name="t" value={time} defaultChecked={form.times.includes(time)} />
                <Bi text={TIME_LABELS[time]} stack />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="field" aria-describedby="need-hint">
          <legend>
            <Bi text={T.needInstruments} />
          </legend>
          <div className="choices">
            {INSTRUMENT_CLASSES.map((cls) => (
              <label key={cls}>
                <input type="checkbox" name="need" value={cls} defaultChecked={form.needs.includes(cls)} />
                <Bi text={INSTRUMENT_LABELS[cls]} stack />
              </label>
            ))}
          </div>
          <label className="inline-check">
            <input type="checkbox" name="unknown" value="1" defaultChecked={form.includeUnknown} />
            <Bi text={T.includeUnknown} />
          </label>
        </fieldset>

        <fieldset className="field">
          <legend>
            <Bi text={T.municipalities} />
          </legend>
          <div className="choices compact">
            {municipalityOptions.map((m) => (
              <label key={m}>
                <input type="checkbox" name="m" value={m} defaultChecked={form.municipalities.includes(m)} />
                <Municipality name={m} />
              </label>
            ))}
          </div>
          <p className="hint">
            <Bi text={T.anyHint} />
          </p>
        </fieldset>

        <button type="submit" className="button">
          <Bi text={T.search} />
        </button>
      </form>

      <p className="hint">
        <Bi text={T.searchDisclaimer} />
      </p>

      {!hasData ? (
        <p className="empty">
          <Bi text={T.noData} />
        </p>
      ) : (
        <section aria-live="polite">
          <h2>
            <Bi text={result.days.length > 0 ? T.daysFound(result.days.length) : T.noOpenSlots} stack />
          </h2>
          {result.days.map((day) => (
            <section key={day.date} className="day">
              <h3>
                <Bi text={dateText(day.date)} />
              </h3>
              <ul className="room-list">
                {day.rooms.map(({ room, slots: roomSlots }) => (
                  <li key={room.id} className="card result">
                    <p className="room-title">
                      <RoomName room={room} stack />
                    </p>
                    <p className="room-sub">
                      <Municipality name={room.municipality} />
                      <span className={`capacity ${room.capacity === null ? 'unknown' : ''}`}>
                        <Bi text={capacityLabel(room.capacity)} />
                      </span>
                    </p>
                    <ul className="slots" aria-label={plain(T.timeOfDay)}>
                      {roomSlots.map((slot) => (
                        <li key={slot.start} className="slot">
                          <span className="time">
                            {slot.start}–{slot.end}
                          </span>
                          <Bi text={TIME_SHORT[timeOfDayOf(slot.start)]} />
                        </li>
                      ))}
                    </ul>
                    <InstrumentChips room={room} shown={shown} />
                    <RoomLinks room={room} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}

      {result.manual.length > 0 ? (
        <section>
          <h2>
            <Bi text={T.checkYourself} stack />
          </h2>
          <p className="hint">
            <Bi text={T.checkYourselfHint} />
          </p>
          <ul className="room-list">
            {result.manual.map((room) => (
              <li key={room.id} className="card result">
                <p className="room-title">
                  <RoomName room={room} stack />
                </p>
                <p className="room-sub">
                  <Municipality name={room.municipality} />
                  <span className={`capacity ${room.capacity === null ? 'unknown' : ''}`}>
                    <Bi text={capacityLabel(room.capacity)} />
                  </span>
                </p>
                <InstrumentChips room={room} shown={shown} />
                <RoomLinks room={room} />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {hasData && result.automatic.length > 0 ? (
        <details className="coverage">
          <summary>
            <Bi text={T.coverage} />
          </summary>
          <p className="hint">
            <Bi text={T.coverageHint} />
          </p>
          <table className="coverage-table">
            <thead>
              <tr>
                <th scope="col">
                  <Bi text={T.navCatalog} />
                </th>
                <th scope="col">
                  <Bi text={T.dataUntil} />
                </th>
                <th scope="col">
                  <Bi text={T.updatedAt} />
                </th>
              </tr>
            </thead>
            <tbody>
              {result.automatic.map((room) => {
                const snapshot = snapshotOf.get(room.id);
                return (
                  <tr key={room.id}>
                    <td>
                      <RoomName room={room} />
                    </td>
                    <td>{snapshot?.coveredThrough ?? <Bi text={T.notOpenYet} />}</td>
                    <td>
                      {timestampText(snapshot?.fetchedAt ?? null)}
                      {snapshot?.lastError ? (
                        <span className="coverage-error">
                          <Bi text={T.lastError} /> ({timestampText(snapshot.lastErrorAt)})
                        </span>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </details>
      ) : null}

    </>
  );
}

/** 楽器ごとの可否。記録の文面や記録者は出さない（このページはログインなしで見られるため）。 */
function InstrumentChips({ room, shown }: { room: RoomWithEvidences; shown: InstrumentClass[] }) {
  const policy = effectivePolicy(room.evidences);
  return (
    <ul className="chips" aria-label={plain(T.instrumentsAria)}>
      {shown.map((cls) => (
        <li key={cls}>
          <StatusChip status={policy[cls].status} prefix={INSTRUMENT_SHORT_LABELS[cls]} />
        </li>
      ))}
    </ul>
  );
}

function RoomLinks({ room }: { room: RoomWithEvidences }) {
  const site = BOOKING_SITES[room.municipality];
  return (
    <p className="room-links">
      {site ? (
        <a href={site} rel="noopener noreferrer" target="_blank">
          <Bi text={T.book} /> ↗
        </a>
      ) : null}
      <Link href={`/rooms/${room.id}`}>
        <Bi text={T.roomDetails} />
      </Link>
    </p>
  );
}
