/**
 * Simple development-only logger utility
 * 
 * Automatically disabled in production builds.
 * Use this for debug logs that should not appear in production.
 * 
 * For actual errors, continue using console.error (useful for debugging in production too).
 * 
 * @example
 * ```typescript
 * import { devLog } from '@/utils/devLogger';
 * 
 * devLog('Restored unsaved edits for experience:', experienceId);
 * ```
 */

/**
 * Check if we're in development mode
 */
const isDevelopment = process.env.NODE_ENV === 'development';

/**
 * Development-only logger
 * 
 * Only logs in development mode. Automatically removed/no-op in production.
 * 
 * @param args - Arguments to log (same as console.log)
 */
export function devLog(...args: any[]): void {
  if (isDevelopment) {
    console.log(...args);
  }
}

/**
 * Development-only logger for warnings
 * 
 * Only logs in development mode. Automatically removed/no-op in production.
 * 
 * @param args - Arguments to log (same as console.warn)
 */
export function devWarn(...args: any[]): void {
  if (isDevelopment) {
    console.warn(...args);
  }
}

