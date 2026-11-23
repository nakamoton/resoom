import { redirect } from 'next/navigation';

/** トップは、ログインなしで使える空き状況の検索。 */
export default function Home() {
  redirect('/search');
}
