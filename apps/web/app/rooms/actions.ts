'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { validateNewEvidence, validateNewRoom, type FieldErrors } from '@resoom/core';
import { DuplicateRoomError, addEvidence, createRoom, getDb, getRoom } from '@resoom/db';

export interface FormState {
  status: 'idle' | 'error' | 'saved';
  message?: string;
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
  const checked = validateNewEvidence(values, todayInJapan());
  if (!checked.ok) {
    return { status: 'error', message: '入力内容を確認してください。', errors: checked.errors, values };
  }

  const db = await getDb();
  if (!(await getRoom(db, roomId))) {
    return { status: 'error', message: 'この部屋は見つかりませんでした。', errors: {}, values };
  }
  await addEvidence(db, roomId, checked.value);
  revalidatePath('/rooms');
  revalidatePath(`/rooms/${roomId}`);
  // 続けて入力しやすいよう、記録者の名前だけ残す
  return { status: 'saved', message: '記録しました。', errors: {}, values: { reportedBy: checked.value.reportedBy } };
}

/** 部屋を追加し、その部屋のページへ移動する。 */
export async function createRoomAction(_prev: FormState, form: FormData): Promise<FormState> {
  const values = {
    municipality: single(form, 'municipality'),
    facilityName: single(form, 'facilityName'),
    roomName: single(form, 'roomName'),
    capacity: single(form, 'capacity'),
    nearestStation: single(form, 'nearestStation'),
  };
  const checked = validateNewRoom(values);
  if (!checked.ok) {
    return { status: 'error', message: '入力内容を確認してください。', errors: checked.errors, values };
  }

  let id: string;
  try {
    id = await createRoom(await getDb(), checked.value);
  } catch (error) {
    if (error instanceof DuplicateRoomError) {
      return { status: 'error', message: error.message, errors: { roomName: 'この部屋はすでに登録されています' }, values };
    }
    throw error;
  }
  revalidatePath('/rooms');
  redirect(`/rooms/${id}`);
}
