/**
 * コンテナで動かすコマンド（取得処理・マイグレーション・初期データの取り込み）を、
 * それぞれ1つの JavaScript ファイルにまとめる。出力は dist/scripts/。
 */
import { build } from 'esbuild';

await build({
  entryPoints: ['scripts/crawl.ts', 'scripts/db-migrate.ts', 'scripts/db-seed.ts'],
  outdir: 'dist/scripts',
  outExtension: { '.js': '.mjs' },
  // 開発用の PGlite は、使うときにだけ読み込む別ファイルに分ける（本番では読み込まない）
  splitting: true,
  chunkNames: 'chunks/[name]-[hash]',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  // pg は同梱する。PGlite（開発用）と、使わないネイティブ版・Cloudflare 用の部品は外す
  external: ['pg-native', 'cloudflare:sockets', '@electric-sql/pglite', '@electric-sql/pglite/*'],
  // CommonJS のライブラリが require を使えるようにする
  banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" },
  logLevel: 'info',
});
