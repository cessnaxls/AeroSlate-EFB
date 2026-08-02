import { useEffect, useState } from 'react';
import { normalizeZulu } from '../lib/flightTimes';

interface Props {
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  ariaLabel?: string;
}

function cleanDraft(value: string): string {
  return value.toUpperCase().replace(/[^0-9:Z]/g, '').slice(0, 6);
}

export function ZuluTimeInput({ value, onChange, disabled, readOnly, placeholder = 'HH:MMz', ariaLabel }: Props) {
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);

  const commit = () => {
    const normalized = normalizeZulu(draft);
    setDraft(normalized);
    onChange(normalized);
  };

  return <input
    value={draft}
    disabled={disabled}
    readOnly={readOnly}
    placeholder={placeholder}
    aria-label={ariaLabel}
    inputMode="numeric"
    onChange={event => {
      const next = cleanDraft(event.target.value);
      setDraft(next);
      if (readOnly) return;
      if (/^(?:[01]\d|2[0-3]):[0-5]\d[Zz]?$/.test(next) || /^(?:[01]\d|2[0-3])[0-5]\d[Zz]?$/.test(next)) onChange(normalizeZulu(next));
    }}
    onBlur={commit}
    onKeyDown={event => { if (event.key === 'Enter') { event.currentTarget.blur(); } }}
  />;
}
