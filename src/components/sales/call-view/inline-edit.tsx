'use client';

/**
 * The frame every editable panel on the calling screen shares: a small gold
 * title, a pencil that turns into Save / Cancel, an error line. The panel
 * itself decides what "editing" looks like; this only draws the chrome.
 */
export function PanelFrame({
  title, badge, editing, onEdit, onCancel, onSave, saving, error, extra, children, className = '',
}: {
  title: React.ReactNode;
  badge?: React.ReactNode;
  editing: boolean;
  onEdit: () => void;
  onCancel: () => void;
  onSave: () => void;
  saving: boolean;
  error: string | null;
  /** Extra header controls (a collapse toggle, a count). */
  extra?: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <div className="mb-2 flex items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-[13px] font-bold uppercase tracking-wide text-ppc-gold">
          {title}
          {badge}
        </h3>
        <div className="flex items-center gap-1.5">
          {extra}
          {editing ? (
            <>
              <button type="button" onClick={onCancel} disabled={saving} className="rounded-lg border border-line px-2.5 py-1 text-[13px] hover:border-ppc-gold/60 disabled:opacity-50">Cancel</button>
              <button type="button" onClick={onSave} disabled={saving} className="rounded-lg bg-ppc-gold px-3 py-1 text-[13px] font-bold text-black hover:bg-ppc-gold-dim disabled:opacity-50">{saving ? 'Saving…' : 'Save'}</button>
            </>
          ) : (
            <button type="button" onClick={onEdit} aria-label={`Edit ${typeof title === 'string' ? title : 'panel'}`} title="Edit" className="rounded px-1.5 text-[13px] text-muted hover:text-ppc-gold">✎</button>
          )}
        </div>
      </div>
      {error && <p className="mb-2 text-[13px] text-red-300">{error}</p>}
      {children}
    </div>
  );
}

export const EDIT_INPUT = 'w-full rounded-lg border border-line bg-surface-2 px-3 py-2 text-[15px] leading-snug';
