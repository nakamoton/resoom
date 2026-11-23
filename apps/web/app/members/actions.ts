'use server';

import { revalidatePath } from 'next/cache';
import { MEMBER_ROLES, isValidEmail, normalizeEmail, type FieldErrors, type LocalizedText, type MemberRole } from '@resoom/core';
import { MemberError, changeMemberRole, getDb, inviteMember, removeMember } from '@resoom/db';
import { memberWith } from '@/lib/session';
import { T } from '../_i18n/texts';

export interface MemberFormState {
  status: 'idle' | 'error' | 'saved';
  message?: LocalizedText;
  errors: FieldErrors;
  values: Record<string, string>;
}

const single = (form: FormData, key: string): string => {
  const value = form.get(key);
  return typeof value === 'string' ? value : '';
};
const isRole = (value: string): value is MemberRole => (MEMBER_ROLES as readonly string[]).includes(value);

/** 楽団員を招待する（管理者だけ）。 */
export async function inviteMemberAction(_prev: MemberFormState, form: FormData): Promise<MemberFormState> {
  const values = { email: single(form, 'email'), role: single(form, 'role') };
  const admin = await memberWith('manageMembers');
  if (!admin) return { status: 'error', message: T.notAllowedAction, errors: {}, values };

  const errors: FieldErrors = {};
  const email = normalizeEmail(values.email);
  if (!isValidEmail(email)) errors.email = 'emailInvalid';
  if (!isRole(values.role)) errors.role = 'roleRequired';
  if (Object.keys(errors).length > 0 || !isRole(values.role)) return { status: 'error', message: T.checkFields, errors, values };

  try {
    await inviteMember(await getDb(), { email, role: values.role, invitedBy: admin.email });
  } catch (error) {
    if (error instanceof MemberError && error.code === 'memberExists') {
      return { status: 'error', message: T.checkFields, errors: { email: 'memberExists' }, values };
    }
    throw error;
  }
  revalidatePath('/members');
  return { status: 'saved', message: T.invited, errors: {}, values: { email: '', role: values.role } };
}

/** ロールを変える（管理者だけ）。 */
export async function changeRoleAction(email: string, _prev: MemberFormState, form: FormData): Promise<MemberFormState> {
  const role = single(form, 'role');
  const values = { role };
  if (!(await memberWith('manageMembers'))) return { status: 'error', message: T.notAllowedAction, errors: {}, values };
  if (!isRole(role)) return { status: 'error', message: T.checkFields, errors: { role: 'roleRequired' }, values };
  try {
    await changeMemberRole(await getDb(), email, role);
  } catch (error) {
    if (error instanceof MemberError && error.code === 'lastAdmin') {
      return { status: 'error', message: T.checkFields, errors: { role: 'lastAdmin' }, values };
    }
    throw error;
  }
  revalidatePath('/members');
  return { status: 'saved', message: T.roleChanged, errors: {}, values };
}

/** 名簿から外す（管理者だけ）。自分自身と最後の管理者は外せない。 */
export async function removeMemberAction(email: string, _prev: MemberFormState): Promise<MemberFormState> {
  const admin = await memberWith('manageMembers');
  if (!admin) return { status: 'error', message: T.notAllowedAction, errors: {}, values: {} };
  if (normalizeEmail(email) === admin.email) return { status: 'error', message: T.checkFields, errors: { remove: 'cannotRemoveSelf' }, values: {} };
  try {
    await removeMember(await getDb(), email);
  } catch (error) {
    if (error instanceof MemberError && error.code === 'lastAdmin') {
      return { status: 'error', message: T.checkFields, errors: { remove: 'lastAdmin' }, values: {} };
    }
    throw error;
  }
  revalidatePath('/members');
  return { status: 'saved', message: T.removed, errors: {}, values: {} };
}
