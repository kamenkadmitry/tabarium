import { AiError, assertConfigured, providerOrigin, type AiConfig } from '../core/ai/client';
import { tr } from '../i18n/runtime';
import type { Platform } from '../platform/ports';

/**
 * Runs an AI call after making sure the user has allowed access to the provider's origin.
 * Call it directly from a click handler: the permission prompt needs the user gesture.
 */
export async function withProviderAccess<T>(platform: Platform, config: AiConfig, action: () => Promise<T>): Promise<T> {
  assertConfigured(config);
  const origin = providerOrigin(config);
  if (!(await platform.permissions.requestOrigin(origin))) {
    throw new AiError(tr()('err.aiNeedsOrigin', { origin }));
  }
  return action();
}

export const isAiConfigured = (config: AiConfig): boolean =>
  config.provider !== null && config.apiKey.trim() !== '' && config.model.trim() !== '';
