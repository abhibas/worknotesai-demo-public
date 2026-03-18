'use client';

import { useState, useEffect } from 'react';
import { Search, X, ChevronLeft, ChevronRight } from 'lucide-react';
import { Experience } from './ExperienceCard';

interface ExperienceSearchBarProps {
  // Input data
  experiences: Experience[];              // All experiences (for reference)
  filteredExperiences: Experience[];      // Filtered results (parent passes)
  selectedExperienceId: string | null;   // Selected ID
  
  // Callbacks
  onSearchChange: (query: string) => void; // Parent filters when query changes
  onExperienceSelect: (id: string) => void; // User selects from dropdown
  onPrevious: () => void;                  // Previous arrow clicked
  onNext: () => void;                      // Next arrow clicked
  onSearchInteraction?: () => void;        // User types or uses arrows (for tip boxes)
  
  // UI customization
  placeholder?: string;                    // Default: "Search experiences..."
  emptyStateMessage?: string;              // Optional custom empty state
  currentNumber?: number;                  // Optional: Override current position for "x of y" display
  totalNumber?: number;                    // Optional: Override total count for "x of y" display
  isRotationMode?: boolean;                // Optional: If true, both arrows always enabled (for rotation)
}

export default function ExperienceSearchBar({
  experiences,
  filteredExperiences,
  selectedExperienceId,
  onSearchChange,
  onExperienceSelect,
  onPrevious,
  onNext,
  onSearchInteraction,
  placeholder = "Search experiences...",
  emptyStateMessage,
  currentNumber: overrideCurrentNumber,
  totalNumber: overrideTotalNumber,
  isRotationMode = false
}: ExperienceSearchBarProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [showSearchDropdown, setShowSearchDropdown] = useState(false);

  // Debounce search query (300ms delay)
  useEffect(() => {
    const timer = setTimeout(() => {
      onSearchChange(searchQuery);
    }, 300);

    return () => clearTimeout(timer);
  }, [searchQuery, onSearchChange]);

  // Calculate navigation state
  const currentIndex = selectedExperienceId 
    ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
    : 0;
  // In rotation mode, both arrows are always enabled (rotation can go both directions)
  // In search mode with 2+ results, enable wrap-around (both arrows always enabled)
  // Otherwise, disable arrows at boundaries
  const hasMultipleResults = filteredExperiences.length > 1;
  const canGoPrevious = isRotationMode || hasMultipleResults ? true : (currentIndex > 0);
  const canGoNext = isRotationMode || hasMultipleResults ? true : (currentIndex < filteredExperiences.length - 1);
  // Use override values if provided, otherwise calculate from filteredExperiences
  const currentNumber = overrideCurrentNumber !== undefined ? overrideCurrentNumber : (currentIndex + 1);
  const totalNumber = overrideTotalNumber !== undefined ? overrideTotalNumber : filteredExperiences.length;

  // Handle search input change
  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setSearchQuery(value);
    setShowSearchDropdown(true);
    // Call onSearchInteraction callback if provided (for tip box hiding)
    if (onSearchInteraction) {
      onSearchInteraction();
    }
  };

  // Handle clear search
  const handleClearSearch = () => {
    setSearchQuery('');
    setShowSearchDropdown(false);
    // When clearing search (X button), don't call onSearchInteraction
    // Tip boxes will remain in their current state
  };

  // Handle experience selection from dropdown
  const handleExperienceSelect = (id: string) => {
    onExperienceSelect(id);
    setShowSearchDropdown(false);
    // Optionally clear search to show selected experience
    // Keep search query visible so user can see what they searched for
  };

  // Handle previous arrow
  const handlePrevious = () => {
    if (canGoPrevious) {
      onPrevious();
      // Call onSearchInteraction callback if provided (for tip box hiding)
      if (onSearchInteraction) {
        onSearchInteraction();
      }
    }
  };

  // Handle next arrow
  const handleNext = () => {
    if (canGoNext) {
      onNext();
      // Call onSearchInteraction callback if provided (for tip box hiding)
      if (onSearchInteraction) {
        onSearchInteraction();
      }
    }
  };

  return (
    <div className="mb-6">
      <div className="flex items-center gap-2">
        {/* Search Bar - Flexible width, leaves room for arrows and future sort */}
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            placeholder={placeholder}
            value={searchQuery}
            onChange={handleSearchChange}
            onFocus={() => {
              if (filteredExperiences.length > 0) {
                setShowSearchDropdown(true);
              }
            }}
            onBlur={() => {
              // Delay to allow click on dropdown item
              setTimeout(() => setShowSearchDropdown(false), 200);
            }}
            className="w-full pl-10 pr-10 py-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          />
          {searchQuery && (
            <button
              onClick={handleClearSearch}
              className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
              title="Clear search"
            >
              <X className="h-4 w-4" />
            </button>
          )}
          
          {/* Search Results Dropdown (Autocomplete-style) */}
          {showSearchDropdown && filteredExperiences.length > 0 && searchQuery.trim() && (
            <div className="absolute z-50 w-full mt-1 bg-indigo-50 border-2 border-indigo-200 rounded-lg shadow-xl max-h-60 overflow-y-auto">
              {filteredExperiences.map((exp, index) => (
                <button
                  key={exp.id}
                  onClick={() => handleExperienceSelect(exp.id)}
                  className={`w-full text-left px-4 py-2.5 hover:bg-indigo-100 transition-colors ${
                    index === 0 ? 'rounded-t-lg' : ''
                  } ${
                    index === filteredExperiences.length - 1 ? 'rounded-b-lg' : 'border-b border-indigo-200'
                  }`}
                >
                  <div className="font-medium text-gray-900 truncate">{exp.title}</div>
                  {exp.company && (
                    <div className="text-xs text-gray-600 truncate mt-0.5">{exp.company}</div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
        
        {/* Navigation Arrows with Count - Compact, to the right of search */}
        {filteredExperiences.length > 0 && (
          <div className="flex items-center gap-1">
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious}
              className={`p-2 rounded-lg border transition-colors ${
                canGoPrevious
                  ? 'border-gray-300 hover:bg-gray-50 text-gray-700 hover:text-indigo-600'
                  : 'border-gray-200 text-gray-300 cursor-not-allowed'
              }`}
              title="Previous experience"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-sm text-gray-600 px-2 min-w-[3rem] text-center">
              {currentNumber} of {totalNumber}
            </span>
            <button
              onClick={handleNext}
              disabled={!canGoNext}
              className={`p-2 rounded-lg border transition-colors ${
                canGoNext
                  ? 'border-gray-300 hover:bg-gray-50 text-gray-700 hover:text-indigo-600'
                  : 'border-gray-200 text-gray-300 cursor-not-allowed'
              }`}
              title="Next experience"
            >
              <ChevronRight className="h-4 w-4" />
            </button>
            {/* Future: Sort filter will go here */}
          </div>
        )}
      </div>
    </div>
  );
}

