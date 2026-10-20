import { Plus, X } from 'lucide-react';
import { useState } from 'react';

export interface LabelItem {
  id: string;
  label: string;
  color?: string;
}

interface Props {
  /** Name of the field; also the accessible name of the input. */
  title: string;
  /** Shown before each label, e.g. "#". */
  prefix?: string;
  items: readonly LabelItem[];
  selected: readonly string[];
  onChange: (ids: string[]) => void;
  /** Creates a label from the typed text and returns its id. May throw for invalid text. */
  onCreate: (text: string) => Promise<string>;
  /** Maps typed text to the stored form so "#AI" finds "ai". Defaults to a trimmed lowercase match. */
  normalize?: (text: string) => string;
}

const defaultNormalize = (text: string) => text.trim().toLowerCase();
const MAX_SUGGESTIONS = 6;

/** Chips for the chosen labels plus a search box: pick an existing label, or create one when nothing matches. */
export function LabelPicker({ title, prefix = '', items, selected, onChange, onCreate, normalize = defaultNormalize }: Props) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const chosen = new Set(selected);
  const byId = new Map(items.map((i) => [i.id, i]));
  const key = normalize(text);
  const exact = key === '' ? undefined : items.find((i) => normalize(i.label) === key);
  const suggestions = items.filter((i) => !chosen.has(i.id) && (key === '' || normalize(i.label).includes(key))).slice(0, MAX_SUGGESTIONS);
  const canCreate = key !== '' && exact === undefined;

  const pick = (id: string) => {
    onChange([...selected, id]);
    setText('');
    setError(null);
  };

  const create = async () => {
    setBusy(true);
    setError(null);
    try {
      pick(await onCreate(text.trim()));
    } catch (e) {
      console.error(`Tabarium: creating "${text}" in ${title} failed`, e);
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const open = text.trim() !== '';
  return (
    <div className="mb-4">
      <span className="mb-1.5 block text-sm font-semibold">{title}</span>
      {selected.length > 0 && (
        <ul className="mb-2 flex flex-wrap gap-1.5" aria-label={`Chosen ${title.toLowerCase()}`}>
          {selected.map((id) => {
            const item = byId.get(id);
            if (!item) return null;
            return (
              <li key={id} className="flex items-center gap-1.5 rounded-full bg-surface-2 py-1 pl-2.5 pr-1 text-xs font-semibold">
                {item.color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: item.color }} />}
                {prefix}
                {item.label}
                <button
                  type="button"
                  aria-label={`Remove ${prefix}${item.label}`}
                  onClick={() => onChange(selected.filter((s) => s !== id))}
                  className="grid size-5 place-items-center rounded-full text-muted hover:text-danger"
                >
                  <X size={12} aria-hidden />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <input
        aria-label={title}
        value={text}
        disabled={busy}
        placeholder={`Search ${title.toLowerCase()} or type a new one`}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key !== 'Enter') return;
          e.preventDefault(); // Enter picks a label here; it must not submit the surrounding form
          const first = suggestions[0];
          if (exact && !chosen.has(exact.id)) pick(exact.id);
          else if (first && !canCreate) pick(first.id);
          else if (canCreate) void create();
        }}
        className="h-11 w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted"
      />
      {error && <span className="mt-1 block text-xs text-danger">{error}</span>}
      {open && (suggestions.length > 0 || canCreate) && (
        <ul className="mt-1.5 flex flex-col overflow-hidden rounded-lg border border-line">
          {suggestions.map((i) => (
            <li key={i.id}>
              <button
                type="button"
                onClick={() => pick(i.id)}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm hover:bg-surface-2"
              >
                {i.color && <span aria-hidden className="size-2.5 rounded-full" style={{ background: i.color }} />}
                {prefix}
                {i.label}
              </button>
            </li>
          ))}
          {canCreate && (
            <li>
              <button
                type="button"
                onClick={() => void create()}
                className="flex min-h-10 w-full items-center gap-2 px-3 text-left text-sm font-semibold text-primary hover:bg-surface-2"
              >
                <Plus size={14} aria-hidden /> Create {prefix}
                {key}
              </button>
            </li>
          )}
        </ul>
      )}
    </div>
  );
}
