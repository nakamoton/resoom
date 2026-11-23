'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validateNewEvidence, validateNewRoom, validateRoomBasics, type FieldErrors, type LocalizedText } from '@resoom/core';
import { DuplicateRoomError, addEvidence, createRoom, getDb, getRoom, updateRoomBasics } from '@resoom/db';
import { memberWith } from '@/lib/session';
import { T } from '../_i18n/texts';

export interface FormState {
  status: 'idle' | 'error' | 'saved';
  message?: LocalizedText;
  /** 項目ごとのエラーコード */
  errors: FieldErrors;
  /** エラー時に入力内容を戻すための値 */
  values: Record<string, string | string[]>;
}

/** 今日の日付（日本時間、YYYY-MM-DD）。 */
function todayInJapan(): string {
  return new Intl.DateTimeFormat('sv-SE', { timeZone: 'Asia/Tokyo' }).format(new Date());
}

const single = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};

/** 部屋に記録を1件追加する。 */
export async function addEvidenceAction(roomId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    kind: single(form, 'kind'),
    occurredOn: single(form, 'occurredOn'),
    result: single(form, 'result'),
    instruments: form.getAll('instruments').filter((v): v is string => typeof v === 'string'),
    note: single(form, 'note'),
    sourceUrl: single(form, 'sourceUrl'),
    reportedBy: single(form, 'reportedBy'),
  };
  if (!(await memberWith('editCatalog'))) return { status: 'error', message: T.notAllowedAction, errors: {}, values };
  const checked = validateNewEvidence(values, todayInJapan());
  if (!checked.ok) return { status: 'error', message: T.checkFields, errors: checked.errors, values };

  const db = await getDb();
  if (!(await getRoom(db, roomId))) return { status: 'error', message: T.roomNotFound, errors: {}, values };
  await addEvidence(db, roomId, checked.value);
  revalidatePath('/rooms');
  revalidatePath(`/rooms/${roomId}`);
  // 続けて入力しやすいよう、記録者の名前だけ残す
  return { status: 'saved', message: T.recordSaved, errors: {}, values: { reportedBy: checked.value.reportedBy } };
}

const roomFields = (form: FormData) => ({
  facilityNameEn: single(form, 'facilityNameEn'),
  roomNameEn: single(form, 'roomNameEn'),
  capacity: single(form, 'capacity'),
  capacitySource: single(form, 'capacitySource'),
  nearestStation: single(form, 'nearestStation'),
});

/** 部屋を追加し、その部屋のページへ移動する。 */
export async function createRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    municipality: single(form, 'municipality'),
    facilityName: single(form, 'facilityName'),
    roomName: single(form, 'roomName'),
    ...roomFields(form),
  };
  if (!(await memberWith('editCatalog'))) return { status: 'error', message: T.notAllowedAction, errors: {}, values };
  const checked = validateNewRoom(values);
  if (!checked.ok) return { status: 'error', message: T.checkFields, errors: checked.errors, values };

  let id: string;
  try {
    id = await createRoom(await getDb(), checked.value);
  } catch (error) {
    if (error instanceof DuplicateRoomError) {
      return { status: 'error', message: T.roomDuplicateMessage, errors: { roomName: 'roomDuplicate' }, values };
    }
    throw error;
  }
  revalidatePath('/rooms');
  redirect(`/rooms/${id}`);
}

/** 部屋の英語名・定員・定員の出典・最寄駅を直す。 */
export async function updateRoomBasicsAction(roomId: string, _prev: FormState, form: FormData): Promise<FormState> {
  const values = roomFields(form);
  if (!(await memberWith('editCatalog'))) return { status: 'error', message: T.notAllowedAction, errors: {}, values };
  const checked = validateRoomBasics(values);
  if (!checked.ok) return { status: 'error', message: T.checkFields, errors: checked.errors, values };
  if (!(await updateRoomBasics(await getDb(), roomId, checked.value))) {
    return { status: 'error', message: T.roomNotFound, errors: {}, values };
  }
  revalidatePath('/rooms');
  revalidatePath(`/rooms/${roomId}`);
  const v = checked.value;
  return {
    status: 'saved',
    message: T.basicsSaved,
    errors: {},
    values: {
      facilityNameEn: v.facilityNameEn ?? '',
      roomNameEn: v.roomNameEn ?? '',
      capacity: v.capacity === null ? '' : String(v.capacity),
      capacitySource: v.capacitySource ?? '',
      nearestStation: v.nearestStation ?? '',
    },
  };
}
