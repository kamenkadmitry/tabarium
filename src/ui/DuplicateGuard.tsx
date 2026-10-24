import { createContext, useCallback, useContext, useState } from 'react';
import { findExistingLinks, type ExistingLink } from '../core/duplicates';
import { db, repo } from '../core/instance';
import { normalizeUrl } from '../core/url';
import { useT } from '../i18n/I18nProvider';
import { Dialog, PrimaryButton, SecondaryButton } from './Dialog';

/** Anything about to be added to the library: it needs an address and a title to show. */
export interface LinkToAdd {
  url: string;
  title: string;
}

/**
 * Asks before links that are already somewhere in the library are added again. Resolves to the links to add (all of
 * them, or only the new ones), or null when the user cancels, in which case nothing may be added.
 */
export type DuplicateGuard = <T extends LinkToAdd>(items: readonly T[]) => Promise<readonly T[] | null>;

type Choice = 'all' | 'new' | 'cancel';

interface Pending {
  total: number;
  hits: { title: string; where: ExistingLink }[];
  resolve: (choice: Choice) => void;
}

const GuardContext = createContext<DuplicateGuard | null>(null);

const place = (e: ExistingLink) => [e.space, e.collection].filter((x) => x !== '').join(' / ');

/** Provides the check to everything below it and shows the question when needed. */
export function DuplicateGuardProvider({ children }: { children: React.ReactNode }) {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);

  const guard = useCallback<DuplicateGuard>(async (items) => {
    const found = await findExistingLinks(
      db,
      items.map((i) => i.url),
    );
    const duplicates = items.filter((i) => found.has(normalizeUrl(i.url)));
    if (duplicates.length === 0) return items;

    const choice = await new Promise<Choice>((resolve) => {
      setPending({
        total: items.length,
        hits: duplicates.map((d) => ({ title: d.title, where: found.get(normalizeUrl(d.url)) as ExistingLink })),
        resolve,
      });
    });
    setPending(null);
    if (choice === 'all') {
      await repo.recordActivity('duplicates-created', duplicates.length);
      return items;
    }
    await repo.recordActivity('duplicates-skipped', duplicates.length);
    return choice === 'new' ? items.filter((i) => !found.has(normalizeUrl(i.url))) : null;
  }, []);

  const fresh = pending ? pending.total - pending.hits.length : 0;
  const single = pending !== null && pending.total === 1;

  return (
    <GuardContext.Provider value={guard}>
      {children}
      {pending && (
        <Dialog title={single ? t('dup.title.single') : t.plural('dup.title.multi', pending.total, { hits: pending.hits.length })} onClose={() => pending.resolve('cancel')}>
          <ul aria-label={t('dup.list')} className="mb-4 flex max-h-56 flex-col gap-2 overflow-y-auto">
            {pending.hits.slice(0, 6).map((h, i) => (
              <li key={i} className="rounded-lg border border-line px-3 py-2">
                <span className="block truncate text-sm font-semibold">{h.title}</span>
                <span className="block truncate text-xs text-muted">
                  {t('dup.alreadyIn', { place: place(h.where) })}
                  {h.where.copies > 1 ? t.plural('dup.morePlaces', h.where.copies - 1) : ''}
                </span>
              </li>
            ))}
            {pending.hits.length > 6 && <li className="px-1 text-xs text-muted">{t('dup.andMore', { n: pending.hits.length - 6 })}</li>}
          </ul>
          <p className="mb-4 text-sm text-muted">
            {single ? t('dup.ask.single') : t('dup.ask.multi')}
          </p>
          <div className="flex flex-wrap justify-end gap-2">
            <SecondaryButton onClick={() => pending.resolve('cancel')}>{t('common.cancel')}</SecondaryButton>
            {!single && fresh > 0 && <SecondaryButton onClick={() => pending.resolve('new')}>{t.plural('dup.addOnlyNew', fresh)}</SecondaryButton>}
            <PrimaryButton type="button" onClick={() => pending.resolve('all')}>
              {single ? t('dup.addOne') : t('dup.addAll')}
            </PrimaryButton>
          </div>
        </Dialog>
      )}
    </GuardContext.Provider>
  );
}

export function useDuplicateGuard(): DuplicateGuard {
  const guard = useContext(GuardContext);
  if (!guard) throw new Error('useDuplicateGuard must be used inside a DuplicateGuardProvider');
  return guard;
}
