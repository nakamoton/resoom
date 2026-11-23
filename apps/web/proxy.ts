import { NextResponse, type NextRequest } from 'next/server';
import { canonicalRedirect } from './lib/canonical';

/** もう一方の Cloud Run のURLで開かれたら、正規のURL（BETTER_AUTH_URL）へ移す。 */
export function proxy(request: NextRequest) {
  const target = canonicalRedirect(
    request.nextUrl.pathname + request.nextUrl.search,
    request.headers.get('host'),
    process.env.BETTER_AUTH_URL,
  );
  return target ? NextResponse.redirect(target, 308) : NextResponse.next();
}

export const config = {
  // 静的なファイルには使わない
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};
