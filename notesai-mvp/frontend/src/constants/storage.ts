/**
 * Storage-related constants for edit functionality
 * Centralized to ensure consistency and easy maintenance
 */

// localStorage key for unsaved edit data
export const UNSAVED_EDIT_STORAGE_KEY = 'worknotesai_unsaved_edit';

// Time constants (in milliseconds)
export const DEBOUNCE_DELAY_MS = 2000; // 2 seconds - delay before auto-saving to localStorage
export const COLLAPSE_STATE_RESET_DELAY_MS = 100; // 100ms - delay to allow state to settle after collapse

// Data expiry (7 days in milliseconds)
// Rationale for 7-day expiry:
// - Prevents stale data from old sessions (user might have already saved elsewhere)
// - Balances data preservation vs. cleanup (7 days is reasonable for unsaved work)
// - User typically returns within a week if they have unsaved work
// - Prevents localStorage from accumulating indefinitely
// - If user needs longer, they should explicitly save their work
// Consideration: Could be made configurable or removed entirely if user feedback suggests it's too short
const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * Calculate timestamp for data expiry check
 * Returns timestamp from 7 days ago
 */
export const getExpiryTimestamp = (): number => {
  return Date.now() - SEVEN_DAYS_MS;
};

/**
 * Check if a timestamp is recent (within expiry period)
 * Data older than 7 days is considered stale and will be cleared
 */
export const isRecentTimestamp = (timestamp: number | undefined): boolean => {
  if (!timestamp) return false;
  return timestamp > getExpiryTimestamp();
};

