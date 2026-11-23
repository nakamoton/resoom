import type { LocalizedText } from './i18n';
import {
  EVIDENCE_KINDS,
  INSTRUMENT_CLASSES,
  POLICY_RESULTS,
  type EvidenceKind,
  type InstrumentClass,
  type PolicyResult,
} from './policy';

/** 入力エラーの文言。検証はコードを返し、画面がこの表から英語と日本語の文を出す。 */
export const ERROR_MESSAGES = {
  municipalityRequired: { en: 'Enter the municipality.', ja: '自治体を入力してください' },
  facilityNameRequired: { en: 'Enter the facility name.', ja: '施設名を入力してください' },
  roomNameRequired: { en: 'Enter the room name.', ja: '部屋名を入力してください' },
  roomDuplicate: { en: 'This room is already registered.', ja: 'この部屋はすでに登録されています' },
  capacityInvalid: { en: 'Enter a number from 1 to 9999.', ja: '定員は1〜9999の数字で入力してください' },
  capacitySourceWithoutCapacity: {
    en: 'Enter the capacity, or leave the source empty.',
    ja: '定員を入力するか、出典を空にしてください',
  },
  kindRequired: { en: 'Choose the type of record.', ja: '記録の種類を選んでください' },
  dateRequired: { en: 'Enter a date.', ja: '日付を入力してください' },
  dateInFuture: { en: 'The date cannot be in the future.', ja: '未来の日付は入力できません' },
  resultRequired: { en: 'Choose a result.', ja: '結果を選んでください' },
  instrumentsInvalid: { en: 'The instrument selection is not valid.', ja: '楽器の指定が正しくありません' },
  noteRequired: { en: 'Describe what happened.', ja: '内容を入力してください' },
  reportedByRequired: { en: 'Enter your name.', ja: '記録者の名前を入力してください' },
  urlInvalid: { en: 'Enter a URL that starts with http:// or https://.', ja: 'http:// または https:// で始まるURLを入力してください' },
  emailInvalid: { en: 'Enter a valid email address.', ja: '正しいメールアドレスを入力してください' },
  roleRequired: { en: 'Choose a role.', ja: 'ロールを選んでください' },
  memberExists: { en: 'This person is already a member.', ja: 'この人はすでに楽団員として登録されています' },
  lastAdmin: { en: 'At least one admin is needed.', ja: '管理者が1人もいなくなるため、変更できません' },
  cannotRemoveSelf: { en: 'You cannot remove yourself.', ja: '自分自身は外せません' },
  maxLength20: { en: 'Use 20 characters or fewer.', ja: '20文字以内で入力してください' },
  maxLength40: { en: 'Use 40 characters or fewer.', ja: '40文字以内で入力してください' },
  maxLength80: { en: 'Use 80 characters or fewer.', ja: '80文字以内で入力してください' },
  maxLength120: { en: 'Use 120 characters or fewer.', ja: '120文字以内で入力してください' },
  maxLength200: { en: 'Use 200 characters or fewer.', ja: '200文字以内で入力してください' },
  maxLength500: { en: 'Use 500 characters or fewer.', ja: '500文字以内で入力してください' },
  maxLength1000: { en: 'Use 1000 characters or fewer.', ja: '1000文字以内で入力してください' },
} as const satisfies Record<string, LocalizedText>;

export type ErrorCode = keyof typeof ERROR_MESSAGES;
export type FieldErrors = Record<string, ErrorCode>;
export type Validated<T> = { ok: true; value: T } | { ok: false; errors: FieldErrors };

/** 部屋の基本情報のうち、あとから直せる項目。 */
export interface RoomBasicsInput {
  /** 施設名の英語表記。null なら日本語だけを表示する */
  facilityNameEn: string | null;
  /** 部屋名の英語表記 */
  roomNameEn: string | null;
  capacity: number | null;
  /** 定員の出典。定員が空なら null */
  capacitySource: string | null;
  nearestStation: string | null;
}

export interface NewRoomInput extends RoomBasicsInput {
  municipality: string;
  facilityName: string;
  roomName: string;
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

/** 英語名・定員・定員の出典・最寄駅の入力を検証する。 */
export function validateRoomBasics(raw: Raw): Validated<RoomBasicsInput> {
  const errors: FieldErrors = {};
  const facilityNameEn = text(raw, 'facilityNameEn');
  const roomNameEn = text(raw, 'roomNameEn');
  const capacityText = text(raw, 'capacity');
  const capacitySource = text(raw, 'capacitySource');
  const nearestStation = text(raw, 'nearestStation');

  if (facilityNameEn.length > 120) errors.facilityNameEn = 'maxLength120';
  if (roomNameEn.length > 120) errors.roomNameEn = 'maxLength120';
  let capacity: number | null = null;
  if (capacityText) {
    if (!/^\d{1,4}$/.test(capacityText) || Number(capacityText) < 1) errors.capacity = 'capacityInvalid';
    else capacity = Number(capacityText);
  }
  if (capacitySource.length > 200) errors.capacitySource = 'maxLength200';
  else if (capacitySource && !capacityText) errors.capacitySource = 'capacitySourceWithoutCapacity';
  if (nearestStation.length > 40) errors.nearestStation = 'maxLength40';

  if (Object.keys(errors).length > 0) return { ok: false, errors };
  return {
    ok: true,
    value: {
      facilityNameEn: facilityNameEn || null,
      roomNameEn: roomNameEn || null,
      capacity,
      capacitySource: capacity === null ? null : capacitySource || null,
      nearestStation: nearestStation || null,
    },
  };
}

/** 部屋の追加フォームの入力を検証する。 */
export function validateNewRoom(raw: Raw): Validated<NewRoomInput> {
  const errors: FieldErrors = {};
  const municipality = text(raw, 'municipality');
  const facilityName = text(raw, 'facilityName');
  const roomName = text(raw, 'roomName');

  if (!municipality) errors.municipality = 'municipalityRequired';
  else if (municipality.length > 20) errors.municipality = 'maxLength20';
  if (!facilityName) errors.facilityName = 'facilityNameRequired';
  else if (facilityName.length > 80) errors.facilityName = 'maxLength80';
  if (!roomName) errors.roomName = 'roomNameRequired';
  else if (roomName.length > 80) errors.roomName = 'maxLength80';

  const basics = validateRoomBasics(raw);
  if (!basics.ok) Object.assign(errors, basics.errors);
  if (Object.keys(errors).length > 0 || !basics.ok) return { ok: false, errors };
  return { ok: true, value: { municipality, facilityName, roomName, ...basics.value } };
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

  if (!includes(EVIDENCE_KINDS, kind)) errors.kind = 'kindRequired';
  if (!isRealDate(occurredOn)) errors.occurredOn = 'dateRequired';
  else if (occurredOn > today) errors.occurredOn = 'dateInFuture';
  if (!includes(POLICY_RESULTS, result)) errors.result = 'resultRequired';
  if (rawInstruments.some((v) => typeof v !== 'string' || !includes(INSTRUMENT_CLASSES, v))) {
    errors.instruments = 'instrumentsInvalid';
  }
  if (!note) errors.note = 'noteRequired';
  else if (note.length > 1000) errors.note = 'maxLength1000';
  if (!reportedBy) errors.reportedBy = 'reportedByRequired';
  else if (reportedBy.length > 40) errors.reportedBy = 'maxLength40';
  if (sourceUrl) {
    if (sourceUrl.length > 500) errors.sourceUrl = 'maxLength500';
    else if (!/^https?:\/\/\S+$/.test(sourceUrl)) errors.sourceUrl = 'urlInvalid';
  }

  if (Object.keys(errors).length > 0 || !includes(EVIDENCE_KINDS, kind) || !includes(POLICY_RESULTS, result)) {
    return { ok: false, errors };
  }
  return { ok: true, value: { kind, occurredOn, result, instruments, note, sourceUrl: sourceUrl || null, reportedBy } };
}
