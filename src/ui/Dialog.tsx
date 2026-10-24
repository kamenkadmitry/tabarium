import { X } from 'lucide-react';
import { useEffect, useRef } from 'react';
import { useT } from '../i18n/I18nProvider';

interface Props {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}

/** Modal built on the native <dialog> element: focus trap, Esc to close and backdrop come from the browser. */
export function Dialog({ title, onClose, children }: Props) {
  const t = useT();
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (el && !el.open) el.showModal();
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby="dialog-title"
      onClose={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[min(32rem,calc(100vw-2rem))] rounded-2xl border border-line bg-surface p-0 text-fg shadow-none backdrop:bg-black/50"
    >
      <div className="flex items-center justify-between border-b border-line px-5 py-4">
        <h2 id="dialog-title" className="text-lg font-bold">
          {title}
        </h2>
        <button
          type="button"
          aria-label={t('common.close')}
          onClick={onClose}
          className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-fg"
        >
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  );
}

export function Field(props: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-4 block">
      <span className="mb-1.5 block text-sm font-semibold">{props.label}</span>
      {props.children}
      {props.hint && <span className="mt-1 block text-xs text-muted">{props.hint}</span>}
    </label>
  );
}

export const inputClass =
  'h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted';

export function PrimaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="submit"
      {...props}
      className="flex h-11 items-center justify-center gap-2 rounded-lg bg-primary px-5 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}

export function SecondaryButton(props: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      type="button"
      {...props}
      className="flex h-11 items-center justify-center gap-2 rounded-lg border border-line px-5 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:cursor-not-allowed disabled:opacity-50"
    />
  );
}
