import {
  EVIDENCE_KINDS,
  INSTRUMENT_CLASSES,
  POLICY_RESULTS,
  type EvidenceKind,
  type InstrumentClass,
  type PolicyResult,
} from './policy';

export type FieldErrors = Record<string, string>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

export interface NewRoomInput {
  municipality: string;
  facilityName: string;
  roomName: string;
  capacity: number | null;
  nearestStation: string | null;
}

export interface NewEvidenceInput {
  kind: EvidenceKind;
  occurredOn: string;
  result: PolicyResult;
  instruments: InstrumentClass[];
  note: string;
  sourceUrl: string | null;
  reportedBy: string;
}

type Raw = Record<string, unknown>;

const text = (raw: Raw, key: string): string => (typeof raw[key] === 'string' ? (raw[key] as string).trim() : '');
const includes = <T extends string>(list: readonly T[], value: string): value is T => (list as readonly string[]).includes(value);

function isRealDate(value: string): boolean {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!m) return false;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])));
  return date.toISOString().slice(0, 10) === value;
}

/** 部屋の追加フォームの入力を検証する。 */
export function validateNewRoom(raw: Raw): Validated<NewRoomInput> {
  const errors: FieldErrors = {};
  const municipality = text(raw, 'municipality');
  const facilityName = text(raw, 'facilityName');
  const roomName = text(raw, 'roomName');
  const capacityText = text(raw, 'capacity');
  const nearestStation = text(raw, 'nearestStation');

  if (!municipality) errors.municipality = '自治体を入力してください';
  else if (municipality.length > 20) errors.municipality = '20文字以内で入力してください';
  if (!facilityName) errors.facilityName = '施設名を入力してください';
  else if (facilityName.length > 80) errors.facilityName = '80文字以内で入力してください';
  if (!roomName) errors.roomName = '部屋名を入力してください';
  else if (roomName.length > 80) errors.roomName = '80文字以内で入力してください';
  if (nearestStation.length > 40) errors.nearestStation = '40文字以内で入力してください';

  let capacity: number | null = null;
  if (capacityText) {
    if (!/^\d{1,4}$/.test(capacityText) || Number(capacityText) < 1) errors.capacity = '定員は1〜9999の数字で入力してください';
    else capacity = Number(capacityText);
  }

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return { ok: true, value: { municipality, facilityName, roomName, capacity, nearestStation: nearestStation || null } };
}

/** 記録の追加フォームの入力を検証する。today は「未来の日付」を弾くための今日（YYYY-MM-DD）。 */
export function validateNewEvidence(raw: Raw, today: string): Validated<NewEvidenceInput> {
  const errors: FieldErrors = {};
  const kind = text(raw, 'kind');
  const occurredOn = text(raw, 'occurredOn');
  const result = text(raw, 'result');
  const note = text(raw, 'note');
  const sourceUrl = text(raw, 'sourceUrl');
  const reportedBy = text(raw, 'reportedBy');
  const rawInstruments = Array.isArray(raw.instruments) ? raw.instruments : [];
  const instruments = INSTRUMENT_CLASSES.filter((cls) => rawInstruments.includes(cls));

  if (!includes(EVIDENCE_KINDS, kind)) errors.kind = '記録の種類を選んでください';
  if (!isRealDate(occurredOn)) errors.occurredOn = '日付を入力してください';
  else if (occurredOn > today) errors.occurredOn = '未来の日付は入力できません';
  if (!includes(POLICY_RESULTS, result)) errors.result = '結果を選んでください';
  if (rawInstruments.some((v) => typeof v !== 'string' || !includes(INSTRUMENT_CLASSES, v))) {
    errors.instruments = '楽器の指定が正しくありません';
  }
  if (!note) errors.note = '内容を入力してください';
  else if (note.length > 1000) errors.note = '1000文字以内で入力してください';
  if (!reportedBy) errors.reportedBy = '記録者の名前を入力してください';
  else if (reportedBy.length > 40) errors.reportedBy = '40文字以内で入力してください';
  if (sourceUrl) {
    if (sourceUrl.length > 500) errors.sourceUrl = '500文字以内で入力してください';
    else if (!/^https?:\/\/\S+$/.test(sourceUrl)) errors.sourceUrl = 'http:// または https:// で始まるURLを入力してください';
  }

  if (Object.keys(errors).length > 0 || !includes(EVIDENCE_KINDS, kind) || !includes(POLICY_RESULTS, result)) {
    return { ok: false, errors };
  }
  return { ok: true, value: { kind, occurredOn, result, instruments, note, sourceUrl: sourceUrl || null, reportedBy } };
}
