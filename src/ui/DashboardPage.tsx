import { type ReactNode, useState } from 'react';
import { computeStats, type Ranked, STATS_PERIODS, type Stats, type StatsPeriod } from '../core/stats';
import type { Activity, Card, Collection, Hashtag, Space, Tag } from '../core/types';
import { useT } from '../i18n/I18nProvider';
import type { StringKey, T } from '../i18n/messages';

const PERIOD_KEYS: Record<StatsPeriod, StringKey> = { today: 'dash.period.today', '7d': 'dash.period.7d', '30d': 'dash.period.30d', all: 'dash.period.all' };
const PERIOD_PHRASE_KEYS: Record<StatsPeriod, StringKey> = { today: 'dash.phrase.today', '7d': 'dash.phrase.7d', '30d': 'dash.phrase.30d', all: 'dash.phrase.all' };

/** The `YYYY-MM-DD` day of a stats point as a short localized date, e.g. "12 Mar". */
const dayLabel = (t: T, day: string) => t.date(new Date(`${day}T00:00:00`), { day: 'numeric', month: 'short' });

const box = 'rounded-2xl border border-line bg-surface p-5';

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'primary' | 'danger' | 'accent' }) {
  const t = useT();
  const color = tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : tone === 'primary' ? 'text-primary' : 'text-fg';
  return (
    <div className={`${box} flex flex-col gap-1`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{t.num(value)}</span>
      {hint && <span className="text-xs text-muted">{hint}</span>}
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section aria-label={title} className="flex flex-col gap-3">
      <h2 className="text-sm font-bold uppercase tracking-wider text-muted">{title}</h2>
      {children}
    </section>
  );
}

/** Bars of links added (teal) and deleted (red) per day, with the same numbers in a table for screen readers. */
function HistoryChart({ series }: { series: Stats['series'] }) {
  const t = useT();
  const max = Math.max(1, ...series.flatMap((d) => [d.added, d.deleted]));
  const slot = 100 / series.length;
  const height = 120;
  return (
    <div className={box}>
      <div className="mb-3 flex items-center gap-4 text-xs font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden /> {t('dash.chart.added')}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-danger" aria-hidden /> {t('dash.chart.deleted')}
        </span>
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label={t('dash.chart.legend')} className="h-40 w-full">
        {series.map((d, i) => {
          const bar = (n: number, x: number, cls: string) =>
            n > 0 ? <rect key={cls} x={x} y={height - (n / max) * (height - 4)} width={slot * 0.36} height={(n / max) * (height - 4)} rx={0.4} className={cls}>
              <title>{`${dayLabel(t, d.day)}: ${n}`}</title>
            </rect> : null;
          return (
            <g key={d.day}>
              {bar(d.added, i * slot + slot * 0.12, 'fill-primary')}
              {bar(d.deleted, i * slot + slot * 0.52, 'fill-danger')}
            </g>
          );
        })}
        <line x1="0" x2="100" y1={height - 0.2} y2={height - 0.2} className="stroke-line" strokeWidth="0.4" vectorEffect="non-scaling-stroke" />
      </svg>
      <div className="mt-1 flex justify-between text-xs text-muted" aria-hidden>
        <span>{series[0] && dayLabel(t, series[0].day)}</span>
        <span>{series.at(-1) && dayLabel(t, series.at(-1)!.day)}</span>
      </div>
      <table className="sr-only">
        <caption>{t('dash.chart.legend')}</caption>
        <thead>
          <tr>
            <th>{t('dash.table.day')}</th>
            <th>{t('dash.table.added')}</th>
            <th>{t('dash.table.deleted')}</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{dayLabel(t, d.day)}</td>
              <td>{t.num(d.added)}</td>
              <td>{t.num(d.deleted)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankList({ title, rows, empty }: { title: string; rows: readonly Ranked[]; empty: string }) {
  const t = useT();
  const max = Math.max(1, ...rows.map((r) => r.count));
  return (
    <div className={box}>
      <h3 className="mb-3 text-sm font-bold">{title}</h3>
      {rows.length === 0 ? (
        <p className="text-sm text-muted">{empty}</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((r) => (
            <li key={r.label} className="flex flex-col gap-1">
              <div className="flex items-baseline justify-between gap-3 text-sm">
                <span className="truncate font-medium">{r.label}</span>
                <span className="shrink-0 tabular-nums text-muted">{t.num(r.count)}</span>
              </div>
              <div className="h-1.5 rounded-full bg-surface-2" aria-hidden>
                <div className="h-full rounded-full bg-primary" style={{ width: `${(r.count / max) * 100}%` }} />
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

interface Props {
  spaces: readonly Space[];
  collections: readonly Collection[];
  cards: readonly Card[];
  tags: readonly Tag[];
  hashtags: readonly Hashtag[];
  activity: readonly Activity[];
}

/** Everything that can be counted in the library, and what happened to it over time. */
export function DashboardPage(props: Props) {
  const t = useT();
  const [period, setPeriod] = useState<StatsPeriod>('7d');
  const [now] = useState(() => Date.now());
  const stats = computeStats({ ...props, now }, period);
  const { totals, duplicates } = stats;
  const p = stats.period;

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {t('dash.summary', { links: t.plural('count.links', totals.links), collections: t.plural('count.collections', totals.collections), everAdded: t.num(totals.everAdded) })}
        </p>
        <div role="radiogroup" aria-label={t('dash.periodAria')} className="flex overflow-hidden rounded-lg border border-line">
          {STATS_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${period === value ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {t(PERIOD_KEYS[value])}
            </button>
          ))}
        </div>
      </div>

      <Section title={t('dash.now')}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={t('dash.tile.links')} value={totals.links} hint={t.plural('dash.tile.linksHint', totals.inbox)} />
          <Tile label={t('dash.tile.collections')} value={totals.collections} hint={t.plural('dash.tile.collectionsHint', totals.spaces)} />
          <Tile label={t('dash.tile.tags')} value={totals.tags} />
          <Tile label={t('dash.tile.hashtags')} value={totals.hashtags} />
          <Tile label={t('dash.tile.starred')} value={totals.starred} />
          <Tile label={t('dash.tile.labelled')} value={totals.labelled} hint={t('dash.tile.labelledHint', { n: t.num(Math.max(0, totals.links - totals.labelled)) })} />
          <Tile label={t('dash.tile.duplicates')} value={duplicates.extraCopies} tone={duplicates.extraCopies > 0 ? 'accent' : undefined} hint={t.plural('dash.tile.duplicatesHint', duplicates.groups)} />
          <Tile label={t('dash.tile.everAdded')} value={totals.everAdded} hint={t.plural('dash.tile.everAddedHint', totals.everDeleted)} />
        </div>
      </Section>

      <Section title={t('dash.activity', { period: t(PERIOD_PHRASE_KEYS[period]) })}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label={t('dash.activity.newLinks')} value={p.added} tone="primary" />
          <Tile label={t('dash.activity.deleted')} value={p.deleted} tone="danger" />
          <Tile label={t('dash.activity.dupesRemoved')} value={p['duplicates-removed']} hint={t('dash.activity.dupesRemovedHint')} />
          <Tile label={t('dash.activity.dupesStopped')} value={p['duplicates-skipped']} hint={t('dash.activity.dupesStoppedHint')} />
          <Tile label={t('dash.activity.dupesAdded')} value={p['duplicates-created']} hint={t('dash.activity.dupesAddedHint')} />
        </div>
        <HistoryChart series={stats.series} />
      </Section>

      <Section title={t('dash.where')}>
        <div className="grid gap-3 md:grid-cols-2">
          <RankList title={t('dash.rank.perSpace')} rows={stats.perSpace} empty={t('dash.rank.noLinks')} />
          <RankList title={t('dash.rank.topSites')} rows={stats.topSites} empty={t('dash.rank.noLinks')} />
          <RankList title={t('dash.rank.topTags')} rows={stats.topTags} empty={t('dash.rank.noTags')} />
          <RankList title={t('dash.rank.topHashtags')} rows={stats.topHashtags} empty={t('dash.rank.noHashtags')} />
        </div>
      </Section>
    </div>
  );
}
