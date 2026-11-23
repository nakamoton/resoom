import { getAuth } from '@/lib/auth';

async function handle(request: Request): Promise<Response> {
  return (await getAuth()).handler(request);
}

export const GET = handle;
export const POST = handle;
