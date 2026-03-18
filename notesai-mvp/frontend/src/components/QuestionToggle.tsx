'use client';

import { ArrowLeft, ArrowRight } from 'lucide-react';

interface FeedbackQuestion {
  component: string;
  question: string;
}

interface QuestionToggleProps {
  questions: FeedbackQuestion[]; // All questions for this component
  currentIndex: number; // Current question index (0-based)
  onPrevious: () => void; // Callback when previous button clicked
  onNext: () => void; // Callback when next button clicked
  onQuestionClick?: () => void; // Optional callback when question box clicked
}

export default function QuestionToggle({
  questions,
  currentIndex,
  onPrevious,
  onNext,
  onQuestionClick,
}: QuestionToggleProps) {
  // Get current question with bounds checking
  const safeIndex = Math.max(0, Math.min(currentIndex, questions.length - 1));
  const currentQuestion = questions[safeIndex]?.question || 'No questions available';
  const questionCount = questions.length;

  if (questions.length === 0) {
    return (
      <div className="flex-1 flex items-center gap-2 border border-gray-300 rounded-md p-2 bg-gray-50">
        <div className="flex-1 text-sm text-gray-500 italic px-2">
          No questions available
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center gap-2 border border-gray-300 rounded-md p-2 bg-gray-50">
      {/* Question Text - Full display, starts at left */}
      <div className="flex-1 text-sm text-gray-700 px-2">
        <div className="whitespace-pre-wrap break-words">
          {currentQuestion}
        </div>
      </div>

      {/* Navigation Group: [<] x of y [>] */}
      <div className="flex items-center gap-1">
        {/* Left Arrow */}
        <button
          onClick={onPrevious}
          disabled={safeIndex === 0}
          className="p-1 hover:bg-gray-200 active:bg-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
          title="Previous question"
          aria-label="Previous question"
        >
          <ArrowLeft className="h-4 w-4 text-gray-600" />
        </button>

        {/* Counter */}
        <div className="text-xs text-gray-500 px-2 whitespace-nowrap">
          {safeIndex + 1} of {questionCount}
        </div>

        {/* Right Arrow */}
        <button
          onClick={onNext}
          disabled={safeIndex >= questionCount - 1}
          className="p-1 hover:bg-gray-200 active:bg-gray-300 rounded disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 transition-colors"
          title="Next question"
          aria-label="Next question"
        >
          <ArrowRight className="h-4 w-4 text-gray-600" />
        </button>
      </div>
    </div>
  );
}

