'use client';

import { useEffect } from 'react';
import { OUTCOME_HOTKEYS } from '@/lib/constants';

export interface CallKeyHandlers {
  /** An outcome hotkey: selects it and opens the finish dialog. */
  onOutcome: (index: number) => void;
  onRating: (n: 1 | 2 | 3 | 4 | 5) => void;
  /** Ctrl+Enter: open the finish dialog, or save when it is open. */
  onFinish: () => void;
  onSkip: () => void;
  onPrevious: () => void;
  onFocusNotes: () => void;
  onHelp: () => void;
  /** Esc outside a text box: close the dialog or the help sheet. */
  onEscape: () => void;
}

const TYPING = new Set(['INPUT', 'TEXTAREA', 'SELECT']);

/**
 * Keys only fire when focus is NOT in a text control — a "1" typed into the
 * notes must never log an outcome. Ctrl+Enter / Ctrl+arrows work everywhere.
 */
export function useCallKeys(h: CallKeyHandlers, enabled: boolean) {
  useEffect(() => {
    if (!enabled) return;
    function onKey(e: KeyboardEvent) {
      const t = e.target as HTMLElement | null;
      const typing = !!t && (TYPING.has(t.tagName) || t.isContentEditable);
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'Enter') { e.preventDefault(); h.onFinish(); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); h.onSkip(); }
        else if (e.key === 'ArrowLeft') { e.preventDefault(); h.onPrevious(); }
        return;
      }
      if (typing) {
        if (e.key === 'Escape') (t as HTMLElement).blur();
        return;
      }
      if (e.key === 'Escape') { h.onEscape(); return; }
      if (e.shiftKey && /^[1-5]$/.test(e.key)) { e.preventDefault(); h.onRating(Number(e.key) as 1 | 2 | 3 | 4 | 5); return; }
      // Shift+1 arrives as "!" on US layouts — map the symbol row too.
      const shifted = ['!', '@', '#', '$', '%'].indexOf(e.key);
      if (e.shiftKey && shifted !== -1) { e.preventDefault(); h.onRating((shifted + 1) as 1 | 2 | 3 | 4 | 5); return; }
      const idx = (OUTCOME_HOTKEYS as readonly string[]).indexOf(e.key);
      if (idx !== -1) { e.preventDefault(); h.onOutcome(idx); return; }
      if (e.key === '/') { e.preventDefault(); h.onFocusNotes(); return; }
      if (e.key === '?') { e.preventDefault(); h.onHelp(); }
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [h, enabled]);
}
