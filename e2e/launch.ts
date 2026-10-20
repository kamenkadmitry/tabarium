import { chromium, type BrowserContext, type Worker } from '@playwright/test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

/** The `e2e` build declares every optional permission up front so prompts never block the tests. */
const extensionPath = path.resolve('.output/chrome-mv3-e2e');

export interface Launched {
  context: BrowserContext;
  worker: Worker;
  extensionId: string;
  workerErrors: string[];
}

export async function launchExtension(): Promise<Launched> {
  const context = await chromium.launchPersistentContext(mkdtempSync(path.join(tmpdir(), 'tabarium-e2e-')), {
    headless: false,
    args: [`--disable-extensions-except=${extensionPath}`, `--load-extension=${extensionPath}`, '--headless=new'],
  });
  const worker = context.serviceWorkers()[0] ?? (await context.waitForEvent('serviceworker'));
  const workerErrors: string[] = [];
  worker.on('console', (m) => m.type() === 'error' && workerErrors.push(m.text()));

  // Pretend web: every https://example.test page answers with a small document titled after its path.
  await context.route('https://example.test/**', (route) => {
    const name = new URL(route.request().url()).pathname.slice(1) || 'home';
    return route.fulfill({ contentType: 'text/html', body: `<title>Page ${name}</title><h1>${name}</h1>` });
  });
  return { context, worker, extensionId: new URL(worker.url()).host, workerErrors };
}

export const page = (name: string) => `https://example.test/${name}`;
