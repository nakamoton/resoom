'use client';

import { useActionState } from 'react';
import { Bi, plain } from '../../_i18n/Bi';
import { T } from '../../_i18n/texts';
import { updateRoomBasicsAction, type FormState } from '../actions';
import { FormNotice, TextField } from './FormParts';

interface Props {
  roomId: string;
  facilityNameEn: string | null;
  roomNameEn: string | null;
  capacity: number | null;
  capacitySource: string | null;
  nearestStation: string | null;
}

/** 英語名・定員・定員の出典・最寄駅を直すフォーム。 */
export function RoomBasicsForm({ roomId, facilityNameEn, roomNameEn, capacity, capacitySource, nearestStation }: Props) {
  const initial: FormState = {
    status: 'idle',
    errors: {},
    values: {
      facilityNameEn: facilityNameEn ?? '',
      roomNameEn: roomNameEn ?? '',
      capacity: capacity === null ? '' : String(capacity),
      capacitySource: capacitySource ?? '',
      nearestStation: nearestStation ?? '',
    },
  };
  const [state, action, pending] = useActionState(updateRoomBasicsAction.bind(null, roomId), initial);
  const { errors, values } = state;
  const text = (key: string): string => (typeof values[key] === 'string' ? (values[key] as string) : '');

  return (
    <form action={action} noValidate>
      <FormNotice state={state} />
      <TextField id="basics-facilityNameEn" name="facilityNameEn" label={T.facilityNameEn} optional defaultValue={text('facilityNameEn')} error={errors.facilityNameEn} lang="en" />
      <TextField
        id="basics-roomNameEn"
        name="roomNameEn"
        label={T.roomNameEn}
        optional
        defaultValue={text('roomNameEn')}
        error={errors.roomNameEn}
        hint={T.englishNameNote}
        lang="en"
      />
      <TextField
        id="basics-capacity"
        name="capacity"
        type="number"
        label={T.capacity}
        optional
        defaultValue={text('capacity')}
        error={errors.capacity}
        extra={{ min: 1, max: 9999, inputMode: 'numeric' }}
      />
      <TextField
        id="basics-capacitySource"
        name="capacitySource"
        label={T.capacitySource}
        optional
        defaultValue={text('capacitySource')}
        error={errors.capacitySource}
        placeholder={plain(T.capacitySourcePlaceholder)}
        hint={T.capacitySourceHint}
      />
      <TextField id="basics-nearestStation" name="nearestStation" label={T.nearestStation} optional defaultValue={text('nearestStation')} error={errors.nearestStation} />
      <button type="submit" className="button" disabled={pending}>
        <Bi text={pending ? T.saving : T.save} />
      </button>
    </form>
  );
}
