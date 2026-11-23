'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { createRoomAction, type FormState } from '../actions';

const INITIAL: FormState = { status: 'idle', errors: {}, values: {} };

export function RoomForm({ municipalities }: { municipalities: string[] }) {
  const [state, action, pending] = useActionState(createRoomAction, INITIAL);
  const { errors, values } = state;
  const text = (key: string): string => (typeof values[key] === 'string' ? (values[key] as string) : '');
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
        <p className="notice error" role="status">
          {state.message}
        </p>
      ) : null}

      <div className="field">
        <label className="label" htmlFor="municipality">
          自治体
        </label>
        <input
          type="text"
          id="municipality"
          name="municipality"
          list="municipality-options"
          defaultValue={text('municipality')}
          placeholder="例: 大田区"
          aria-describedby={describedBy('municipality')}
        />
        <datalist id="municipality-options">
          {municipalities.map((m) => (
            <option key={m} value={m} />
          ))}
        </datalist>
        {fieldError('municipality')}
      </div>

      <div className="field">
        <label className="label" htmlFor="facilityName">
          施設名
        </label>
        <input
          type="text"
          id="facilityName"
          name="facilityName"
          defaultValue={text('facilityName')}
          placeholder="例: 大田区民プラザ"
          aria-describedby={describedBy('facilityName')}
        />
        {fieldError('facilityName')}
      </div>

      <div className="field">
        <label className="label" htmlFor="roomName">
          部屋名
        </label>
        <input
          type="text"
          id="roomName"
          name="roomName"
          defaultValue={text('roomName')}
          placeholder="例: 第一音楽スタジオ"
          aria-describedby={describedBy('roomName')}
        />
        {fieldError('roomName')}
      </div>

      <div className="field">
        <label className="label" htmlFor="capacity">
          定員<span className="optional">任意</span>
        </label>
        <input
          type="number"
          id="capacity"
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
        <label className="label" htmlFor="nearestStation">
          最寄駅<span className="optional">任意</span>
        </label>
        <input
          type="text"
          id="nearestStation"
          name="nearestStation"
          defaultValue={text('nearestStation')}
          aria-describedby={describedBy('nearestStation')}
        />
        {fieldError('nearestStation')}
      </div>

      <button type="submit" className="button" disabled={pending}>
        {pending ? '追加しています…' : '部屋を追加する'}
      </button>{' '}
      <Link href="/rooms" className="button secondary">
        やめる
      </Link>
    </form>
  );
}
