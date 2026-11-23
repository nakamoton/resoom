#!/usr/bin/env bash
# GitHub Actions から呼ぶ公開の手順（.github/workflows/deploy.yml）。
# Cloud Shell の deploy と同じ流れで、コンテナを作り、ジョブを更新し、マイグレーションを当ててから画面を更新する。
# 環境変数・秘密情報・公開範囲は前回の設定を引き継ぎ、コンテナの中身だけを入れ替える
# （変えるときは Cloud Shell の bash deploy/cloudshell.sh deploy を使う）。
set -euo pipefail
: "${PROJECT_ID:?PROJECT_ID がありません}" "${REGION:?REGION がありません}"

REPO=resoom
SERVICE=resoom
IMAGE="$REGION-docker.pkg.dev/$PROJECT_ID/$REPO/app:$(git rev-parse --short HEAD)-$(date +%Y%m%d%H%M%S)"

say() { printf '\n== %s\n' "$*"; }

gcloud config set project "$PROJECT_ID" >/dev/null
gcloud auth configure-docker "$REGION-docker.pkg.dev" --quiet

say "コンテナを作ります: $IMAGE"
docker build -t "$IMAGE" .
docker push "$IMAGE"

say "ジョブのコンテナを入れ替えます"
for job in resoom-migrate resoom-seed resoom-crawl; do
  gcloud run jobs update "$job" --region "$REGION" --image "$IMAGE" --quiet >/dev/null
done

say "データベースにマイグレーションを当てます"
gcloud run jobs execute resoom-migrate --region "$REGION" --wait

say "画面（Cloud Run サービス）を更新します"
gcloud run deploy "$SERVICE" --region "$REGION" --image "$IMAGE" --quiet
