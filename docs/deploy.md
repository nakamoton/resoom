# 公開の手順（Google Cloud ＋ Neon）

resoom をインターネットに公開する手順です。所要時間は30〜45分ほどです。費用は無料枠に収まる見込みです（[設計書 10.1](./design.md)）。

必要なもの:

- Google アカウント（このアカウントが最初の管理者になります）
- クレジットカード（Google Cloud の登録に必要。無料枠の範囲なら請求は0円です）

秘密情報（データベースの接続文字列、OAuth のシークレット）は、手順の中で入力欄に直接入れます。**チャットやメール、リポジトリには貼らないでください。**

---

## 1. データベース（Neon）を作る

1. https://neon.com でアカウントを作ります（Google アカウントでも登録できます）。
2. 「New project」でプロジェクトを作ります。
   - Project name: `resoom`
   - Region: アジアのリージョン（東京があれば東京、なければシンガポール）
3. プロジェクトの画面で「Connect」を押し、**Connection pooling をオン**にして、表示された接続文字列（`postgresql://...?sslmode=require`）をコピーします。手順3で使います。

## 2. Google Cloud のプロジェクトを作る

1. https://console.cloud.google.com を開き、上部のプロジェクト選択から「新しいプロジェクト」を作ります（名前は `resoom` など）。
   - 表示される**プロジェクトID**（例: `resoom-123456`）を控えます。
2. 「お支払い」で請求先アカウント（クレジットカード）を設定し、このプロジェクトに紐付けます。
3. **予算の通知を設定します**（使いすぎで自動的に止まる仕組みはないため）。
   - 「お支払い」→「予算とアラート」→「予算を作成」
   - 対象: このプロジェクト、金額: 100円、通知: 50% と 100%
   - 想定外の費用が出たら、メールで届きます。

## 3. 最初の公開をする（Cloud Shell）

1. Google Cloud コンソールの右上にある「Cloud Shell をアクティブにする」（`>_` のアイコン）を押します。画面の下に黒い端末が開きます。
2. 次を1行ずつ実行します。

```bash
git clone https://github.com/nakamoton/resoom.git
```

```bash
cd resoom
```

```bash
bash deploy/cloudshell.sh init
```

3. 質問に答えます。
   - プロジェクトID: 手順2で控えたもの
   - リージョン: そのまま Enter（東京 `asia-northeast1`）
   - 最初の管理者: あなたの Google アカウントのメールアドレス（複数ならカンマ区切り）
   - Neon の接続文字列: 手順1でコピーしたもの（入力しても画面には表示されません）
4. 10分ほどで終わります。最後に表示される **公開URL** と **リダイレクト URI** を控えます。

この時点で、空き状況の検索ページ（`公開URL/search`）はログインなしで使えます。空き状況の最初の取得には数分かかります。

## 4. Google ログインを設定する

1. Google Cloud コンソールで「Google Auth Platform」（検索欄で「OAuth」と入力すると出ます）を開きます。
2. 「ブランディング」を設定します。
   - アプリ名: `resoom`
   - ユーザーサポートメール・デベロッパーの連絡先: あなたのメールアドレス
3. 「対象」で、ユーザーの種類を「外部」にし、公開ステータスを「本番環境」にします（「アプリを公開」）。
   - resoom が受け取るのは名前とメールアドレスだけなので、Google の審査は不要です。
   - 「テスト」のままだと、テストユーザーに登録した人しかログインできません。
4. 「クライアント」→「クライアントを作成」で、次のように作ります。
   - アプリケーションの種類: ウェブ アプリケーション
   - 名前: `resoom`
   - 承認済みのリダイレクト URI: 手順3で控えた **リダイレクト URI**（`公開URL/api/auth/callback/google`）
5. 作成後に表示される **クライアント ID** と **クライアント シークレット** を控えます。
6. Cloud Shell で次を実行し、2つを入力します（シークレットは画面に表示されません）。

```bash
bash deploy/cloudshell.sh google
```

## 5. ログインして楽団員を招待する

1. `公開URL/sign-in` を開き、「Sign in with Google」から、手順3で指定した管理者のアカウントでログインします。
2. 上部のメニューの「Members 楽団員」で、楽団員の Google アカウントのメールアドレスを招待します。
   - ロール: 団員（閲覧のみ）、施設編集（施設台帳の編集もできる）、管理者（招待もできる）
   - 招待してもメールは送られません。公開URLを本人に伝えてください。
3. 招待された人は、`公開URL/sign-in` から自分の Google アカウントでログインできます。

## 6. 更新するとき

`main` に新しい変更が入ったら、Cloud Shell で次を実行します。

```bash
cd ~/resoom
```

```bash
git pull
```

```bash
bash deploy/cloudshell.sh deploy
```

コンテナを作り直し、データベースのマイグレーションを当ててから、画面を更新します。

---

## 動いているもの

| 名前 | 種類 | 内容 |
|---|---|---|
| `resoom` | Cloud Run サービス | 画面。使われていない間は止まり、最初の表示に数秒かかります |
| `resoom-crawl` | Cloud Run ジョブ | 空き状況の取得。毎日 6:15・12:15・18:15（日本時間）に Cloud Scheduler が起動します |
| `resoom-migrate` | Cloud Run ジョブ | データベースのマイグレーション。更新のたびに実行します |
| `resoom-seed` | Cloud Run ジョブ | 初期データ（部屋と記録）の取り込み。最初の公開で1回だけ実行します |
| `resoom-*` | Secret Manager | データベースの接続文字列、ログインの鍵、OAuth の ID とシークレット |

## 困ったとき

| 症状 | 確認すること |
|---|---|
| ログインで「Sign-in failed. Only invited members can sign in.」 | そのメールアドレスが「Members 楽団員」で招待されているか |
| Google の画面で `redirect_uri_mismatch` | OAuth クライアントのリダイレクト URI が `公開URL/api/auth/callback/google` と完全に一致しているか |
| 検索ページで空き状況が古い | 検索ページ下の「Data coverage」で取得日時と失敗の有無を確認。Cloud Run の `resoom-crawl` ジョブのログも見る |
| 画面がエラーになる | Cloud Run の `resoom` サービスのログを見る |

## 参考: 環境変数

`deploy/cloudshell.sh` が設定します。手で変える必要はありません。

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | Neon の接続文字列（Secret Manager） |
| `BETTER_AUTH_SECRET` | ログインの鍵（自動で作成。Secret Manager） |
| `BETTER_AUTH_URL` | 公開URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth クライアント（Secret Manager） |
| `ADMIN_EMAILS` | 最初の管理者。名簿にまだいない場合だけ管理者として加えます |
