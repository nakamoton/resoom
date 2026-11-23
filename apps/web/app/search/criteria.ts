import { INSTRUMENT_CLASSES, TIMES_OF_DAY, parsePeople, type InstrumentClass, type SearchCriteria, type TimeOfDay } from '@resoom/core';

export type RawParams = Record<string, string | string[] | undefined>;

/** 検索ページの入力欄に戻すための値と、検索の条件。 */
export interface ParsedSearch {
  criteria: SearchCriteria;
  form: {
    from: string;
    to: string;
    days: number[];
    holidays: boolean;
    times: TimeOfDay[];
    people: string;
    needs: InstrumentClass[];
    includeUnknown: boolean;
    municipalities: string[];
  };
  /** 日付の指定が正しくなかった（既定の期間で検索した） */
  invalidDates: boolean;
  /** 人数の指定が正しくなかった（人数で絞らずに検索した） */
  invalidPeople: boolean;
}

const MAX_DAYS = 400;
/** 既定の期間（今日を含む日数）。空き状況を集めている範囲（今日から92日先まで）に合わせる。 */
const DEFAULT_DAYS = 92;

/** 最初に開いたときの人数（楽団のふだんの人数）。 */
export const DEFAULT_PEOPLE = 50;

/** 最初に開いたときに選んでおく楽器（和太鼓以外。楽団のふだんの編成）。 */
export const DEFAULT_NEEDS: InstrumentClass[] = INSTRUMENT_CLASSES.filter((c) => c !== 'taiko');

/** フォームから送られたことを示す隠し項目。ないときは最初に開いたものとして既定の選択を使う。 */
export const SUBMITTED_PARAM = 's';

/** 曜日の欄で、祝日を表す値（曜日は 0〜6）。 */
export const HOLIDAY_VALUE = 'h';

/** 最初に開いたときに選んでおく曜日（土・日）。祝日もあわせて選ぶ。 */
export const DEFAULT_WEEKDAYS = [0, 6];

const many = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * URLの検索条件を読む。正しくない値は既定値に置き換え、そのことを知らせる。
 * 指定がなければ（最初に開いたとき）、期間は今日から92日間、人数は50人、曜日は土・日・祝、楽器は和太鼓以外、
 * 「可否が未確認の部屋も含める」はオン、自治体はすべて選んだ状態にする。
 */
export function parseSearch(params: RawParams, today: string, municipalities: readonly string[]): ParsedSearch {
  const rawFrom = one(params.from);
  const rawTo = one(params.to);
  // 空欄は既定値で補う。形式が正しくない値や、期間が逆・長すぎる指定は、既定の期間に戻して知らせる
  let invalidDates = (rawFrom !== '' && !isIsoDate(rawFrom)) || (rawTo !== '' && !isIsoDate(rawTo));
  const from = isIsoDate(rawFrom) ? rawFrom : today;
  let to = isIsoDate(rawTo) ? rawTo : addDays(from, DEFAULT_DAYS - 1);
  if (to < from || to > addDays(from, MAX_DAYS - 1)) {
    invalidDates = true;
    to = addDays(from, DEFAULT_DAYS - 1);
  }

  // チェックボックスは、すべて外すと何も送られない。フォームから送られたときは、送られたとおりに読む
  const submitted = one(params[SUBMITTED_PARAM]) === '1';
  const rawDays = many(params.d);
  const useDefaultDays = !submitted && params.d === undefined;
  const days = useDefaultDays
    ? DEFAULT_WEEKDAYS
    : [...new Set(rawDays.filter((d) => /^[0-6]$/.test(d)).map(Number))].sort();
  const holidays = useDefaultDays || rawDays.includes(HOLIDAY_VALUE);
  const times = TIMES_OF_DAY.filter((t) => many(params.t).includes(t));
  const needs = submitted || params.need !== undefined ? INSTRUMENT_CLASSES.filter((c) => many(params.need).includes(c)) : DEFAULT_NEEDS;
  // 自治体は、最初はすべて選んだ状態にして、外していく形にする
  const chosenMunicipalities =
    submitted || params.m !== undefined ? municipalities.filter((m) => many(params.m).includes(m)) : [...municipalities];
  // 人数は、フォームから送られたときは空欄なら絞らない。最初に開いたときは既定の人数にする
  const peopleText = submitted || params.people !== undefined ? one(params.people) : String(DEFAULT_PEOPLE);
  const people = parsePeople(peopleText);
  const includeUnknown = submitted || params.unknown !== undefined ? one(params.unknown) === '1' : true;

  return {
    criteria: {
      from,
      to,
      weekdays: days.length > 0 ? days : null,
      holidays,
      timesOfDay: times.length > 0 ? times : null,
      people: people ?? null,
      needs,
      includeUnknown,
      // すべて選んだとき（とすべて外したとき）は、自治体で絞らない
      municipalities:
        chosenMunicipalities.length > 0 && chosenMunicipalities.length < municipalities.length ? chosenMunicipalities : null,
    },
    form: { from, to, days, holidays, times, people: people === undefined ? peopleText : peopleText.trim(), needs, includeUnknown, municipalities: chosenMunicipalities },
    invalidDates,
    invalidPeople: people === undefined,
  };
}
