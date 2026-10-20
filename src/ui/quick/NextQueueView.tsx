import { Check, Clock } from 'lucide-react';
import { useState } from 'react';
import { db, repo } from '../../core/instance';
import { quickSave } from '../../core/quicksave';
import type { Card, NextItem } from '../../core/types';
import { usePlatform } from '../../platform/context';
import { hostOf } from '../CardRow';

interface Props {
  nexts: readonly NextItem[];
  cards: readonly Card[];
  onStatus: (status: { tone: 'ok' | 'error'; text: string } | null) => void;
}

/** The Next queue, plus a button that saves the current tab and queues it. */
export function NextQueueView({ nexts, cards, onStatus }: Props) {
  const platform = usePlatform();
  const [busy, setBusy] = useState(false);
  const byId = new Map(cards.map((c) => [c.id, c]));
  const entries = nexts.flatMap((n) => {
    const card = byId.get(n.cardId);
    return card ? [{ item: n, card }] : [];
  });

  const run = async (what: string, action: () => Promise<string>) => {
    setBusy(true);
    onStatus(null);
    try {
      onStatus({ tone: 'ok', text: await action() });
    } catch (e) {
      console.error(`Tabarium: ${what} failed`, e);
      onStatus({ tone: 'error', text: `${what} failed: ${e instanceof Error ? e.message : String(e)}` });
    } finally {
      setBusy(false);
    }
  };

  const addCurrent = () =>
    run('Adding to Next', async () => {
      const tab = await platform.tabs.getActiveTab();
      if (!tab) throw new Error('This page cannot be saved (only http and https pages can).');
      await quickSave(db, [{ title: tab.title, url: tab.url, favIconUrl: tab.favIconUrl }]);
      const saved = (await db.cards.where('url').equals(tab.url).toArray())[0];
      if (!saved) throw new Error('The tab was not found after saving.');
      await repo.addToNext(saved.id);
      return 'Added to Next.';
    });

  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        disabled={busy}
        onClick={() => void addCurrent()}
        className="flex h-11 items-center justify-center gap-2 rounded-lg bg-accent text-sm font-bold text-accent-fg transition-opacity duration-150 hover:opacity-90 disabled:opacity-50"
      >
        <Clock size={16} aria-hidden /> Add this tab to Next
      </button>
      <ul aria-label="Next queue" className="flex flex-col gap-0.5">
        {entries.map(({ item, card }) => (
          <li key={item.id} className="flex min-h-11 items-center gap-3 rounded-lg px-2 hover:bg-surface-2">
            <button
              type="button"
              role="checkbox"
              aria-checked={item.state === 'done'}
              aria-label={`Mark ${card.customTitle ?? card.title} as ${item.state === 'done' ? 'to do' : 'done'}`}
              onClick={() => void run('Updating Next', async () => {
                await repo.setNextState(item.id, item.state === 'done' ? 'todo' : 'done');
                return item.state === 'done' ? 'Back on the list.' : 'Done.';
              })}
              className={`grid size-5 shrink-0 place-items-center rounded-md border-2 ${item.state === 'done' ? 'border-primary bg-primary text-primary-fg' : 'border-line'}`}
            >
              {item.state === 'done' && <Check size={12} aria-hidden />}
            </button>
            <a href={card.url} target="_blank" rel="noreferrer" className="min-w-0 flex-1 py-1">
              <span className={`block truncate text-sm font-medium ${item.state === 'done' ? 'text-muted line-through' : ''}`}>
                {card.customTitle ?? card.title}
              </span>
              <span className="block truncate text-xs text-muted">{hostOf(card.url)}</span>
            </a>
          </li>
        ))}
        {entries.length === 0 && <li className="px-3 py-6 text-center text-sm text-muted">Nothing queued yet.</li>}
      </ul>
    </div>
  );
}
