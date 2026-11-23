import { useEffect, useRef, useState } from 'react';
import { cleanDigits } from '../hockey.ts';

export function TimeNumber({
  value,
  onValue,
  max,
  maxDigits = 3,
  label,
}: {
  value: number;
  onValue: (next: number) => void;
  max?: number;
  maxDigits?: number;
  label: string;
}) {
  const [text, setText] = useState(() => String(Math.max(0, Math.trunc(value))));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(String(Math.max(0, Math.trunc(value))));
  }, [value]);

  return (
    <input
      type="text"
      inputMode="numeric"
      autoComplete="off"
      aria-label={label}
      value={text}
      onFocus={() => {
        focused.current = true;
      }}
      onBlur={() => {
        focused.current = false;
        const next = text === '' ? 0 : Number(text);
        const clamped = max == null ? next : Math.min(max, Math.max(0, next));
        setText(String(clamped));
        if (clamped !== value) onValue(clamped);
      }}
      onChange={(event) => {
        const next = cleanDigits(event.target.value, maxDigits, max);
        setText(next);
        onValue(next === '' ? 0 : Number(next));
      }}
    />
  );
}
