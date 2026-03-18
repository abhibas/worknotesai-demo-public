'use client';

import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Mic, MicOff } from 'lucide-react';

interface FeedbackInputProps {
  value: string; // Current input value
  onChange: (value: string) => void; // Callback when input changes
  onSave: (value: string) => void | Promise<void>; // Callback when save is clicked - receives current value to avoid closure issues
  onCancel: () => void; // Callback when cancel is clicked
  isExpanded: boolean; // Whether input is expanded (default: true)
  onToggleExpand: () => void; // Callback to toggle expand/collapse
  hasUnsavedChanges: boolean; // Whether there are unsaved changes
  isVoiceSupported?: boolean; // Whether voice input is supported (optional)
  isRecording?: boolean; // Whether currently recording (optional)
  onStartRecording?: () => void; // Callback to start recording (optional)
  onStopRecording?: () => void; // Callback to stop recording (optional)
  isSaving?: boolean; // Whether a save operation is in progress
  resetKey?: number; // Key to force textarea reset to default size (increments when reset needed)
}

export default function FeedbackInput({
  value,
  onChange,
  onSave,
  onCancel,
  isExpanded,
  onToggleExpand,
  hasUnsavedChanges,
  isVoiceSupported = false,
  isRecording = false,
  onStartRecording,
  onStopRecording,
  isSaving = false,
  resetKey = 0, // Default reset key
}: FeedbackInputProps) {
  return (
    <div className="space-y-3">
      {/* Textarea with Voice Button */}
      <div className="relative">
        <Textarea
          key={resetKey} // Reset textarea to default size when resetKey changes
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder="Add your response here..."
          className="resize-y min-h-[100px] max-h-[350px] overflow-y-auto pr-12"
          rows={4}
          disabled={isSaving}
        />
        {/* Voice Button - Only show if voice is supported */}
        {isVoiceSupported && (
          <button
            onClick={isRecording ? onStopRecording : onStartRecording}
            className={`absolute top-2 right-2 p-2 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 ${
              isRecording
                ? 'bg-red-100 text-red-600 hover:bg-red-200 active:bg-red-300'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200 active:bg-gray-300'
            }`}
            title={isRecording ? 'Stop recording' : 'Start voice recording'}
            disabled={isSaving}
            aria-label={isRecording ? 'Stop voice recording' : 'Start voice recording'}
          >
            {isRecording ? (
              <MicOff className="h-4 w-4" />
            ) : (
              <Mic className="h-4 w-4" />
            )}
          </button>
        )}
      </div>

      {/* Recording Indicator */}
      {isRecording && (
        <p className="text-xs text-red-600 flex items-center">
          <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full mr-2"></div>
          Recording... Click the microphone to stop
        </p>
      )}

      {/* Action Buttons */}
      <div className="flex gap-2 justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={onCancel}
          disabled={isSaving}
          className="border-gray-300 text-gray-700 hover:bg-gray-50 active:bg-gray-100 transition-colors"
          aria-label="Cancel input"
        >
          Cancel
        </Button>
        <Button
          variant={hasUnsavedChanges ? "default" : "outline"}
          size="sm"
          onClick={() => onSave(value)} // Pass current value to avoid closure issues
          disabled={!hasUnsavedChanges || isSaving}
          className={
            hasUnsavedChanges
              ? 'bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white transition-colors'
              : 'border-gray-300 text-gray-400 hover:bg-gray-50 active:bg-gray-100 transition-colors'
          }
          aria-label={hasUnsavedChanges ? "Save feedback" : "No changes to save"}
        >
          Save
        </Button>
      </div>
    </div>
  );
}

