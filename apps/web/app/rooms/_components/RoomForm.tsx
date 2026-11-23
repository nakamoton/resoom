'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { Bi, municipalityPlain, plain } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import { createRoomAction, type FormState } from '../actions';
import { FormNotice, TextField } from './FormParts';

const INITIAL: FormState = { status: 'idle', errors: {}, values: {} };

export function RoomForm({ municipalities }: { municipalities: string[] }) {
  const [state, action, pending] = useActionState(createRoomAction, INITIAL);
  const { errors, values } = state;
  const text = (key: string): string => (typeof values[key] === 'string' ? (values[key] as string) : '');

  return (
    <form action={action} noValidate>
      <FormNotice state={state} />

      <TextField
        id="municipality"
        name="municipality"
        label={T.municipality}
        defaultValue={text('municipality')}
        error={errors.municipality}
        hint={T.municipalityHint}
        lang="ja"
        extra={{ list: 'municipality-options' }}
      >
        <datalist id="municipality-options">
          {municipalities.map((m) => (
            <option key={m} value={m} label={municipalityPlain(m)} />
          ))}
        </datalist>
      </TextField>

      <TextField id="facilityName" name="facilityName" label={T.facilityNameJa} defaultValue={text('facilityName')} error={errors.facilityName} lang="ja" />
      <TextField
        id="facilityNameEn"
        name="facilityNameEn"
        label={T.facilityNameEn}
        optional
        defaultValue={text('facilityNameEn')}
        error={errors.facilityNameEn}
        placeholder="e.g. Ota Civic Plaza"
        lang="en"
      />
      <TextField id="roomName" name="roomName" label={T.roomNameJa} defaultValue={text('roomName')} error={errors.roomName} lang="ja" />
      <TextField
        id="roomNameEn"
        name="roomNameEn"
        label={T.roomNameEn}
        optional
        defaultValue={text('roomNameEn')}
        error={errors.roomNameEn}
        placeholder="e.g. Music Studio 1"
        hint={T.namesHint}
        lang="en"
      />

      <TextField
        id="capacity"
        name="capacity"
        type="number"
        label={T.capacity}
        optional
        defaultValue={text('capacity')}
        error={errors.capacity}
        extra={{ min: 1, max: 9999, inputMode: 'numeric' }}
      />
      <TextField
        id="capacitySource"
        name="capacitySource"
        label={T.capacitySource}
        optional
        defaultValue={text('capacitySource')}
        error={errors.capacitySource}
        placeholder={plain(T.capacitySourcePlaceholder)}
        hint={T.capacitySourceHint}
      />
      <TextField id="nearestStation" name="nearestStation" label={T.nearestStation} optional defaultValue={text('nearestStation')} error={errors.nearestStation} />

      <div className="actions">
        <button type="submit" className="button" disabled={pending}>
          <Bi text={pending ? T.addingRoom : T.addRoomSubmit} />
        </button>
        <Link href="/rooms" className="button secondary">
          <Bi text={T.cancel} />
        </Link>
      </div>
    </form>
  );
}
