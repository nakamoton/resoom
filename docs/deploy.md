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
   - Region: AWS の **Asia Pacific (Singapore)**（Neon には東京リージョンがないため、いちばん近いシンガポールにします）
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
   - 途中の「Service URL」にも別のURL（`resoom-<番号>.asia-northeast1.run.app`）が出ますが、**最後の「公開できました」に出るURLを使ってください**。もう一方のURLで開いた場合は、自動で公開URLへ移ります。

この時点で、空き状況の検索ページ（`公開URL/search`）はログインなしで使えます。空き状況の最初の取得には数分かかります。

## 4. Google ログインを設定する

1. Google Cloud コンソールの検索欄で「Google Auth Platform」と入力して開き、「Get started（開始）」を押します。
2. 順に入力します。
   - App Information（アプリ情報）: アプリ名は `resoom`、ユーザーサポートメールはあなたのメールアドレス
   - Audience（対象）: **External（外部）**
   - Contact Information（連絡先情報）: あなたのメールアドレス
   - Finish（終了）: ポリシーに同意して「Create（作成）」
3. **公開ステータスは「Testing（テスト）」のままにします。**
   - resoom が受け取るのは名前・メールアドレス・プロフィールだけなので、Testing のままでも、テストユーザーに登録していない Google アカウントでログインできます（2026-11-23 に確認）。
   - 「Publish app（アプリを公開）」は、Branding にプライバシーポリシーのリンクなどを揃えないと押せません。`run.app` のURLでは所有確認ができないため、本番公開には自分のドメインが必要になる見込みです。
   - テストユーザーに自分を追加しようとすると「Ineligible accounts not added」と出ることがありますが、追加しなくてもログインできます。
4. 左のメニューの「Clients（クライアント）」→「Create client（クライアントを作成）」で、次のように作ります。
   - Application type（アプリケーションの種類）: Web application（ウェブ アプリケーション）
   - Name（名前）: `resoom`
   - Authorized redirect URIs（承認済みのリダイレクト URI）: 手順3で控えた **リダイレクト URI**（`公開URL/api/auth/callback/google`）
5. 作成後に表示される **Client ID（クライアント ID）** と **Client secret（クライアント シークレット）** を控えます。シークレットはこのときしか表示されません。
6. Cloud Shell で次を実行し、2つを入力します（シークレットは画面に表示されません）。

```bash
bash deploy/cloudshell.sh google
```

## 5. ログインして楽団員を招待する

1. `公開URL/sign-in` を開き、「Sign in with Google」から、手順3で指定した管理者のアカウントでログインします。
   - 「Google hasn't verified this app（このアプリは確認されていません）」と出たら「Continue（続行）」を押します（Testing のままなので出ることがあります）。
2. 上部のメニューの「Members 楽団員」で、楽団員の Google アカウントのメールアドレスを招待します。
   - ロール: 団員（閲覧のみ）、施設編集（施設台帳の編集もできる）、管理者（招待もできる）
   - 招待してもメールは送られません。公開URLを本人に伝えてください。
3. 招待された人は、`公開URL/sign-in` から自分の Google アカウントでログインできます。

## 6. 更新するとき

自動公開（手順7）を設定したあとは、`main` に変更が入ると自動で公開されます。Cloud Shell での操作は要りません。

自動公開を設定する前や、環境変数・秘密情報・ジョブの設定を変えるときは、Cloud Shell で次を実行します。

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

空き状況の定期取得の時刻（`deploy/cloudshell.sh` の `CRAWL_SCHEDULE`）を変えたときは、Cloud Shell で次を実行します（数秒で終わります）。自動公開では時刻は変わりません。

```bash
bash deploy/cloudshell.sh schedule
```

## 7. 自動公開を設定する（1回だけ）

GitHub Actions（`.github/workflows/deploy.yml`）が、`main` に入った変更をテストしてから公開するようにします。

- **鍵は作りません。** GitHub と Google Cloud を Workload Identity 連携でつなぎ、このリポジトリの `main` からだけ公開できるようにします（リポジトリは番号で指定するので、名前が変わっても他人のリポジトリからは使えません）。
- 公開用のサービスアカウント `resoom-deployer` に付ける権限は、公開に必要なものだけです。
  - Cloud Run の更新とジョブの実行（`roles/run.developer`）
  - コンテナの保存（`resoom` リポジトリの `roles/artifactregistry.writer`）
  - 画面とジョブを動かすアカウントの指定（そのアカウントの `roles/iam.serviceAccountUser`）
- 文書（`docs/` や `*.md`）だけの変更では公開しません。
- 費用: リポジトリは公開なので GitHub Actions は無料です。Google Cloud 側は今までと同じです（コンテナは GitHub 側で作るため、Cloud Build も使いません）。

### 手順

1. Cloud Shell で次を実行します。設定のあと、続けて今の `main` を公開します（10分ほど）。

```bash
cd ~/resoom
```

```bash
git pull
```

```bash
bash deploy/cloudshell.sh github
```

2. 終わったら Claude に「設定しました」と伝えます。Claude が `deploy/github.env` の `AUTO_DEPLOY` を `on` にして `main` に入れると、最初の自動公開が動きます。
   - 自分で行う場合は、`deploy/github.env` の `AUTO_DEPLOY=off` を `AUTO_DEPLOY=on` に変えて `main` に入れます。
3. 公開の様子は、GitHub のリポジトリの「Actions」タブで見られます。失敗すると、GitHub からメールが届きます。

### 自動公開をやめるとき

- 一時的に止める: `deploy/github.env` の `AUTO_DEPLOY` を `off` にします（テストだけ動きます）。
- 完全にやめる: Google Cloud コンソールの「IAM と管理」→「Workload Identity 連携」で `github` プールを削除し、「サービス アカウント」で `resoom-deployer` を削除します。

---

## 動いているもの

| 名前 | 種類 | 内容 |
|---|---|---|
| `resoom` | Cloud Run サービス | 画面。使われていない間は止まり、最初の表示に数秒かかります |
| `resoom-crawl` | Cloud Run ジョブ | 空き状況の取得。毎日 7:15〜22:15 の3時間ごと（7:15・10:15・13:15・16:15・19:15・22:15、日本時間）に Cloud Scheduler が起動します。夜間は自治体サイトの受付時間外なので取得しません |
| （同上） | | 検索ページの「今すぐ最新を取得」（ログインした楽団員だけ）でも1回動きます。画面のサービスアカウントが、定期取得用に付けた権限でこのジョブを起動します |
| `resoom-migrate` | Cloud Run ジョブ | データベースのマイグレーション。更新のたびに実行します |
| `resoom-seed` | Cloud Run ジョブ | 初期データ（部屋と記録）の取り込み。最初の公開で1回だけ実行します |
| `resoom-*` | Secret Manager | データベースの接続文字列、ログインの鍵、OAuth の ID とシークレット |
| `resoom-deployer` | サービスアカウント | GitHub からの自動公開に使う（手順7）。鍵はなく、このリポジトリの `main` からだけ使える |

## 困ったとき

| 症状 | 確認すること |
|---|---|
| ログインで「Sign-in failed. Only invited members can sign in.」 | そのメールアドレスが「Members 楽団員」で招待されているか |
| Google の画面で `redirect_uri_mismatch` | OAuth クライアントのリダイレクト URI が `公開URL/api/auth/callback/google` と完全に一致しているか |
| 検索ページで空き状況が古い | 検索ページ下の「Data coverage」で取得日時と失敗の有無を確認。Cloud Run の `resoom-crawl` ジョブのログも見る |
| 画面がエラーになる | Cloud Run の `resoom` サービスのログを見る |
| 「今すぐ最新を取得」で「取得を始められませんでした」 | Cloud Run の `resoom` サービスのログを見る。権限のエラーなら `bash deploy/cloudshell.sh schedule` を実行する（ジョブを起動する権限を付け直す） |
| 自動公開が失敗した | GitHub の「Actions」タブで、失敗した手順のログを見る。権限のエラーなら `bash deploy/cloudshell.sh github` をもう一度実行する（何度実行しても同じ設定になる） |

## 参考: 環境変数

`deploy/cloudshell.sh` が設定します。手で変える必要はありません。

| 名前 | 内容 |
|---|---|
| `DATABASE_URL` | Neon の接続文字列（Secret Manager） |
| `BETTER_AUTH_SECRET` | ログインの鍵（自動で作成。Secret Manager） |
| `BETTER_AUTH_URL` | 公開URL |
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | OAuth クライアント（Secret Manager） |
| `ADMIN_EMAILS` | 最初の管理者。名簿にまだいない場合だけ管理者として加えます |
