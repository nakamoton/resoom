'use client';

import { useActionState } from 'react';
import { MEMBER_ROLES, MEMBER_ROLE_DESCRIPTIONS, MEMBER_ROLE_LABELS, type MemberRole } from '@resoom/core';
import { Bi, FieldError, plain } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { changeRoleAction, inviteMemberAction, removeMemberAction, type MemberFormState } from './actions';

const INITIAL: MemberFormState = { status: 'idle', errors: {}, values: {} };

function Notice({ state }: { state: MemberFormState }) {
  if (!state.message) return null;
  return (
    <p className={`notice ${state.status === 'error' ? 'error' : ''}`} role="status">
      <Bi text={state.message} />
    </p>
  );
}

export function InviteForm() {
  const [state, action, pending] = useActionState(inviteMemberAction, INITIAL);
  const role = state.values.role || 'member';
  return (
    <form action={action} noValidate>
      <Notice state={state} />
      <div className="field">
        <label className="label" htmlFor="invite-email">
          <Bi text={T.email} />
        </label>
        <input
          type="email"
          id="invite-email"
          name="email"
          defaultValue={state.values.email ?? ''}
          key={state.status === 'saved' ? 'cleared' : 'input'}
          aria-describedby={['invite-email-hint', state.errors.email ? 'invite-email-error' : null].filter(Boolean).join(' ')}
          aria-invalid={state.errors.email ? true : undefined}
        />
        <p className="hint" id="invite-email-hint">
          <Bi text={T.inviteHint} />
        </p>
        <FieldError id="invite-email-error" code={state.errors.email} />
      </div>
      <fieldset className="field">
        <legend>
          <Bi text={T.role} />
        </legend>
        <div className="choices">
          {MEMBER_ROLES.map((r) => (
            <label key={r}>
              <input type="radio" name="role" value={r} defaultChecked={role === r} />
              <span>
                <Bi text={MEMBER_ROLE_LABELS[r]} />
                <span className="role-desc">
                  <Bi text={MEMBER_ROLE_DESCRIPTIONS[r]} />
                </span>
              </span>
            </label>
          ))}
        </div>
        <FieldError id="invite-role-error" code={state.errors.role} />
      </fieldset>
      <button type="submit" className="button" disabled={pending}>
        <Bi text={T.invite} />
      </button>
    </form>
  );
}

export function RoleForm({ email, role }: { email: string; role: MemberRole }) {
  const [state, action, pending] = useActionState(changeRoleAction.bind(null, email), INITIAL);
  return (
    <form action={action} className="inline-form" noValidate>
      <select name="role" defaultValue={role} aria-label={`${plain(T.role)}: ${email}`}>
        {MEMBER_ROLES.map((r) => (
          <option key={r} value={r}>
            {plain(MEMBER_ROLE_LABELS[r])}
          </option>
        ))}
      </select>
      <button type="submit" className="button secondary small" disabled={pending}>
        <Bi text={T.change} />
      </button>
      <FieldError id={`role-error-${email}`} code={state.errors.role} />
      {state.status === 'saved' ? (
        <span className="saved" role="status">
          <Bi text={T.roleChanged} />
        </span>
      ) : null}
    </form>
  );
}

export function RemoveForm({ email }: { email: string }) {
  const [state, action, pending] = useActionState(removeMemberAction.bind(null, email), INITIAL);
  return (
    <form action={action} className="inline-form" noValidate>
      <button type="submit" className="button danger small" disabled={pending} aria-label={`${plain(T.remove)}: ${email}`}>
        <Bi text={T.remove} />
      </button>
      <FieldError id={`remove-error-${email}`} code={state.errors.remove} />
    </form>
  );
}
