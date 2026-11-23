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
import { Bi, FieldError, plain } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import { addEvidenceAction, type FormState } from '../actions';
import { FieldLabel, FormNotice, TextField } from './FormParts';

const INITIAL: FormState = { status: 'idle', errors: {}, values: {} };

export function EvidenceForm({ roomId, today }: { roomId: string; today: string }) {
  const [state, action, pending] = useActionState(addEvidenceAction.bind(null, roomId), INITIAL);
  const { errors, values } = state;
  const text = (key: string, fallback = ''): string => (typeof values[key] === 'string' ? (values[key] as string) : fallback);
  const picked = Array.isArray(values.instruments) ? values.instruments : [];
  const describedBy = (key: string, hint?: string) => [errors[key] ? `${key}-error` : null, hint].filter(Boolean).join(' ') || undefined;

  return (
    <form action={action} noValidate>
      <FormNotice state={state} />

      <fieldset className="field" aria-describedby={describedBy('kind')}>
        <legend>
          <Bi text={T.recordKind} />
        </legend>
        <div className="choices">
          {EVIDENCE_KINDS.map((kind) => (
            <label key={kind}>
              <input type="radio" name="kind" value={kind} defaultChecked={text('kind', 'usage') === kind} />
              <Bi text={EVIDENCE_KIND_LABELS[kind]} stack />
            </label>
          ))}
        </div>
        <FieldError id="kind-error" code={errors.kind} />
      </fieldset>

      <TextField
        id="occurredOn"
        name="occurredOn"
        type="date"
        label={T.date}
        defaultValue={text('occurredOn', today)}
        error={errors.occurredOn}
        extra={{ max: today }}
      />

      <fieldset className="field" aria-describedby={describedBy('result')}>
        <legend>
          <Bi text={T.result} />
        </legend>
        <div className="choices">
          {POLICY_RESULTS.map((result) => (
            <label key={result}>
              <input type="radio" name="result" value={result} defaultChecked={text('result') === result} />
              <Bi text={STATUS_LABELS[result]} stack />
            </label>
          ))}
        </div>
        <FieldError id="result-error" code={errors.result} />
      </fieldset>

      <fieldset className="field" aria-describedby={describedBy('instruments', 'instruments-hint')}>
        <legend>
          <Bi text={T.instruments} />
          <span className="optional">
            <Bi text={T.optional} />
          </span>
        </legend>
        <div className="choices">
          {INSTRUMENT_CLASSES.map((cls) => (
            <label key={cls}>
              <input type="checkbox" name="instruments" value={cls} defaultChecked={picked.includes(cls)} />
              <Bi text={INSTRUMENT_LABELS[cls]} stack />
            </label>
          ))}
        </div>
        <p className="hint" id="instruments-hint">
          <Bi text={T.instrumentsHint} />
        </p>
        <FieldError id="instruments-error" code={errors.instruments} />
      </fieldset>

      <div className="field">
        <FieldLabel htmlFor="note" text={T.details} />
        <textarea
          id="note"
          name="note"
          defaultValue={text('note')}
          placeholder={`${T.detailsPlaceholder.en}\n${T.detailsPlaceholder.ja}`}
          aria-describedby={describedBy('note')}
          aria-invalid={errors.note ? true : undefined}
        />
        <FieldError id="note-error" code={errors.note} />
      </div>

      <TextField id="sourceUrl" name="sourceUrl" type="url" label={T.referenceUrl} optional defaultValue={text('sourceUrl')} error={errors.sourceUrl} />

      <TextField
        id="reportedBy"
        name="reportedBy"
        label={T.yourName}
        defaultValue={text('reportedBy')}
        error={errors.reportedBy}
        extra={{ autoComplete: 'name' }}
      />

      <button type="submit" className="button" disabled={pending} aria-label={pending ? plain(T.savingRecord) : undefined}>
        <Bi text={pending ? T.savingRecord : T.saveRecord} />
      </button>
    </form>
  );
}
