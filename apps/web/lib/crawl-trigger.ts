import 'server-only';

const METADATA = 'http://metadata.google.internal/computeMetadata/v1';

async function metadata(path: string): Promise<string> {
  const res = await fetch(`${METADATA}/${path}`, { headers: { 'Metadata-Flavor': 'Google' }, cache: 'no-store' });
  if (!res.ok) throw new Error(`メタデータを読めませんでした（${path}: ${res.status}）`);
  return res.text();
}

/**
 * 空き状況の取得ジョブ（Cloud Run ジョブ resoom-crawl）を1回動かす。
 * Cloud Run の上では、画面のサービスアカウントの権限で Cloud Run の API を呼ぶ
 * （定期取得のために、このアカウントにはジョブを動かす権限を付けてある）。
 * Cloud Run の外（開発中）では何もしない。申し込みの記録は残り、15分たつと「始まらなかった」として片づく。
 */
export async function triggerCrawlJob(): Promise<void> {
  if (!process.env.K_SERVICE) {
    console.info('Cloud Run の外なので、取得ジョブは起動しません（申し込みだけを記録しました）。');
    return;
  }
  const token = (JSON.parse(await metadata('instance/service-accounts/default/token')) as { access_token: string }).access_token;
  const project = await metadata('project/project-id');
  // 例: projects/123456789/regions/asia-northeast1
  const region = (await metadata('instance/region')).split('/').pop();
  const job = process.env.RESOOM_CRAWL_JOB ?? 'resoom-crawl';
  const res = await fetch(`https://run.googleapis.com/v2/projects/${project}/locations/${region}/jobs/${job}:run`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: '{}',
    cache: 'no-store',
  });
  if (!res.ok) throw new Error(`取得ジョブを起動できませんでした（${res.status}: ${(await res.text()).slice(0, 200)}）`);
}
