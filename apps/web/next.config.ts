import { join } from 'node:path';
import type { NextConfig } from 'next';

const config: NextConfig = {
  // Cloud Run で動かすコンテナ用に、必要なファイルだけを .next/standalone にまとめる
  output: 'standalone',
  // ワークスペース全体（packages/*）を追跡の対象にする
  outputFileTracingRoot: join(import.meta.dirname, '..', '..'),
  // ワークスペース内のパッケージは TypeScript のまま読み込む
  transpilePackages: ['@resoom/core', '@resoom/db'],
  // データベースのドライバーは実行時にそのまま読み込む（バンドルしない）
  serverExternalPackages: ['@electric-sql/pglite', 'pg'],
};

export default config;
