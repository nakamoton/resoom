'use client';

import { useActionState } from 'react';
import {
  EVIDENCE_KINDS,
  EVIDENCE_KIND_LABELS,
  INSTRUMENT_CLASSES,
  INSTRUMENT_LABELS,
  POLICY_RESULTS,
  STATUS_LABELS,
} from '@resoom/core';
import { addEvidenceAction, type FormState } from '../actions';

const INITIAL: FormState = { status: 'idle', errors: {}, values: {} };

export function EvidenceForm({ roomId, today }: { roomId: string; today: string }) {
  const [state, action, pending] = useActionState(addEvidenceAction.bind(null, roomId), INITIAL);
  const { errors, values } = state;
  const text = (key: string, fallback = ''): string => (typeof values[key] === 'string' ? (values[key] as string) : fallback);
  const picked = Array.isArray(values.instruments) ? values.instruments : [];
  const describedBy = (key: string) => (errors[key] ? `${key}-error` : undefined);
  const fieldError = (key: string) =>
    errors[key] ? (
      <p className="field-error" id={`${key}-error`}>
        {errors[key]}
      </p>
    ) : null;

  return (
    <form action={action} noValidate>
      {state.message ? (
        <p className={`notice ${state.status === 'error' ? 'error' : ''}`} role="status">
          {state.message}
        </p>
      ) : null}

      <fieldset className="field" aria-describedby={describedBy('kind')}>
        <legend>何の記録ですか</legend>
        <div className="choices">
          {EVIDENCE_KINDS.map((kind) => (
            <label key={kind}>
              <input type="radio" name="kind" value={kind} defaultChecked={text('kind', 'usage') === kind} />
              {EVIDENCE_KIND_LABELS[kind]}
            </label>
          ))}
        </div>
        {fieldError('kind')}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="occurredOn">
          日付
        </label>
        <input
          type="date"
          id="occurredOn"
          name="occurredOn"
          max={today}
          defaultValue={text('occurredOn', today)}
          aria-describedby={describedBy('occurredOn')}
        />
        {fieldError('occurredOn')}
      </div>

      <fieldset className="field" aria-describedby={describedBy('result')}>
        <legend>結果</legend>
        <div className="choices">
          {POLICY_RESULTS.map((result) => (
            <label key={result}>
              <input type="radio" name="result" value={result} defaultChecked={text('result') === result} />
              {STATUS_LABELS[result]}
            </label>
          ))}
        </div>
        {fieldError('result')}
      </fieldset>

      <fieldset className="field" aria-describedby="instruments-hint">
        <legend>
          対象の楽器<span className="optional">任意</span>
        </legend>
        <div className="choices">
          {INSTRUMENT_CLASSES.map((cls) => (
            <label key={cls}>
              <input type="checkbox" name="instruments" value={cls} defaultChecked={picked.includes(cls)} />
              {INSTRUMENT_LABELS[cls]}
            </label>
          ))}
        </div>
        <p className="hint" id="instruments-hint">
          特定の楽器についての結果なら選んでください。選ばなければ、合奏全体についての記録になります。
        </p>
        {fieldError('instruments')}
      </fieldset>

      <div className="field">
        <label className="label" htmlFor="note">
          内容
        </label>
        <textarea
          id="note"
          name="note"
          defaultValue={text('note')}
          placeholder="例: 電話で確認。ドラムセットは不可、ティンパニは17時まで可とのこと。"
          aria-describedby={describedBy('note')}
        />
        {fieldError('note')}
      </div>

      <div className="field">
        <label className="label" htmlFor="sourceUrl">
          参考URL<span className="optional">任意</span>
        </label>
        <input type="url" id="sourceUrl" name="sourceUrl" defaultValue={text('sourceUrl')} aria-describedby={describedBy('sourceUrl')} />
        {fieldError('sourceUrl')}
      </div>

      <div className="field">
        <label className="label" htmlFor="reportedBy">
          記録者
        </label>
        <input
          type="text"
          id="reportedBy"
          name="reportedBy"
          defaultValue={text('reportedBy')}
          autoComplete="name"
          aria-describedby={describedBy('reportedBy')}
        />
        {fieldError('reportedBy')}
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? '記録しています…' : '記録する'}
      </button>
    </form>
  );
}
