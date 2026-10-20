import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import type { Collection } from '../../core/types';
import type { OpenTab } from '../../platform/ports';
import { Dialog, Field, inputClass, PrimaryButton, SecondaryButton } from '../Dialog';

const NEW = '__new__';

/** A group proposed by the AI: the tabs, plus existing tag titles and hashtag names to apply. */
export interface ProposedGroup {
  title: string;
  tabs: OpenTab[];
  tags?: string[];
  hashtags?: string[];
}

interface Props {
  tabs: readonly OpenTab[];
  collections: readonly Collection[];
  /** Present only when an AI provider is configured. */
  onOrganise?: (tabs: OpenTab[]) => Promise<ProposedGroup[]>;
  onSave: (args: {
    tabs: OpenTab[];
    collectionId: string | null;
    newTitle: string;
    closeTabs: boolean;
    groups: ProposedGroup[] | null;
  }) => Promise<void>;
  onClose: () => void;
}

export function SaveSessionDialog({ tabs, collections, onOrganise, onSave, onClose }: Props) {
  const [selected, setSelected] = useState(() => new Set(tabs.map((t) => t.id)));
  const [target, setTarget] = useState(NEW);
  const [newTitle, setNewTitle] = useState(`Session ${new Date().toLocaleDateString()}`);
  const [busy, setBusy] = useState(false);
  const [groups, setGroups] = useState<ProposedGroup[] | null>(null);
  const [aiError, setAiError] = useState<string | null>(null);

  const chosen = tabs.filter((t) => selected.has(t.id));
  const canSave = chosen.length > 0 && (target !== NEW || newTitle.trim() !== '') && !busy;

  const save = async (closeTabs: boolean) => {
    setBusy(true);
    try {
      await onSave({ tabs: chosen, collectionId: target === NEW ? null : target, newTitle: newTitle.trim(), closeTabs, groups });
      onClose();
    } finally {
      setBusy(false);
    }
  };

  const organise = async () => {
    if (!onOrganise) return;
    setBusy(true);
    setAiError(null);
    try {
      setGroups(await onOrganise(chosen));
    } catch (e) {
      console.error('Tabarium: AI grouping failed', e);
      setAiError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const toggle = (id: number) => {
    setGroups(null);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <Dialog title="Save session" onClose={onClose}>
      {groups && (
        <section aria-label="AI groups" className="mb-4 rounded-lg border border-primary p-3">
          <p className="mb-2 flex items-center justify-between text-sm font-semibold">
            <span>
              {groups.length} groups from AI
            </span>
            <button type="button" className="text-xs font-semibold text-primary" onClick={() => setGroups(null)}>
              Discard
            </button>
          </p>
          <ul className="text-sm">
            {groups.map((g) => (
              <li key={g.title} className="flex justify-between py-0.5">
                <span className="min-w-0 truncate font-medium">
                  {g.title}
                  {(g.hashtags ?? []).map((h) => (
                    <span key={h} className="ml-2 text-xs font-normal text-primary">
                      #{h}
                    </span>
                  ))}
                </span>
                <span className="text-muted">{g.tabs.length}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className={groups ? 'hidden' : undefined}>
      <Field label="Save to">
        <select value={target} onChange={(e) => setTarget(e.target.value)} className={inputClass}>
          <option value={NEW}>New collection…</option>
          {collections.map((c) => (
            <option key={c.id} value={c.id}>
              {c.title}
            </option>
          ))}
        </select>
      </Field>
      {target === NEW && (
        <Field label="Collection name">
          <input value={newTitle} onChange={(e) => setNewTitle(e.target.value)} className={inputClass} />
        </Field>
      )}
      </div>

      <fieldset className="mb-5">
        <legend className="mb-1.5 flex w-full items-center justify-between text-sm font-semibold">
          <span>Tabs in this window ({chosen.length}/{tabs.length})</span>
          <button
            type="button"
            className="text-xs font-semibold text-primary"
            onClick={() => setSelected(selected.size === tabs.length ? new Set() : new Set(tabs.map((t) => t.id)))}
          >
            {selected.size === tabs.length ? 'Clear all' : 'Select all'}
          </button>
        </legend>
        <ul className="max-h-56 overflow-y-auto rounded-lg border border-line">
          {tabs.map((t) => (
            <li key={t.id} className="border-b border-line last:border-b-0">
              <label className="flex min-h-11 items-center gap-3 px-3 py-1.5">
                <input
                  type="checkbox"
                  checked={selected.has(t.id)}
                  onChange={() => toggle(t.id)}
                  className="size-4 accent-[var(--primary)]"
                />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium">{t.title}</span>
                  <span className="block truncate text-xs text-muted">{new URL(t.url).hostname}</span>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {tabs.length === 0 && <p className="mt-2 text-sm text-muted">No web pages are open in this window.</p>}
      </fieldset>

      {aiError && (
        <p role="alert" className="mb-3 text-sm text-danger">
          {aiError}
        </p>
      )}
      <div className="flex flex-wrap justify-end gap-2">
        <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
        {onOrganise && (
          <SecondaryButton disabled={chosen.length === 0 || busy} onClick={() => void organise()}>
            <Sparkles size={15} aria-hidden /> Organise with AI
          </SecondaryButton>
        )}
        <SecondaryButton disabled={!canSave} onClick={() => void save(false)}>
          Add &amp; keep tabs open
        </SecondaryButton>
        <PrimaryButton type="button" disabled={!canSave} onClick={() => void save(true)}>
          Add &amp; close tabs
        </PrimaryButton>
      </div>
    </Dialog>
  );
}
