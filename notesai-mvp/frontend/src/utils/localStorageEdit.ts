/**
 * localStorage utility functions for edit functionality
 * 
 * Centralizes all localStorage read/write operations for unsaved edit data.
 * Provides type-safe, validated access to edit data stored in localStorage.
 * 
 * All functions handle errors gracefully and use constants from storage.ts
 * for consistency across the application.
 */

import { UNSAVED_EDIT_STORAGE_KEY, isRecentTimestamp } from '../constants/storage';
import { devWarn } from './devLogger';

/**
 * Edit fields that can be saved to localStorage
 */
export interface EditFields {
  title?: string;
  company?: string;
  role?: string;
  date?: string;
  project?: string;
  experienceTitle?: string;
  tags?: string;
  content?: string;
}

/**
 * Structure of data stored in localStorage for unsaved edits
 */
export interface LocalStorageEditData {
  experienceId: string;
  editFields: EditFields;
  timestamp: number;
}

/**
 * Validates that a parsed object matches the expected LocalStorageEditData structure
 */
function isValidEditData(data: any): data is LocalStorageEditData {
  return (
    data &&
    typeof data === 'object' &&
    typeof data.experienceId === 'string' &&
    data.experienceId.length > 0 &&
    typeof data.editFields === 'object' &&
    typeof data.timestamp === 'number' &&
    !isNaN(data.timestamp)
  );
}

/**
 * Get edit data from localStorage
 * 
 * @param experienceId - Optional experience ID to filter by. If provided, only returns data for that experience.
 * @returns Parsed edit data if found and valid, null otherwise
 * 
 * @example
 * ```typescript
 * const data = getEditData();
 * if (data) {
 *   console.log('Found unsaved edits for:', data.experienceId);
 * }
 * ```
 */
export function getEditData(experienceId?: string): LocalStorageEditData | null {
  // Check if we're in a browser environment (localStorage not available in SSR)
  if (typeof window === 'undefined') {
    return null;
  }

  try {
    const savedData = localStorage.getItem(UNSAVED_EDIT_STORAGE_KEY);
    if (!savedData) {
      return null;
    }

    const parsed = JSON.parse(savedData);
    
    // Validate structure
    if (!isValidEditData(parsed)) {
      devWarn('Invalid edit data structure in localStorage, clearing');
      localStorage.removeItem(UNSAVED_EDIT_STORAGE_KEY);
      return null;
    }

    // Check if data is recent (within expiry period)
    if (!isRecentTimestamp(parsed.timestamp)) {
      // CODE CLEANUP: Use devLog for production readiness (or remove if not needed)
      // Data expired, clear it
      localStorage.removeItem(UNSAVED_EDIT_STORAGE_KEY);
      return null;
    }

    // Filter by experienceId if provided
    if (experienceId && parsed.experienceId !== experienceId) {
      return null;
    }

    return parsed;
  } catch (error) {
    console.error('Error reading edit data from localStorage:', error);
    // Clear corrupted data
    try {
      localStorage.removeItem(UNSAVED_EDIT_STORAGE_KEY);
    } catch (clearError) {
      console.error('Error clearing corrupted localStorage data:', clearError);
    }
    return null;
  }
}

/**
 * Get edit data for a specific experience
 * 
 * Convenience function that combines getEditData with experienceId filtering.
 * 
 * @param experienceId - The experience ID to get edit data for
 * @returns Edit data for the specified experience, or null if not found/invalid
 * 
 * @example
 * ```typescript
 * const data = getEditDataForExperience('exp123');
 * if (data) {
 *   console.log('Unsaved title:', data.editFields.title);
 * }
 * ```
 */
export function getEditDataForExperience(experienceId: string): LocalStorageEditData | null {
  return getEditData(experienceId);
}

/**
 * Save edit data to localStorage
 * 
 * @param experienceId - The experience ID this edit data belongs to
 * @param editFields - The edit fields to save
 * 
 * @example
 * ```typescript
 * saveEditData('exp123', {
 *   title: 'My Experience',
 *   content: 'Updated content...',
 *   company: 'Acme Corp'
 * });
 * ```
 */
export function saveEditData(experienceId: string, editFields: EditFields): void {
  // Check if we're in a browser environment (localStorage not available in SSR)
  if (typeof window === 'undefined') {
    devWarn('saveEditData: Cannot save in server environment');
    return;
  }

  try {
    const editData: LocalStorageEditData = {
      experienceId,
      editFields,
      timestamp: Date.now()
    };

    localStorage.setItem(UNSAVED_EDIT_STORAGE_KEY, JSON.stringify(editData));
  } catch (error) {
    console.error('Error saving edit data to localStorage:', error);
    // Note: We don't throw here to prevent breaking the app if localStorage is full
    // The calling code should handle the case where save fails
  }
}

/**
 * Clear edit data from localStorage
 * 
 * Removes all unsaved edit data. Safe to call even if no data exists.
 * 
 * @example
 * ```typescript
 * clearEditData(); // Clears all unsaved edits
 * ```
 */
export function clearEditData(): void {
  // Check if we're in a browser environment (localStorage not available in SSR)
  if (typeof window === 'undefined') {
    return;
  }

  try {
    localStorage.removeItem(UNSAVED_EDIT_STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing edit data from localStorage:', error);
  }
}

/**
 * Check if edit data exists in localStorage
 * 
 * This is a lightweight check that doesn't parse the data.
 * Use this when you only need to know if data exists, not the actual content.
 * 
 * @param experienceId - Optional experience ID to check for
 * @returns true if valid edit data exists, false otherwise
 * 
 * @example
 * ```typescript
 * if (hasEditData('exp123')) {
 *   console.log('Has unsaved edits for this experience');
 * }
 * ```
 */
export function hasEditData(experienceId?: string): boolean {
  // Check if we're in a browser environment (localStorage not available in SSR)
  if (typeof window === 'undefined') {
    return false;
  }

  try {
    const savedData = localStorage.getItem(UNSAVED_EDIT_STORAGE_KEY);
    if (!savedData) {
      return false;
    }

    // Quick parse to check structure (don't validate fully)
    const parsed = JSON.parse(savedData);
    
    // Basic structure check
    if (!parsed || typeof parsed !== 'object' || !parsed.experienceId || !parsed.timestamp) {
      return false;
    }

    // Check if data is recent
    if (!isRecentTimestamp(parsed.timestamp)) {
      return false;
    }

    // Filter by experienceId if provided
    if (experienceId && parsed.experienceId !== experienceId) {
      return false;
    }

    return true;
  } catch (error) {
    // If parsing fails, data is corrupted, so it doesn't exist
    return false;
  }
}

