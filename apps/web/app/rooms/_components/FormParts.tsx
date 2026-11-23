import type { ErrorCode, LocalizedText } from '@resoom/core';
import type { ReactNode } from 'react';
import { Bi, FieldError } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import type { FormState } from '../actions';

/** 保存の結果やエラーの案内。 */
export function FormNotice({ state }: { state: FormState }) {
  if (!state.message) return null;
  return (
    <p className={`notice ${state.status === 'error' ? 'error' : ''}`} role="status">
      <Bi text={state.message} />
    </p>
  );
}

/** ラベル（英語と日本語）。任意の項目には「Optional 任意」を付ける。 */
export function FieldLabel({ htmlFor, text, optional = false }: { htmlFor: string; text: LocalizedText; optional?: boolean }) {
  return (
    <label className="label" htmlFor={htmlFor}>
      <Bi text={text} />
      {optional ? (
        <span className="optional">
          <Bi text={T.optional} />
        </span>
      ) : null}
    </label>
  );
}

interface TextFieldProps {
  id: string;
  name: string;
  label: LocalizedText;
  optional?: boolean;
  type?: 'text' | 'url' | 'number' | 'date';
  defaultValue: string;
  error: ErrorCode | undefined;
  hint?: LocalizedText;
  placeholder?: string;
  lang?: 'en' | 'ja';
  extra?: Record<string, string | number>;
  children?: ReactNode;
}

/** 1行の入力欄と、そのラベル・ヒント・エラー。 */
export function TextField({ id, name, label, optional, type = 'text', defaultValue, error, hint, placeholder, lang, extra, children }: TextFieldProps) {
  const hintId = hint ? `${id}-hint` : null;
  const errorId = error ? `${id}-error` : null;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;
  return (
    <div className="field">
      <FieldLabel htmlFor={id} text={label} optional={optional} />
      <input
        type={type}
        id={id}
        name={name}
        defaultValue={defaultValue}
        placeholder={placeholder}
        lang={lang}
        aria-describedby={describedBy}
        aria-invalid={error ? true : undefined}
        {...extra}
      />
      {children}
      {hint ? (
        <p className="hint" id={hintId ?? undefined}>
          <Bi text={hint} />
        </p>
      ) : null}
      <FieldError id={`${id}-error`} code={error} />
    </div>
  );
}
