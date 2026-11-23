import type { NextConfig } from 'next';

const config: NextConfig = {
  // ワークスペース内のパッケージは TypeScript のまま読み込む
  transpilePackages: ['@resoom/core', '@resoom/db'],
  // 組み込みデータベースは実行時にそのまま読み込む（バンドルしない）
  serverExternalPackages: ['@electric-sql/pglite'],
};

export default config;
