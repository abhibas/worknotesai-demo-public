/**
 * Custom hook for managing unsaved changes state
 * 
 * Consolidates all unsaved changes tracking into a single source of truth.
 * Manages both active editing state and collapsed state (localStorage).
 * 
 * Uses useLocalStorageEdit internally to sync with localStorage.
 * Uses compareEditFields from utils/fieldComparison.ts for change detection.
 * 
 * @example
 * ```typescript
 * const {
 *   hasUnsavedChanges,
 *   hasUnsavedFor,
 *   unsavedExperienceIds,
 *   checkForUnsavedChanges,
 *   clearUnsaved,
 * } = useUnsavedChanges(experienceId, editFields, originalExperience, isEditing);
 * 
 * // Check if current experience has unsaved changes
 * if (hasUnsavedChanges) {
 *   console.log('Has unsaved changes');
 * }
 * 
 * // Check if another experience has unsaved changes
 * if (hasUnsavedFor('other-exp-id')) {
 *   console.log('Other experience has unsaved changes');
 * }
 * ```
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useLocalStorageEdit } from './useLocalStorageEdit';
import { compareEditFields, type ExperienceFields } from '../utils/fieldComparison';
import { type EditFields } from '../utils/localStorageEdit';

/**
 * Return type for useUnsavedChanges hook
 */
export interface UseUnsavedChangesReturn {
  /** True if the current experience (experienceId) has unsaved changes */
  hasUnsavedChanges: boolean;
  /** Function to check if a specific experience has unsaved changes */
  hasUnsavedFor: (id: string) => boolean;
  /** Array of all experience IDs with unsaved changes */
  unsavedExperienceIds: string[];
  /** Manual check function (returns boolean) */
  checkForUnsavedChanges: () => boolean;
  /** Clear unsaved flag for a specific experience or all */
  clearUnsaved: (id?: string) => void;
  /** Get unsaved edit fields for a specific experience */
  getUnsavedEditFields: (id: string) => EditFields | null;
}

/**
 * Custom hook for managing unsaved changes state
 * 
 * @param experienceId - The current experience ID (for active editing)
 * @param editFields - Current edit field values (for active editing)
 * @param originalExperience - Original experience fields to compare against
 * @param isEditing - Whether currently in edit mode
 * @returns Object with unsaved changes state and utility functions
 * 
 * @example
 * ```typescript
 * const { hasUnsavedChanges } = useUnsavedChanges(
 *   experience.id,
 *   { title: editTitle, content: editContent },
 *   experience,
 *   isEditing
 * );
 * ```
 */
export function useUnsavedChanges(
  experienceId: string,
  editFields: EditFields,
  originalExperience: ExperienceFields,
  isEditing: boolean
): UseUnsavedChangesReturn {
  // Use localStorage hook to get collapsed state data
  const { editData: localStorageData } = useLocalStorageEdit(experienceId);

  // Track unsaved changes per experience (for collapsed mode)
  const [unsavedByExperience, setUnsavedByExperience] = useState<{
    [id: string]: boolean;
  }>({});

  // Track unsaved changes for active editing
  const [hasActiveUnsavedChanges, setHasActiveUnsavedChanges] = useState(false);

  // Clear state when experienceId changes (prevent state from persisting across experiences)
  useEffect(() => {
    // When switching to a different experience, clear active unsaved changes
    // The localStorage check will handle collapsed state for the new experience
    setHasActiveUnsavedChanges(false);
  }, [experienceId]);

  // Automatic change detection for active editing
  useEffect(() => {
    if (isEditing && experienceId) {
      const hasChanges = compareEditFields(editFields, originalExperience);
      setHasActiveUnsavedChanges(hasChanges);

      // Also update per-experience tracking
      setUnsavedByExperience((prev) => ({
        ...prev,
        [experienceId]: hasChanges,
      }));
    } else {
      // Not editing, clear active unsaved changes
      // But DON'T clear per-experience tracking here - it's handled by localStorage check below
      setHasActiveUnsavedChanges(false);
    }
  }, [editFields, originalExperience, isEditing, experienceId]);

  // Check localStorage data for collapsed state
  // Use useMemo to memoize the comparison result to prevent infinite loops
  const hasLocalStorageChanges = useMemo(() => {
    // Check localStorage data when not editing OR when localStorage data exists for this experience
    // This ensures we detect changes even during the transition from editing to collapsed
    if (localStorageData && localStorageData.experienceId === experienceId) {
      return compareEditFields(localStorageData.editFields, originalExperience);
    }
    return false;
  }, [localStorageData, experienceId, originalExperience]);

  useEffect(() => {
    // Always check localStorage data, regardless of isEditing state
    // This ensures we detect changes when collapsing (isEditing might still be true momentarily)
    if (localStorageData && localStorageData.experienceId === experienceId) {
      if (hasLocalStorageChanges) {
        // Update per-experience tracking - data differs from original
        setUnsavedByExperience((prev) => ({
          ...prev,
          [experienceId]: true,
        }));
      } else {
        // Data exists but matches original, clear unsaved flag
        // This prevents false positives when data matches original
        setUnsavedByExperience((prev) => {
          const updated = { ...prev };
          delete updated[experienceId];
          return updated;
        });
        // Note: We don't clear localStorage here automatically because:
        // 1. It might be cleared elsewhere (e.g., when user opens edit and data matches)
        // 2. Clearing here could cause issues during transitions
        // 3. The cleanup should happen in the component when appropriate
      }
    } else {
      // No localStorage data for this experience, clear unsaved flag
      setUnsavedByExperience((prev) => {
        const updated = { ...prev };
        delete updated[experienceId];
        return updated;
      });
    }
  }, [hasLocalStorageChanges, experienceId, localStorageData]);

  // Manual check function
  const checkForUnsavedChanges = useCallback(() => {
    return compareEditFields(editFields, originalExperience);
  }, [editFields, originalExperience]);

  // Check if specific experience has unsaved changes
  const hasUnsavedFor = useCallback(
    (id: string): boolean => {
      return unsavedByExperience[id] === true;
    },
    [unsavedByExperience]
  );

  // Get all experience IDs with unsaved changes
  const unsavedExperienceIds = useMemo(() => {
    return Object.keys(unsavedByExperience).filter(
      (id) => unsavedByExperience[id] === true
    );
  }, [unsavedByExperience]);

  // Get unsaved edit fields for a specific experience
  const getUnsavedEditFields = useCallback(
    (id: string): EditFields | null => {
      // For current experience, return current editFields if editing
      if (id === experienceId && isEditing) {
        return editFields;
      }

      // For collapsed state, would need to check localStorage
      // This is a simplified version - in practice, might need to use
      // useLocalStorageEdit hook for the specific ID
      // For now, return null if not current experience
      return null;
    },
    [experienceId, isEditing, editFields]
  );

  // Clear unsaved flag
  const clearUnsaved = useCallback(
    (id?: string) => {
      if (id) {
        // Clear specific experience
        setUnsavedByExperience((prev) => {
          const updated = { ...prev };
          delete updated[id];
          return updated;
        });
      } else {
        // Clear all
        setUnsavedByExperience({});
        setHasActiveUnsavedChanges(false);
      }
    },
    []
  );

  // Combined unsaved changes state (active editing OR collapsed state)
  const hasUnsavedChanges =
    hasActiveUnsavedChanges || unsavedByExperience[experienceId] === true;

  return {
    hasUnsavedChanges,
    hasUnsavedFor,
    unsavedExperienceIds,
    checkForUnsavedChanges,
    clearUnsaved,
    getUnsavedEditFields,
  };
}

