'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useRef, useTransition, type FormEvent, type ReactNode } from 'react';

/** 日付や人数の入力は、打ち終わるのを少し待ってから検索する（1文字ごとに検索しないため）。 */
const TYPING_DELAY_MS = 600;

/**
 * 検索条件を変えたら、検索ボタンを押さなくても結果を更新するフォーム。
 * - チェックボックスはすぐに、日付・人数は入力が止まってから検索する。
 * - 検索中はフォームに aria-busy を付ける（結果を薄く表示するのに使う）。
 * - スクリプトが動かないときは、ふつうのフォームとして検索ボタンで検索できる。
 */
export function AutoSearchForm({
  action,
  className,
  updatingLabel,
  children,
}: {
  action: string;
  className?: string;
  updatingLabel: ReactNode;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function search() {
    if (timer.current) clearTimeout(timer.current);
    const form = formRef.current;
    if (!form) return;
    const query = new URLSearchParams();
    for (const [key, value] of new FormData(form)) {
      if (typeof value === 'string') query.append(key, value);
    }
    // 履歴を増やさず、表示している位置も変えない
    startTransition(() => router.replace(`${action}?${query.toString()}`, { scroll: false }));
  }

  function onChange(event: FormEvent<HTMLFormElement>) {
    const target = event.target as HTMLInputElement;
    if (target.type === 'checkbox' || target.type === 'radio') {
      search();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(search, TYPING_DELAY_MS);
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    search();
  }

  return (
    <form
      ref={formRef}
      action={action}
      method="get"
      className={className}
      onChange={onChange}
      onSubmit={onSubmit}
      aria-busy={pending}
    >
      {children}
      <p className="updating" role="status" aria-live="polite">
        {pending ? updatingLabel : null}
      </p>
    </form>
  );
}
