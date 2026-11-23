'use client';

import { createAuthClient } from 'better-auth/react';

/** ブラウザ側のログイン機能（同じサイトの /api/auth を使う）。 */
export const authClient = createAuthClient();
