import type { Metadata } from 'next';
import { redirect } from 'next/navigation';
import { devLoginEnabled, googleLoginEnabled } from '@/lib/auth';
import { getCurrentMember, safeReturnPath } from '@/lib/session';
import { Bi } from '../_i18n/Bi';
import { T } from '../_i18n/texts';
import { SignInButtons } from './SignInButtons';

export const metadata: Metadata = { title: `${T.signInTitle.en} · ${T.signInTitle.ja}` };
export const dynamic = 'force-dynamic';

type Props = { searchParams: Promise<{ next?: string; error?: string }> };

export default async function SignInPage({ searchParams }: Props) {
  const { next, error } = await searchParams;
  const returnTo = safeReturnPath(next);
  const member = await getCurrentMember();
  // ログイン済みで権限の問題でもなければ、元のページへ
  if (member && error !== 'forbidden') redirect(returnTo);

  return (
    <>
      <h1>
        <Bi text={T.signInTitle} stack />
      </h1>
      <p className="lead">
        <Bi text={T.signInLead} />
      </p>
      {error ? (
        <p className="notice error" role="alert">
          <Bi text={error === 'forbidden' ? T.forbidden : T.notInvited} />
        </p>
      ) : null}
      <div className="card">
        <SignInButtons returnTo={returnTo} google={googleLoginEnabled()} devLogin={devLoginEnabled()} />
      </div>
    </>
  );
}
