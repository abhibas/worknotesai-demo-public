'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Mic, MicOff, Save } from 'lucide-react';
import { Experience } from './ExperienceCard';

interface EditExperienceFormProps {
  experienceId: string;
  // Form state
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
  // Original content for comparison
  originalContent: string;
  // Recording state
  editIsRecording: boolean;
  editIsSubmitting: boolean;
  isVoiceSupported: boolean;
  // Functions
  generateEditTitle: () => string;
  handleSaveEdit: (experienceId: string) => Promise<Experience | null>;
  handleCancelEdit: () => void;
  startEditVoiceRecording: () => void;
  stopEditVoiceRecording: () => void;
}

export default function EditExperienceForm({
  experienceId,
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
  originalContent,
  editIsRecording,
  editIsSubmitting,
  isVoiceSupported,
  generateEditTitle,
  handleSaveEdit,
  handleCancelEdit,
  startEditVoiceRecording,
  stopEditVoiceRecording,
}: EditExperienceFormProps) {
  // Check if there are changes to highlight the save button
  const hasChanges = editExperienceText.trim() !== originalContent.trim();
  return (
    <Card>
      <CardContent className="space-y-6 pt-6">
        {/* Title Field */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Title</label>
          <input
            type="text"
            value={editTitle || generateEditTitle()}
            onChange={(e) => setEditTitle(e.target.value)}
            placeholder={generateEditTitle() || "company - role - date - project - experience title"}
            className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
            style={{ color: editTitle ? 'black' : 'grey' }}
          />
          {generateEditTitle() && !editTitle && (
            <p className="text-xs text-gray-500">
              Auto-generated: {generateEditTitle()}
            </p>
          )}
        </div>

        {/* Experience Text Area */}
        <div className="space-y-2">
          <label className="text-sm font-medium text-gray-700">Your Experience</label>
          <div className="relative">
            <Textarea
              value={editExperienceText}
              onChange={(e) => setEditExperienceText(e.target.value)}
              placeholder="Describe your professional experience in detail..."
              className={`resize-y overflow-y-auto pr-12 ${
                editExperienceText.length >= 200 
                  ? 'min-h-[300px] max-h-[600px]' 
                  : 'min-h-[120px] max-h-[600px]'
              }`}
              rows={editExperienceText.length >= 200 ? 15 : 6}
            />
            {isVoiceSupported && (
              <button
                onClick={editIsRecording ? stopEditVoiceRecording : startEditVoiceRecording}
                className={`absolute top-2 right-2 p-2 rounded-full transition-colors ${
                  editIsRecording
                    ? 'bg-red-100 text-red-600 hover:bg-red-200'
                    : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                }`}
                title={editIsRecording ? 'Stop recording' : 'Start voice recording'}
              >
                {editIsRecording ? (
                  <MicOff className="h-4 w-4" />
                ) : (
                  <Mic className="h-4 w-4" />
                )}
              </button>
            )}
          </div>
          {editIsRecording && (
            <p className="text-xs text-red-600 flex items-center">
              <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full mr-2"></div>
              Recording... Click the microphone to stop
            </p>
          )}
        </div>

        {/* Tags Field - after textarea, before company/role/date, no border */}
        {editExperienceText.trim() && (
          <div className="mt-4">
            <label className="block text-sm font-medium text-gray-600 mb-1">
              Tags
            </label>
            <input
              type="text"
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              placeholder="e.g., leadership, technical, teamwork, (separate with commas)"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500 placeholder:text-[#808080] placeholder:opacity-100"
            />
          </div>
        )}

        {/* Dynamic Form Fields - Only show when user starts typing */}
        {editExperienceText.trim() && (
          <div className="space-y-4 mt-4">
            <div className="grid grid-cols-3 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Company
                </label>
                <input
                  type="text"
                  value={editCompany}
                  onChange={(e) => setEditCompany(e.target.value)}
                  placeholder="e.g., google, microsoft"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Role
                </label>
                <input
                  type="text"
                  value={editRole}
                  onChange={(e) => setEditRole(e.target.value)}
                  placeholder="e.g., product manager, software engineer"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Date
                </label>
                <input
                  type="text"
                  value={editDate}
                  onChange={(e) => setEditDate(e.target.value)}
                  placeholder="e.g., mm-dd-yy, mm-yy"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Project
                </label>
                <input
                  type="text"
                  value={editProject}
                  onChange={(e) => setEditProject(e.target.value)}
                  placeholder="e.g., mobile app redesign, data migration"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-600 mb-1">
                  Experience Title
                </label>
                <input
                  type="text"
                  value={editExperienceTitle}
                  onChange={(e) => setEditExperienceTitle(e.target.value)}
                  placeholder="e.g., led cross-functional team, improved user engagement"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              </div>
            </div>
          </div>
        )}

        {/* Action Buttons */}
        <div className="flex justify-end space-x-3 pt-4">
          <Button
            variant="outline"
            onClick={handleCancelEdit}
            disabled={editIsSubmitting}
          >
            Cancel
          </Button>
          <Button
            onClick={() => handleSaveEdit(experienceId)}
            disabled={editIsSubmitting || !editExperienceText.trim()}
            variant={hasChanges ? undefined : 'outline'}
            className={
              hasChanges
                ? 'bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50'
                : 'disabled:opacity-50'
            }
          >
            {editIsSubmitting ? (
              <>
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Experience
              </>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

