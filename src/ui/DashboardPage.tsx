import { type ReactNode, useState } from 'react';
import { computeStats, type Ranked, STATS_PERIODS, type Stats, type StatsPeriod } from '../core/stats';
import type { Activity, Card, Collection, Hashtag, Space, Tag } from '../core/types';

const PERIOD_LABELS: Record<StatsPeriod, string> = { today: 'Today', '7d': '7 days', '30d': '30 days', all: 'All time' };
const PERIOD_PHRASES: Record<StatsPeriod, string> = { today: 'today', '7d': 'in the last 7 days', '30d': 'in the last 30 days', all: 'in total' };

const box = 'rounded-2xl border border-line bg-surface p-5';

function Tile({ label, value, hint, tone }: { label: string; value: number; hint?: string; tone?: 'primary' | 'danger' | 'accent' }) {
  const color = tone === 'danger' ? 'text-danger' : tone === 'accent' ? 'text-accent' : tone === 'primary' ? 'text-primary' : 'text-fg';
  return (
    <div className={`${box} flex flex-col gap-1`}>
      <span className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</span>
      <span className={`text-3xl font-bold tabular-nums ${color}`}>{value.toLocaleString()}</span>
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
  const max = Math.max(1, ...series.flatMap((d) => [d.added, d.deleted]));
  const slot = 100 / series.length;
  const height = 120;
  return (
    <div className={box}>
      <div className="mb-3 flex items-center gap-4 text-xs font-semibold text-muted">
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-primary" aria-hidden /> Added
        </span>
        <span className="flex items-center gap-1.5">
          <span className="size-2.5 rounded-sm bg-danger" aria-hidden /> Deleted
        </span>
      </div>
      <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" role="img" aria-label="Links added and deleted per day" className="h-40 w-full">
        {series.map((d, i) => {
          const bar = (n: number, x: number, cls: string) =>
            n > 0 ? <rect key={cls} x={x} y={height - (n / max) * (height - 4)} width={slot * 0.36} height={(n / max) * (height - 4)} rx={0.4} className={cls}>
              <title>{`${d.day}: ${n}`}</title>
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
        <span>{series[0]?.day}</span>
        <span>{series.at(-1)?.day}</span>
      </div>
      <table className="sr-only">
        <caption>Links added and deleted per day</caption>
        <thead>
          <tr>
            <th>Day</th>
            <th>Added</th>
            <th>Deleted</th>
          </tr>
        </thead>
        <tbody>
          {series.map((d) => (
            <tr key={d.day}>
              <td>{d.day}</td>
              <td>{d.added}</td>
              <td>{d.deleted}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function RankList({ title, rows, empty }: { title: string; rows: readonly Ranked[]; empty: string }) {
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
                <span className="shrink-0 tabular-nums text-muted">{r.count}</span>
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
  const [period, setPeriod] = useState<StatsPeriod>('7d');
  const [now] = useState(() => Date.now());
  const stats = computeStats({ ...props, now }, period);
  const { totals, duplicates } = stats;
  const p = stats.period;
  const said = PERIOD_PHRASES[period];

  return (
    <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 pb-10">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted">
          {totals.links.toLocaleString()} links in {totals.collections.toLocaleString()} collections, {totals.everAdded.toLocaleString()} ever added.
        </p>
        <div role="radiogroup" aria-label="Period" className="flex overflow-hidden rounded-lg border border-line">
          {STATS_PERIODS.map((value) => (
            <button
              key={value}
              type="button"
              role="radio"
              aria-checked={period === value}
              onClick={() => setPeriod(value)}
              className={`px-3 py-1.5 text-sm font-semibold transition-colors duration-150 ${period === value ? 'bg-surface-2 text-fg' : 'text-muted hover:text-fg'}`}
            >
              {PERIOD_LABELS[value]}
            </button>
          ))}
        </div>
      </div>

      <Section title="Library now">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Links" value={totals.links} hint={`${totals.inbox.toLocaleString()} waiting in Inbox`} />
          <Tile label="Collections" value={totals.collections} hint={`in ${totals.spaces.toLocaleString()} spaces`} />
          <Tile label="Tags" value={totals.tags} />
          <Tile label="Hashtags" value={totals.hashtags} />
          <Tile label="Starred" value={totals.starred} />
          <Tile label="With labels" value={totals.labelled} hint={`${Math.max(0, totals.links - totals.labelled).toLocaleString()} without`} />
          <Tile label="Duplicates now" value={duplicates.extraCopies} tone={duplicates.extraCopies > 0 ? 'accent' : undefined} hint={`${duplicates.groups.toLocaleString()} addresses saved more than once`} />
          <Tile label="Ever added" value={totals.everAdded} hint={`${totals.everDeleted.toLocaleString()} deleted since`} />
        </div>
      </Section>

      <Section title={`Activity ${said}`}>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="New links" value={p.added} tone="primary" />
          <Tile label="Deleted" value={p.deleted} tone="danger" />
          <Tile label="Duplicates removed" value={p['duplicates-removed']} hint="deleted as copies" />
          <Tile label="Duplicates stopped" value={p['duplicates-skipped']} hint="you chose not to add them" />
          <Tile label="Duplicates added on purpose" value={p['duplicates-created']} hint="confirmed in the warning" />
        </div>
        <HistoryChart series={stats.series} />
      </Section>

      <Section title="Where it all is">
        <div className="grid gap-3 md:grid-cols-2">
          <RankList title="Links per space" rows={stats.perSpace} empty="No links yet." />
          <RankList title="Top sites" rows={stats.topSites} empty="No links yet." />
          <RankList title="Top tags" rows={stats.topTags} empty="No tags are used yet." />
          <RankList title="Top hashtags" rows={stats.topHashtags} empty="No hashtags are used yet." />
        </div>
      </Section>
    </div>
  );
}
