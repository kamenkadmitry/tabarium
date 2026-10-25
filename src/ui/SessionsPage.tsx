import { useLiveQuery } from 'dexie-react-hooks';
import { Globe, History, RotateCcw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { db } from '../core/instance';
import { deleteSnapshot, listSnapshots } from '../core/snapshots';
import type { SessionSnapshot, SnapshotWindow } from '../core/types';
import { usePlatform } from '../platform/context';
import { useT } from '../i18n/I18nProvider';
import { EmptyState } from './EmptyState';

interface Props {
  run: (what: string, action: () => Promise<void>) => Promise<void>;
  /** Restored windows become a named browser tab group when the tabGroups setting (and permission) is on. */
  groupTitles: boolean;
}

const buttonClass =
  'flex h-9 items-center gap-2 rounded-lg border border-line px-3 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50';

function TabLine({ favIconUrl, title, url }: { favIconUrl: string | null; title: string; url: string }) {
  return (
    <li className="flex min-w-0 items-center gap-2 text-sm text-muted">
      {favIconUrl ? <img src={favIconUrl} alt="" className="size-4 shrink-0 rounded" /> : <Globe size={14} aria-hidden className="shrink-0" />}
      <span className="truncate" title={url}>
        {title || url}
      </span>
    </li>
  );
}

/** Snapshots taken by the periodic session alarm, newest first, with one-click recovery. */
export function SessionsPage({ run, groupTitles }: Props) {
  const t = useT();
  const platform = usePlatform();
  const snapshots = useLiveQuery(() => listSnapshots(db), []);
  const [note, setNote] = useState<string | null>(null);

  const groupTitle = (snap: SessionSnapshot, windowIndex: number) =>
    t('ses.windowTitle', { time: t.time(snap.createdAt), n: windowIndex + 1 });

  const openWindow = async (snap: SessionSnapshot, w: SnapshotWindow, windowIndex: number) =>
    platform.tabs.openUrls(
      w.tabs.map((tab) => tab.url),
      groupTitles ? { groupTitle: groupTitle(snap, windowIndex) } : undefined,
    );

  const restoreWindow = (snap: SessionSnapshot, w: SnapshotWindow, windowIndex: number) =>
    void run(t('run.restoringSession'), async () => {
      await openWindow(snap, w, windowIndex);
      setNote(t('ses.restored'));
    });

  const restoreAll = (snap: SessionSnapshot) =>
    void run(t('run.restoringSession'), async () => {
      // Sequential: each remembered window becomes one tab group, in its original order.
      for (const [i, w] of snap.windows.entries()) await openWindow(snap, w, i);
      setNote(t('ses.restored'));
    });

  const remove = (snap: SessionSnapshot) =>
    void run(t('run.deletingSnapshot'), async () => {
      await deleteSnapshot(db, snap.id);
      setNote(t('ses.deleted'));
    });

  if (!snapshots) return null;
  if (snapshots.length === 0) {
    return <EmptyState className="mt-16" icon={<History />} title={t('ses.empty.title')} hint={t('ses.empty.hint')} />;
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-4">
      {note && (
        <p role="status" className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-primary">
          {note}
        </p>
      )}
      {snapshots.map((snap) => {
        const tabCount = snap.windows.reduce((n, w) => n + w.tabs.length, 0);
        return (
          <section key={snap.id} className="rounded-2xl border border-line bg-surface">
            <header className="flex flex-wrap items-center gap-3 border-b border-line px-5 py-3">
              <History size={16} aria-hidden className="text-muted" />
              <div className="min-w-0 flex-1">
                <h2 className="text-sm font-bold">{t.date(snap.createdAt)} · {t.time(snap.createdAt)}</h2>
                <p className="text-xs text-muted">
                  {t.plural('count.windows', snap.windows.length)} · {t.plural('count.tabs', tabCount)}
                </p>
              </div>
              <button type="button" className={buttonClass} onClick={() => restoreAll(snap)}>
                <RotateCcw size={15} aria-hidden /> {t('ses.restoreAll')}
              </button>
              <button
                type="button"
                aria-label={t('ses.delete')}
                onClick={() => remove(snap)}
                className="grid size-9 place-items-center rounded-lg text-muted transition-colors duration-150 hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={16} aria-hidden />
              </button>
            </header>
            <ol className="flex flex-col gap-3 p-5">
              {snap.windows.map((w, i) => (
                <li key={i} className="rounded-xl border border-line p-3">
                  <div className="mb-2 flex items-center gap-3">
                    <span className="flex-1 text-sm font-semibold">
                      {t('ses.windowN', { n: i + 1 })} · {t.plural('count.tabs', w.tabs.length)}
                    </span>
                    <button type="button" className={buttonClass} onClick={() => restoreWindow(snap, w, i)}>
                      <RotateCcw size={14} aria-hidden /> {t('ses.restoreWindow')}
                    </button>
                  </div>
                  <ul className="flex flex-col gap-1">
                    {w.tabs.map((tab) => (
                      <TabLine key={`${i}-${tab.url}`} favIconUrl={tab.favIconUrl} title={tab.title} url={tab.url} />
                    ))}
                  </ul>
                </li>
              ))}
            </ol>
          </section>
        );
      })}
    </div>
  );
}
