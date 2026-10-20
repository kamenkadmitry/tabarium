import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Eye, EyeOff, Upload } from 'lucide-react';
import { useRef, useState } from 'react';
import { exportBackup, parseBackup, restoreBackup } from '../core/backup';
import { parseBookmarksHtml, toBookmarksHtml, toPlainText } from '../core/formats';
import { db, repo } from '../core/instance';
import { AI_PROVIDERS, loadSettings, type Settings, updateSettings } from '../core/settings';
import { usePlatform } from '../platform/context';
import { backupFilename, downloadTextFile } from '../platform/files';
import { inputClass } from './Dialog';

const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  openrouter: 'OpenRouter',
  custom: 'Custom (OpenAI-compatible)',
};

const INTERVALS = [
  { hours: 6, label: 'Every 6 hours' },
  { hours: 12, label: 'Every 12 hours' },
  { hours: 24, label: 'Daily' },
  { hours: 168, label: 'Weekly' },
];

function Section(props: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-bold">{props.title}</h2>
        <p className="mt-0.5 text-sm text-muted">{props.description}</p>
      </div>
      <div className="flex flex-col gap-4 p-5">{props.children}</div>
    </section>
  );
}

const buttonClass =
  'flex h-10 items-center gap-2 rounded-lg border border-line px-4 text-sm font-semibold transition-colors duration-150 hover:bg-surface-2 disabled:opacity-50';

function Switch(props: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={props.checked}
      aria-label={props.label}
      onClick={() => props.onChange(!props.checked)}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors duration-150 ${props.checked ? 'bg-primary' : 'bg-line'}`}
    >
      <span
        className={`absolute top-0.5 size-5 rounded-full bg-white transition-all duration-150 ${props.checked ? 'left-[22px]' : 'left-0.5'}`}
      />
    </button>
  );
}

export function SettingsView({ onError }: { onError: (what: string, e: unknown) => void }) {
  const platform = usePlatform();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const bookmarksInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [aiDraft, setAiDraft] = useState<Settings['ai'] | null>(null);

  if (!settings) return null;
  const ai = aiDraft ?? settings.ai;

  const guard = (what: string, fn: () => Promise<void>) => () => {
    setStatus(null);
    fn().catch((e: unknown) => onError(what, e));
  };

  const exportNow = guard('Export', async () => {
    const backup = await exportBackup(db);
    downloadTextFile(backupFilename(), JSON.stringify(backup, null, 2));
    await updateSettings(db, { lastBackupAt: Date.now() });
    setStatus(`Exported ${backup.cards.length} tabs in ${backup.collections.length} collections.`);
  });

  const exportAs = (format: 'html' | 'txt') =>
    guard('Export', async () => {
      const backup = await exportBackup(db);
      const base = backupFilename().replace(/\.json$/, '');
      if (format === 'html') downloadTextFile(`${base}.html`, toBookmarksHtml(backup), 'text/html');
      else downloadTextFile(`${base}.txt`, toPlainText(backup), 'text/plain');
      setStatus(`Exported ${backup.cards.length} tabs as ${format.toUpperCase()}.`);
    })();

  const importBookmarks = async (file: File) => {
    const imported = parseBookmarksHtml(await file.text());
    const result = await repo.importStructure(imported);
    setStatus(`Imported ${result.cards} tabs into ${result.collections} collections from ${file.name}.`);
  };

  const importFile = async (file: File) => {
    const backup = parseBackup(await file.text());
    const current = await db.cards.count();
    const message = `Replace ALL current data (${current} tabs) with this backup (${backup.cards.length} tabs, ${backup.collections.length} collections)? This cannot be undone.`;
    if (!confirm(message)) return;
    await restoreBackup(db, backup);
    setStatus(`Restored ${backup.cards.length} tabs from ${file.name}.`);
  };

  const setAutoBackup = (enabled: boolean, intervalHours: number) =>
    guard('Auto-backup', async () => {
      if (enabled) {
        const granted =
          (await platform.permissions.request('alarms')) && (await platform.permissions.request('downloads'));
        if (!granted) throw new Error('Auto-backup needs the "alarms" and "downloads" permissions.');
      }
      await updateSettings(db, { autoBackup: { enabled, intervalHours } });
      await platform.backupSchedule.resync();
      setStatus(enabled ? 'Auto-backup enabled. Files are saved to Downloads/Tabarium.' : 'Auto-backup disabled.');
    })();

  const saveAi = guard('Saving AI settings', async () => {
    if (aiDraft === null) return;
    await updateSettings(db, { ai: aiDraft });
    setAiDraft(null);
    setStatus('AI settings saved.');
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {status && (
        <p role="status" className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-primary">
          {status}
        </p>
      )}

      <Section title="Backup" description="Your library lives only in this browser. Keep a copy you control.">
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={exportNow}>
            <Download size={16} aria-hidden /> Export to file
          </button>
          <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()}>
            <Upload size={16} aria-hidden /> Import from file
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label="Backup file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) guard('Import', () => importFile(file))();
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="mr-2 text-sm font-semibold">Other formats</span>
          <button type="button" className={buttonClass} onClick={() => exportAs('html')}>
            <Download size={16} aria-hidden /> Bookmarks (HTML)
          </button>
          <button type="button" className={buttonClass} onClick={() => exportAs('txt')}>
            <Download size={16} aria-hidden /> Text
          </button>
          <button type="button" className={buttonClass} onClick={() => bookmarksInput.current?.click()}>
            <Upload size={16} aria-hidden /> Import bookmarks (HTML)
          </button>
          <input
            ref={bookmarksInput}
            type="file"
            accept="text/html,.html,.htm"
            className="hidden"
            aria-label="Bookmarks file"
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) guard('Import', () => importBookmarks(file))();
            }}
          />
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">Automatic backup</p>
            <p className="text-xs text-muted">
              {settings.lastBackupAt
                ? `Last backup: ${new Date(settings.lastBackupAt).toLocaleString()}`
                : 'Saves a JSON file to Downloads/Tabarium on a schedule.'}
            </p>
          </div>
          <select
            aria-label="Backup interval"
            value={settings.autoBackup.intervalHours}
            disabled={!settings.autoBackup.enabled}
            onChange={(e) => setAutoBackup(true, Number(e.target.value))}
            className="h-10 rounded-lg border border-line bg-bg px-3 text-sm disabled:opacity-50"
          >
            {INTERVALS.map((i) => (
              <option key={i.hours} value={i.hours}>
                {i.label}
              </option>
            ))}
          </select>
          <Switch
            checked={settings.autoBackup.enabled}
            label="Automatic backup"
            onChange={(v) => setAutoBackup(v, settings.autoBackup.intervalHours)}
          />
        </div>
      </Section>

      <Section title="Appearance" description="Follows your system by default.">
        <div role="radiogroup" aria-label="Theme" className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((t) => (
            <button
              key={t}
              type="button"
              role="radio"
              aria-checked={settings.theme === t}
              onClick={guard('Theme', async () => void (await updateSettings(db, { theme: t })))}
              className={`h-10 flex-1 rounded-lg border text-sm font-semibold capitalize transition-colors duration-150 ${
                settings.theme === t ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:bg-surface-2'
              }`}
            >
              {t}
            </button>
          ))}
        </div>
      </Section>

      <Section
        title="AI assistant"
        description="Optional. Bring your own provider and key; requests go straight from your browser to the provider."
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">Provider</span>
          <select
            value={ai.provider ?? ''}
            onChange={(e) =>
              setAiDraft({ ...ai, provider: e.target.value === '' ? null : (e.target.value as (typeof AI_PROVIDERS)[number]) })
            }
            className={inputClass}
          >
            <option value="">Off</option>
            {AI_PROVIDERS.map((p) => (
              <option key={p} value={p}>
                {PROVIDER_LABELS[p]}
              </option>
            ))}
          </select>
        </label>
        {ai.provider !== null && (
          <>
            {ai.provider === 'custom' && (
              <label className="block">
                <span className="mb-1.5 block text-sm font-semibold">Base URL</span>
                <input
                  value={ai.baseUrl}
                  onChange={(e) => setAiDraft({ ...ai, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">Model</span>
              <input value={ai.model} onChange={(e) => setAiDraft({ ...ai, model: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">API key</span>
              <span className="relative block">
                <input
                  type={showKey ? 'text' : 'password'}
                  autoComplete="off"
                  value={ai.apiKey}
                  onChange={(e) => setAiDraft({ ...ai, apiKey: e.target.value })}
                  className={`${inputClass} pr-11`}
                />
                <button
                  type="button"
                  aria-label={showKey ? 'Hide key' : 'Show key'}
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"
                >
                  {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </span>
              <span className="mt-1 block text-xs text-muted">
                Stored only in this browser. It is never included in backups and never sent anywhere except your provider.
              </span>
            </label>
          </>
        )}
        <div>
          <button type="button" disabled={aiDraft === null} onClick={saveAi} className={buttonClass}>
            Save AI settings
          </button>
        </div>
      </Section>
    </div>
  );
}
