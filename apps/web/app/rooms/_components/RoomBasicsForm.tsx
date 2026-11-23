'use client';

import { useActionState } from 'react';
import { updateRoomBasicsAction, type FormState } from '../actions';

interface Props {
  roomId: string;
  capacity: number | null;
  capacitySource: string | null;
  nearestStation: string | null;
}

/** 定員・定員の出典・最寄駅を直すフォーム。 */
export function RoomBasicsForm({ roomId, capacity, capacitySource, nearestStation }: Props) {
  const initial: FormState = {
    status: 'idle',
    errors: {},
    values: {
      capacity: capacity === null ? '' : String(capacity),
      capacitySource: capacitySource ?? '',
      nearestStation: nearestStation ?? '',
    },
  };
  const [state, action, pending] = useActionState(updateRoomBasicsAction.bind(null, roomId), initial);
  const { errors, values } = state;
  const text = (key: string): string => (typeof values[key] === 'string' ? (values[key] as string) : '');
  const describedBy = (key: string, hint?: string) => [errors[key] ? `basics-${key}-error` : null, hint].filter(Boolean).join(' ') || undefined;
  const fieldError = (key: string) =>
    errors[key] ? (
      <p className="field-error" id={`basics-${key}-error`}>
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

      <div className="field">
        <label className="label" htmlFor="basics-capacity">
          定員<span className="optional">任意</span>
        </label>
        <input
          type="number"
          id="basics-capacity"
          name="capacity"
          min={1}
          max={9999}
          inputMode="numeric"
          defaultValue={text('capacity')}
          aria-describedby={describedBy('capacity')}
        />
        {fieldError('capacity')}
      </div>

      <div className="field">
        <label className="label" htmlFor="basics-capacitySource">
          定員の出典<span className="optional">任意</span>
        </label>
        <input
          type="text"
          id="basics-capacitySource"
          name="capacitySource"
          defaultValue={text('capacitySource')}
          placeholder="例: 予約システムの部屋一覧、施設に電話で確認"
          aria-describedby={describedBy('capacitySource', 'basics-capacitySource-hint')}
        />
        <p className="hint" id="basics-capacitySource-hint">
          どこで確かめた人数かを残しておくと、あとで見直すときに役立ちます。
        </p>
        {fieldError('capacitySource')}
      </div>

      <div className="field">
        <label className="label" htmlFor="basics-nearestStation">
          最寄駅<span className="optional">任意</span>
        </label>
        <input
          type="text"
          id="basics-nearestStation"
          name="nearestStation"
          defaultValue={text('nearestStation')}
          aria-describedby={describedBy('nearestStation')}
        />
        {fieldError('nearestStation')}
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? '保存しています…' : '保存する'}
      </button>
    </form>
  );
}
