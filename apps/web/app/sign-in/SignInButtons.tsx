'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { authClient } from '@/lib/auth-client';
import { Bi } from '../_i18n/Bi';
import { T } from '../_i18n/texts';

interface Props {
  returnTo: string;
  google: boolean;
  devLogin: boolean;
}

export function SignInButtons({ returnTo, google, devLogin }: Props) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  const [failed, setFailed] = useState(false);
  const errorURL = `/sign-in?error=not-invited&next=${encodeURIComponent(returnTo)}`;

  async function signInWithGoogle() {
    setPending(true);
    await authClient.signIn.social({ provider: 'google', callbackURL: returnTo, errorCallbackURL: errorURL });
  }

  /** ローカル開発用: 招待済みのメールアドレスでログインする（初回はアカウントを作る）。 */
  async function devSignIn(form: FormData) {
    setPending(true);
    setFailed(false);
    const email = String(form.get('email') ?? '');
    const password = String(form.get('password') ?? '');
    const signedIn = await authClient.signIn.email({ email, password });
    const failedToSignIn = signedIn.error
      ? Boolean((await authClient.signUp.email({ email, password, name: email.split('@')[0] ?? email })).error)
      : false;
    if (failedToSignIn) {
      setPending(false);
      setFailed(true);
      return;
    }
    router.push(returnTo);
    router.refresh();
  }

  return (
    <>
      {google ? (
        <button type="button" className="button" onClick={signInWithGoogle} disabled={pending}>
          <Bi text={pending ? T.signingIn : T.signInWithGoogle} />
        </button>
      ) : (
        <p className="hint">
          <Bi text={T.googleNotConfigured} />
        </p>
      )}

      {devLogin ? (
        <form action={devSignIn} className="dev-login" noValidate>
          <h2>
            <Bi text={T.devLoginTitle} />
          </h2>
          <p className="hint">
            <Bi text={T.devLoginHint} />
          </p>
          {failed ? (
            <p className="notice error" role="alert">
              <Bi text={T.notInvited} />
            </p>
          ) : null}
          <div className="field">
            <label className="label" htmlFor="dev-email">
              <Bi text={T.email} />
            </label>
            <input type="email" id="dev-email" name="email" autoComplete="username" />
          </div>
          <div className="field">
            <label className="label" htmlFor="dev-password">
              <Bi text={T.password} />
            </label>
            <input type="password" id="dev-password" name="password" autoComplete="current-password" />
          </div>
          <button type="submit" className="button secondary" disabled={pending}>
            <Bi text={pending ? T.signingIn : T.signIn} />
          </button>
        </form>
      ) : null}
    </>
  );
}
