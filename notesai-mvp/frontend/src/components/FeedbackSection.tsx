'use client';

import { useState } from 'react';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { Button } from '@/components/ui/button';
import FeedbackInput from './FeedbackInput';
import QuestionToggle from './QuestionToggle';

interface FeedbackQuestion {
  component: string;
  question: string;
}

interface FeedbackSectionProps {
  component: 'situation' | 'task' | 'action' | 'result';
  detailedFeedback: string; // Read-only feedback text for this component
  questions: FeedbackQuestion[]; // Filtered by component
  currentQuestionIndex: number; // Current question being displayed (0-based)
  onQuestionChange: (index: number) => void; // Callback when question changes
  input: string; // Current input value
  onInputChange: (value: string) => void; // Callback when input changes
  onSave: (value: string) => void | Promise<void>; // Callback when save is clicked - receives current value
  onCancel: () => void; // Callback when cancel is clicked
  onInsertQuestion: (question: string) => void; // Callback when question is inserted
  isVoiceSupported?: boolean; // Whether voice input is supported (optional)
  isRecording?: boolean; // Whether currently recording (optional)
  onStartRecording?: () => void; // Callback to start recording (optional)
  onStopRecording?: () => void; // Callback to stop recording (optional)
  isSaving: boolean; // Whether a save operation is in progress
  resetKey?: number; // Key to force textarea reset to default size (increments when reset needed)
}

export default function FeedbackSection({
  component,
  detailedFeedback,
  questions,
  currentQuestionIndex,
  onQuestionChange,
  input,
  onInputChange,
  onSave,
  onCancel,
  onInsertQuestion,
  isVoiceSupported = false,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  isSaving,
  resetKey = 0, // Default reset key
}: FeedbackSectionProps) {
  // State for section expand/collapse (default: expanded)
  const [sectionExpanded, setSectionExpanded] = useState(true);

  // Get current question (with bounds checking) - for insert question functionality
  const safeIndex = Math.max(0, Math.min(currentQuestionIndex, questions.length - 1));
  const currentQuestion = questions[safeIndex]?.question || 'No questions available';
  const questionCount = questions.length;

  // Component name in uppercase
  const componentName = component.toUpperCase();

  return (
    <div className="border border-gray-200 rounded-lg">
      {/* Section Header with Expand/Collapse */}
      <button
        onClick={() => setSectionExpanded(!sectionExpanded)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setSectionExpanded(!sectionExpanded);
          }
        }}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 rounded-t-lg transition-colors"
        aria-expanded={sectionExpanded}
        aria-controls={`${component}-section-content`}
        aria-label={`${componentName} section, click to ${sectionExpanded ? 'collapse' : 'expand'}`}
      >
        <h3 className="font-semibold text-gray-900 text-base">{componentName}</h3>
        {sectionExpanded ? (
          <ChevronUp className="h-5 w-5 text-gray-500 transition-transform" />
        ) : (
          <ChevronDown className="h-5 w-5 text-gray-500 transition-transform" />
        )}
      </button>

      {/* Section Content - Only visible when expanded */}
      {sectionExpanded && (
        <div 
          id={`${component}-section-content`}
          className="px-4 pb-4 space-y-4 transition-all duration-200 ease-in-out"
        >
          {/* Detailed Feedback Section - HIDDEN for now (data still stored, can be re-enabled later) */}
          {/* {detailedFeedback && (
            <div className="border border-gray-200 rounded-lg p-3">
              <div className="text-sm font-medium text-gray-900 mb-2">Detailed Feedback</div>
              <div className="text-sm text-gray-700 whitespace-pre-wrap">
                {detailedFeedback}
              </div>
            </div>
          )} */}

          {/* Question Toggle + Insert Button Row */}
          {questions.length > 0 ? (
            <div className="flex items-center gap-2">
              {/* QuestionToggle Component */}
              <QuestionToggle
                questions={questions}
                currentIndex={currentQuestionIndex}
                onPrevious={() => {
                  if (safeIndex > 0) {
                    onQuestionChange(safeIndex - 1);
                  }
                }}
                onNext={() => {
                  if (safeIndex < questionCount - 1) {
                    onQuestionChange(safeIndex + 1);
                  }
                }}
                onQuestionClick={() => {
                  // Optional: Could trigger other actions in future
                }}
              />

              {/* Insert Button - Inserts current question into input */}
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  if (currentQuestion && currentQuestion !== 'No questions available') {
                    onInsertQuestion(currentQuestion);
                  }
                }}
                disabled={!currentQuestion || currentQuestion === 'No questions available'}
                className="border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                title="Insert current question into input field"
                aria-label="Insert current question into input field"
              >
                Insert
              </Button>
            </div>
          ) : (
            <div className="text-sm text-gray-500 italic">
              No questions available for this section
            </div>
          )}

          {/* FeedbackInput Component - Always expanded when section is expanded */}
          <FeedbackInput
            value={input}
            onChange={onInputChange}
            onSave={onSave}
            onCancel={() => {
              onCancel();
            }}
            isExpanded={true} // Always expanded when section is expanded
            onToggleExpand={() => {}} // No-op since always expanded
            hasUnsavedChanges={input.trim().length > 0}
            isVoiceSupported={isVoiceSupported}
            isRecording={isRecording}
            onStartRecording={onStartRecording}
            onStopRecording={onStopRecording}
            isSaving={isSaving}
            resetKey={resetKey} // Pass reset key to reset textarea height
          />
        </div>
      )}
    </div>
  );
}

