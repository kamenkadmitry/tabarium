import { useLiveQuery } from 'dexie-react-hooks';
import { Download, Eye, EyeOff, Upload } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { exportBackup, parseBackup, restoreBackup } from '../core/backup';
import { parseBookmarksHtml, toBookmarksHtml, toPlainText } from '../core/formats';
import { parseTobyFile, toTobyJson } from '../core/toby';
import { db, repo } from '../core/instance';
import { AI_PROVIDERS, loadSettings, recordBackup, type Settings, updateSettings } from '../core/settings';
import { usePlatform } from '../platform/context';
import { backupFilename, downloadTextFile } from '../platform/files';
import type { ShortcutInfo } from '../platform/ports';
import { detectProviderFromKey } from '../core/ai/client';
import { testConnection } from '../core/ai/tasks';
import { isAiConfigured, withProviderAccess } from './ai';
import { avatarFromFile } from './avatar';
import { inputClass } from './Dialog';
import { PALETTES } from './palettes';
import { useT } from '../i18n/I18nProvider';
import { LOCALE_NAMES } from '../i18n/locale';
import type { StringKey } from '../i18n/messages';
import { tr } from '../i18n/runtime';

const PROVIDER_LABELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  anthropic: 'Anthropic (Claude)',
  openai: 'OpenAI',
  google: 'Google (Gemini)',
  openrouter: 'OpenRouter',
  custom: 'Custom (OpenAI-compatible)',
};

/** Suggested model per provider, offered when the field is empty. The value stays visible and editable. */
const SUGGESTED_MODELS: Record<(typeof AI_PROVIDERS)[number], string> = {
  anthropic: 'claude-haiku-5-5',
  openai: 'gpt-4o-mini',
  google: 'gemini-2.0-flash',
  openrouter: 'openrouter/auto',
  custom: '',
};

const INTERVALS: readonly { hours: number; label: Extract<StringKey, `set.auto.${string}`> }[] = [
  { hours: 6, label: 'set.auto.every6h' },
  { hours: 12, label: 'set.auto.every12h' },
  { hours: 24, label: 'set.auto.daily' },
  { hours: 168, label: 'set.auto.weekly' },
];

const THEME_KEYS: Record<Settings['theme'], Extract<StringKey, `set.theme.${string}`>> = {
  system: 'set.theme.system',
  light: 'set.theme.light',
  dark: 'set.theme.dark',
};

function Section(props: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-line bg-surface">
      <div className="border-b border-line px-5 py-4">
        <h2 className="text-base font-bold">{props.title}</h2>
        {props.description !== undefined && <p className="mt-0.5 text-sm text-muted">{props.description}</p>}
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
  const t = useT();
  const platform = usePlatform();
  const settings = useLiveQuery(() => loadSettings(db), []);
  const fileInput = useRef<HTMLInputElement>(null);
  const bookmarksInput = useRef<HTMLInputElement>(null);
  const avatarInput = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);
  const [aiDraft, setAiDraft] = useState<Settings['ai'] | null>(null);
  const [shortcuts, setShortcuts] = useState<ShortcutInfo[]>([]);
  useEffect(() => {
    void platform.shortcuts.list().then(setShortcuts);
  }, [platform]);

  // Palette swatches preview the theme that is actually on screen, so "system" resolves to light or dark.
  const [systemDark, setSystemDark] = useState(() => window.matchMedia('(prefers-color-scheme: dark)').matches);
  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => setSystemDark(mq.matches);
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, []);

  if (!settings) return null;
  const effectiveTheme = settings.theme === 'system' ? (systemDark ? 'dark' : 'light') : settings.theme;
  const ai = aiDraft ?? settings.ai;
  const keyBelongsTo = detectProviderFromKey(ai.apiKey);
  const keyMismatch = ai.provider !== null && ai.provider !== 'custom' && keyBelongsTo !== null && keyBelongsTo !== ai.provider;
  const missing: StringKey[] = [
    ai.apiKey.trim() === '' ? 'set.ai.missing.apiKey' : null,
    ai.model.trim() === '' ? 'set.ai.missing.model' : null,
    ai.provider === 'custom' && ai.baseUrl.trim() === '' ? 'set.ai.missing.baseUrl' : null,
  ].filter((x): x is StringKey => x !== null);

  const guard = (what: string, fn: () => Promise<void>) => () => {
    setStatus(null);
    fn().catch((e: unknown) => onError(what, e));
  };

  const exportNow = guard(t('run.export'), async () => {
    const backup = await exportBackup(db);
    downloadTextFile(backupFilename(), JSON.stringify(backup, null, 2));
    await recordBackup(db);
    setStatus(t('set.backup.exported', { tabs: t.plural('count.tabs', backup.cards.length), collections: t.plural('count.collections', backup.collections.length) }));
  });

  const exportAs = (format: 'html' | 'txt' | 'toby') =>
    guard(t('run.export'), async () => {
      const backup = await exportBackup(db);
      const base = backupFilename().replace(/\.json$/, '');
      if (format === 'html') downloadTextFile(`${base}.html`, toBookmarksHtml(backup), 'text/html');
      else if (format === 'txt') downloadTextFile(`${base}.txt`, toPlainText(backup), 'text/plain');
      else downloadTextFile(`${base}-toby.json`, toTobyJson(backup));
      setStatus(t('set.backup.exportedAs', { tabs: t.plural('count.tabs', backup.cards.length), format: format === 'toby' ? 'Toby-compatible JSON' : format.toUpperCase() }));
    })();

  /** Browser bookmarks (.html with folders) or a Toby export (.json, .txt, flat .html). */
  const importBookmarks = async (file: File) => {
    const text = await file.text();
    const isNetscape = /<!DOCTYPE NETSCAPE-Bookmark-file/i.test(text) || /<dl\b/i.test(text);
    const imported = file.name.toLowerCase().endsWith('.html') || file.name.toLowerCase().endsWith('.htm')
      ? isNetscape
        ? parseBookmarksHtml(text)
        : parseTobyFile(file.name, text)
      : parseTobyFile(file.name, text);
    const result = await repo.importStructure(imported);
    setStatus(t('set.backup.imported', { tabs: t.plural('count.tabs', result.cards), collections: t.plural('count.collections', result.collections), file: file.name }));
  };

  const importFile = async (file: File) => {
    const text = await file.text();
    // A Toby export or bookmarks file is not a backup: add it to the library instead of replacing everything.
    if (!/"app"\s*:\s*"tabarium"/.test(text)) {
      await importBookmarks(file);
      return;
    }
    const backup = parseBackup(text);
    const current = await db.cards.count();
    const message = t('set.backup.replaceConfirm', {
      current: t.plural('count.tabs', current),
      summary: `${t.plural('count.tabs', backup.cards.length)}, ${t.plural('count.collections', backup.collections.length)}`,
    });
    if (!confirm(message)) return;
    await restoreBackup(db, backup);
    setStatus(t('set.backup.restored', { tabs: t.plural('count.tabs', backup.cards.length), file: file.name }));
  };

  const setAutoBackup = (enabled: boolean, intervalHours: number) =>
    guard(t('run.autoBackup'), async () => {
      if (enabled) {
        const granted =
          (await platform.permissions.request('alarms')) && (await platform.permissions.request('downloads'));
        if (!granted) throw new Error(tr()('err.needAlarmsDownloads'));
      }
      await updateSettings(db, { autoBackup: { enabled, intervalHours } });
      await platform.backupSchedule.resync();
      setStatus(enabled ? t('set.auto.enabled') : t('set.auto.disabled'));
    })();

  const setToolbar = (quickPanel: 'side' | 'popup') =>
    guard(t('run.toolbarButton'), async () => {
      await updateSettings(db, { quickPanel });
      await platform.backupSchedule.resync();
      setStatus(quickPanel === 'side' ? t('set.toolbar.nowSide') : t('set.toolbar.nowPopup'));
    })();

  const setContextMenu = (enabled: boolean) =>
    guard(t('run.contextMenuSetting'), async () => {
      if (enabled && !(await platform.permissions.request('contextMenus'))) {
        throw new Error(tr()('err.needContextMenus'));
      }
      await updateSettings(db, { contextMenu: enabled });
      await platform.backupSchedule.resync();
      setStatus(enabled ? t('set.context.enabled') : t('set.context.disabled'));
    })();

  const setTabGroups = (enabled: boolean) =>
    guard(t('run.tabGroupsSetting'), async () => {
      if (enabled && !(await platform.permissions.request('tabGroups'))) {
        throw new Error(tr()('err.needTabGroupsSetting'));
      }
      await updateSettings(db, { tabGroups: enabled });
      setStatus(enabled ? t('set.tabGroups.enabled') : t('set.tabGroups.disabled'));
    })();

  const testAi = guard(t('run.aiConnectionTest'), async () => {
    await withProviderAccess(platform, settings.ai, () => testConnection(settings.ai));
    setStatus(t('set.ai.testOk'));
  });

  const saveAi = guard(t('run.savingAiSettings'), async () => {
    if (aiDraft === null) return;
    await updateSettings(db, { ai: aiDraft });
    setAiDraft(null);
    setStatus(t('set.ai.saved'));
  });

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-5">
      {status && (
        <p role="status" className="rounded-lg bg-surface-2 px-4 py-2 text-sm font-medium text-primary">
          {status}
        </p>
      )}

      <Section title={t('set.backup.title')} description={t('set.backup.desc')}>
        <div className="flex flex-wrap gap-2">
          <button type="button" className={buttonClass} onClick={exportNow}>
            <Download size={16} aria-hidden /> {t('set.backup.export')}
          </button>
          <button type="button" className={buttonClass} onClick={() => fileInput.current?.click()}>
            <Upload size={16} aria-hidden /> {t('set.backup.import')}
          </button>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="hidden"
            aria-label={t('set.backup.file')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) guard(t('run.import'), () => importFile(file))();
            }}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-4">
          <span className="mr-2 text-sm font-semibold">{t('set.backup.otherFormats')}</span>
          <button type="button" className={buttonClass} onClick={() => exportAs('html')}>
            <Download size={16} aria-hidden /> {t('set.backup.bookmarksHtml')}
          </button>
          <button type="button" className={buttonClass} onClick={() => exportAs('txt')}>
            <Download size={16} aria-hidden /> {t('set.backup.text')}
          </button>
          <button type="button" className={buttonClass} onClick={() => exportAs('toby')}>
            <Download size={16} aria-hidden /> {t('set.backup.tobyJson')}
          </button>
          <button type="button" className={buttonClass} onClick={() => bookmarksInput.current?.click()}>
            <Upload size={16} aria-hidden /> {t('set.backup.importFile')}
          </button>
          <input
            ref={bookmarksInput}
            type="file"
            accept=".html,.htm,.json,.txt"
            className="hidden"
            aria-label={t('set.backup.importFileAria')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) guard(t('run.import'), () => importBookmarks(file))();
            }}
          />
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('set.auto.title')}</p>
            <p className="text-xs text-muted">
              {settings.lastBackupAt
                ? t('set.auto.lastBackup', { date: t.time(settings.lastBackupAt) })
                : t('set.auto.desc')}
            </p>
          </div>
          <select
            aria-label={t('set.auto.interval')}
            value={settings.autoBackup.intervalHours}
            disabled={!settings.autoBackup.enabled}
            onChange={(e) => setAutoBackup(true, Number(e.target.value))}
            className="h-10 rounded-lg border border-line bg-bg px-3 text-sm disabled:opacity-50"
          >
            {INTERVALS.map((i) => (
              <option key={i.hours} value={i.hours}>
                {t(i.label)}
              </option>
            ))}
          </select>
          <Switch
            checked={settings.autoBackup.enabled}
            label={t('set.auto.switch')}
            onChange={(v) => setAutoBackup(v, settings.autoBackup.intervalHours)}
          />
        </div>
      </Section>

      <Section title={t('set.browser.title')} description={t('set.browser.desc')}>
        <div className="flex items-center gap-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('set.toolbar.title')}</p>
            <p className="text-xs text-muted">{t('set.toolbar.desc')}</p>
          </div>
          <div role="radiogroup" aria-label={t('set.toolbar.aria')} className="flex gap-1">
            {(['side', 'popup'] as const).map((mode) => (
              <button
                key={mode}
                type="button"
                role="radio"
                aria-checked={settings.quickPanel === mode}
                onClick={() => setToolbar(mode)}
                className={`h-9 rounded-lg border px-3 text-sm font-semibold transition-colors duration-150 ${
                  settings.quickPanel === mode ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:bg-surface-2'
                }`}
              >
                {mode === 'side' ? t('set.toolbar.side') : t('set.toolbar.popup')}
              </button>
            ))}
          </div>
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('set.context.title')}</p>
            <p className="text-xs text-muted">{t('set.context.desc')}</p>
          </div>
          <Switch checked={settings.contextMenu} label={t('set.context.switch')} onChange={setContextMenu} />
        </div>
        <div className="flex items-center gap-4 border-t border-line pt-4">
          <div className="flex-1">
            <p className="text-sm font-semibold">{t('set.tabGroups.title')}</p>
            <p className="text-xs text-muted">{t('set.tabGroups.desc')}</p>
          </div>
          <Switch checked={settings.tabGroups} label={t('set.tabGroups.switch')} onChange={setTabGroups} />
        </div>
      </Section>

      <Section title={t('set.profile.title')} description={t('set.profile.desc')}>
        <div className="flex items-center gap-4">
          {settings.profile.avatar ? (
            <img src={settings.profile.avatar} alt={t('set.profile.avatarAlt')} className="size-16 rounded-full object-cover" />
          ) : (
            <span className="grid size-16 place-items-center rounded-full bg-surface-2 text-xl font-bold text-primary">
              {settings.profile.name[0]?.toUpperCase() ?? '?'}
            </span>
          )}
          <div className="flex flex-wrap gap-2">
            <button type="button" className={buttonClass} onClick={() => avatarInput.current?.click()}>
              <Upload size={16} aria-hidden /> {t('set.profile.chooseAvatar')}
            </button>
            {settings.profile.avatar && (
              <button
                type="button"
                className={buttonClass}
                onClick={guard(t('run.removingAvatar'), async () => void (await updateSettings(db, { profile: { ...settings.profile, avatar: null } })))}
              >
                {t('set.profile.remove')}
              </button>
            )}
          </div>
          <input
            ref={avatarInput}
            type="file"
            accept="image/*"
            hidden
            aria-label={t('set.profile.avatarFile')}
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = '';
              if (file) {
                guard(t('run.settingAvatar'), async () => {
                  const avatar = await avatarFromFile(file);
                  await updateSettings(db, { profile: { ...settings.profile, avatar } });
                })();
              }
            }}
          />
        </div>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {t('set.profile.name')}
          <input
            key={settings.profile.name}
            defaultValue={settings.profile.name}
            maxLength={40}
            placeholder={t('set.profile.namePlaceholder')}
            className={inputClass}
            onBlur={(e) => {
              const name = e.target.value.trim();
              if (name !== settings.profile.name) {
                guard(t('run.savingName'), async () => void (await updateSettings(db, { profile: { ...settings.profile, name } })))();
              }
            }}
          />
        </label>
      </Section>

      <Section title={t('set.appearance.title')} description={t('set.appearance.desc')}>
        <div role="radiogroup" aria-label={t('set.theme.aria')} className="flex gap-2">
          {(['system', 'light', 'dark'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={settings.theme === v}
              onClick={guard(t('run.theme'), async () => void (await updateSettings(db, { theme: v })))}
              className={`h-10 flex-1 rounded-lg border text-sm font-semibold capitalize transition-colors duration-150 ${
                settings.theme === v ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:bg-surface-2'
              }`}
            >
              {t(THEME_KEYS[v])}
            </button>
          ))}
        </div>
        <div role="radiogroup" aria-label={t('set.palette.aria')} className="mt-4 flex flex-wrap gap-3">
          {PALETTES.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={settings.palette === p.id}
              aria-label={t(p.key)}
              title={t(p.key)}
              onClick={guard(t('run.colourPalette'), async () => void (await updateSettings(db, { palette: p.id })))}
              className={`grid size-11 place-items-center rounded-full transition-shadow duration-150 ${
                settings.palette === p.id ? 'ring-2 ring-primary ring-offset-2 ring-offset-surface' : 'hover:ring-2 hover:ring-line hover:ring-offset-2 hover:ring-offset-surface'
              }`}
            >
              {/* The swatch carries the palette+theme attrs itself, so the quadrant disc previews real tokens. */}
              <span
                aria-hidden
                data-palette={p.id}
                data-theme={effectiveTheme}
                className="size-9 rounded-full border border-line"
                style={{ background: 'conic-gradient(var(--bg) 0 25%, var(--surface) 0 50%, var(--accent) 0 75%, var(--primary) 0)' }}
              />
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('set.language.title')}>
        <div role="radiogroup" aria-label={t('set.language.title')} className="flex gap-2">
          {(['system', 'en', 'ru', 'pl', 'be'] as const).map((v) => (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={settings.language === v}
              onClick={guard(t('run.savingSetting'), async () => void (await updateSettings(db, { language: v })))}
              className={`h-10 flex-1 rounded-lg border text-sm font-semibold capitalize transition-colors duration-150 ${
                settings.language === v ? 'border-primary bg-primary text-primary-fg' : 'border-line hover:bg-surface-2'
              }`}
            >
              {v === 'system' ? t('set.language.system') : LOCALE_NAMES[v]}
            </button>
          ))}
        </div>
      </Section>

      <Section title={t('set.shortcuts.title')} description={t('set.shortcuts.desc')}>
        <ul className="space-y-1.5">
          {shortcuts.map((s) => (
            <li key={s.name} className="flex items-center justify-between gap-3 text-sm">
              <span>{s.description}</span>
              <kbd className="rounded border border-line bg-surface-2 px-1.5 py-0.5 font-mono text-xs">{s.shortcut || t('set.shortcuts.notSet')}</kbd>
            </li>
          ))}
        </ul>
        <p className="mt-2 text-xs text-muted">
          {t('set.shortcuts.editAt')} <span className="font-mono">chrome://extensions/shortcuts</span>
        </p>
      </Section>

      <Section
        title={t('set.ai.title')}
        description={t('set.ai.desc')}
      >
        <p className="rounded-lg bg-surface-2 px-3 py-2 text-xs text-muted">
          {t('set.ai.intro')}
        </p>
        <label className="block">
          <span className="mb-1.5 block text-sm font-semibold">{t('set.ai.provider')}</span>
          <select
            value={ai.provider ?? ''}
            onChange={(e) => {
              const provider = e.target.value === '' ? null : (e.target.value as (typeof AI_PROVIDERS)[number]);
              setAiDraft({ ...ai, provider, model: ai.model.trim() === '' && provider ? SUGGESTED_MODELS[provider] : ai.model });
            }}
            className={inputClass}
          >
            <option value="">{t('set.ai.off')}</option>
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
                <span className="mb-1.5 block text-sm font-semibold">{t('set.ai.baseUrl')}</span>
                <input
                  value={ai.baseUrl}
                  onChange={(e) => setAiDraft({ ...ai, baseUrl: e.target.value })}
                  placeholder="https://api.example.com/v1"
                  className={inputClass}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">{t('set.ai.model')}</span>
              <input value={ai.model} onChange={(e) => setAiDraft({ ...ai, model: e.target.value })} className={inputClass} />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-sm font-semibold">{t('set.ai.apiKey')}</span>
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
                  aria-label={showKey ? t('set.ai.hideKey') : t('set.ai.showKey')}
                  onClick={() => setShowKey((v) => !v)}
                  className="absolute right-1 top-1 grid size-9 place-items-center rounded-lg text-muted hover:bg-surface-2"
                >
                  {showKey ? <EyeOff size={16} aria-hidden /> : <Eye size={16} aria-hidden />}
                </button>
              </span>
              {keyMismatch && keyBelongsTo && (
                <span role="alert" className="mt-1 flex flex-wrap items-center gap-2 text-xs font-semibold text-danger">
                  {t('set.ai.keyMismatch', {
                    belongs: PROVIDER_LABELS[keyBelongsTo],
                    selected: PROVIDER_LABELS[ai.provider as keyof typeof PROVIDER_LABELS],
                  })}
                  <button
                    type="button"
                    className="rounded-md border border-line px-2 py-1 text-fg"
                    onClick={() =>
                      setAiDraft({ ...ai, provider: keyBelongsTo, model: SUGGESTED_MODELS[keyBelongsTo] })
                    }
                  >
                    {t('set.ai.switchTo', { provider: PROVIDER_LABELS[keyBelongsTo] })}
                  </button>
                </span>
              )}
              <span className="mt-1 block text-xs text-muted">
                {t('set.ai.note')}
              </span>
            </label>
          </>
        )}
        <p role="note" className={`text-sm font-medium ${missing.length === 0 ? 'text-primary' : 'text-muted'}`}>
          {aiDraft !== null
            ? t('set.ai.unsaved')
            : ai.provider === null
              ? t('set.ai.statusOff')
              : missing.length === 0
                ? t('set.ai.statusReady')
                : t('set.ai.statusMissing', { missing: missing.map((m) => t(m)).join(', ') })}
        </p>
        <div className="flex flex-wrap gap-2">
          <button type="button" disabled={aiDraft === null} onClick={saveAi} className={buttonClass}>
            {t('set.ai.save')}
          </button>
          <button type="button" disabled={aiDraft !== null || !isAiConfigured(settings.ai)} onClick={testAi} className={buttonClass}>
            {t('set.ai.test')}
          </button>
        </div>
      </Section>
    </div>
  );
}
