import { createContext, useContext } from 'react';
import type { Platform } from './ports';

const PlatformContext = createContext<Platform | null>(null);

export const PlatformProvider = PlatformContext.Provider;

export function usePlatform(): Platform {
  const platform = useContext(PlatformContext);
  if (!platform) throw new Error('usePlatform called outside PlatformProvider');
  return platform;
}
