#!/usr/bin/env bash
# resoom を Google Cloud（Cloud Run）に公開・更新するスクリプト。
# Google Cloud Shell で、リポジトリのルートから実行する。手順は docs/deploy.md を参照。
#
#   bash deploy/cloudshell.sh init     最初の公開（データベースの準備・初期データ・定期取得の設定まで）
#   bash deploy/cloudshell.sh google   Google ログインの設定（OAuth クライアントを作ったあと）
#   bash deploy/cloudshell.sh deploy   2回目以降の更新（main の最新を反映）
#   bash deploy/cloudshell.sh github   GitHub からの自動公開の設定（1回だけ。設定のあと今の main を公開する）
#   bash deploy/cloudshell.sh schedule 空き状況の定期取得の時刻だけを設定し直す（CRAWL_SCHEDULE を変えたとき）
#
# 秘密情報（データベースの接続文字列、OAuth のシークレット）は入力欄から Secret Manager に直接保存し、
# 画面・履歴・ファイルには残さない。
set -euo pipefail

CONFIG_FILE="${RESOOM_DEPLOY_CONFIG:-$HOME/.resoom-deploy.env}"
SERVICE=resoom
REPO=resoom
SECRET_DB=resoom-database-url
SECRET_AUTH=resoom-auth-secret
SECRET_GOOGLE_ID=resoom-google-client-id
SECRET_GOOGLE_SECRET=resoom-google-client-secret
# 空き状況の定期取得: 毎日 7:15〜22:15 の3時間ごと（7:15・10:15・13:15・16:15・19:15・22:15、日本時間）。
# 夜間は自治体サイトの受付時間外（世田谷区 0〜7時、品川区 0〜5時、大田区 2〜5時）なので取得しない。
CRAWL_SCHEDULE='15 7-22/3 * * *'

say() { printf '\n== %s\n' "$*"; }
die() { printf 'エラー: %s\n' "$*" >&2; exit 1; }

ask() { # ask 変数名 質問 [既定値]
  local value
  read -r -p "$2${3:+ [$3]}: " value
  printf -v "$1" '%s' "${value:-${3:-}}"
  [ -n "${!1}" ] || die "$2 が空です"
}

ask_secret() { # ask_secret 変数名 質問（入力は画面に出ない）
  local value
  read -r -s -p "$2: " value
  echo
  [ -n "$value" ] || die "$2 が空です"
  printf -v "$1" '%s' "$value"
}

load_config() {
  # shellcheck disable=SC1090
  [ -f "$CONFIG_FILE" ] && . "$CONFIG_FILE"
  return 0
}

save_config() {
  umask 077
  cat >"$CONFIG_FILE" <<EOF
PROJECT_ID='$PROJECT_ID'
REGION='$REGION'
ADMIN_EMAILS='$ADMIN_EMAILS'
SERVICE_URL='${SERVICE_URL:-}'
GOOGLE_ENABLED='${GOOGLE_ENABLED:-0}'
EOF
}

require_config() {
  load_config
  [ -n "${PROJECT_ID:-}" ] || die "設定がありません。先に bash deploy/cloudshell.sh init を実行してください"
  gcloud config set project "$PROJECT_ID" >/dev/null
}

put_secret() { # put_secret 名前 値（既にあれば新しいバージョンを追加）
  if gcloud secrets describe "$1" >/dev/null 2>&1; then
    printf '%s' "$2" | gcloud secrets versions add "$1" --data-file=- >/dev/null
  else
    printf '%s' "$2" | gcloud secrets create "$1" --replication-policy=automatic --data-file=- >/dev/null
  fi
}

runtime_sa() { # Cloud Run・Cloud Build・Cloud Scheduler が使うサービスアカウント（既定の Compute のもの）
  local number
  number=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  printf '%s-compute@developer.gserviceaccount.com' "$number"
}

build_image() { # コンテナを Cloud Build で作り、IMAGE に名前を入れる
  local tag
  tag="$(git rev-parse --short HEAD 2>/dev/null || echo manual)-$(date +%Y%m%d%H%M%S)"
  IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/app:$tag"
  say "コンテナを作ります（5分ほどかかります）: $IMAGE"
  gcloud builds submit --region "$REGION" --tag "$IMAGE" .
}

upsert_job() { # upsert_job 名前 実行するファイル [追加の指定...]
  local name=$1 script=$2 verb=create
  shift 2
  gcloud run jobs describe "$name" --region "$REGION" >/dev/null 2>&1 && verb=update
  gcloud run jobs "$verb" "$name" --region "$REGION" --image "$IMAGE" \
    --command node --args "$script" \
    --set-secrets "DATABASE_URL=$SECRET_DB:latest" \
    --tasks 1 --max-retries 0 "$@" >/dev/null
}

update_jobs() {
  say "ジョブ（マイグレーション・初期データ・空き状況の取得）を設定します"
  upsert_job resoom-migrate scripts/db-migrate.mjs --task-timeout 600s
  upsert_job resoom-seed scripts/db-seed.mjs --task-timeout 600s
  upsert_job resoom-crawl scripts/crawl.mjs --task-timeout 3600s --memory 512Mi
}

deploy_service() {
  local secrets="DATABASE_URL=$SECRET_DB:latest,BETTER_AUTH_SECRET=$SECRET_AUTH:latest"
  [ "${GOOGLE_ENABLED:-0}" = 1 ] && secrets="$secrets,GOOGLE_CLIENT_ID=$SECRET_GOOGLE_ID:latest,GOOGLE_CLIENT_SECRET=$SECRET_GOOGLE_SECRET:latest"
  say "画面（Cloud Run サービス）を公開します"
  # ADMIN_EMAILS にはカンマが入るので、区切り文字を ; にする（^;^）
  gcloud run deploy "$SERVICE" --region "$REGION" --image "$IMAGE" \
    --allow-unauthenticated --min-instances 0 --max-instances 2 --memory 512Mi --cpu 1 \
    --set-secrets "$secrets" \
    --set-env-vars "^;^ADMIN_EMAILS=$ADMIN_EMAILS;BETTER_AUTH_URL=${SERVICE_URL:-https://placeholder.invalid}" >/dev/null
  if [ -z "${SERVICE_URL:-}" ]; then
    SERVICE_URL=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(status.url)')
    gcloud run services update "$SERVICE" --region "$REGION" --update-env-vars "BETTER_AUTH_URL=$SERVICE_URL" >/dev/null
    save_config
  fi
}

setup_schedule() { # 空き状況の定期取得（Cloud Scheduler → resoom-crawl ジョブ）を作る、または時刻を直す
  local sa uri verb=create
  sa=$(runtime_sa)
  uri="https://run.googleapis.com/v2/projects/$PROJECT_ID/locations/$REGION/jobs/resoom-crawl:run"
  say "空き状況の定期取得を設定します（$CRAWL_SCHEDULE、日本時間）"
  gcloud run jobs add-iam-policy-binding resoom-crawl --region "$REGION" --member "serviceAccount:$sa" --role roles/run.invoker >/dev/null
  gcloud scheduler jobs describe resoom-crawl --location "$REGION" >/dev/null 2>&1 && verb=update
  gcloud scheduler jobs "$verb" http resoom-crawl --location "$REGION" --schedule "$CRAWL_SCHEDULE" \
    --time-zone Asia/Tokyo --uri "$uri" --http-method POST --oauth-service-account-email "$sa" >/dev/null
}

cmd_schedule() {
  require_config
  setup_schedule
  printf '\n定期取得の時刻を設定しました: %s（日本時間）\n' "$CRAWL_SCHEDULE"
}

cmd_init() {
  load_config
  say "最初の公開の設定"
  ask PROJECT_ID "Google Cloud のプロジェクトID" "${PROJECT_ID:-$(gcloud config get-value project 2>/dev/null || true)}"
  ask REGION "リージョン" "${REGION:-asia-northeast1}"
  ask ADMIN_EMAILS "最初の管理者の Google アカウント（複数ならカンマ区切り）" "${ADMIN_EMAILS:-}"
  gcloud config set project "$PROJECT_ID" >/dev/null
  save_config

  say "必要な API を有効にします（数分かかることがあります）"
  # Compute Engine API は、Cloud Run と Cloud Build が使う既定のサービスアカウントを作るために有効にする（無料）
  gcloud services enable compute.googleapis.com run.googleapis.com cloudbuild.googleapis.com \
    artifactregistry.googleapis.com secretmanager.googleapis.com cloudscheduler.googleapis.com

  local sa
  sa=$(runtime_sa)
  say "既定のサービスアカウントができるのを待ちます"
  for _ in $(seq 1 36); do
    gcloud iam service-accounts describe "$sa" >/dev/null 2>&1 && break
    sleep 5
  done
  gcloud iam service-accounts describe "$sa" >/dev/null 2>&1 || die "サービスアカウント $sa が見つかりません。数分待ってから、もう一度 init を実行してください"
  say "サービスアカウントに権限を付けます: $sa"
  for role in roles/secretmanager.secretAccessor roles/cloudbuild.builds.builder roles/logging.logWriter; do
    gcloud projects add-iam-policy-binding "$PROJECT_ID" --member "serviceAccount:$sa" --role "$role" --condition=None >/dev/null
  done

  say "コンテナの保管場所を作ります（古いコンテナは自動で消し、無料枠に収めます）"
  if ! gcloud artifacts repositories describe "$REPO" --location "$REGION" >/dev/null 2>&1; then
    gcloud artifacts repositories create "$REPO" --repository-format docker --location "$REGION" --description "resoom"
  fi
  local policy
  policy=$(mktemp)
  cat >"$policy" <<'JSON'
[
  { "name": "keep-recent", "action": { "type": "Keep" }, "mostRecentVersions": { "keepCount": 3 } },
  { "name": "delete-old", "action": { "type": "Delete" }, "condition": { "tagState": "any", "olderThan": "1d" } }
]
JSON
  gcloud artifacts repositories set-cleanup-policies "$REPO" --location "$REGION" --policy "$policy" --no-dry-run >/dev/null
  rm -f "$policy"

  say "秘密情報を Secret Manager に保存します"
  local database_url
  ask_secret database_url "Neon の接続文字列（postgresql://... ?sslmode=require。入力は表示されません）"
  case "$database_url" in postgres://* | postgresql://*) ;; *) die "接続文字列は postgresql:// で始まります" ;; esac
  put_secret "$SECRET_DB" "$database_url"
  unset database_url
  if ! gcloud secrets describe "$SECRET_AUTH" >/dev/null 2>&1; then
    put_secret "$SECRET_AUTH" "$(openssl rand -base64 32)"
  fi

  build_image
  update_jobs
  say "データベースにマイグレーションを当て、初期データを取り込みます"
  gcloud run jobs execute resoom-migrate --region "$REGION" --wait
  gcloud run jobs execute resoom-seed --region "$REGION" --wait

  deploy_service

  setup_schedule
  say "最初の空き状況の取得を始めます（終わるまで数分かかります。待たずに次へ進めます）"
  gcloud run jobs execute resoom-crawl --region "$REGION" --async >/dev/null

  cat <<EOF

公開できました: $SERVICE_URL

次は Google ログインの設定です（docs/deploy.md の手順4）。
OAuth クライアントの「承認済みのリダイレクト URI」には、次を入れてください:
  $SERVICE_URL/api/auth/callback/google
作り終えたら、bash deploy/cloudshell.sh google を実行してください。
EOF
}

cmd_google() {
  require_config
  say "Google ログインの設定"
  local client_id client_secret
  ask client_id "OAuth クライアント ID"
  ask_secret client_secret "OAuth クライアント シークレット（入力は表示されません）"
  put_secret "$SECRET_GOOGLE_ID" "$client_id"
  put_secret "$SECRET_GOOGLE_SECRET" "$client_secret"
  unset client_secret
  GOOGLE_ENABLED=1
  save_config
  IMAGE=$(gcloud run services describe "$SERVICE" --region "$REGION" --format='value(spec.template.spec.containers[0].image)')
  deploy_service
  cat <<EOF

Google ログインを設定しました。
$SERVICE_URL/sign-in を開き、最初の管理者（$ADMIN_EMAILS）の Google アカウントでログインしてください。
EOF
}

retry() { # retry コマンド...（作ったばかりのアカウントは反映に少し時間がかかるので、何度か試す）
  local i
  for i in 1 2 3 4 5 6; do
    "$@" && return 0
    sleep 10
  done
  return 1
}

cmd_github() {
  # GitHub Actions が、鍵なしで（Workload Identity 連携）このリポジトリの main からだけ公開できるようにする。
  # 公開用のサービスアカウントには、公開に必要な権限だけを付ける。
  require_config
  local env_file
  env_file="$(dirname "$0")/github.env"
  [ -f "$env_file" ] || die "$env_file がありません。git pull してから実行してください"
  local GITHUB_REPOSITORY GITHUB_REPOSITORY_ID
  GITHUB_REPOSITORY=$(sed -n 's/^DEPLOY_REPOSITORY=//p' "$env_file")
  GITHUB_REPOSITORY_ID=$(sed -n 's/^DEPLOY_REPOSITORY_ID=//p' "$env_file")
  local expected_project
  expected_project=$(sed -n 's/^PROJECT_ID=//p' "$env_file")
  [ "$expected_project" = "$PROJECT_ID" ] || die "deploy/github.env のプロジェクトID（$expected_project）が、このプロジェクト（$PROJECT_ID）と違います"
  [[ "$GITHUB_REPOSITORY_ID" =~ ^[0-9]+$ ]] || die "deploy/github.env の DEPLOY_REPOSITORY_ID が正しくありません"

  local number deployer pool=github provider=resoom
  number=$(gcloud projects describe "$PROJECT_ID" --format='value(projectNumber)')
  deployer="resoom-deployer@$PROJECT_ID.iam.gserviceaccount.com"
  local member="principalSet://iam.googleapis.com/projects/$number/locations/global/workloadIdentityPools/$pool/attribute.repository_id/$GITHUB_REPOSITORY_ID"
  local mapping="google.subject=assertion.sub,attribute.repository_id=assertion.repository_id,attribute.ref=assertion.ref"
  local condition="assertion.repository_id == '$GITHUB_REPOSITORY_ID' && assertion.ref == 'refs/heads/main'"

  say "GitHub（$GITHUB_REPOSITORY の main）からの自動公開を設定します"
  gcloud services enable iam.googleapis.com iamcredentials.googleapis.com sts.googleapis.com

  if ! gcloud iam service-accounts describe "$deployer" >/dev/null 2>&1; then
    gcloud iam service-accounts create resoom-deployer --display-name "resoom: GitHub からの自動公開" >/dev/null
  fi
  if ! gcloud iam workload-identity-pools describe "$pool" --location global >/dev/null 2>&1; then
    gcloud iam workload-identity-pools create "$pool" --location global --display-name "GitHub Actions" >/dev/null
  fi
  if gcloud iam workload-identity-pools providers describe "$provider" --location global --workload-identity-pool "$pool" >/dev/null 2>&1; then
    gcloud iam workload-identity-pools providers update-oidc "$provider" --location global --workload-identity-pool "$pool" \
      --attribute-mapping "$mapping" --attribute-condition "$condition" >/dev/null
  else
    gcloud iam workload-identity-pools providers create-oidc "$provider" --location global --workload-identity-pool "$pool" \
      --display-name "resoom (GitHub main)" --issuer-uri "https://token.actions.githubusercontent.com" \
      --attribute-mapping "$mapping" --attribute-condition "$condition" >/dev/null
  fi

  say "公開用のアカウントに権限を付けます"
  # GitHub（このリポジトリ）が公開用のアカウントとして動けるようにする
  retry gcloud iam service-accounts add-iam-policy-binding "$deployer" \
    --role roles/iam.workloadIdentityUser --member "$member" >/dev/null
  # Cloud Run の更新とジョブの実行
  retry gcloud projects add-iam-policy-binding "$PROJECT_ID" \
    --member "serviceAccount:$deployer" --role roles/run.developer --condition=None >/dev/null
  # コンテナの保存（このリポジトリだけ）
  retry gcloud artifacts repositories add-iam-policy-binding "$REPO" --location "$REGION" \
    --member "serviceAccount:$deployer" --role roles/artifactregistry.writer >/dev/null
  # 画面とジョブを動かすアカウントを指定して更新するため（そのアカウントだけ）
  retry gcloud iam service-accounts add-iam-policy-binding "$(runtime_sa)" \
    --member "serviceAccount:$deployer" --role roles/iam.serviceAccountUser >/dev/null

  say "設定できました。続けて今の main を公開します"
  cmd_deploy
  printf '\nGitHub からの自動公開の準備ができました。Claude に「設定しました」と伝えてください（deploy/github.env の AUTO_DEPLOY を on にします）。\n'
}

cmd_deploy() {
  require_config
  [ -n "${SERVICE_URL:-}" ] || die "最初の公開が終わっていません。bash deploy/cloudshell.sh init を実行してください"
  build_image
  update_jobs
  say "データベースにマイグレーションを当てます"
  gcloud run jobs execute resoom-migrate --region "$REGION" --wait
  deploy_service
  printf '\n更新しました: %s\n' "$SERVICE_URL"
}

case "${1:-}" in
  init) cmd_init ;;
  google) cmd_google ;;
  deploy) cmd_deploy ;;
  github) cmd_github ;;
  schedule) cmd_schedule ;;
  *)
    sed -n '2,12p' "$0"
    exit 1
    ;;
esac
