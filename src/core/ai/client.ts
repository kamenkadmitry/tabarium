import type { Settings } from '../settings';

export type AiConfig = Settings['ai'];

export interface AiRequest {
  system: string;
  prompt: string;
  /** Upper bound for the reply; keeps cost predictable. */
  maxTokens?: number;
}

export type FetchLike = (input: string, init: RequestInit) => Promise<Response>;

export class AiError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message);
    this.name = 'AiError';
  }
}

const ENDPOINTS = {
  anthropic: 'https://api.anthropic.com/v1/messages',
  openai: 'https://api.openai.com/v1/chat/completions',
  openrouter: 'https://openrouter.ai/api/v1/chat/completions',
} as const;

const GOOGLE_BASE = 'https://generativelanguage.googleapis.com/v1beta/models';

/**
 * Guesses which provider a key belongs to from its well-known prefix, or null when it is not recognisable.
 * Used only to warn about a likely mismatch; the user's selection is never changed silently.
 */
export function detectProviderFromKey(key: string): Exclude<AiConfig['provider'], 'custom' | null> | null {
  const k = key.trim();
  if (k.startsWith('sk-ant-')) return 'anthropic';
  if (k.startsWith('sk-or-')) return 'openrouter';
  if (k.startsWith('AIza')) return 'google';
  if (k.startsWith('sk-')) return 'openai';
  return null;
}

/** A config is usable only when every field the chosen provider needs is filled in. */
export function assertConfigured(config: AiConfig): asserts config is AiConfig & { provider: NonNullable<AiConfig['provider']> } {
  if (config.provider === null) throw new AiError('AI is turned off. Choose a provider in Settings.');
  if (config.apiKey.trim() === '') throw new AiError('Add your API key in Settings.');
  if (config.model.trim() === '') throw new AiError('Enter a model name in Settings.');
  if (config.provider === 'custom') {
    if (config.baseUrl.trim() === '') throw new AiError('Enter the base URL of your provider in Settings.');
    new URL(config.baseUrl);
  }
}

/** Origin that must be reachable for this configuration, e.g. "https://api.openai.com". */
export function providerOrigin(config: AiConfig): string {
  assertConfigured(config);
  switch (config.provider) {
    case 'anthropic':
      return new URL(ENDPOINTS.anthropic).origin;
    case 'openai':
      return new URL(ENDPOINTS.openai).origin;
    case 'openrouter':
      return new URL(ENDPOINTS.openrouter).origin;
    case 'google':
      return new URL(GOOGLE_BASE).origin;
    case 'custom':
      return new URL(config.baseUrl).origin;
  }
}

function chatCompletionsUrl(config: AiConfig & { provider: NonNullable<AiConfig['provider']> }): string {
  if (config.provider === 'custom') return `${config.baseUrl.replace(/\/+$/, '')}/chat/completions`;
  return ENDPOINTS[config.provider as 'openai' | 'openrouter'];
}

interface BuiltRequest {
  url: string;
  headers: Record<string, string>;
  body: unknown;
}

function buildRequest(config: AiConfig & { provider: NonNullable<AiConfig['provider']> }, req: AiRequest): BuiltRequest {
  const maxTokens = req.maxTokens ?? 1024;
  switch (config.provider) {
    case 'anthropic':
      return {
        url: ENDPOINTS.anthropic,
        headers: {
          'content-type': 'application/json',
          'x-api-key': config.apiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-dangerous-direct-browser-access': 'true',
        },
        body: { model: config.model, max_tokens: maxTokens, system: req.system, messages: [{ role: 'user', content: req.prompt }] },
      };
    case 'google':
      return {
        url: `${GOOGLE_BASE}/${encodeURIComponent(config.model)}:generateContent`,
        headers: { 'content-type': 'application/json', 'x-goog-api-key': config.apiKey },
        body: {
          systemInstruction: { parts: [{ text: req.system }] },
          contents: [{ role: 'user', parts: [{ text: req.prompt }] }],
          generationConfig: { maxOutputTokens: maxTokens },
        },
      };
    default:
      return {
        url: chatCompletionsUrl(config),
        headers: { 'content-type': 'application/json', authorization: `Bearer ${config.apiKey}` },
        body: {
          model: config.model,
          max_tokens: maxTokens,
          messages: [
            { role: 'system', content: req.system },
            { role: 'user', content: req.prompt },
          ],
        },
      };
  }
}

function extractText(provider: NonNullable<AiConfig['provider']>, data: unknown): string {
  const d = data as Record<string, unknown>;
  let text: unknown;
  if (provider === 'anthropic') {
    const content = d.content as { type?: string; text?: string }[] | undefined;
    text = content?.filter((c) => c.type === 'text').map((c) => c.text ?? '').join('');
  } else if (provider === 'google') {
    const candidates = d.candidates as { content?: { parts?: { text?: string }[] } }[] | undefined;
    text = candidates?.[0]?.content?.parts?.map((p) => p.text ?? '').join('');
  } else {
    const choices = d.choices as { message?: { content?: string } }[] | undefined;
    text = choices?.[0]?.message?.content;
  }
  if (typeof text !== 'string' || text.trim() === '') throw new AiError('The provider returned an empty answer.');
  return text;
}

/** Sends one prompt to the configured provider. No retries: a failure is reported to the user as it is. */
export async function complete(config: AiConfig, req: AiRequest, fetchImpl: FetchLike = fetch): Promise<string> {
  assertConfigured(config);
  const { url, headers, body } = buildRequest(config, req);
  const response = await fetchImpl(url, { method: 'POST', headers, body: JSON.stringify(body) });
  if (!response.ok) {
    const detail = (await response.text()).slice(0, 300);
    throw new AiError(`${config.provider} responded with ${response.status}${detail ? `: ${detail}` : ''}`, response.status);
  }
  return extractText(config.provider, await response.json());
}
