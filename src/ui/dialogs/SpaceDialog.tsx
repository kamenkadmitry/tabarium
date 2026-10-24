import { Search } from 'lucide-react';
import { useState } from 'react';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';
import { ICON_GROUPS, SpaceIcon } from '../spaceIcons';
import { useT } from '../../i18n/I18nProvider';

interface Props {
  mode: 'create' | 'edit';
  initialName?: string;
  initialIcon?: string | null;
  onSubmit: (values: { name: string; icon: string | null }) => Promise<void>;
  onClose: () => void;
}

/** Name and icon of a space. "Choose icon" opens a searchable list of themed icons and brand logos. */
export function SpaceDialog({ mode, initialName = '', initialIcon = null, onSubmit, onClose }: Props) {
  const t = useT();
  const [name, setName] = useState(initialName);
  const [icon, setIcon] = useState<string | null>(initialIcon);
  const [picking, setPicking] = useState(false);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const trimmed = name.trim();
  const needle = search.trim().toLowerCase();
  const groups = ICON_GROUPS.map((g) => ({ ...g, icons: g.icons.filter((i) => needle === '' || `${i.label} ${g.title}`.toLowerCase().includes(needle)) })).filter((g) => g.icons.length > 0);

  return (
    <Dialog title={mode === 'create' ? t('dlg.space.create') : t('dlg.space.edit')} onClose={onClose}>
      <form
        onSubmit={async (e) => {
          e.preventDefault();
          setBusy(true);
          try {
            await onSubmit({ name: trimmed, icon });
            onClose();
          } finally {
            setBusy(false);
          }
        }}
      >
        <Field label={t('dlg.space.name')}>
          <input autoFocus value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>

        <div className="mb-4">
          <span className="mb-1.5 block text-sm font-semibold">{t('dlg.space.icon')}</span>
          <div className="flex items-center gap-3">
            <span className="grid size-11 place-items-center rounded-xl bg-surface-2 text-primary">
              <SpaceIcon icon={icon} name={trimmed || '?'} size={22} />
            </span>
            <button
              type="button"
              aria-expanded={picking}
              onClick={() => setPicking((v) => !v)}
              className="h-10 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2"
            >
              {t('dlg.space.chooseIcon')}
            </button>
            {icon !== null && (
              <button type="button" onClick={() => setIcon(null)} className="text-sm font-semibold text-primary">
                {t('dlg.space.removeIcon')}
              </button>
            )}
          </div>

          {picking && (
            <div className="mt-3 rounded-xl border border-line">
              <label className="relative block border-b border-line p-2">
                <span className="sr-only">{t('dlg.space.searchIcons')}</span>
                <Search size={15} aria-hidden className="absolute left-5 top-1/2 -translate-y-1/2 text-muted" />
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t('dlg.space.searchPlaceholder')} className={`${inputClass} h-10 pl-9`} />
              </label>
              <div className="max-h-64 overflow-y-auto p-2">
                {groups.map((g) => (
                  <section key={g.key} aria-label={t(g.key)} className="mb-3">
                    <h3 className="mb-1.5 px-1 text-xs font-bold uppercase tracking-wider text-muted">{t(g.key)}</h3>
                    <ul className="grid grid-cols-8 gap-1">
                      {g.icons.map((i) => (
                        <li key={i.icon}>
                          <button
                            type="button"
                            title={i.key ? t(i.key) : i.label}
                            aria-label={i.key ? t(i.key) : i.label}
                            aria-pressed={icon === i.icon}
                            onClick={() => {
                              setIcon(i.icon);
                              setPicking(false);
                            }}
                            className={`grid size-10 place-items-center rounded-lg transition-colors duration-150 ${
                              icon === i.icon ? 'bg-primary text-primary-fg' : 'text-fg hover:bg-surface-2'
                            }`}
                          >
                            <SpaceIcon icon={i.icon} name={i.label} size={20} />
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
                {groups.length === 0 && <p className="px-2 py-6 text-center text-sm text-muted">{t('dlg.space.noIcon', { query: search.trim() })}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2">
          <SecondaryButton onClick={onClose}>{t('common.cancel')}</SecondaryButton>
          <PrimaryButton disabled={trimmed === '' || busy}>{mode === 'create' ? t('common.create') : t('common.save')}</PrimaryButton>
        </div>
      </form>
    </Dialog>
  );
}
