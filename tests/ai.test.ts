import { describe, expect, it } from 'vitest';
import { AiError, assertConfigured, complete, type FetchLike, providerOrigin } from '../src/core/ai/client';
import { extractJson, groupTabs, suggestCollectionNames } from '../src/core/ai/tasks';
import type { Settings } from '../src/core/settings';

type Ai = Settings['ai'];
const cfg = (over: Partial<Ai>): Ai => ({ provider: 'openai', model: 'm', baseUrl: '', apiKey: 'k', ...over });

interface Call {
  url: string;
  headers: Record<string, string>;
  body: Record<string, unknown>;
}

function fakeFetch(reply: unknown, status = 200): { fetch: FetchLike; calls: Call[] } {
  const calls: Call[] = [];
  const fetch: FetchLike = async (url, init) => {
    calls.push({ url, headers: init.headers as Record<string, string>, body: JSON.parse(init.body as string) });
    return new Response(typeof reply === 'string' ? reply : JSON.stringify(reply), { status });
  };
  return { fetch, calls };
}

const openaiReply = (text: string) => ({ choices: [{ message: { content: text } }] });

describe('provider requests', () => {
  it('openai: bearer auth and chat messages', async () => {
    const { fetch, calls } = fakeFetch(openaiReply('hi'));
    expect(await complete(cfg({}), { system: 's', prompt: 'p' }, fetch)).toBe('hi');
    expect(calls[0]?.url).toBe('https://api.openai.com/v1/chat/completions');
    expect(calls[0]?.headers.authorization).toBe('Bearer k');
    expect(calls[0]?.body).toMatchObject({ model: 'm', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'p' }] });
  });

  it('anthropic: x-api-key header and top-level system prompt', async () => {
    const { fetch, calls } = fakeFetch({ content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] });
    expect(await complete(cfg({ provider: 'anthropic' }), { system: 's', prompt: 'p' }, fetch)).toBe('ab');
    expect(calls[0]?.url).toBe('https://api.anthropic.com/v1/messages');
    expect(calls[0]?.headers['x-api-key']).toBe('k');
    expect(calls[0]?.headers['anthropic-version']).toBe('2023-06-01');
    expect(calls[0]?.body).toMatchObject({ system: 's', messages: [{ role: 'user', content: 'p' }] });
  });

  it('google: key goes in a header, never in the URL', async () => {
    const { fetch, calls } = fakeFetch({ candidates: [{ content: { parts: [{ text: 'g' }] } }] });
    expect(await complete(cfg({ provider: 'google', model: 'gemini-x' }), { system: 's', prompt: 'p' }, fetch)).toBe('g');
    expect(calls[0]?.url).toBe('https://generativelanguage.googleapis.com/v1beta/models/gemini-x:generateContent');
    expect(calls[0]?.url).not.toContain('k');
    expect(calls[0]?.headers['x-goog-api-key']).toBe('k');
  });

  it('openrouter and custom endpoints', async () => {
    const a = fakeFetch(openaiReply('x'));
    await complete(cfg({ provider: 'openrouter' }), { system: 's', prompt: 'p' }, a.fetch);
    expect(a.calls[0]?.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    const b = fakeFetch(openaiReply('x'));
    await complete(cfg({ provider: 'custom', baseUrl: 'http://localhost:11434/v1/' }), { system: 's', prompt: 'p' }, b.fetch);
    expect(b.calls[0]?.url).toBe('http://localhost:11434/v1/chat/completions');
  });

  it('surfaces provider errors without retrying', async () => {
    const { fetch, calls } = fakeFetch('{"error":"bad key"}', 401);
    await expect(complete(cfg({}), { system: 's', prompt: 'p' }, fetch)).rejects.toMatchObject({ status: 401 });
    expect(calls).toHaveLength(1);
  });

  it('rejects empty answers', async () => {
    const { fetch } = fakeFetch(openaiReply('  '));
    await expect(complete(cfg({}), { system: 's', prompt: 'p' }, fetch)).rejects.toThrow(/empty answer/);
  });
});

describe('configuration checks', () => {
  it('names what is missing', () => {
    expect(() => assertConfigured(cfg({ provider: null }))).toThrow(/turned off/);
    expect(() => assertConfigured(cfg({ apiKey: ' ' }))).toThrow(/API key/);
    expect(() => assertConfigured(cfg({ model: '' }))).toThrow(/model/);
    expect(() => assertConfigured(cfg({ provider: 'custom', baseUrl: '' }))).toThrow(/base URL/);
  });
  it('reports the origin to request access for', () => {
    expect(providerOrigin(cfg({ provider: 'anthropic' }))).toBe('https://api.anthropic.com');
    expect(providerOrigin(cfg({ provider: 'custom', baseUrl: 'https://llm.example.com/v1' }))).toBe('https://llm.example.com');
  });
});

describe('tasks', () => {
  it('extracts JSON from fenced or chatty answers', () => {
    expect(extractJson('```json\n["a","b"]\n```')).toEqual(['a', 'b']);
    expect(extractJson('Sure! Here you go: ["a"] hope it helps')).toEqual(['a']);
    expect(() => extractJson('no json here')).toThrow(AiError);
    expect(() => extractJson('[oops')).toThrow(/not valid JSON/);
  });

  it('suggests collection names', async () => {
    const { fetch } = fakeFetch(openaiReply('["Rust basics","Rust basics","Learning Rust"]'));
    const names = await suggestCollectionNames(cfg({}), [{ title: 'Rust book', url: 'https://doc.rust-lang.org/book/' }], fetch);
    expect(names).toEqual(['Rust basics', 'Learning Rust']);
  });

  it('rejects a non-list answer', async () => {
    const { fetch } = fakeFetch(openaiReply('{"a":1}'));
    await expect(suggestCollectionNames(cfg({}), [{ title: 't', url: 'https://t.dev' }], fetch)).rejects.toThrow(/list of names/);
  });

  it('groups tabs: ignores bad and duplicate indexes and puts leftovers in "Other"', async () => {
    const pages = ['a', 'b', 'c', 'd'].map((t) => ({ title: t, url: `https://${t}.dev` }));
    const reply = '[{"title":"First","tabs":[1,2,99]},{"title":"Second","tabs":[2,3]}]';
    const { fetch } = fakeFetch(openaiReply(reply));
    expect(await groupTabs(cfg({}), pages, fetch)).toEqual([
      { title: 'First', indexes: [0, 1] },
      { title: 'Second', indexes: [2] },
      { title: 'Other', indexes: [3] },
    ]);
  });

  it('refuses to call the model for empty input', async () => {
    await expect(groupTabs(cfg({}), [])).rejects.toThrow(/no tabs/);
    await expect(suggestCollectionNames(cfg({}), [])).rejects.toThrow(/empty/);
  });
});
