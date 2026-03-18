/**
 * Custom hook for managing edit button state and tooltip logic
 * 
 * Simplifies the complex button rendering logic in ExperienceCard.
 * Determines what button to show (edit vs save) and what tooltip to display.
 * 
 * Uses useUnsavedChanges hook internally (via hasUnsavedChanges parameter).
 * All return values are memoized to prevent unnecessary recalculations.
 * 
 * @example
 * ```typescript
 * const {
 *   showSaveIcon,
 *   showExitEditTooltip,
 *   tooltipContent,
 *   buttonState,
 * } = useEditButtonState({
 *   isEditing,
 *   experienceId,
 *   hasUnsavedChanges, // from useUnsavedChanges hook
 *   contentExpanded,
 * });
 * 
 * // Use in component
 * {showSaveIcon && <SaveButton />}
 * {showExitEditTooltip && <Tooltip>{tooltipContent}</Tooltip>}
 * ```
 */

import { useMemo } from 'react';

/**
 * Parameters for useEditButtonState hook
 */
export interface UseEditButtonStateParams {
  /** Whether currently in edit mode */
  isEditing: boolean;
  /** The experience ID */
  experienceId: string;
  /** Whether there are unsaved changes (from useUnsavedChanges hook) */
  hasUnsavedChanges: boolean;
  /** Whether content is expanded (for collapsed mode) */
  contentExpanded: boolean;
}

/**
 * Return type for useEditButtonState hook
 */
export interface UseEditButtonStateReturn {
  /** True if save icon should be shown */
  showSaveIcon: boolean;
  /** True if exit edit tooltip should be shown */
  showExitEditTooltip: boolean;
  /** Tooltip content to display */
  tooltipContent: string;
  /** Button state enum (for convenience) */
  buttonState: 'edit' | 'save' | 'exit-edit';
}

/**
 * Custom hook for managing edit button state
 * 
 * Determines button visibility and tooltip content based on:
 * - Edit mode state
 * - Unsaved changes state
 * - Content expansion state
 * 
 * @param params - Configuration object
 * @returns Object with button state flags and tooltip content
 * 
 * @example
 * ```typescript
 * const buttonState = useEditButtonState({
 *   isEditing: editingExperience === experience.id,
 *   experienceId: experience.id,
 *   hasUnsavedChanges: hasUnsavedChanges, // from useUnsavedChanges
 *   contentExpanded: contentExpanded,
 * });
 * ```
 */
export function useEditButtonState(
  params: UseEditButtonStateParams
): UseEditButtonStateReturn {
  const { isEditing, experienceId, hasUnsavedChanges, contentExpanded } =
    params;

  // Determine if save icon should be shown
  const showSaveIcon = useMemo(() => {
    // Show save icon if:
    // 1. Currently editing AND has unsaved changes, OR
    // 2. Not editing BUT has unsaved changes (collapsed mode)
    return (isEditing && hasUnsavedChanges) || (!isEditing && hasUnsavedChanges);
  }, [isEditing, hasUnsavedChanges]);

  // Determine if exit edit tooltip should be shown
  const showExitEditTooltip = useMemo(() => {
    // Show exit edit tooltip if:
    // Currently editing AND no unsaved changes
    return isEditing && !hasUnsavedChanges;
  }, [isEditing, hasUnsavedChanges]);

  // Determine tooltip content
  const tooltipContent = useMemo(() => {
    if (isEditing && !hasUnsavedChanges) {
      return 'Exit Edit';
    }
    if (showSaveIcon) {
      return 'Save unsaved changes';
    }
    return 'Edit Experience';
  }, [isEditing, hasUnsavedChanges, showSaveIcon]);

  // Determine button state enum (for convenience/logging)
  const buttonState = useMemo<'edit' | 'save' | 'exit-edit'>(() => {
    if (isEditing && !hasUnsavedChanges) {
      return 'exit-edit';
    }
    if (showSaveIcon) {
      return 'save';
    }
    return 'edit';
  }, [isEditing, hasUnsavedChanges, showSaveIcon]);

  return {
    showSaveIcon,
    showExitEditTooltip,
    tooltipContent,
    buttonState,
  };
}

