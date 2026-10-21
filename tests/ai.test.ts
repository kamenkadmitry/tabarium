import { describe, expect, it } from 'vitest';
import { AiError, assertConfigured, complete, detectProviderFromKey, type FetchLike, providerOrigin } from '../src/core/ai/client';
import { extractJson, groupTabs, MAX_DETAILS_PER_REQUEST, proposeTabGroups, suggestCardDetails, suggestCollectionNames, testConnection } from '../src/core/ai/tasks';
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

  it('rejects empty answers and explains why', async () => {
    const { fetch } = fakeFetch({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    await expect(complete(cfg({}), { system: 's', prompt: 'p' }, fetch)).rejects.toThrow(/no text \(finish reason: length\).*non-reasoning/);
  });

  it('treats a null content (tool-style or reasoning replies) as empty, not a crash', async () => {
    const { fetch } = fakeFetch({ choices: [{ message: { content: null }, finish_reason: 'stop' }] });
    await expect(complete(cfg({}), { system: 's', prompt: 'p' }, fetch)).rejects.toThrow(/no text/);
  });

  it('can accept an empty answer when only the round trip matters', async () => {
    const { fetch } = fakeFetch(openaiReply(''));
    expect(await complete(cfg({}), { system: 's', prompt: 'p' }, fetch, { allowEmpty: true })).toBe('');
  });

  it('openai gets max_completion_tokens, other providers keep max_tokens', async () => {
    const a = fakeFetch(openaiReply('x'));
    await complete(cfg({ provider: 'openai' }), { system: 's', prompt: 'p', maxTokens: 50 }, a.fetch);
    expect(a.calls[0]?.body).toMatchObject({ max_completion_tokens: 50 });
    expect(a.calls[0]?.body).not.toHaveProperty('max_tokens');
    const b = fakeFetch(openaiReply('x'));
    await complete(cfg({ provider: 'openrouter' }), { system: 's', prompt: 'p', maxTokens: 50 }, b.fetch);
    expect(b.calls[0]?.body).toMatchObject({ max_tokens: 50 });
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

describe('key prefix detection', () => {
  it('recognises well-known prefixes and stays silent otherwise', () => {
    expect(detectProviderFromKey('sk-or-v1-abc')).toBe('openrouter');
    expect(detectProviderFromKey('sk-ant-api03-abc')).toBe('anthropic');
    expect(detectProviderFromKey('AIzaSyabc')).toBe('google');
    expect(detectProviderFromKey('sk-proj-abc')).toBe('openai');
    expect(detectProviderFromKey('  sk-or-x  ')).toBe('openrouter');
    expect(detectProviderFromKey('custom-token')).toBeNull();
    expect(detectProviderFromKey('')).toBeNull();
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
      { title: 'First', indexes: [0, 1], tags: [], hashtags: [] },
      { title: 'Second', indexes: [2], tags: [], hashtags: [] },
      { title: 'Other', indexes: [3], tags: [], hashtags: [] },
    ]);
  });

  it('groups tabs: tells the model what exists and keeps only existing tags and clean hashtags', async () => {
    const pages = ['a', 'b'].map((t) => ({ title: t, url: `https://${t}.dev` }));
    const reply = JSON.stringify([
      { title: 'reading list', tabs: [1], tags: ['work', 'Invented'], hashtags: ['#Machine Learning', 'ai', 'ai', 'x y z', 'four'] },
      { title: 'New one', tabs: [2] },
    ]);
    const { fetch, calls } = fakeFetch(openaiReply(reply));
    const groups = await groupTabs(cfg({}), pages, fetch, { collections: ['Reading List'], tags: ['Work'], hashtags: ['ai', 'rust'] });

    const prompt = JSON.stringify(calls[0]?.body);
    expect(prompt).toContain('Existing collections: Reading List');
    expect(prompt).toContain('Existing tags: Work');
    expect(prompt).toContain('Existing hashtags: ai, rust');
    expect(groups[0]).toEqual({ title: 'Reading List', indexes: [0], tags: ['Work'], hashtags: ['machine-learning', 'ai', 'x-y-z'] });
    expect(groups[1]).toMatchObject({ title: 'New one', tags: [], hashtags: [] });
  });

  it('card details: one entry per link, existing tags only, clean hashtags, long notes cut, missing entries empty', async () => {
    const pages = ['a', 'b', 'c'].map((t) => ({ title: t, url: `https://${t}.dev` }));
    const reply = JSON.stringify([
      { n: 1, note: 'x'.repeat(300), tags: ['work', 'Invented'], hashtags: ['#Machine Learning', 'ai', 'ai', 'a', 'b'] },
      { n: 2, note: '  A guide.  ' },
    ]);
    const { fetch, calls } = fakeFetch(openaiReply(reply));
    const out = await suggestCardDetails(cfg({}), pages, { tags: ['Work'], hashtags: ['ai'] }, fetch);

    const prompt = JSON.stringify(calls[0]?.body);
    expect(prompt).toContain('Existing tags: Work');
    expect(prompt).toContain('Existing hashtags: ai');
    expect(prompt).toContain('1. a');
    expect(out).toHaveLength(3);
    expect(out[0]).toEqual({ note: 'x'.repeat(200), tags: ['Work'], hashtags: ['machine-learning', 'ai', 'a'] });
    expect(out[1]).toEqual({ note: 'A guide.', tags: [], hashtags: [] });
    expect(out[2]).toEqual({ note: '', tags: [], hashtags: [] });
  });

  it('card details: refuses empty input, too many links and unusable answers', async () => {
    const ctx = { tags: [], hashtags: [] };
    await expect(suggestCardDetails(cfg({}), [], ctx)).rejects.toThrow('no links');
    const many = Array.from({ length: MAX_DETAILS_PER_REQUEST + 1 }, (_, i) => ({ title: `t${i}`, url: `https://${i}.dev` }));
    await expect(suggestCardDetails(cfg({}), many, ctx)).rejects.toThrow('At most');
    const { fetch } = fakeFetch(openaiReply('{"nope":true}'));
    await expect(suggestCardDetails(cfg({}), [{ title: 'a', url: 'https://a.dev' }], ctx, fetch)).rejects.toThrow('valid suggestions');
  });

  it('proposes browser tab groups: every tab once, leftovers in "Other", needs two tabs', async () => {
    const pages = ['a', 'b', 'c', 'd'].map((t) => ({ title: t, url: `https://${t}.dev` }));
    const { fetch, calls } = fakeFetch(openaiReply('```json\n[{"title":"Docs","tabs":[1,2,99]},{"title":"More","tabs":[2,3]}]\n```'));
    expect(await proposeTabGroups(cfg({}), pages, fetch)).toEqual([
      { title: 'Docs', indexes: [0, 1] },
      { title: 'More', indexes: [2] },
      { title: 'Other', indexes: [3] },
    ]);
    expect(JSON.stringify(calls[0]?.body)).toContain('sort open browser tabs');
    await expect(proposeTabGroups(cfg({}), pages.slice(0, 1))).rejects.toThrow('at least two');
  });

  it('connection test succeeds on a reply with no text', async () => {
    const { fetch, calls } = fakeFetch({ choices: [{ message: { content: '' }, finish_reason: 'length' }] });
    await expect(testConnection(cfg({ provider: 'openrouter' }), fetch)).resolves.toBeUndefined();
    expect(calls).toHaveLength(1);
  });

  it('connection test still fails on provider errors', async () => {
    const { fetch } = fakeFetch('{"error":"bad key"}', 401);
    await expect(testConnection(cfg({}), fetch)).rejects.toMatchObject({ status: 401 });
  });

  it('refuses to call the model for empty input', async () => {
    await expect(groupTabs(cfg({}), [])).rejects.toThrow(/no tabs/);
    await expect(suggestCollectionNames(cfg({}), [])).rejects.toThrow(/empty/);
  });
});
