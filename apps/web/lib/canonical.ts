/**
 * Cloud Run には同じサービスにつながるURLが2つある（例: resoom-xxxx-an.a.run.app と
 * resoom-<番号>.asia-northeast1.run.app）。ログインは正規のURL（BETTER_AUTH_URL）でしか動かないので、
 * もう一方の run.app のURLで開かれたら、同じパスのまま正規のURLへ移す。
 *
 * 移す必要がなければ null を返す。run.app 以外のホスト（ローカルの開発環境など）は移さない。
 */
export function canonicalRedirect(pathAndQuery: string, host: string | null, canonical: string | undefined): string | null {
  if (!canonical || !host) return null;
  let target: URL;
  try {
    target = new URL(canonical);
  } catch {
    return null;
  }
  const incoming = host.toLowerCase();
  if (incoming === target.host.toLowerCase()) return null;
  if (!incoming.endsWith('.run.app')) return null;
  const path = pathAndQuery.startsWith('/') && !pathAndQuery.startsWith('//') ? pathAndQuery : '/';
  return new URL(path, target.origin).toString();
}
