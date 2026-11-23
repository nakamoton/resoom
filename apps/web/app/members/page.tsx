import type { Metadata } from 'next';
import { getDb, listMembers } from '@resoom/db';
import { requirePermission } from '@/lib/session';
import { Bi } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { InviteForm, RemoveForm, RoleForm } from './MemberForms';

export const metadata: Metadata = { title: `${T.membersTitle.en} · ${T.membersTitle.ja}` };
export const dynamic = 'force-dynamic';

export default async function MembersPage() {
  const me = await requirePermission('manageMembers', '/members');
  const members = await listMembers(await getDb());

  return (
    <>
      <h1>
        <Bi text={T.membersTitle} />
      </h1>
      <p className="lead">
        <Bi text={T.membersLead} />
      </p>

      <h2>
        <Bi text={T.inviteTitle} />
      </h2>
      <div className="card">
        <InviteForm />
      </div>

      <h2>
        <Bi text={T.membersTitle} />
      </h2>
      <ul className="member-list">
        {members.map((m) => (
          <li key={m.email} className="card">
            <p className="member-email">
              {m.email}
              {m.email === me.email ? (
                <span className="you">
                  {' '}
                  (<Bi text={T.you} />)
                </span>
              ) : null}
            </p>
            <p className="meta">
              <Bi text={T.invitedBy} />: {m.invitedBy ?? <Bi text={T.initialAdmin} />}
            </p>
            <div className="member-actions">
              <RoleForm email={m.email} role={m.role} />
              {m.email === me.email ? null : <RemoveForm email={m.email} />}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}
