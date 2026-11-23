import Link from 'next/link';
import { Bi } from './_i18n/Bi';
import { T } from './_i18n/texts';

export default function NotFound() {
  return (
    <>
      <h1>
        <Bi text={T.notFoundTitle} />
      </h1>
      <p className="lead">
        <Bi text={T.notFoundLead} />
      </p>
      <Link href="/rooms" className="button">
        <Bi text={T.backToCatalogButton} />
      </Link>
    </>
  );
}
