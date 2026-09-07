'use client';

import { useCallerName } from './use-caller-name';

export function CallerNameField({ fallback }: { fallback: string }) {
  const [name, setName] = useCallerName(fallback);
  return (
    <label className="flex items-center gap-3 text-sm">
      <span className="shrink-0 font-medium text-muted">Calling as</span>
      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        placeholder="Your name"
        className="max-w-xs"
        aria-label="Caller name"
      />
    </label>
  );
}
