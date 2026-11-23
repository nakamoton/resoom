import { INSTRUMENT_CLASSES, TIMES_OF_DAY, parsePeople, type InstrumentClass, type SearchCriteria, type TimeOfDay } from '@resoom/core';

export type RawParams = Record<string, string | string[] | undefined>;

/** 検索ページの入力欄に戻すための値と、検索の条件。 */
export interface ParsedSearch {
  criteria: SearchCriteria;
  form: {
    from: string;
    to: string;
    days: number[];
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
const DEFAULT_DAYS = 31;

const many = (value: string | string[] | undefined): string[] => (Array.isArray(value) ? value : value === undefined ? [] : [value]);
const one = (value: string | string[] | undefined): string => (Array.isArray(value) ? (value[0] ?? '') : (value ?? ''));

function isIsoDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  return new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) === value;
}

const addDays = (date: string, days: number): string => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** URLの検索条件を読む。正しくない値は既定値に置き換え、そのことを知らせる。 */
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

  const days = [...new Set(many(params.d).map(Number))].filter((d) => Number.isInteger(d) && d >= 0 && d <= 6).sort();
  const times = TIMES_OF_DAY.filter((t) => many(params.t).includes(t));
  const needs = INSTRUMENT_CLASSES.filter((c) => many(params.need).includes(c));
  const chosenMunicipalities = municipalities.filter((m) => many(params.m).includes(m));
  const peopleText = one(params.people);
  const people = parsePeople(peopleText);
  const includeUnknown = one(params.unknown) === '1';

  return {
    criteria: {
      from,
      to,
      weekdays: days.length > 0 ? days : null,
      timesOfDay: times.length > 0 ? times : null,
      people: people ?? null,
      needs,
      includeUnknown,
      municipalities: chosenMunicipalities.length > 0 ? chosenMunicipalities : null,
    },
    form: { from, to, days, times, people: people === undefined ? peopleText : peopleText.trim(), needs, includeUnknown, municipalities: chosenMunicipalities },
    invalidDates,
    invalidPeople: people === undefined,
  };
}
