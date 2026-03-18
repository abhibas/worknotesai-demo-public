'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, Save, X } from 'lucide-react';
import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@clerk/nextjs';
import { API_URL } from '@/lib/api';
import { Experience, Response } from './ExperienceCard';
import FeedbackSection from './FeedbackSection';

interface FeedbackCardProps {
  experience: Experience;
  response: Response; // STAR response with feedback data
  onContentAppended: (content: string, updatedExperience?: Experience) => void | Promise<void>; // Callback when content saved, optional updated experience from API
  isVoiceSupported?: boolean; // Whether voice input is supported (optional)
  isRecording?: boolean; // Whether currently recording (optional)
  onStartRecording?: () => void; // Callback to start recording (optional)
  onStopRecording?: () => void; // Callback to stop recording (optional)
  onUnsavedChangesChange?: (hasUnsaved: boolean, count: number) => void; // Callback when unsaved state changes
  saveAllRef?: React.MutableRefObject<((baseContent?: string) => Promise<void>) | null>; // Ref to expose handleSaveAll to parent, accepts optional baseContent
  saveEditFormAndGetContent?: () => Promise<string | null>; // Callback to save edit form (if open) and return updated content, or null if no edit form
}

interface FeedbackQuestion {
  component: string;
  question: string;
}

export default function FeedbackCard({
  experience,
  response,
  onContentAppended,
  isVoiceSupported = false,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  onUnsavedChangesChange,
  saveAllRef,
  saveEditFormAndGetContent, // Callback to save edit form and get updated content
}: FeedbackCardProps) {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE || 'true').toLowerCase() === 'true';
  const clerkAuth = demoMode ? null : useAuth();
  const getToken = demoMode
    ? async () => null
    : (clerkAuth?.getToken || (async () => null));
  
  // State for collapsible sections
  const [summaryExpanded, setSummaryExpanded] = useState(true);
  
  // State for tracking unsaved changes
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // Flag to prevent auto-save after successful save (to avoid re-saving cleared inputs)
  const skipAutoSaveRef = useRef(false);
  
  // State for save operations - track which component is saving (null = none)
  const [savingComponent, setSavingComponent] = useState<'situation' | 'task' | 'action' | 'result' | null>(null);

  // State for success/error messages
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const [showErrorMessage, setShowErrorMessage] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const successMessageTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Parse feedbackQuestions JSON string
  let questions: FeedbackQuestion[] = [];
  try {
    if (response.feedbackQuestions) {
      questions = JSON.parse(response.feedbackQuestions);
    }
  } catch (error) {
    console.error('Error parsing feedbackQuestions:', error);
    questions = [];
  }

  // Filter questions by component
  const situationQuestions = questions.filter(q => q.component === 'situation');
  const taskQuestions = questions.filter(q => q.component === 'task');
  const actionQuestions = questions.filter(q => q.component === 'action');
  const resultQuestions = questions.filter(q => q.component === 'result');

  // Parse detailedFeedback JSON string
  interface DetailedFeedback {
    situation?: string;
    task?: string;
    action?: string;
    result?: string;
  }
  
  let parsedDetailedFeedback: DetailedFeedback = {};
  try {
    if (response.detailedFeedback) {
      parsedDetailedFeedback = JSON.parse(response.detailedFeedback);
    }
  } catch (error) {
    console.error('Error parsing detailedFeedback:', error);
    parsedDetailedFeedback = {};
  }

  // State for question indices (current question being displayed for each section)
  const [situationQuestionIndex, setSituationQuestionIndex] = useState(0);
  const [taskQuestionIndex, setTaskQuestionIndex] = useState(0);
  const [actionQuestionIndex, setActionQuestionIndex] = useState(0);
  const [resultQuestionIndex, setResultQuestionIndex] = useState(0);

  // State for user input in each STAR section
  const [situationInput, setSituationInput] = useState('');
  const [taskInput, setTaskInput] = useState('');
  const [actionInput, setActionInput] = useState('');
  const [resultInput, setResultInput] = useState('');

  // Reset keys for textarea height reset (increment to force reset to default size)
  const [situationResetKey, setSituationResetKey] = useState(0);
  const [taskResetKey, setTaskResetKey] = useState(0);
  const [actionResetKey, setActionResetKey] = useState(0);
  const [resultResetKey, setResultResetKey] = useState(0);

  // Refs to track previous experience/response for immediate save on change
  const prevExperienceIdRef = useRef<string | null>(null);
  const prevResponseIdRef = useRef<string | null>(null);

  // Calculate unsaved count dynamically
  const unsavedCount = [
    situationInput.trim().length > 0,
    taskInput.trim().length > 0,
    actionInput.trim().length > 0,
    resultInput.trim().length > 0
  ].filter(Boolean).length;

  // Track unsaved changes and notify parent
  useEffect(() => {
    const count = [
      situationInput.trim().length > 0,
      taskInput.trim().length > 0,
      actionInput.trim().length > 0,
      resultInput.trim().length > 0
    ].filter(Boolean).length;
    
    const hasUnsaved = count > 0;
    setHasUnsavedChanges(hasUnsaved);
    
    // Notify parent of unsaved state changes
    if (onUnsavedChangesChange) {
      onUnsavedChangesChange(hasUnsaved, count);
    }
  }, [situationInput, taskInput, actionInput, resultInput, onUnsavedChangesChange]);

  // Helper function to get localStorage key for this experience
  // Use only experience.id (not response.id) so input persists across STAR re-generations
  // Feedback input is tied to the experience, not the specific response
  const getStorageKey = (expId: string) => {
    return `worknotesai_unsaved_feedback_${expId}`;
  };

  // Auto-Save Logic (localStorage)
  // Save immediately whenever inputs change (no debounce for reliability)
  // IMPORTANT: Only save when inputs change, NOT when experience/response changes
  // Use refs to track current experience/response so we always save to the right key
  const currentExpIdRef = useRef(experience.id);
  const currentRespIdRef = useRef(response.id);
  
  // Update refs when experience changes (but don't trigger save)
  // Note: We don't track response.id in the storage key anymore, so input persists across re-generations
  useEffect(() => {
    currentExpIdRef.current = experience.id;
    currentRespIdRef.current = response.id; // Still track for logging/debugging, but not used in storage key
  }, [experience.id, response.id]);
  
  useEffect(() => {
    // Skip auto-save if we just saved (to prevent re-saving cleared inputs)
    if (skipAutoSaveRef.current) {
      skipAutoSaveRef.current = false; // Reset flag after skipping once
      return;
    }
    
    // Use refs to get current experience/response (won't trigger re-runs)
    const expId = currentExpIdRef.current;
    const respId = currentRespIdRef.current;
    const storageKey = getStorageKey(expId);
    
    // If no unsaved changes, don't clear (let restore handle that)
    if (!hasUnsavedChanges) {
      return;
    }
    
    // Save immediately (no debounce) to ensure data is always saved
    try {
      const feedbackData = {
        experienceId: expId,
        sections: {
          situation: { input: situationInput },
          task: { input: taskInput },
          action: { input: actionInput },
          result: { input: resultInput }
        },
        timestamp: Date.now()
      };
      localStorage.setItem(storageKey, JSON.stringify(feedbackData));
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [
    hasUnsavedChanges,
    situationInput,
    taskInput,
    actionInput,
    resultInput
    // NOTE: Removed experience.id and response.id from dependencies
    // We only want to save when inputs change, not when experience changes
    // Use refs to get current experience/response ID
  ]);

  // Save immediately when experience is about to change (using cleanup)
  // Note: We don't need to save on response.id change since storage key is now experience-only
  useEffect(() => {
    // Capture previous experience ID BEFORE updating refs
    const prevExpId = prevExperienceIdRef.current;
    
    // Cleanup: Save current state BEFORE experience changes
    return () => {
      // Skip if we just saved (to prevent re-saving cleared inputs)
      if (skipAutoSaveRef.current) {
        return;
      }
      
      // This runs BEFORE the next effect (restore) runs
      // Capture current values at this moment (these are the OLD experience's values)
      const currentInputs = {
        situation: situationInput,
        task: taskInput,
        action: actionInput,
        result: resultInput
      };
      
      // Only save if we have input and we had a previous experience (not initial mount)
      if (prevExpId && (currentInputs.situation || currentInputs.task || currentInputs.action || currentInputs.result)) {
        try {
          const prevStorageKey = getStorageKey(prevExpId);
          const feedbackData = {
            experienceId: prevExpId,
            sections: {
              situation: { input: currentInputs.situation },
              task: { input: currentInputs.task },
              action: { input: currentInputs.action },
              result: { input: currentInputs.result }
            },
            timestamp: Date.now()
          };
          localStorage.setItem(prevStorageKey, JSON.stringify(feedbackData));
          // Saved feedback before switching experience
        } catch (error) {
          console.error('Error immediately saving to localStorage:', error);
        }
      }
    };
  }, [experience.id, situationInput, taskInput, actionInput, resultInput]);
  
  // Update refs AFTER the cleanup has been set up
  useEffect(() => {
    prevExperienceIdRef.current = experience.id;
    // Note: We still track response.id for debugging, but it's not used in storage key
    prevResponseIdRef.current = response.id;
  }, [experience.id, response.id]);

  // Reset textarea heights when STAR is regenerated (response.id changes)
  // Note: We only reset textarea heights, NOT input values, so input persists across STAR re-generations
  useEffect(() => {
    if (!experience || !response) return;
    
    // Reset textarea heights when response.id changes (STAR regenerated)
    setSituationResetKey(prev => prev + 1);
    setTaskResetKey(prev => prev + 1);
    setActionResetKey(prev => prev + 1);
    setResultResetKey(prev => prev + 1);
  }, [response.id]); // Only run when response.id changes (STAR regenerated)

  // Restore Logic (localStorage) + Reset when experience changes
  // Note: We only reset when experience.id changes, NOT when response.id changes
  // This allows input to persist across STAR re-generations
  useEffect(() => {
    if (!experience || !response) return;

    // Since this effect only runs when experience.id changes (dependency array),
    // we should ALWAYS reset first to clear any previous experience's data
    setSituationInput('');
    setTaskInput('');
    setActionInput('');
    setResultInput('');
    setHasUnsavedChanges(false);
    setSituationQuestionIndex(0);
    setTaskQuestionIndex(0);
    setActionQuestionIndex(0);
    setResultQuestionIndex(0);
    
    // Reset textarea heights to default when switching experiences
    setSituationResetKey(prev => prev + 1);
    setTaskResetKey(prev => prev + 1);
    setActionResetKey(prev => prev + 1);
    setResultResetKey(prev => prev + 1);
    
    // Notify parent that there are no unsaved changes when experience changes
    if (onUnsavedChangesChange) {
      onUnsavedChangesChange(false, 0);
    }

    // Now restore saved data for the CURRENT experience (if it exists)
    try {
      const storageKey = getStorageKey(experience.id);
      const savedFeedback = localStorage.getItem(storageKey);
      
      if (savedFeedback) {
        const parsed = JSON.parse(savedFeedback);
        
        // Verify the data matches (should always match since key includes experience ID)
        if (parsed.experienceId === experience.id) {
          // Check if data is recent (within 7 days)
          const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
          if (parsed.timestamp && parsed.timestamp > sevenDaysAgo) {
            // Only restore non-empty inputs (empty strings mean content was saved)
            const situationInput = parsed.sections?.situation?.input?.trim() || '';
            const taskInput = parsed.sections?.task?.input?.trim() || '';
            const actionInput = parsed.sections?.action?.input?.trim() || '';
            const resultInput = parsed.sections?.result?.input?.trim() || '';
            
            // Only restore if there's actual content to restore
            if (situationInput || taskInput || actionInput || resultInput) {
              setSituationInput(situationInput);
              setTaskInput(taskInput);
              setActionInput(actionInput);
              setResultInput(resultInput);
              setHasUnsavedChanges(true);
              
              // Notify parent of unsaved changes
              if (onUnsavedChangesChange) {
                const count = [situationInput, taskInput, actionInput, resultInput].filter(Boolean).length;
                onUnsavedChangesChange(true, count);
              }
            } else {
              // All inputs are empty - this means content was saved, remove localStorage
              localStorage.removeItem(storageKey);
            }
          } else {
            // Data is too old, clear it
            localStorage.removeItem(storageKey);
          }
        } else {
          console.warn('Data mismatch - expected', experience.id, 'got', parsed.experienceId);
        }
      }
      // If no saved feedback, inputs remain empty (already reset above)
    } catch (error) {
      console.error('Error restoring unsaved feedback:', error);
      // If error, inputs remain empty (already reset above)
    }
  }, [experience.id]); // Only run when experience.id changes, NOT when response.id changes

  // Helper function to format content (extracted for reuse in Save All)
  const formatFeedbackContent = (content: string): string => {
    const contentToSave = content.trim();
    if (!contentToSave) return '';

    // Parse contentToSave to separate questions (Q:) and answers (A:)
    // Content may contain "Q: [question]\n\n" followed by user's answer
    // We need to format it as: [Q: question] [A: answer]
    let formattedContent = '';
    const lines = contentToSave.split('\n');
    let currentQuestion = '';
    let currentAnswer = '';
    let inQuestion = false;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Check if line starts with "Q:" (case insensitive)
      if (line.match(/^Q:\s*/i)) {
        // If we had a previous question/answer pair, add it
        if (currentQuestion || currentAnswer) {
          formattedContent += (currentQuestion ? `Q: ${currentQuestion}\n` : '');
          formattedContent += (currentAnswer ? `A: ${currentAnswer}\n\n` : '\n');
        }
        // Start new question
        currentQuestion = line.replace(/^Q:\s*/i, '').trim();
        currentAnswer = '';
        inQuestion = true;
      } else if (line === '' && inQuestion) {
        // Empty line after question - next non-empty line is answer
        inQuestion = false;
      } else if (line && !inQuestion) {
        // This is part of the answer
        if (currentAnswer) {
          currentAnswer += '\n' + line;
        } else {
          currentAnswer = line;
        }
      } else if (line && inQuestion) {
        // Continuation of question
        currentQuestion += ' ' + line;
      }
    }
    
    // Add the last question/answer pair
    if (currentQuestion || currentAnswer) {
      formattedContent += (currentQuestion ? `Q: ${currentQuestion}\n` : '');
      formattedContent += (currentAnswer ? `A: ${currentAnswer}` : '');
    }
    
    // If no Q:/A: structure found, treat entire content as answer
    if (!formattedContent.trim()) {
      formattedContent = `A: ${contentToSave}`;
    }

    return formattedContent;
  };

  // Handle Save to Main Content (single component)
  const handleSaveFeedback = async (component: 'situation' | 'task' | 'action' | 'result', content: string) => {
    // Validate: content must not be empty
    if (!content || !content.trim()) {
      console.warn(`Cannot save empty content for ${component}`);
      return;
    }

    // Only save the content passed as parameter (specific to this component)
    const contentToSave = content.trim();

    setSavingComponent(component);
    
    try {
      // Format timestamp
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });
      
      // Format component name (uppercase for STAR section)
      const componentName = component.toUpperCase();
      
      // Format content using helper function
      const formattedContent = formatFeedbackContent(contentToSave);
      
      // Format: [Star Section] [Timestamp] [Q:] [A:]
      const appendText = `${componentName}\n${timestamp}\n${formattedContent}`;
      
      // If edit form is open, save it first and get updated content (same as "Save All" behavior)
      // This ensures both edits and feedback are saved together atomically
      let baseContent = experience.content;
      if (saveEditFormAndGetContent) {
        const savedEditContent = await saveEditFormAndGetContent();
        if (savedEditContent !== null) {
          baseContent = savedEditContent; // Use saved edit form content
        }
      }
      
      // Append feedback to the base content
      const updatedContent = baseContent + '\n\n' + appendText;
      
      // Get auth token
      const token = await getToken();
      if (!token && !demoMode) {
        throw new Error('Authentication required');
      }
      
      // Update experience via API
      // NOTE: If edit form is open, this will overwrite any unsaved edits in the edit form
      // The edit form should be closed before saving feedback, or we need to merge content
      const apiResponse = await fetch(`${API_URL}/api/experiences/${experience.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: updatedContent,
          updatedAt: new Date().toISOString()
        }),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `Failed to save: ${apiResponse.statusText}` };
        }
        console.error('API Error Response:', {
          status: apiResponse.status,
          statusText: apiResponse.statusText,
          error: errorData
        });
        throw new Error(errorData.error || `Failed to save: ${apiResponse.statusText}`);
      }
      
      const result = await apiResponse.json();
      
      // Call parent callback to refresh experience data
      // Pass the updated experience from API response for immediate update
      try {
        await onContentAppended(appendText, result.experience);
      } catch (callbackError) {
        console.error('Error in onContentAppended callback:', callbackError);
        // Don't throw - save was successful, just callback failed
      }
      
      // Show success message (no count - same message for all saves)
      setSuccessMessage('Responses saved. Ready to re-generate STAR.');
      
      setShowSuccessMessage(true);
      setShowErrorMessage(false); // Clear any error message
      
      // Clear existing timeout if any
      if (successMessageTimeoutRef.current) {
        clearTimeout(successMessageTimeoutRef.current);
      }
      
      // Auto-hide after 10 seconds
      successMessageTimeoutRef.current = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 10000);
      
      // Set flag FIRST to prevent auto-save from re-saving cleared inputs
      skipAutoSaveRef.current = true;
      
      // Remove localStorage entirely after successful individual save
      // This prevents the restore logic from restoring saved content
      const storageKey = getStorageKey(experience.id);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.error('Error removing localStorage:', e);
      }
      
      // Success - clear input for this section
      // After successful save, remove localStorage entirely to prevent restore
      // This ensures saved content doesn't reappear when navigating back
      if (component === 'situation') {
        setSituationInput('');
        setSituationResetKey(prev => prev + 1); // Reset textarea height to default
      } else if (component === 'task') {
        setTaskInput('');
        setTaskResetKey(prev => prev + 1); // Reset textarea height to default
      } else if (component === 'action') {
        setActionInput('');
        setActionResetKey(prev => prev + 1); // Reset textarea height to default
      } else if (component === 'result') {
        setResultInput('');
        setResultResetKey(prev => prev + 1); // Reset textarea height to default
      }
      
      // Notify parent immediately (synchronously) that unsaved state has changed
      // The effect that tracks unsavedCount will also fire, but calling this explicitly ensures parent updates immediately
      if (onUnsavedChangesChange) {
        onUnsavedChangesChange(false, 0);
      }
      
      // Successfully saved
    } catch (error) {
      console.error(`Error saving ${component} feedback:`, error);
      
      // Show error message
      setErrorMessage('Save failed. Please try again.');
      setShowErrorMessage(true);
      setShowSuccessMessage(false); // Clear any success message
      
      // Error messages don't auto-hide (per requirements)
      // User must manually dismiss
      
      // Don't clear input on error
    } finally {
      setSavingComponent(null);
    }
  };

  // Handle Save All - Save all sections with unsaved changes
  // Optional baseContent parameter: if provided, use this instead of experience.content
  // This allows using updated content after edit form save
  const handleSaveAll = async (baseContent?: string) => {
    // Collect all non-empty inputs
    const sectionsToSave: Array<{ component: 'situation' | 'task' | 'action' | 'result', content: string }> = [];
    
    if (situationInput.trim()) {
      sectionsToSave.push({ component: 'situation', content: situationInput });
    }
    if (taskInput.trim()) {
      sectionsToSave.push({ component: 'task', content: taskInput });
    }
    if (actionInput.trim()) {
      sectionsToSave.push({ component: 'action', content: actionInput });
    }
    if (resultInput.trim()) {
      sectionsToSave.push({ component: 'result', content: resultInput });
    }

    // If nothing to save, return early
    if (sectionsToSave.length === 0) {
      console.warn('No content to save');
      return;
    }

    // Set saving state (use a special value to indicate "saving all")
    setSavingComponent('situation'); // Use first component as indicator, but we'll handle all

    try {
      // Format timestamp (same for all sections)
      const timestamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
        hour12: true
      });

      // Format all sections
      const appendTexts: string[] = [];
      
      for (const { component, content } of sectionsToSave) {
        const componentName = component.toUpperCase();
        const formattedContent = formatFeedbackContent(content);
        
        // Format: [Star Section] [Timestamp] [Q:] [A:]
        const appendText = `${componentName}\n${timestamp}\n${formattedContent}`;
        appendTexts.push(appendText);
      }

      // Combine all append texts with double newline separator
      const combinedAppendText = appendTexts.join('\n\n');

      // If edit form is open, save it first and get updated content (same as "Save All" behavior)
      // Priority: baseContent (from navigation save) > saved edit form content > experience.content
      // This ensures both edits and feedback are saved together atomically
      let currentContent = experience.content;
      if (!baseContent && saveEditFormAndGetContent) {
        const savedEditContent = await saveEditFormAndGetContent();
        if (savedEditContent !== null) {
          currentContent = savedEditContent; // Use saved edit form content
        }
      } else if (baseContent) {
        currentContent = baseContent; // Use provided baseContent (from navigation save)
      }
      
      // Append feedback to the current content
      const updatedContent = currentContent + '\n\n' + combinedAppendText;

      // Get auth token
      const token = await getToken();
      if (!token && !demoMode) {
        throw new Error('Authentication required');
      }

      // Update experience via API
      const apiResponse = await fetch(`${API_URL}/api/experiences/${experience.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          content: updatedContent,
          updatedAt: new Date().toISOString()
        }),
      });

      if (!apiResponse.ok) {
        const errorText = await apiResponse.text();
        let errorData;
        try {
          errorData = JSON.parse(errorText);
        } catch {
          errorData = { error: errorText || `Failed to save: ${apiResponse.statusText}` };
        }
        console.error('API Error Response:', {
          status: apiResponse.status,
          statusText: apiResponse.statusText,
          error: errorData
        });
        throw new Error(errorData.error || `Failed to save: ${apiResponse.statusText}`);
      }
      
      const result = await apiResponse.json();

      // Call parent callback to refresh experience data
      try {
        await onContentAppended(combinedAppendText, result.experience);
      } catch (callbackError) {
        console.error('Error in onContentAppended callback:', callbackError);
        // Don't throw - save was successful, just callback failed
      }

      // Show success message (no count - same message for all saves)
      setSuccessMessage('Responses saved. Ready to re-generate STAR.');
      setShowSuccessMessage(true);
      setShowErrorMessage(false); // Clear any error message
      
      
      // Clear existing timeout if any
      if (successMessageTimeoutRef.current) {
        clearTimeout(successMessageTimeoutRef.current);
      }
      
      // Auto-hide after 10 seconds
      successMessageTimeoutRef.current = setTimeout(() => {
        setShowSuccessMessage(false);
      }, 10000);

      // Set flag FIRST to prevent auto-save from re-saving cleared inputs
      skipAutoSaveRef.current = true;
      
      // Remove localStorage entirely after successful save (not just clear - prevents restore from stale data)
      const storageKey = getStorageKey(experience.id);
      try {
        localStorage.removeItem(storageKey);
      } catch (e) {
        console.error('Error removing localStorage:', e);
      }
      
      // Success - clear all inputs and localStorage
      setSituationInput('');
      setTaskInput('');
      setActionInput('');
      setResultInput('');
      setHasUnsavedChanges(false);
      
      // Reset all textarea heights to default after Save All
      setSituationResetKey(prev => prev + 1);
      setTaskResetKey(prev => prev + 1);
      setActionResetKey(prev => prev + 1);
      setResultResetKey(prev => prev + 1);
      
      // Explicitly notify parent immediately (synchronously) that unsaved state has changed
      // The effect that tracks unsavedCount will also fire, but calling this explicitly ensures parent updates immediately
      if (onUnsavedChangesChange) {
        onUnsavedChangesChange(false, 0);
      }
    } catch (error) {
      console.error('Error saving all feedback:', error);
      
      // Show error message
      setErrorMessage('Save failed. Please try again.');
      setShowErrorMessage(true);
      setShowSuccessMessage(false); // Clear any success message
      
      // Error messages don't auto-hide (per requirements)
      // User must manually dismiss
      
      // Don't clear inputs on error
    } finally {
      setSavingComponent(null);
    }
  };

  // Expose handleSaveAll to parent via ref (after it's defined)
  useEffect(() => {
    if (saveAllRef) {
      saveAllRef.current = handleSaveAll;
    }
    return () => {
      if (saveAllRef) {
        saveAllRef.current = null;
      }
    };
  }, [saveAllRef, handleSaveAll]);

  // Cleanup timeout on unmount
  useEffect(() => {
    return () => {
      if (successMessageTimeoutRef.current) {
        clearTimeout(successMessageTimeoutRef.current);
      }
    };
  }, []);

  return (
    <>
      {/* Success/Error Messages - Appear between ExperienceCard and FeedbackCard */}
      {/* Fixed height container to prevent layout shift when message appears/disappears */}
      <div className="max-w-4xl mx-auto mb-6 mt-6 min-h-[60px]">
        {showSuccessMessage && (
          <div className="p-4 bg-green-50 border border-green-200 rounded-lg transition-all duration-300 ease-in-out" role="alert" aria-live="polite">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">🎉</span>
                <div className="text-sm font-medium text-green-800">
                  {successMessage}
                </div>
              </div>
              <button
                onClick={() => {
                  setShowSuccessMessage(false);
                  if (successMessageTimeoutRef.current) {
                    clearTimeout(successMessageTimeoutRef.current);
                  }
                }}
                className="text-green-600 hover:text-green-800 active:text-green-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-green-500 focus-visible:ring-offset-2 rounded transition-colors"
                title="Dismiss message"
                aria-label="Dismiss success message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}

        {showErrorMessage && (
          <div className="p-4 bg-red-50 border border-red-200 rounded-lg transition-all duration-300 ease-in-out" role="alert" aria-live="assertive">
            <div className="flex items-center justify-between">
              <div className="flex items-center space-x-2">
                <span className="text-lg">⚠️</span>
                <div className="text-sm font-medium text-red-800">
                  {errorMessage}
                </div>
              </div>
              <button
                onClick={() => setShowErrorMessage(false)}
                className="text-red-600 hover:text-red-800 active:text-red-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-500 focus-visible:ring-offset-2 rounded transition-colors"
                title="Dismiss message"
                aria-label="Dismiss error message"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <Card className="mt-6">
      <CardHeader>
        <div className="flex justify-between items-start">
          <div className="flex-1">
            <CardTitle className="text-lg">Feedback: Capture your experience and improve your response</CardTitle>
          </div>
          <div className="flex items-center space-x-2">
            {/* Save All Button */}
            <Button
              variant={unsavedCount > 0 ? "default" : "outline"}
              size="sm"
                onClick={() => handleSaveAll()}
              disabled={savingComponent !== null || unsavedCount === 0}
              className={
                unsavedCount > 0
                  ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white transition-colors'
                  : 'border-gray-300 text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors'
              }
              aria-label={unsavedCount > 0 ? `Save all ${unsavedCount} feedback responses` : "No unsaved changes"}
            >
              <Save className="h-4 w-4" />
              {unsavedCount > 0 && <span className="ml-2">Save All</span>}
            </Button>
            {/* Chevron Toggle for Summary Feedback */}
            {response.summaryFeedback && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setSummaryExpanded(!summaryExpanded)}
                className="text-gray-600 hover:text-gray-700 active:text-gray-800 transition-colors"
                aria-expanded={summaryExpanded}
                aria-label={summaryExpanded ? "Collapse summary feedback" : "Expand summary feedback"}
              >
                {summaryExpanded ? (
                  <ChevronUp className="h-4 w-4" />
                ) : (
                  <ChevronDown className="h-4 w-4" />
                )}
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Summary Feedback Section */}
        {response.summaryFeedback && summaryExpanded && (
          <div className="border border-gray-200 rounded-lg p-4 transition-all duration-200 ease-in-out">
            <div className="text-sm text-gray-700 whitespace-pre-wrap">
              Summary Feedback: {response.summaryFeedback}
            </div>
          </div>
        )}

        {/* Feedback Sections - Using FeedbackSection components */}
        <div className="space-y-4">
          {/* Situation Section */}
          <FeedbackSection
            component="situation"
            detailedFeedback={parsedDetailedFeedback.situation || ''}
            questions={situationQuestions}
            currentQuestionIndex={situationQuestionIndex}
            onQuestionChange={setSituationQuestionIndex}
            input={situationInput}
            onInputChange={setSituationInput}
            onSave={(value: string) => handleSaveFeedback('situation', value)}
            onCancel={() => {
              setSituationInput('');
            }}
            onInsertQuestion={(question) => {
              // Insert question with proper formatting: "Q: [question]\n\n"
              setSituationInput(prev => prev ? `${prev}\n\nQ: ${question}\n\n` : `Q: ${question}\n\n`);
            }}
            isVoiceSupported={isVoiceSupported}
            isRecording={isRecording}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            isSaving={savingComponent === 'situation'}
            resetKey={situationResetKey}
          />

          {/* Task Section */}
          <FeedbackSection
            component="task"
            detailedFeedback={parsedDetailedFeedback.task || ''}
            questions={taskQuestions}
            currentQuestionIndex={taskQuestionIndex}
            onQuestionChange={setTaskQuestionIndex}
            input={taskInput}
            onInputChange={setTaskInput}
            onSave={(value: string) => handleSaveFeedback('task', value)}
            onCancel={() => {
              setTaskInput('');
            }}
            onInsertQuestion={(question) => {
              // Insert question with proper formatting: "Q: [question]\n\n"
              setTaskInput(prev => prev ? `${prev}\n\nQ: ${question}\n\n` : `Q: ${question}\n\n`);
            }}
            isVoiceSupported={isVoiceSupported}
            isRecording={isRecording}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            isSaving={savingComponent === 'task'}
            resetKey={taskResetKey}
          />

          {/* Action Section */}
          <FeedbackSection
            component="action"
            detailedFeedback={parsedDetailedFeedback.action || ''}
            questions={actionQuestions}
            currentQuestionIndex={actionQuestionIndex}
            onQuestionChange={setActionQuestionIndex}
            input={actionInput}
            onInputChange={setActionInput}
            onSave={(value: string) => handleSaveFeedback('action', value)}
            onCancel={() => {
              setActionInput('');
            }}
            onInsertQuestion={(question) => {
              // Insert question with proper formatting: "Q: [question]\n\n"
              setActionInput(prev => prev ? `${prev}\n\nQ: ${question}\n\n` : `Q: ${question}\n\n`);
            }}
            isVoiceSupported={isVoiceSupported}
            isRecording={isRecording}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            isSaving={savingComponent === 'action'}
            resetKey={actionResetKey}
          />

          {/* Result Section */}
          <FeedbackSection
            component="result"
            detailedFeedback={parsedDetailedFeedback.result || ''}
            questions={resultQuestions}
            currentQuestionIndex={resultQuestionIndex}
            onQuestionChange={setResultQuestionIndex}
            input={resultInput}
            onInputChange={setResultInput}
            onSave={(value: string) => handleSaveFeedback('result', value)}
            onCancel={() => {
              setResultInput('');
            }}
            onInsertQuestion={(question) => {
              // Insert question with proper formatting: "Q: [question]\n\n"
              setResultInput(prev => prev ? `${prev}\n\nQ: ${question}\n\n` : `Q: ${question}\n\n`);
            }}
            isVoiceSupported={isVoiceSupported}
            isRecording={isRecording}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            isSaving={savingComponent === 'result'}
            resetKey={resultResetKey}
          />
        </div>
      </CardContent>
    </Card>
    </>
  );
}



