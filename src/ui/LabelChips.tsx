import { Plus, X } from 'lucide-react';
import { useId, useRef, useState } from 'react';
import { useT } from '../i18n/I18nProvider';

export interface LabelItem {
  id: string;
  label: string;
  color?: string;
  /** How many links use it; shown in suggestions and used to order them. */
  count: number;
}

interface Props {
  /** Heading of the row, e.g. "Hashtags". */
  title: string;
  /** Singular name used in accessible labels, e.g. "hashtag". */
  noun: string;
  /** Plural name for the empty list message, e.g. "hashtags". */
  nounPlural: string;
  /** Shown before each label, e.g. "#". */
  prefix?: string;
  items: readonly LabelItem[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** Creates a label from the typed text (and the chosen colour, when swatches are offered) and returns its id. */
  onCreate: (text: string, color?: string) => Promise<string>;
  /** Maps typed text to the stored form so "#AI" finds "ai". Defaults to a trimmed lowercase match. */
  normalize?: (text: string) => string;
  /** Colours offered next to "Create" (tags only). */
  swatches?: readonly string[];
}

const defaultNormalize = (text: string) => text.trim().toLowerCase();
const MAX_SUGGESTIONS = 6;
const LIST_HEIGHT = 300;

/**
 * A row of chips with a cross, ending in a dashed "+". Pressing "+" turns it into a small field with suggestions:
 * matches (or the most used labels when the field is empty) and a line to create a new label.
 */
export function LabelChips({ title, noun, nounPlural, prefix = '', items, selected, onChange, onCreate, normalize = defaultNormalize, swatches }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [openUp, setOpenUp] = useState(false);
  const [text, setText] = useState('');
  const [active, setActive] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const wrap = useRef<HTMLDivElement>(null);
  const listId = useId();

  const chosen = new Set(selected);
  const byId = new Map(items.map((i) => [i.id, i]));
  const key = normalize(text);
  const exact = key === '' ? undefined : items.find((i) => normalize(i.label) === key);
  const suggestions = items
    .filter((i) => !chosen.has(i.id) && (key === '' || normalize(i.label).includes(key)))
    .sort((a, b) => Number(normalize(b.label).startsWith(key)) - Number(normalize(a.label).startsWith(key)) || b.count - a.count || a.label.localeCompare(b.label))
    .slice(0, MAX_SUGGESTIONS);
  const canCreate = key !== '' && exact === undefined;
  const rows = suggestions.length + (canCreate ? 1 : 0);

  const close = () => {
    setOpen(false);
    setText('');
    setError(null);
  };

  const show = () => {
    const rect = wrap.current?.getBoundingClientRect();
    setOpenUp(rect !== undefined && rect.bottom + LIST_HEIGHT > window.innerHeight && rect.top > LIST_HEIGHT);
    setActive(0);
    setOpen(true);
  };

  const pick = (id: string) => {
    onChange([...selected, id]);
    setText('');
    setActive(0);
    setError(null);
  };

  const create = async (color?: string) => {
    setBusy(true);
    setError(null);
    try {
      pick(await onCreate(text.trim(), color));
    } catch (e) {
      console.error(`Tabarium: creating "${text}" in ${title} failed`, e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const choose = (index: number) => {
    const s = suggestions[index];
    if (s) pick(s.id);
    else if (canCreate) void create();
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.stopPropagation(); // closes the field only, not the whole editor
      close();
    } else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault();
      if (rows > 0) setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : rows - 1)) % rows);
    } else if (e.key === 'Enter') {
      e.preventDefault(); // Enter adds a label here; it must not submit the editor
      if (exact && !chosen.has(exact.id)) pick(exact.id);
      else choose(active);
    }
  };

  return (
    <div className="mb-3">
      <p className="mb-1.5 text-xs font-semibold text-muted">{title}</p>
      <div
        ref={wrap}
        className="relative"
        onBlur={(e) => {
          if (open && !e.currentTarget.contains(e.relatedTarget as Node | null)) close();
        }}
      >
        <ul className="flex flex-wrap items-center gap-1.5" aria-label={t('label.chosen', { title })}>
          {selected.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li key={id} className="flex h-7 items-center gap-1.5 rounded-full bg-bg py-0.5 pl-2.5 pr-1 text-xs font-semibold">
                {item.color && <span aria-hidden className="size-2 rounded-full" style={{ background: item.color }} />}
                <span className={prefix ? 'text-primary' : ''}>
                  {prefix}
                  {item.label}
                </span>
                <button
                  type="button"
                  aria-label={t('label.remove', { label: `${prefix}${item.label}` })}
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                  className="grid size-5 place-items-center rounded-full text-muted hover:text-danger"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            );
          })}
          <li>
            {open ? (
              <input
                autoFocus
                role="combobox"
                aria-label={t('label.add', { noun })}
                aria-expanded
                aria-controls={listId}
                aria-activedescendant={rows > 0 ? `${listId}-${active}` : undefined}
                value={text}
                disabled={busy}
                placeholder={`${noun[0]?.toUpperCase()}${noun.slice(1)}…`}
                onChange={(e) => {
                  setText(e.target.value);
                  setActive(0);
                }}
                onKeyDown={onKeyDown}
                className="h-7 w-36 rounded-full border border-primary bg-bg px-3 text-xs font-semibold placeholder:text-muted"
              />
            ) : (
              <button
                type="button"
                aria-label={t('label.add', { noun })}
                onClick={show}
                className="grid h-7 w-8 place-items-center rounded-full border border-dashed border-muted text-muted transition-colors duration-150 hover:border-primary hover:text-primary"
              >
                <Plus size={14} aria-hidden />
              </button>
            )}
          </li>
        </ul>

        {open && (
          <div
            className={`absolute left-0 z-20 w-72 max-w-full overflow-hidden rounded-xl border border-line bg-surface shadow-lg ${openUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}`}
          >
            {rows > 0 && (
              <p className="px-3 pb-0.5 pt-2 text-[11px] font-bold uppercase tracking-wider text-muted">{key === '' ? t('label.oftenUsed') : t('label.matches')}</p>
            )}
            <ul id={listId} role="listbox" aria-label={t('label.suggestions', { title })} className="max-h-64 overflow-y-auto py-1">
              {suggestions.map((s, i) => (
                <li
                  key={s.id}
                  id={`${listId}-${i}`}
                  role="option"
                  aria-selected={active === i}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => pick(s.id)}
                  className={`flex min-h-9 cursor-pointer items-center gap-2 px-3 text-sm font-medium ${active === i ? 'bg-surface-2' : ''}`}
                >
                  {s.color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: s.color }} />}
                  <span className={prefix ? 'text-primary' : ''}>
                    {prefix}
                    {s.label}
                  </span>
                  <span className="ml-auto text-xs text-muted">{s.count}</span>
                </li>
              ))}
              {canCreate && (
                <li
                  id={`${listId}-${suggestions.length}`}
                  role="option"
                  aria-selected={active === suggestions.length}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => void create()}
                  className={`flex min-h-9 cursor-pointer items-center gap-2 border-t border-line px-3 text-sm font-bold text-primary ${active === suggestions.length ? 'bg-surface-2' : ''}`}
                >
                  <Plus size={14} aria-hidden /> {t('label.create', { label: `${prefix}${key}` })}
                  {swatches && (
                    <span className="ml-auto flex gap-1" role="group" aria-label={t('label.pickColour')}>
                      {swatches.map((c) => (
                        <button
                          key={c}
                          type="button"
                          aria-label={t('label.createColour', { colour: c })}
                          onMouseDown={(e) => e.preventDefault()}
                          onClick={(e) => {
                            e.stopPropagation();
                            void create(c);
                          }}
                          className="size-4 rounded-full border border-line"
                          style={{ background: c }}
                        />
                      ))}
                    </span>
                  )}
                </li>
              )}
              {rows === 0 && <li className="px-3 py-2 text-sm text-muted">{items.length === 0 ? t('label.noneYet', { nounPlural }) : t('label.allAdded')}</li>}
            </ul>
            {error && <p className="border-t border-line px-3 py-2 text-xs text-danger">{error}</p>}
            <p className="border-t border-line px-3 py-1.5 text-[11px] text-muted">{t('label.keysHint')}</p>
          </div>
        )}
      </div>
    </div>
  );
}
