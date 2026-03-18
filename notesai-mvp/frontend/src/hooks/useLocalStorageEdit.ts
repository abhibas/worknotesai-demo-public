/**
 * Custom hook for managing localStorage edit data with reactive state
 * 
 * Provides reactive state management for unsaved edit data stored in localStorage.
 * Automatically syncs with localStorage on mount and when experienceId changes.
 * 
 * Uses utilities from utils/localStorageEdit.ts for all localStorage operations.
 * 
 * @example
 * ```typescript
 * const { editData, hasEditData, saveEditData, clearEditData } = useLocalStorageEdit('exp123');
 * 
 * // Check if data exists
 * if (hasEditData) {
 *   console.log('Unsaved edits:', editData.editFields);
 * }
 * 
 * // Save new edits
 * saveEditData({ title: 'New Title', content: 'Updated content' });
 * 
 * // Clear when done
 * clearEditData();
 * ```
 */

import { useState, useEffect, useCallback } from 'react';
import { devWarn } from '../utils/devLogger';
import {
  getEditData,
  saveEditData as saveEditDataUtil,
  clearEditData as clearEditDataUtil,
  hasEditData as hasEditDataUtil,
  type LocalStorageEditData,
  type EditFields,
} from '../utils/localStorageEdit';

/**
 * Return type for useLocalStorageEdit hook
 */
export interface UseLocalStorageEditReturn {
  /** Current edit data from localStorage, or null if not found/invalid */
  editData: LocalStorageEditData | null;
  /** Convenience boolean: true if edit data exists */
  hasEditData: boolean;
  /** Save edit data to localStorage */
  saveEditData: (editFields: EditFields) => void;
  /** Clear edit data from localStorage */
  clearEditData: () => void;
  /** Check if edit data exists (lightweight check) */
  hasEditDataCheck: () => boolean;
}

/**
 * Custom hook for managing localStorage edit data
 * 
 * @param experienceId - Optional experience ID to filter by. If provided, only manages data for that experience.
 * @returns Object with editData state, convenience flags, and save/clear functions
 * 
 * @example
 * ```typescript
 * // For a specific experience
 * const { editData, saveEditData } = useLocalStorageEdit('exp123');
 * 
 * // For any experience (no filter)
 * const { editData, saveEditData } = useLocalStorageEdit();
 * ```
 */
export function useLocalStorageEdit(experienceId?: string): UseLocalStorageEditReturn {
  // Reactive state for edit data
  const [editData, setEditData] = useState<LocalStorageEditData | null>(null);

  // Sync with localStorage on mount and when experienceId changes
  useEffect(() => {
    const data = getEditData(experienceId);
    setEditData(data);
  }, [experienceId]);

  // Save edit data to localStorage and update state
  const saveEditData = useCallback(
    (editFields: EditFields) => {
      if (!experienceId) {
        devWarn('useLocalStorageEdit: Cannot save without experienceId');
        return;
      }

      try {
        saveEditDataUtil(experienceId, editFields);
        // Update state immediately to reflect the save
        const newData: LocalStorageEditData = {
          experienceId,
          editFields,
          timestamp: Date.now(),
        };
        setEditData(newData);
      } catch (error) {
        console.error('useLocalStorageEdit: Error saving edit data:', error);
        // Don't throw - graceful degradation
      }
    },
    [experienceId]
  );

  // Clear edit data from localStorage and update state
  const clearEditData = useCallback(() => {
    try {
      clearEditDataUtil();
      setEditData(null);
    } catch (error) {
      console.error('useLocalStorageEdit: Error clearing edit data:', error);
      // Don't throw - graceful degradation
    }
  }, []);

  // Lightweight check if edit data exists (doesn't parse full data)
  const hasEditDataCheck = useCallback(() => {
    return hasEditDataUtil(experienceId);
  }, [experienceId]);

  // Convenience boolean
  const hasEditData = editData !== null;

  return {
    editData,
    hasEditData,
    saveEditData,
    clearEditData,
    hasEditDataCheck,
  };
}

