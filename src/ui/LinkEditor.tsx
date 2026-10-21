import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import type { CardDetails } from '../core/ai/tasks';
import { LabelFields, type LabelsApi } from './labels';
import { type LinkValues, parseUserUrl } from './linkInput';

interface Props {
  mode: 'edit' | 'add';
  /** Values to start from. Empty strings and arrays for a new link. */
  initial: LinkValues;
  labels: LabelsApi;
  /** "stack": fields one under another. "columns": three columns, for wide rows (List view). */
  layout: 'stack' | 'columns';
  /** Resolves to false when saving failed, so the editor stays open and keeps what was typed. */
  onSubmit: (values: LinkValues) => Promise<boolean>;
  onCancel: () => void;
  /** Present when an AI provider is configured: proposes a note, tags and hashtags for the link. */
  suggest?: (input: { title: string; url: string }) => Promise<CardDetails>;
  /** Reports whether something was changed, so the board can ask before throwing it away. */
  onDirtyChange?: (dirty: boolean) => void;
}

const field = 'h-10 w-full rounded-lg border border-line bg-bg px-3 text-sm placeholder:text-muted';

const sameIds = (a: readonly string[], b: readonly string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Edit or add a link in place. Ctrl+Enter saves, Esc cancels. */
export function LinkEditor({ mode, initial, labels, layout, suggest, onSubmit, onCancel, onDirtyChange }: Props) {
  const [title, setTitle] = useState(initial.title);
  const [rawUrl, setRawUrl] = useState(initial.url);
  const [note, setNote] = useState(initial.note);
  const [tagIds, setTagIds] = useState(initial.tagIds);
  const [hashtagIds, setHashtagIds] = useState(initial.hashtagIds);
  const [busy, setBusy] = useState(false);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestNote, setSuggestNote] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const form = useRef<HTMLFormElement>(null);

  const url = parseUserUrl(rawUrl);
  const showUrlError = rawUrl.trim() !== '' && url === null;
  const dirty =
    title !== initial.title || rawUrl !== initial.url || note !== initial.note || !sameIds(tagIds, initial.tagIds) || !sameIds(hashtagIds, initial.hashtagIds);

  useEffect(() => {
    onDirtyChange?.(dirty);
  }, [dirty, onDirtyChange]);
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  const submit = async () => {
    if (url === null || busy) return;
    setBusy(true);
    try {
      await onSubmit({ title, url, note, tagIds, hashtagIds });
    } finally {
      setBusy(false);
    }
  };

  /** Adds what the AI proposes to the form. Nothing is saved until Save, and nothing already typed is replaced. */
  const runSuggest = async () => {
    if (!suggest || url === null) return;
    setSuggesting(true);
    setSuggestNote(null);
    try {
      const details = await suggest({ title: title.trim() || new URL(url).hostname, url });
      const tagByTitle = new Map(labels.tags.map((t) => [t.title.toLowerCase(), t.id]));
      const addTags = details.tags.flatMap((t) => tagByTitle.get(t.toLowerCase()) ?? []);
      const addHashtags: string[] = [];
      for (const name of details.hashtags) {
        const known = labels.hashtags.find((h) => h.name === name);
        addHashtags.push(known ? known.id : await labels.createHashtag(name));
      }
      const fillNote = note.trim() === '' && details.note !== '';
      if (fillNote) setNote(details.note);
      setTagIds((prev) => [...new Set([...prev, ...addTags])]);
      setHashtagIds((prev) => [...new Set([...prev, ...addHashtags])]);
      const parts = [fillNote ? 'a note' : '', addTags.length > 0 ? `${addTags.length} tag${addTags.length === 1 ? '' : 's'}` : '', addHashtags.length > 0 ? `${addHashtags.length} hashtag${addHashtags.length === 1 ? '' : 's'}` : ''].filter((x) => x !== '');
      setSuggestNote({ tone: 'ok', text: parts.length > 0 ? `Added ${parts.join(', ')}. Review it and press Save.` : 'Nothing to suggest for this link.' });
    } catch (e) {
      console.error('Tabarium: the AI suggestion failed', e);
      setSuggestNote({ tone: 'error', text: e instanceof Error ? e.message : String(e) });
    } finally {
      setSuggesting(false);
    }
  };

  const cancel = () => {
    if (dirty && !confirm('Discard your changes?')) return;
    onCancel();
  };

  const wide = layout === 'columns';
  const textFields = (
    <>
      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Title</span>
        <input autoFocus={mode === 'edit'} value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === 'add' ? 'Optional. Defaults to the site name' : undefined} className={field} />
      </label>
      <label className="mb-3 block">
        <span className="mb-1.5 block text-xs font-semibold text-muted">Address</span>
        <input
          autoFocus={mode === 'add'}
          value={rawUrl}
          onChange={(e) => setRawUrl(e.target.value)}
          placeholder="example.com/article"
          aria-invalid={showUrlError}
          className={field}
        />
        {showUrlError && <span className="mt-1 block text-xs text-danger">Enter a valid http(s) address.</span>}
      </label>
    </>
  );
  const noteField = (
    <label className={`mb-3 block ${wide ? 'h-full' : ''}`}>
      <span className="mb-1.5 block text-xs font-semibold text-muted">Note</span>
      <textarea
        value={note}
        onChange={(e) => setNote(e.target.value)}
        rows={wide ? 5 : 2}
        className="w-full rounded-lg border border-line bg-bg px-3 py-2 text-sm"
      />
    </label>
  );
  const labelFields = (
    <>
      {suggest && (
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={url === null || suggesting}
            onClick={() => void runSuggest()}
            className="flex h-8 items-center gap-1.5 rounded-lg border border-line px-3 text-xs font-bold transition-colors duration-150 hover:bg-bg disabled:opacity-50"
          >
            <Sparkles size={13} aria-hidden className="text-accent" /> {suggesting ? 'Asking the AI…' : 'Suggest with AI'}
          </button>
          {suggestNote && (
            <span role="status" className={`text-xs ${suggestNote.tone === 'error' ? 'text-danger' : 'text-muted'}`}>
              {suggestNote.text}
            </span>
          )}
        </div>
      )}
      <LabelFields api={labels} tagIds={tagIds} hashtagIds={hashtagIds} onTags={setTagIds} onHashtags={setHashtagIds} />
    </>
  );

  return (
    <form
      ref={form}
      aria-label={mode === 'edit' ? 'Edit link' : 'Add link'}
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      onKeyDown={(e) => {
        if (e.key === 'Escape') {
          e.stopPropagation();
          cancel();
        } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
          e.preventDefault();
          void submit();
        }
      }}
      className="editor-in rounded-xl border border-line border-l-4 border-l-primary bg-surface-2 p-3"
    >
      {wide ? (
        <div className="grid grid-cols-3 gap-x-5">
          <div>{textFields}</div>
          <div>{noteField}</div>
          <div>{labelFields}</div>
        </div>
      ) : (
        <>
          {textFields}
          {noteField}
          {labelFields}
        </>
      )}
      <div className="flex items-center gap-2">
        <span className="mr-auto text-xs text-muted">Ctrl+Enter to save · Esc to cancel</span>
        <button
          type="button"
          onClick={cancel}
          className="h-9 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-bg"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={url === null || busy}
          className="h-9 rounded-lg bg-primary px-4 text-sm font-bold text-primary-fg transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {mode === 'edit' ? 'Save' : 'Add link'}
        </button>
      </div>
    </form>
  );
}
