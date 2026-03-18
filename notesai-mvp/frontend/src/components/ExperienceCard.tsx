'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Clock, Edit, Trash2, Sparkles, Star, Save, X, Trophy, ChevronDown, ChevronUp, MessageCircle } from 'lucide-react';
import { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import EditExperienceForm from './EditExperienceForm';
import TagsDisplay from './TagsDisplay';
import { Tooltip } from '@/components/ui/tooltip';
import { UNSAVED_EDIT_STORAGE_KEY, isRecentTimestamp } from '@/constants/storage';
import { useLocalStorageEdit } from '@/hooks/useLocalStorageEdit';
import { useUnsavedChanges } from '@/hooks/useUnsavedChanges';
import { useEditButtonState } from '@/hooks/useEditButtonState';

// Export interfaces so they can be reused
export interface Experience {
  id: string;
  content: string;
  title: string;
  company?: string;
  role?: string;
  date?: string;
  project?: string;
  experienceTitle?: string;
  tags?: string;
  createdAt: string;
  updatedAt?: string;
  responses?: Response[];
}

export interface Response {
  id: string;
  starResponse: string;
  score?: string;
  sectionScores?: string;
  summaryFeedback?: string | null;
  detailedFeedback?: string | null;
  rubricScores?: string | null;
  topStrengths?: string | null;
  improvementAreas?: string | null;
  rubricDiagnosticSummary?: string | null;
  skillsHighlighted?: string | null;
  feedbackQuestions?: string | null; // JSON string: Array<{component: string, question: string}>
  createdAt: string;
  updatedAt?: string;
}

type ExperienceCardVariant = 'recently-added' | 'in-progress' | 'star-bank';

interface ExperienceCardProps {
  experience: Experience;
  variant: ExperienceCardVariant;
  // Edit state
  editingExperience: string | null;
  editTitle: string;
  setEditTitle: (value: string) => void;
  editTags: string;
  setEditTags: (value: string) => void;
  editExperienceText: string;
  setEditExperienceText: (value: string) => void;
  editCompany: string;
  setEditCompany: (value: string) => void;
  editRole: string;
  setEditRole: (value: string) => void;
  editDate: string;
  setEditDate: (value: string) => void;
  editProject: string;
  setEditProject: (value: string) => void;
  editExperienceTitle: string;
  setEditExperienceTitle: (value: string) => void;
  editIsRecording: boolean;
  editIsSubmitting: boolean;
  isVoiceSupported: boolean;
  editShowTitleError: boolean;
  setEditShowTitleError: (value: boolean) => void;
  editShowSuccessMessage: boolean;
  setEditShowSuccessMessage: (value: boolean) => void;
  // Handlers
  handleEditExperience: (experience: Experience) => void;
  handleDeleteExperience: (id: string) => void;
  handleSaveEdit: (experienceId: string) => Promise<Experience | null>;
  handleCancelEdit: () => void;
  handleGenerateSTAR: (experience: Experience) => Promise<void>;
  handleSaveToStarBank?: (experience: Experience) => Promise<void>;
  handleUnsaveFromStarBank?: (experience: Experience) => Promise<void>;
  generateEditTitle: () => string;
  startEditVoiceRecording: () => void;
  stopEditVoiceRecording: () => void;
  // Grade visibility (for in-progress and star-bank)
  getGradeVisibility?: (experienceId: string) => boolean;
  toggleGradeVisibility?: (experienceId: string) => void;
  // Feedback visibility (for in-progress tab only)
  getFeedbackVisibility?: (experienceId: string) => boolean;
  toggleFeedbackVisibility?: (experienceId: string) => void;
  generatingExperienceId: string | null;
  // Helper function
  normalizeListFormatting: (text: string) => string;
  // Unsaved changes tracking for collapsed mode
  // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience prop - now using hooks
  handleCollapseInEditMode?: (experienceId: string) => void;
  handleSaveInCollapsedMode?: (experienceId: string) => Promise<Experience | null>;
}

export default function ExperienceCard({
  experience,
  variant,
  editingExperience,
  editTitle,
  setEditTitle,
  editTags,
  setEditTags,
  editExperienceText,
  setEditExperienceText,
  editCompany,
  setEditCompany,
  editRole,
  setEditRole,
  editDate,
  setEditDate,
  editProject,
  setEditProject,
  editExperienceTitle,
  setEditExperienceTitle,
  editIsRecording,
  editIsSubmitting,
  isVoiceSupported,
  editShowTitleError,
  setEditShowTitleError,
  editShowSuccessMessage,
  setEditShowSuccessMessage,
  handleEditExperience,
  handleDeleteExperience,
  handleSaveEdit,
  handleCancelEdit,
  handleGenerateSTAR,
  handleSaveToStarBank,
  handleUnsaveFromStarBank,
  generateEditTitle,
  startEditVoiceRecording,
  stopEditVoiceRecording,
  getGradeVisibility,
  toggleGradeVisibility,
  getFeedbackVisibility,
  toggleFeedbackVisibility,
  generatingExperienceId,
  normalizeListFormatting,
  handleCollapseInEditMode,
  handleSaveInCollapsedMode,
}: ExperienceCardProps) {
  const isEditing = editingExperience === experience.id;
  const hasStarResponse = experience.responses && experience.responses.length > 0 && experience.responses[0];
  const starResponse = hasStarResponse && experience.responses ? experience.responses[0] : null;
  const showGrades = variant !== 'recently-added' && getGradeVisibility && getGradeVisibility(experience.id);
  const showFeedback = variant === 'in-progress' && getFeedbackVisibility && getFeedbackVisibility(experience.id);
  
  // PHASE 3 REFACTOR: Use hook for localStorage edit data (Step 1.1)
  const { editData: localStorageEditData, hasEditData } = useLocalStorageEdit(experience.id);
  
  // PHASE 3 REFACTOR: Memoize edit fields and original experience to prevent infinite loops
  // These objects are recreated on every render, so we memoize them to stabilize dependencies
  const editFields = useMemo(() => ({
    title: editTitle,
    company: editCompany,
    role: editRole,
    date: editDate,
    project: editProject,
    experienceTitle: editExperienceTitle,
    tags: editTags,
    content: editExperienceText,
  }), [editTitle, editCompany, editRole, editDate, editProject, editExperienceTitle, editTags, editExperienceText]);
  
  const originalExperience = useMemo(() => ({
    title: experience.title,
    company: experience.company,
    role: experience.role,
    date: experience.date,
    project: experience.project,
    experienceTitle: experience.experienceTitle,
    tags: experience.tags,
    content: experience.content,
  }), [experience.title, experience.company, experience.role, experience.date, experience.project, experience.experienceTitle, experience.tags, experience.content]);
  
  // PHASE 3 REFACTOR: Use hook for unified unsaved changes state (Step 1.2)
  // This replaces: hasUnsavedChanges (from props), hasUnsavedInStorage (computed), hasUnsavedChangesFinal (combined)
  const {
    hasUnsavedChanges: hasUnsavedChangesFromHook,
    hasUnsavedFor,
  } = useUnsavedChanges(
    experience.id,
    editFields,
    originalExperience,
    isEditing
  );
  
  // Use hook's unified state (replaces hasUnsavedChangesFinal)
  const hasUnsavedChangesFinal = hasUnsavedChangesFromHook;
  
  // State for expand/collapse user content (for all variants)
  // Default to collapsed (false) so user sees first two lines when switching experiences
  const [contentExpanded, setContentExpanded] = useState(false);
  
  // PHASE 3 REFACTOR: Use hook for button state logic (Step 1.3)
  // This replaces: shouldShowSaveIcon, shouldShowExitEditTooltip, tooltip content logic
  // Must be after contentExpanded declaration
  const {
    showSaveIcon,
    showExitEditTooltip,
    tooltipContent,
    buttonState,
  } = useEditButtonState({
    isEditing,
    experienceId: experience.id,
    hasUnsavedChanges: hasUnsavedChangesFinal,
    contentExpanded,
  });
  
  // State to hold unsaved content from localStorage (for display when collapsed)
  const [unsavedContent, setUnsavedContent] = useState<string | null>(null);
  
  // Ref for the scrollable content div to reset scroll position when collapsing
  const contentScrollRef = useRef<HTMLDivElement>(null);
  
  // Show chevron for all variants
  // - recently-added: always show (no STAR response by definition)
  // - in-progress and star-bank: show if there's a STAR response
  // - Show even when editing (for consistency)
  const showChevron = variant === 'recently-added' || ((variant === 'in-progress' || variant === 'star-bank') && hasStarResponse);

  // Track previous experience ID to detect actual changes
  const prevExperienceIdRef = useRef<string | null>(null);
  
  // Reset to collapsed state when switching experiences (only when ID actually changes)
  useEffect(() => {
    if (prevExperienceIdRef.current !== null && prevExperienceIdRef.current !== experience.id) {
    setContentExpanded(false);
      setUnsavedContent(null); // Clear unsaved content when switching experiences
    }
    prevExperienceIdRef.current = experience.id;
  }, [experience.id]);

  // Read unsaved content from localStorage when there are unsaved changes (for display when collapsed)
  // PHASE 3 REFACTOR: Use hook's localStorage data directly for more reliable detection
  useEffect(() => {
    if (isEditing) {
      // When editing, use current editExperienceText
      setUnsavedContent(editExperienceText);
    } else if (localStorageEditData && localStorageEditData.experienceId === experience.id) {
      // When collapsed, use localStorage data from hook
      // Hook handles comparison internally, so we can trust it
      setUnsavedContent(localStorageEditData.editFields?.content || null);
    } else {
      // No localStorage data, clear unsaved content
      setUnsavedContent(null);
    }
  }, [isEditing, localStorageEditData, experience.id, experience.title, experience.company, experience.role, experience.date, experience.project, experience.experienceTitle, experience.tags, experience.content, editExperienceText]);

  // PHASE 3 REFACTOR: Removed justCollapsedRef - no longer needed with hooks as single source of truth
  
  // Handler for toggling expand/collapse - simple and clean
  const handleToggleContent = useCallback(() => {
    const willBeCollapsed = contentExpanded; // If currently expanded, will be collapsed after toggle
    
    // If collapsing while in edit mode, close edit mode FIRST (before state update)
    // This must happen outside setState to avoid React warning
    if (willBeCollapsed && isEditing && handleCollapseInEditMode) {
      // Save to localStorage FIRST (before closing edit mode)
      // Hook will handle state updates reactively
      handleCollapseInEditMode(experience.id);
      
      // Immediately read from localStorage to display unsaved content
      // Use hook's editData directly - hook is now single source of truth
      if (localStorageEditData && localStorageEditData.experienceId === experience.id && localStorageEditData.editFields?.content) {
        setUnsavedContent(localStorageEditData.editFields.content);
      }
    }
    
    // Single toggle call that handles both cases (collapsing from edit mode and normal toggle)
    setContentExpanded(prev => {
      const newValue = !prev;
      const wasExpanded = prev;
      
      // Handle side effects if collapsing
      if (wasExpanded) {
        // Reset scroll position
        setTimeout(() => {
          if (contentScrollRef.current) {
      contentScrollRef.current.scrollTop = 0;
      contentScrollRef.current.style.height = '';
    }
        }, 0);
      }
      
      return newValue;
    });
  }, [isEditing, contentExpanded, experience.id, handleCollapseInEditMode]);

  // Format STAR response HTML - normalize list formatting for ALL variants
  const formatStarResponse = (text: string): string => {
    if (!text) return 'No STAR response available';
    
    // Apply normalizeListFormatting to ALL variants for consistent list formatting
    const normalizedText = normalizeListFormatting(text);
    
    // Apply HTML formatting
    return normalizedText
      .replace(/\*\*(Situation|Task|Action|Result):\*\*\s+/g, '<br><strong>$1:</strong><br>')
      .replace(/\*\*(Situation|Task|Action|Result):\*\*([^\n])/g, '<br><strong>$1:</strong><br>$2')
      .replace(/\*\*(Situation|Task|Action|Result):\*\*\n/g, '<br><strong>$1:</strong><br>')
      .replace(/\*\*(Situation|Task|Action|Result):\*\*/g, '<br><strong>$1:</strong>')
      .replace(/\*\*(Situation|Task|Action|Result)\*\*/g, '<br><strong>$1</strong>')
      .replace(/\n/g, '<br>');
  };

  return (
    <Card key={`${variant}-${experience.id}`} className="hover:shadow-lg transition-shadow">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">{experience.title}</CardTitle>
            {/* Tags Display */}
            <TagsDisplay tags={experience.tags} />
            {/* Draft badge - only for recently-added */}
            {variant === 'recently-added' && (!hasStarResponse) && (
              <div className="flex items-center space-x-2 mt-2">
                <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                  <Clock className="h-3 w-3 mr-1" />
                  Draft
                </span>
              </div>
            )}
          </div>
          <div className="flex items-center space-x-2">
            <span className="text-xs text-gray-500">
              {new Date(experience.updatedAt || experience.createdAt).toLocaleDateString()}{' '}
              {new Date(experience.updatedAt || experience.createdAt).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                hour12: true,
              })}
            </span>
            {/* Hide edit button in STAR Bank tab - users should move experience back to in-progress to edit */}
            {variant !== 'star-bank' && (
              <>
                {/* When collapsed with unsaved changes OR when saving from collapsed (isEditing but contentExpanded is false), show both edit and save icons */}
                {(() => {
                  // Use hook's state directly - hook is now single source of truth
                  // Show collapsed buttons if:
                  // 1. Not editing AND have unsaved changes, OR
                  // 2. Editing but content is collapsed AND have unsaved changes
                  return ((!isEditing && hasUnsavedChangesFinal) || (isEditing && !contentExpanded && hasUnsavedChangesFinal));
                })() ? (
                  <>
                    {/* Edit icon to re-enter edit mode */}
                  <Tooltip
                    content="Edit Experience"
                    side="top"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                          // Auto-expand if collapsed, then open edit mode (will restore from localStorage)
                          if (!contentExpanded) {
                            setContentExpanded(true);
                          }
                          handleEditExperience(experience);
                        }}
                        className="text-gray-600 hover:text-indigo-600"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                    {/* Save icon to save unsaved changes */}
                    <Tooltip
                      content="Save unsaved changes"
                      side="top"
                    >
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={async () => {
                          // Save in background
                          if (handleSaveInCollapsedMode) {
                            await handleSaveInCollapsedMode(experience.id);
                          }
                        }}
                        className="bg-indigo-600 text-white hover:bg-indigo-700"
                      >
                        <Save className="h-4 w-4" />
                      </Button>
                    </Tooltip>
                  </>
                ) : showSaveIcon && isEditing && contentExpanded ? (
                  // When editing with changes, show save icon
                  <Tooltip
                    content={tooltipContent}
                    side="top"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={async () => {
                        // Save normally
                        await handleSaveEdit(experience.id);
                      }}
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                        <Save className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                ) : showExitEditTooltip ? (
                  // Show "Exit Edit" tooltip when in edit mode with no changes
                  <Tooltip
                    content={tooltipContent}
                    side="top"
                  >
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        // Exit edit mode
                        handleCancelEdit();
                      }}
                      className="text-gray-600 hover:text-indigo-600"
                    >
                        <Edit className="h-4 w-4" />
                    </Button>
                  </Tooltip>
                ) : (
                  // Show "Edit Experience" tooltip when not editing and no unsaved changes
                  <Tooltip
                    content="Edit Experience"
                    side="top"
                  >
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                        // Auto-expand if collapsed, then open edit mode
                        if (!contentExpanded) {
                          setContentExpanded(true);
                        }
                        handleEditExperience(experience);
                      }}
                      className="text-gray-600 hover:text-indigo-600"
                    >
                      <Edit className="h-4 w-4" />
                  </Button>
                  </Tooltip>
                )}
              </>
            )}
            <Button
              size="sm"
              variant="outline"
              onClick={() => handleDeleteExperience(experience.id)}
              className={variant === 'recently-added' ? 'text-gray-600 hover:text-gray-700' : 'text-gray-400 hover:text-red-600'}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
            {/* Chevron for expand/collapse user content - only for in-progress and star-bank with STAR response */}
            {/* Show chevron even when editing (for consistency) */}
            {showChevron && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleToggleContent}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggleContent();
                  }
                }}
                className="text-gray-600 hover:text-gray-700 active:text-gray-800 transition-colors"
                aria-expanded={contentExpanded}
                aria-label={contentExpanded ? "Collapse experience content" : "Expand experience content"}
                type="button"
              >
                {contentExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {/* Edit Form */}
        {/* Hide edit form in STAR Bank tab - users should move experience back to in-progress to edit */}
        {/* Also hide form when collapsed (contentExpanded is false) - this allows immediate collapse without waiting for parent state */}
        {isEditing && variant !== 'star-bank' && contentExpanded ? (
          <div className="space-y-6">
            {/* Title Error Message - only for recently-added */}
            {variant === 'recently-added' && editShowTitleError && (
              <div className="p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">⚠️</span>
                    <div className="text-sm font-medium text-red-800">
                      Please add a title for your experience. Fill in the title field or add details in the form below.
                    </div>
                  </div>
                  <button
                    onClick={() => setEditShowTitleError(false)}
                    className="text-red-600 hover:text-red-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}

            <EditExperienceForm
              experienceId={experience.id}
              editTitle={editTitle}
              setEditTitle={setEditTitle}
              editTags={editTags}
              setEditTags={setEditTags}
              editExperienceText={editExperienceText}
              setEditExperienceText={setEditExperienceText}
              editCompany={editCompany}
              setEditCompany={setEditCompany}
              editRole={editRole}
              setEditRole={setEditRole}
              editDate={editDate}
              setEditDate={setEditDate}
              editProject={editProject}
              setEditProject={setEditProject}
              editExperienceTitle={editExperienceTitle}
              setEditExperienceTitle={setEditExperienceTitle}
              originalContent={experience.content}
              editIsRecording={editIsRecording}
              editIsSubmitting={editIsSubmitting}
              isVoiceSupported={isVoiceSupported}
              generateEditTitle={generateEditTitle}
              handleSaveEdit={handleSaveEdit}
              handleCancelEdit={handleCancelEdit}
              startEditVoiceRecording={startEditVoiceRecording}
              stopEditVoiceRecording={stopEditVoiceRecording}
            />
          </div>
        ) : (
          <>
            {/* User content - wrapped in outline box matching FeedbackCard summary feedback styling */}
            {/* Show unsaved content if available, otherwise show original experience content */}
            {(() => {
              const displayContent = (unsavedContent !== null && unsavedContent.trim()) 
                ? unsavedContent.trim() 
                : experience.content.trim();
              
              return showChevron && contentExpanded ? (
              // When expanded: inner div has its own border and padding (like textarea), resize handle on border
              <div className="mb-6">
                <div 
                  key={`expanded-${experience.id}`}
                  ref={contentScrollRef}
                  className="text-sm text-gray-700 whitespace-pre-wrap min-h-[100px] max-h-96 overflow-y-auto resize-y rounded-md border border-gray-200 bg-background px-3 py-2 transition-all duration-200 ease-in-out"
                >
                    {displayContent}
                </div>
              </div>
            ) : (
              // When collapsed or no chevron: use outer container with border and padding
              <div className="mb-6 border border-gray-200 rounded-lg p-4">
                {showChevron ? (
                  <div 
                    key={`collapsed-${experience.id}`}
                    className="text-sm text-gray-700 whitespace-pre-wrap line-clamp-2"
                  >
                      {displayContent}
                  </div>
                ) : (
                  <div className="text-sm text-gray-700 whitespace-pre-wrap">
                      {displayContent}
                  </div>
                )}
              </div>
              );
            })()}
          </>
        )}

        {/* STAR Response */}
        {/* Only show STAR response for in-progress and star-bank variants (recently-added should not have STAR responses) */}
        {hasStarResponse && starResponse && (variant === 'in-progress' || variant === 'star-bank') && (
          <>
            {/* In Progress & STAR Bank: Full STAR Response with Grades */}
            <div className="bg-gray-50 rounded-lg px-6 pt-6 pb-0 relative">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <h4 className="font-medium text-gray-900">STAR Response</h4>
                  {starResponse.score && showGrades && (
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
                      {starResponse.score}
                    </span>
                  )}
                </div>
                {starResponse.createdAt && (
                  <span className="text-xs text-gray-500">
                    Generated:{' '}
                    {new Date(starResponse.createdAt).toLocaleDateString()}{' '}
                    {new Date(starResponse.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      hour12: true,
                    })}
                  </span>
                )}
              </div>

              {/* Resizable wrapper - resize handle at bottom edge of grey box */}
              <div className="flex flex-col min-h-[300px] max-h-[700px] resize-y overflow-hidden -mr-6">
                {/* Scrollable STAR Response Content - flexible height */}
                <div className="flex-1 relative min-h-0 overflow-y-auto">
                  <div className="prose prose-sm max-w-none pr-2">
                    <div dangerouslySetInnerHTML={{ __html: formatStarResponse(starResponse.starResponse) }} />
                  </div>
                </div>

                {/* Section Scores - fixed height, only show if grades are visible */}
                {starResponse.sectionScores && showGrades && (
                  <div className="mt-8 pt-4 border-t border-gray-200 flex-shrink-0">
                    <div className="flex space-x-4 text-sm mb-4">
                      {(() => {
                        try {
                          const scores = JSON.parse(starResponse.sectionScores);
                          return (
                            <>
                              <span className="text-gray-600">
                                Situation: <span className="font-bold text-green-700">{scores.situation}</span>
                              </span>
                              <span className="text-gray-600">
                                Task: <span className="font-bold text-green-700">{scores.task}</span>
                              </span>
                              <span className="text-gray-600">
                                Action: <span className="font-bold text-green-700">{scores.action}</span>
                              </span>
                              <span className="text-gray-600">
                                Result: <span className="font-bold text-green-700">{scores.result}</span>
                              </span>
                            </>
                          );
                        } catch (error) {
                          console.error('Error parsing section scores:', error);
                          return null;
                        }
                      })()}
                    </div>
                  </div>
                )}
              </div>
            </div>

              {/* Button row - outside grey box, against white background */}
              <div className="flex justify-end space-x-2 mt-8">
                {/* Show/Hide Grade button - only if section scores exist */}
                {starResponse.sectionScores && toggleGradeVisibility && (
                  <Tooltip
                    content="AI-generated scores for guidance only"
                    side="top"
                  >
                    <Button
                      onClick={() => toggleGradeVisibility(experience.id)}
                      size="sm"
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {showGrades ? (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Hide Grade
                        </>
                      ) : (
                        <>
                          <Trophy className="h-4 w-4 mr-2" />
                          Show Grade
                        </>
                      )}
                    </Button>
                  </Tooltip>
                )}
                {/* Show/Hide Feedback button - only for in-progress variant */}
                {variant === 'in-progress' && toggleFeedbackVisibility && (
                  <Tooltip
                    content="View feedback questions to improve your response"
                    side="top"
                  >
                    <Button
                      onClick={() => toggleFeedbackVisibility(experience.id)}
                      size="sm"
                      className="bg-indigo-600 text-white hover:bg-indigo-700"
                    >
                      {showFeedback ? (
                        <>
                          <X className="h-4 w-4 mr-2" />
                          Hide Feedback
                        </>
                      ) : (
                        <>
                          <MessageCircle className="h-4 w-4 mr-2" />
                          Show Feedback
                        </>
                      )}
                    </Button>
                  </Tooltip>
                )}
                {/* Re-Generate STAR button - hidden in Star Bank tab */}
                {variant !== 'star-bank' && (
                  <Button
                    onClick={() => handleGenerateSTAR(experience)}
                    disabled={generatingExperienceId === experience.id}
                    size="sm"
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {generatingExperienceId === experience.id ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                        Regenerating...
                      </>
                    ) : (
                      <>
                        <Sparkles className="h-4 w-4 mr-2" />
                        Re-Generate STAR
                      </>
                    )}
                  </Button>
                )}
                {/* STAR Bank button - only for in-progress variant */}
                {variant === 'in-progress' && handleSaveToStarBank && (
                  <Button
                    onClick={() => handleSaveToStarBank(experience)}
                    size="sm"
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Save className="h-4 w-4 mr-2" />
                    STAR Bank
                  </Button>
                )}
                {/* Unsave and Edit STAR button - only for star-bank variant */}
                {variant === 'star-bank' && handleUnsaveFromStarBank && (
                  <Button
                    onClick={() => handleUnsaveFromStarBank(experience)}
                    size="sm"
                    className="bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    <Edit className="h-4 w-4 mr-2" />
                    Unsave and Edit STAR
                  </Button>
                )}
              </div>
              </>
            )}

        {/* Generate STAR button - only for experiences without STAR response */}
        {!hasStarResponse && (
          <div className="flex justify-end mt-4">
            <Button
              onClick={() => handleGenerateSTAR(experience)}
              disabled={generatingExperienceId === experience.id}
              className="bg-indigo-600 text-white hover:bg-indigo-700"
            >
              {generatingExperienceId === experience.id ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Generating...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Generate STAR
                </>
              )}
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

