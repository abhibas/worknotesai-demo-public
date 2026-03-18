/**
 * Field comparison utilities for edit functionality
 * 
 * Provides normalized comparison functions to detect changes between edit fields
 * and original experience data. Handles edge cases like:
 * - null/undefined/empty string differences
 * - Date format variations (Date objects vs strings)
 * - Whitespace differences
 * 
 * All comparison functions use normalization to prevent false positives.
 */

import { EditFields } from './localStorageEdit';

/**
 * Experience fields that can be compared
 * This matches the structure of the Experience type
 */
export interface ExperienceFields {
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
 * Normalize a value for comparison
 * 
 * Handles null, undefined, and empty string differences by converting all to empty string.
 * Trims whitespace to prevent false positives from leading/trailing spaces.
 * 
 * @param val - The value to normalize (can be any type)
 * @returns Normalized string (empty string for null/undefined, trimmed string otherwise)
 * 
 * @example
 * ```typescript
 * normalize(null) === normalize(undefined) === normalize('') === '' // true
 * normalize('  hello  ') === 'hello' // true
 * ```
 */
export function normalize(val: any): string {
  if (val === null || val === undefined) return '';
  return String(val).trim();
}

/**
 * Normalize a date value for comparison
 * 
 * Special handling for dates to compare them correctly regardless of format.
 * If both values are valid dates, compares only the date part (ignores time).
 * Falls back to string comparison if values aren't dates.
 * 
 * @param val - The value to normalize (can be Date, string, or other)
 * @param orig - The original value to compare against (for context)
 * @returns Normalized date string (ISO date format YYYY-MM-DD) or normalized string
 * 
 * @example
 * ```typescript
 * normalizeDate(new Date('2025-01-15'), '2025-01-15') === '2025-01-15' // true
 * normalizeDate('2025-01-15T10:00:00Z', '2025-01-15') === '2025-01-15' // true
 * ```
 */
export function normalizeDate(val: any, orig: any): string {
  // If both are empty/null, return empty string
  if (!val && !orig) return '';
  
  // If one is empty, normalize as string
  if (!val || !orig) return String(val || '').trim();
  
  // Try to parse both as dates
  try {
    const valDate = val instanceof Date ? val : new Date(val);
    const origDate = orig instanceof Date ? orig : new Date(orig);
    
    // If both are valid dates, compare just the date part (ignore time)
    if (!isNaN(valDate.getTime()) && !isNaN(origDate.getTime())) {
      return valDate.toISOString().split('T')[0]; // Returns YYYY-MM-DD format
    }
  } catch (e) {
    // Not dates, fall through to string comparison
  }
  
  // Fallback to string normalization
  return String(val).trim();
}

/**
 * Compare edit fields with experience fields to detect changes
 * 
 * Compares all editable fields between edit data and original experience.
 * Uses normalization to handle edge cases and prevent false positives.
 * 
 * @param editFields - The edit fields to compare (from edit form or localStorage)
 * @param experience - The original experience fields to compare against
 * @returns true if any field differs, false if all fields match
 * 
 * @example
 * ```typescript
 * const hasChanges = compareEditFields(
 *   { title: 'New Title', content: 'Updated content' },
 *   { title: 'Old Title', content: 'Original content' }
 * ); // returns true
 * ```
 */
export function compareEditFields(
  editFields: EditFields,
  experience: ExperienceFields
): boolean {
  // Normalize string values
  const normalizeStr = normalize;
  
  // Compare all fields with normalization
  return (
    normalizeStr(editFields.title) !== normalizeStr(experience.title) ||
    normalizeStr(editFields.company) !== normalizeStr(experience.company) ||
    normalizeStr(editFields.role) !== normalizeStr(experience.role) ||
    normalizeDate(editFields.date, experience.date) !== normalizeDate(experience.date, experience.date) ||
    normalizeStr(editFields.project) !== normalizeStr(experience.project) ||
    normalizeStr(editFields.experienceTitle) !== normalizeStr(experience.experienceTitle) ||
    normalizeStr(editFields.tags) !== normalizeStr(experience.tags) ||
    normalizeStr(editFields.content) !== normalizeStr(experience.content)
  );
}

/**
 * Check if edit fields have actual changes compared to experience
 * 
 * Convenience function that wraps compareEditFields for clarity.
 * 
 * @param editFields - The edit fields to check
 * @param experience - The original experience fields
 * @returns true if there are actual changes, false otherwise
 * 
 * @example
 * ```typescript
 * if (hasActualChanges(editFields, experience)) {
 *   console.log('User has made changes');
 * }
 * ```
 */
export function hasActualChanges(
  editFields: EditFields,
  experience: ExperienceFields
): boolean {
  return compareEditFields(editFields, experience);
}

/**
 * Get detailed comparison results for debugging
 * 
 * Returns an object showing which fields differ, useful for debugging false positives.
 * 
 * @param editFields - The edit fields to compare
 * @param experience - The original experience fields
 * @returns Object with boolean flags for each field indicating if it differs
 * 
 * @example
 * ```typescript
 * const diff = getFieldDifferences(editFields, experience);
 * if (diff.title) {
 *   console.log('Title was changed');
 * }
 * ```
 */
export function getFieldDifferences(
  editFields: EditFields,
  experience: ExperienceFields
): {
  title: boolean;
  company: boolean;
  role: boolean;
  date: boolean;
  project: boolean;
  experienceTitle: boolean;
  tags: boolean;
  content: boolean;
} {
  const normalizeStr = normalize;
  
  return {
    title: normalizeStr(editFields.title) !== normalizeStr(experience.title),
    company: normalizeStr(editFields.company) !== normalizeStr(experience.company),
    role: normalizeStr(editFields.role) !== normalizeStr(experience.role),
    date: normalizeDate(editFields.date, experience.date) !== normalizeDate(experience.date, experience.date),
    project: normalizeStr(editFields.project) !== normalizeStr(experience.project),
    experienceTitle: normalizeStr(editFields.experienceTitle) !== normalizeStr(experience.experienceTitle),
    tags: normalizeStr(editFields.tags) !== normalizeStr(experience.tags),
    content: normalizeStr(editFields.content) !== normalizeStr(experience.content),
  };
}

