import type { Metadata } from 'next';
import Link from 'next/link';
import {
  INSTRUMENT_CLASSES,
  INSTRUMENT_LABELS,
  INSTRUMENT_SHORT_LABELS,
  TIMES_OF_DAY,
  can,
  capacityLabel,
  effectivePolicy,
  municipalityName,
  searchAvailability,
  timeOfDayOf,
  type InstrumentClass,
  type LocalizedText,
  type TimeOfDay,
} from '@resoom/core';
import { getDb, listRooms, loadAvailability, type AvailabilitySnapshot, type RoomWithEvidences } from '@resoom/db';
import { getCurrentMember } from '@/lib/session';
import { Bi, Municipality, RoomName, plain } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { StatusLegend, StatusMark } from '../rooms/_components/StatusChip';
import { BOOKING_SITES } from './booking-sites';
import { SUBMITTED_PARAM, parseSearch, type RawParams } from './criteria';
import { NOT_SEARCHED_REASONS, byReason, groupNotSearched } from './not-searched';

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
  morning: { en: 'Morning –12', ja: '午前' },
  afternoon: { en: 'Afternoon 12–17', ja: '午後' },
  evening: { en: 'Evening 17–', ja: '夜間' },
};

/** 結果に添える楽器（指定がなければ打楽器の3区分）。 */
const DEFAULT_SHOWN: InstrumentClass[] = ['small_percussion', 'drum_set', 'large_percussion'];

const todayInJapan = (): string => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
const dateText = (date: string): LocalizedText => {
  const d = new Date(`${date}T00:00:00Z`);
  return {
    en: new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(d),
    ja: new Intl.DateTimeFormat('ja-JP', { month: 'numeric', day: 'numeric', weekday: 'short', timeZone: 'UTC' }).format(d),
  };
};
/** 日付の一覧（目次）向けの短い表記。例: Sat 28 Nov */
const shortDate = (date: string): string =>
  new Intl.DateTimeFormat('en-GB', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' }).format(new Date(`${date}T00:00:00Z`)).replace(',', '');
/** 土日を色分けするための曜日（0 = 日曜）。 */
const weekdayOf = (date: string): number => new Date(`${date}T00:00:00Z`).getUTCDay();
const dayClass = (date: string): string => (weekdayOf(date) === 6 ? 'sat' : weekdayOf(date) === 0 ? 'sun' : '');
const timestampText = (at: Date | null): string =>
  at
    ? `${new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }).format(at)} JST`
    : '—';

export default async function SearchPage({ searchParams }: { searchParams: Promise<RawParams> }) {
  const params = await searchParams;
  const showDetails = can((await getCurrentMember())?.role, 'viewCatalog');
  const db = await getDb();
  const rooms = await listRooms(db);
  const today = todayInJapan();
  // 英語を主にするので、英語名の順に並べる
  const municipalityOptions = [...new Set(rooms.map((r) => r.municipality))].sort((a, b) =>
    (municipalityName(a).en ?? a).localeCompare(municipalityName(b).en ?? b, 'en'),
  );
  const { criteria, form, invalidDates, invalidPeople } = parseSearch(params, today, municipalityOptions);
  const { slots, snapshots } = await loadAvailability(db, { from: criteria.from, to: criteria.to });
  const result = searchAvailability(rooms, slots, snapshots, criteria);
  const snapshotOf = new Map<string, AvailabilitySnapshot>(snapshots.map((s) => [s.roomId, s]));
  const shown = criteria.needs.length > 0 ? criteria.needs : DEFAULT_SHOWN;
  const hasData = snapshots.some((s) => s.coveredThrough !== null);
  // 自動で検索していない部屋（条件にかかわらず、ページ上部の案内に使う）
  const tracked = new Set(snapshots.filter((s) => s.coveredThrough !== null).map((s) => s.roomId));
  const notSearched = byReason(groupNotSearched(rooms.filter((room) => !tracked.has(room.id))));
  const manualByCity = groupNotSearched(result.manual);

  return (
    <>
      <div className="page-title">
        <h1>
          <Bi text={T.searchTitle} />
        </h1>
        <p className="lead">
          <Bi text={T.searchLead} />
        </p>
      </div>

      {notSearched.length > 0 ? (
        <section className="not-searched" aria-labelledby="not-searched-title">
          <p className="ns-head">
            <strong id="not-searched-title">
              <Bi text={T.notSearchedTitle} />
            </strong>
            <span className="ns-lead">
              <Bi text={T.notSearchedLead} />
            </span>
          </p>
          <ul>
            {notSearched.map((group) => (
              <li key={group.reason}>
                <span className="cities">
                  {group.cities.map((city) =>
                    BOOKING_SITES[city.municipality] ? (
                      <a key={city.municipality} href={BOOKING_SITES[city.municipality]} rel="noopener noreferrer" target="_blank">
                        <Municipality name={city.municipality} /> ↗
                      </a>
                    ) : (
                      <span key={city.municipality} className="city">
                        <Municipality name={city.municipality} />
                      </span>
                    ),
                  )}
                </span>
                <span className="reason">
                  <Bi text={NOT_SEARCHED_REASONS[group.reason]} />
                </span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <form className="card search-form" action="/search" method="get">
        <input type="hidden" name={SUBMITTED_PARAM} value="1" />
        {invalidDates ? (
          <p className="notice error" role="status">
            <Bi text={T.searchInvalidDates} />
          </p>
        ) : null}

        <div className="form-row">
          <span className="row-label" id="dates-label">
            <Bi text={T.dates} />
          </span>
          <div className="row-body inputs">
            <label className="inline-field">
              <span className="sr-only">
                <Bi text={T.fromDate} />
              </span>
              <input type="date" id="from" name="from" defaultValue={form.from} aria-label={plain(T.fromDate)} />
            </label>
            <span aria-hidden="true">–</span>
            <label className="inline-field">
              <span className="sr-only">
                <Bi text={T.toDate} />
              </span>
              <input type="date" id="to" name="to" defaultValue={form.to} aria-label={plain(T.toDate)} />
            </label>
            <label className="inline-field people" htmlFor="people">
              <span className="field-name">
                <Bi text={T.people} />
              </span>
              <input
                type="number"
                id="people"
                name="people"
                min={1}
                max={9999}
                inputMode="numeric"
                defaultValue={form.people}
                aria-describedby="people-hint"
                placeholder="—"
              />
            </label>
            <span className={invalidPeople ? 'hint field-error' : 'hint'} id="people-hint">
              <Bi text={invalidPeople ? T.peopleInvalid : T.searchPeopleHint} />
            </span>
          </div>
        </div>

        <fieldset className="form-row">
          <legend className="row-label">
            <Bi text={T.daysOfWeek} />
          </legend>
          <div className="row-body choices">
            {WEEKDAYS.map((d) => (
              <label key={d.value} className={d.value === 6 ? 'sat' : d.value === 0 ? 'sun' : undefined}>
                <input type="checkbox" name="d" value={d.value} defaultChecked={form.days.includes(d.value)} />
                <Bi text={d.label} />
              </label>
            ))}
            <span className="hint">
              <Bi text={T.anyHint} />
            </span>
          </div>
        </fieldset>

        <fieldset className="form-row">
          <legend className="row-label">
            <Bi text={T.timeOfDay} />
          </legend>
          <div className="row-body choices">
            {TIMES_OF_DAY.map((time) => (
              <label key={time}>
                <input type="checkbox" name="t" value={time} defaultChecked={form.times.includes(time)} />
                <Bi text={TIME_LABELS[time]} />
              </label>
            ))}
          </div>
        </fieldset>

        <fieldset className="form-row">
          <legend className="row-label">
            <Bi text={T.needInstruments} />
          </legend>
          <div className="row-body choices">
            {INSTRUMENT_CLASSES.map((cls) => (
              <label key={cls}>
                <input type="checkbox" name="need" value={cls} defaultChecked={form.needs.includes(cls)} />
                <Bi text={INSTRUMENT_LABELS[cls]} />
              </label>
            ))}
            <label className="plain-check">
              <input type="checkbox" name="unknown" value="1" defaultChecked={form.includeUnknown} />
              <Bi text={T.includeUnknown} />
            </label>
          </div>
        </fieldset>

        <fieldset className="form-row">
          <legend className="row-label">
            <Bi text={T.municipalities} />
          </legend>
          <div className="row-body choices">
            {municipalityOptions.map((m) => (
              <label key={m}>
                <input type="checkbox" name="m" value={m} defaultChecked={form.municipalities.includes(m)} />
                <Municipality name={m} />
              </label>
            ))}
          </div>
        </fieldset>

        <div className="form-actions">
          <button type="submit" className="button">
            <Bi text={T.search} />
          </button>
          <span className="hint">
            <Bi text={T.searchDisclaimer} />
          </span>
        </div>
      </form>

      {!hasData ? (
        <p className="empty">
          <Bi text={T.noData} />
        </p>
      ) : (
        <section className="results" aria-live="polite">
          <div className="results-head">
            <h2>
              <Bi text={result.days.length > 0 ? T.daysFound(result.days.length) : T.noOpenSlots} />
            </h2>
            {result.days.length > 0 ? <StatusLegend /> : null}
          </div>
          {result.days.length > 1 ? (
            <nav className="day-index" aria-label={plain(T.jumpToDay)}>
              {result.days.map((day) => (
                <a key={day.date} href={`#day-${day.date}`} className={dayClass(day.date)}>
                  {shortDate(day.date)} <span className="count">{day.rooms.length}</span>
                </a>
              ))}
            </nav>
          ) : null}
          {result.days.map((day) => (
            <section key={day.date} className="day" id={`day-${day.date}`}>
              <h3 className={dayClass(day.date)}>
                <Bi text={dateText(day.date)} />
                <span className="count">
                  <Bi text={T.roomCount(day.rooms.length)} />
                </span>
              </h3>
              <ul className="rows">
                {day.rooms.map(({ room, slots: roomSlots }) => (
                  <li key={room.id} className="row result">
                    <div className="row-main">
                      <p className="room-title">
                        <RoomName room={room} />
                      </p>
                      <p className="room-sub">
                        <Municipality name={room.municipality} />
                        <span className={`capacity ${room.capacity === null ? 'unknown' : ''}`}>
                          <Bi text={capacityLabel(room.capacity)} />
                        </span>
                      </p>
                    </div>
                    <div className="row-info">
                      <ul className="slots" aria-label={plain(T.timeOfDay)}>
                        {roomSlots.map((slot) => (
                          <li key={slot.start} className="slot" title={`${TIME_LABELS[timeOfDayOf(slot.start)].en} / ${TIME_LABELS[timeOfDayOf(slot.start)].ja}`}>
                            {slot.start}–{slot.end}
                          </li>
                        ))}
                      </ul>
                      <InstrumentMarks room={room} shown={shown} />
                    </div>
                    <RoomLinks room={room} showDetails={showDetails} />
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </section>
      )}

      {manualByCity.length > 0 ? (
        <section className="manual-panel" aria-labelledby="manual-panel-title">
          <h2 id="manual-panel-title">
            <Bi text={T.manualPanelTitle} />
          </h2>
          <p className="manual-note">
            <Bi text={T.manualPanelNote} />
          </p>
          {manualByCity.map((city) => (
            <div key={city.municipality} className="manual-city">
              <h3>
                <Municipality name={city.municipality} />
                {BOOKING_SITES[city.municipality] ? (
                  <a href={BOOKING_SITES[city.municipality]} rel="noopener noreferrer" target="_blank">
                    <Bi text={T.book} /> ↗
                  </a>
                ) : null}
              </h3>
              <ul>
                {city.rooms.map((room) => (
                  <li key={room.id}>
                    {showDetails ? (
                      <Link href={`/rooms/${room.id}`}>
                        <RoomName room={room} />
                      </Link>
                    ) : (
                      <RoomName room={room} />
                    )}
                    <span className="capacity">
                      <Bi text={capacityLabel(room.capacity)} />
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
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
                  <Bi text={T.room} />
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
function InstrumentMarks({ room, shown }: { room: RoomWithEvidences; shown: InstrumentClass[] }) {
  const policy = effectivePolicy(room.evidences);
  return (
    <ul className="marks" aria-label={plain(T.instrumentsAria)}>
      {shown.map((cls) => (
        <li key={cls}>
          <StatusMark status={policy[cls].status} label={INSTRUMENT_SHORT_LABELS[cls]} />
        </li>
      ))}
    </ul>
  );
}

function RoomLinks({ room, showDetails }: { room: RoomWithEvidences; showDetails: boolean }) {
  const site = BOOKING_SITES[room.municipality];
  return (
    <p className="room-links">
      {site ? (
        <a href={site} rel="noopener noreferrer" target="_blank">
          <Bi text={T.book} /> ↗
        </a>
      ) : null}
      {showDetails ? (
        <Link href={`/rooms/${room.id}`}>
          <Bi text={T.roomDetails} />
        </Link>
      ) : null}
    </p>
  );
}
