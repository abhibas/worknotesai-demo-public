'use client';

import { useUser, useAuth } from '@clerk/nextjs';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import EditExperienceForm from '@/components/EditExperienceForm';
import ExperienceCard, { Experience, Response } from '@/components/ExperienceCard';
import ExperienceSearchBar from '@/components/ExperienceSearchBar';
import FeedbackCard from '@/components/FeedbackCard';
import { 
  Plus,
  Star,
  Trash2,
  Sparkles,
  Clock,
  CheckCircle,
  ArrowLeft,
  Edit,
  Mic,
  MicOff,
  Send,
  X,
  Save,
  Search
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect, useRef, useCallback } from 'react';
import { API_URL } from '@/lib/api';
import { UNSAVED_EDIT_STORAGE_KEY, isRecentTimestamp, DEBOUNCE_DELAY_MS, COLLAPSE_STATE_RESET_DELAY_MS } from '@/constants/storage';
import { getEditData, hasEditData, clearEditData, saveEditData } from '@/utils/localStorageEdit';
import { compareEditFields, normalize, normalizeDate } from '@/utils/fieldComparison';
import { devLog, devWarn } from '@/utils/devLogger';

// Type declarations for Speech Recognition
interface SpeechRecognitionResult {
  transcript: string;
}

interface SpeechRecognitionResultList extends Array<SpeechRecognitionResult> {
  isFinal?: boolean;
}

interface SpeechRecognitionType {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  onstart: (() => void) | null;
  onresult: ((event: { resultIndex: number; results: SpeechRecognitionResultList[] }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognitionType;
    webkitSpeechRecognition: new () => SpeechRecognitionType;
  }
}

// Experience and Response interfaces are now imported from ExperienceCard component
// This avoids duplication and ensures consistency

// Force dynamic rendering - this page requires client-side rendering
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

function DashboardContent() {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE || 'true').toLowerCase() === 'true';
  const clerkUser = demoMode ? null : useUser();
  const clerkAuth = demoMode ? null : useAuth();
  const isSignedIn = demoMode ? true : !!clerkUser?.isSignedIn;
  const user = demoMode ? ({ id: 'demo-user', firstName: 'Demo' } as any) : clerkUser?.user;
  const getToken = useCallback(async () => {
    if (demoMode) return null;
    if (!clerkAuth?.getToken) return null;
    return clerkAuth.getToken();
  }, [demoMode, clerkAuth]);
  // Don't use useSearchParams() directly to avoid build-time evaluation
  // We'll access URL params via window.location in useEffect instead
  
  // Determine environment label
  const getEnvLabel = () => {
    if (API_URL.includes('localhost')) return 'local';
    if (API_URL.includes('staging') || typeof window !== 'undefined' && window.location.hostname.includes('staging')) return 'stage';
    return 'beta'; // production - show beta
  };
  const envLabel = getEnvLabel();
  
  // Simple state management
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [inProgressExperiences, setInProgressExperiences] = useState<Experience[]>([]);
  const [starBankExperiences, setStarBankExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'add' | 'list' | 'inprogress' | 'starbank'>('add');
  
  // Form state
  const [experienceText, setExperienceText] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [generatingExperienceId, setGeneratingExperienceId] = useState<string | null>(null);
  const [showSuccessMessage, setShowSuccessMessage] = useState(false);
  const [showTitleError, setShowTitleError] = useState(false);
  const [showEditTip, setShowEditTip] = useState(false);
  const hasShownEditTip = useRef(false);
  const hasRestoredOnLoadRef = useRef(false);
  const [showStarGeneratedTip, setShowStarGeneratedTip] = useState(false);
  const [showStarRegeneratedTip, setShowStarRegeneratedTip] = useState(false);
  const [showStarBankSavedTip, setShowStarBankSavedTip] = useState(false);
  const [showStarUnsaveTip, setShowStarUnsaveTip] = useState(false);
  const [showInProgressTip, setShowInProgressTip] = useState(false);
  
  // Refs to track auto-hide timeouts for tip boxes
  const starGeneratedTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const starRegeneratedTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const starBankSavedTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const starUnsaveTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const inProgressTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const editTipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const justSavedEditRef = useRef(false); // Track if we just saved to prevent clearing success message
  
  // Feedback unsaved state tracking
  const [hasUnsavedFeedback, setHasUnsavedFeedback] = useState(false);
  const [unsavedFeedbackCount, setUnsavedFeedbackCount] = useState(0);
  const feedbackSaveAllRef = useRef<((baseContent?: string) => Promise<void>) | null>(null);
  const feedbackCardRef = useRef<HTMLDivElement>(null);
  const [shouldScrollToFeedback, setShouldScrollToFeedback] = useState(false);
  
  // Search state for In Progress and Star Bank tabs
  // Note: ExperienceSearchBar component handles debouncing internally
  // Parent receives debounced value via onSearchChange callback
  const [debouncedSearchQuery, setDebouncedSearchQuery] = useState('');
  const [filteredExperiences, setFilteredExperiences] = useState<Experience[]>([]);
  const [selectedExperienceId, setSelectedExperienceId] = useState<string | null>(null);
  
  // Track recently saved experiences to preserve their updatedAt after loadExperiences()
  // Key: experienceId, Value: { updatedAt: timestamp, savedAt: timestamp }
  const recentlySavedExperiences = useRef<Map<string, { updatedAt: string; savedAt: number }>>(new Map());
  const isUpdatingEditTextProgrammaticallyRef = useRef(false); // Track if editExperienceText is being updated programmatically
  const showEditTipAfterNavigationRef = useRef(false); // Track if we should show edit tip box after navigation completes
  
  // Rotation state for all tabs (when no search)
  // Tracks how many positions the list has been rotated
  const [inProgressRotationOffset, setInProgressRotationOffset] = useState(0);
  const [starBankRotationOffset, setStarBankRotationOffset] = useState(0);
  const [recentlyAddedRotationOffset, setRecentlyAddedRotationOffset] = useState(0);
  
  // Title generation fields
  const [company, setCompany] = useState('');
  const [role, setRole] = useState('');
  const [date, setDate] = useState('');
  const [project, setProject] = useState('');
  const [experienceTitle, setExperienceTitle] = useState('');
  const [tags, setTags] = useState('');
  
  // Voice recording state
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [recognition, setRecognition] = useState<any>(null);
  
  // Edit state
  const [editingExperience, setEditingExperience] = useState<string | null>(null);
  const [editingExperienceId, setEditingExperienceId] = useState<string | null>(null); // Persists even when form closes
  const [editContent, setEditContent] = useState('');
  
  // Enhanced edit state (full Add Experience workflow)
  const [editTitle, setEditTitle] = useState('');
  const [editCompany, setEditCompany] = useState('');
  const [editRole, setEditRole] = useState('');
  const [editDate, setEditDate] = useState('');
  const [editProject, setEditProject] = useState('');
  const [editExperienceTitle, setEditExperienceTitle] = useState('');
  const [editTags, setEditTags] = useState('');
  const [editExperienceText, setEditExperienceText] = useState('');
  const [editIsRecording, setEditIsRecording] = useState(false);
  const [editShowTitleError, setEditShowTitleError] = useState(false);
  const [editShowSuccessMessage, setEditShowSuccessMessage] = useState(false);
  const [editIsSubmitting, setEditIsSubmitting] = useState(false);
  const [editRecognition, setEditRecognition] = useState<any>(null);
  
  // Edit state persistence (Option 4: Hybrid)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience - now using hooks/utilities
  // State tracking is now handled by ExperienceCard hooks and localStorage utilities
  const [showSaveDialog, setShowSaveDialog] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);

  // Load experiences on mount and handle pending experiences
  useEffect(() => {
    if (!isSignedIn) return;

    const handlePendingExperience = async () => {
      // Check for pending experience from landing page and submit it
      if (typeof window === 'undefined') return;
      
      const pendingExperience = localStorage.getItem('pendingExperience');
      if (pendingExperience && pendingExperience.trim()) {
        try {
          const token = await getToken();
          const requestBody = {
            content: pendingExperience,
            title: pendingExperience.substring(0, 50) + (pendingExperience.length > 50 ? '...' : ''),
          };

          const response = await fetch(`${API_URL}/api/experiences`, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
            },
            body: JSON.stringify(requestBody),
          });

          if (response.ok) {
            // Remove from localStorage after successful submission
            localStorage.removeItem('pendingExperience');
            // Set flag to redirect to Recently Added tab
            localStorage.setItem('redirectToRecentlyAdded', 'true');
            // Reload experiences to show the new one
            await loadExperiences();
          }
        } catch (error) {
          console.error('Dashboard: Error submitting pending experience:', error);
        }
      }
    };

    // Check for redirect flag (user saved experience from landing page)
    // This handles both cases: immediate save while signed in, or pending experience submitted on dashboard load
    const checkAndRedirect = () => {
      const shouldRedirectToRecentlyAdded = localStorage.getItem('redirectToRecentlyAdded') === 'true';
      if (shouldRedirectToRecentlyAdded) {
        setActiveTab('list');
        localStorage.removeItem('redirectToRecentlyAdded');
      }
    };

    // Check redirect flag early (for immediate saves)
    checkAndRedirect();

    // Load experiences first, then handle pending experience
    loadExperiences().then(() => {
      handlePendingExperience().then(() => {
        // Check redirect flag again after submitting pending experience
        checkAndRedirect();
      });
    });
  }, [isSignedIn, getToken]);

  // Check for voice support
  useEffect(() => {
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setIsVoiceSupported(true);
    }
  }, []);

  // Cleanup recognition on unmount
  useEffect(() => {
    return () => {
      if (recognition) {
        recognition.stop();
      }
    };
  }, [recognition]);

  // Check for tab query parameter (only if no redirect flag is set)
  useEffect(() => {
    // Don't override redirect flag from landing page
    const hasRedirectFlag = localStorage.getItem('redirectToRecentlyAdded') === 'true';
    if (hasRedirectFlag) return;
    
    // Only access URL params on client side using window.location
    if (typeof window === 'undefined') return;
    
    try {
      const urlParams = new URLSearchParams(window.location.search);
      const tab = urlParams.get('tab');
    if (tab === 'experiences') {
      setActiveTab('list');
    }
    } catch (error) {
      // Silently fail if URL params not available
      devWarn('Could not access URL params:', error);
    }
  }, []); // Empty deps - only run once on mount

  // Hide success message when switching tabs
  useEffect(() => {
    if (activeTab !== 'add') {
      setShowSuccessMessage(false);
      setShowTitleError(false);
    }
  }, [activeTab]);

  // Hide title error when user starts typing a title
  useEffect(() => {
    const currentTitle = title || generateTitle();
    if (currentTitle.trim() && showTitleError) {
      setShowTitleError(false);
    }
  }, [title, company, role, date, project, experienceTitle, showTitleError]);

  // Sort experiences by most recent - ANY activity (edit, STAR, move) precedes creation
  // Priority: updatedAt (any activity) ALWAYS precedes createdAt (creation only)
  const sortExperiencesByRecent = (exps: Experience[]): Experience[] => {
    if (!exps || exps.length === 0) return exps;
    
    return [...exps].sort((a, b) => {
      // Helper to safely get timestamp, defaulting to 0 if invalid
      const getTimestamp = (exp: Experience): number => {
        if (exp.updatedAt) {
          const updated = new Date(exp.updatedAt).getTime();
          if (!isNaN(updated)) return updated;
        }
        if (exp.createdAt) {
          const created = new Date(exp.createdAt).getTime();
          if (!isNaN(created)) return created;
        }
        return 0; // Fallback for invalid dates
      };

      const dateA = getTimestamp(a);
      const dateB = getTimestamp(b);

      // Most recent first (descending) - higher timestamp comes first
      const timeDiff = dateB - dateA;

      // If timestamps are equal, maintain stable sort by id for consistent ordering
      if (timeDiff === 0) {
        return (a.id || '').localeCompare(b.id || '');
      }

      return timeDiff;
    });
  };

  // Filter experiences by search query across all fields
  // Searches: tags, title, role, company, date, project, experienceTitle, content
  // Returns filtered results sorted by most recent first
  const filterExperiences = useCallback((experiences: Experience[], query: string): Experience[] => {
    // If no query, return all experiences (already sorted)
    if (!query.trim()) {
      return sortExperiencesByRecent(experiences);
    }

    const lowerQuery = query.toLowerCase();
    
    // Filter experiences where ANY field matches (case-insensitive)
    const filtered = experiences.filter(exp => {
      const tagsMatch = exp.tags?.toLowerCase().includes(lowerQuery) || false;
      const titleMatch = exp.title?.toLowerCase().includes(lowerQuery) || false;
      const roleMatch = exp.role?.toLowerCase().includes(lowerQuery) || false;
      const companyMatch = exp.company?.toLowerCase().includes(lowerQuery) || false;
      const dateMatch = exp.date?.toLowerCase().includes(lowerQuery) || false;
      const projectMatch = exp.project?.toLowerCase().includes(lowerQuery) || false;
      const experienceTitleMatch = exp.experienceTitle?.toLowerCase().includes(lowerQuery) || false;
      const contentMatch = exp.content?.toLowerCase().includes(lowerQuery) || false;
      
      // Return true if ANY field matches
      return tagsMatch || titleMatch || roleMatch || companyMatch || 
             dateMatch || projectMatch || experienceTitleMatch || contentMatch;
    });
    
    // IMPORTANT: Sort filtered results to maintain "most recent first" order
    return sortExperiencesByRecent(filtered);
  }, []);

  // Clear search when switching away from In Progress, Star Bank, or Recently Added tabs
  // Note: ExperienceSearchBar component handles its own search query state and debouncing
  useEffect(() => {
    if (activeTab !== 'inprogress' && activeTab !== 'starbank' && activeTab !== 'list') {
      setDebouncedSearchQuery('');
      setFilteredExperiences([]);
      setSelectedExperienceId(null);
    }
  }, [activeTab]);

  // Apply filter when debounced search query or experiences change (for In Progress, Star Bank, and Recently Added tabs)
  useEffect(() => {
    if (activeTab === 'inprogress') {
      const filtered = filterExperiences(inProgressExperiences, debouncedSearchQuery);
      setFilteredExperiences(filtered);
      
      // Auto-select first experience if:
      // 1. No experience is currently selected, OR
      // 2. Selected experience is no longer in filtered results
      if (filtered.length > 0) {
        const isSelectedStillValid = selectedExperienceId && 
          filtered.some(exp => exp.id === selectedExperienceId);
        
        if (!selectedExperienceId || !isSelectedStillValid) {
          // Auto-select first filtered experience
          setSelectedExperienceId(filtered[0].id);
        }
      } else {
        // No filtered results, clear selection
        setSelectedExperienceId(null);
      }
    } else if (activeTab === 'starbank') {
      const filtered = filterExperiences(starBankExperiences, debouncedSearchQuery);
      setFilteredExperiences(filtered);
      
      // Auto-select first experience if:
      // 1. No experience is currently selected, OR
      // 2. Selected experience is no longer in filtered results
      if (filtered.length > 0) {
        const isSelectedStillValid = selectedExperienceId && 
          filtered.some(exp => exp.id === selectedExperienceId);
        
        if (!selectedExperienceId || !isSelectedStillValid) {
          // Auto-select first filtered experience
          setSelectedExperienceId(filtered[0].id);
        }
      } else {
        // No filtered results, clear selection
        setSelectedExperienceId(null);
      }
    } else if (activeTab === 'list') {
      // Recently Added tab: filter all experiences
      const filtered = filterExperiences(experiences, debouncedSearchQuery);
      setFilteredExperiences(filtered);
      
      // Auto-select first experience if:
      // 1. No experience is currently selected, OR
      // 2. Selected experience is no longer in filtered results
      if (filtered.length > 0) {
        const isSelectedStillValid = selectedExperienceId && 
          filtered.some(exp => exp.id === selectedExperienceId);
        
        if (!selectedExperienceId || !isSelectedStillValid) {
          // Auto-select first filtered experience
          setSelectedExperienceId(filtered[0].id);
        }
      } else {
        // No filtered results, clear selection
        setSelectedExperienceId(null);
      }
    } else {
      // Clear filtered experiences when switching away from In Progress, Star Bank, or Recently Added tabs
      setFilteredExperiences([]);
      setSelectedExperienceId(null);
    }
  }, [inProgressExperiences, starBankExperiences, experiences, debouncedSearchQuery, activeTab, filterExperiences, selectedExperienceId]);

  // Update selectedExperienceId when rotation offset changes (for In Progress tab)
  useEffect(() => {
    if (activeTab === 'inprogress' && !debouncedSearchQuery.trim() && inProgressExperiences.length > 0) {
      const rotateArray = <T,>(arr: T[], offset: number): T[] => {
        if (arr.length === 0) return arr;
        const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
        return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
      };
      const rotated = rotateArray(inProgressExperiences, inProgressRotationOffset);
      if (rotated.length > 0 && rotated[0].id !== selectedExperienceId) {
        setSelectedExperienceId(rotated[0].id);
      }
    }
  }, [inProgressRotationOffset, inProgressExperiences, activeTab, debouncedSearchQuery, selectedExperienceId]);

  // Update selectedExperienceId when rotation offset changes (for Star Bank tab)
  useEffect(() => {
    if (activeTab === 'starbank' && !debouncedSearchQuery.trim() && starBankExperiences.length > 0) {
      const rotateArray = <T,>(arr: T[], offset: number): T[] => {
        if (arr.length === 0) return arr;
        const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
        return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
      };
      const rotated = rotateArray(starBankExperiences, starBankRotationOffset);
      if (rotated.length > 0 && rotated[0].id !== selectedExperienceId) {
        setSelectedExperienceId(rotated[0].id);
      }
    }
  }, [starBankRotationOffset, starBankExperiences, activeTab, debouncedSearchQuery, selectedExperienceId]);

  // Hide success message when user starts working on a new response
  useEffect(() => {
    if (experienceText.trim() && showSuccessMessage) {
      setShowSuccessMessage(false);
    }
  }, [experienceText, showSuccessMessage]);

  // Show edit tip when user enters Recently Added tab
  useEffect(() => {
    if (activeTab === 'list') {
      setShowEditTip(true);
    } else {
      setShowEditTip(false);
    }
  }, [activeTab]);

  // Hide STAR generated tip when user clicks on In Progress tab
  useEffect(() => {
    if (activeTab === 'inprogress') {
      setShowStarGeneratedTip(false);
    }
  }, [activeTab]);

  // Hide STAR regenerated tip when user switches away from In Progress tab
  useEffect(() => {
    if (activeTab !== 'inprogress') {
      setShowStarRegeneratedTip(false);
    }
  }, [activeTab]);

  // Show In Progress instructional tip when user enters In Progress tab
  useEffect(() => {
    if (activeTab === 'inprogress' && inProgressExperiences.length > 0) {
      setShowInProgressTip(true);
    } else if (activeTab !== 'inprogress') {
      // Don't reset the state when leaving - let user's manual close persist
      // But reset if they come back to a tab with experiences
    }
  }, [activeTab, inProgressExperiences.length]);

  // Hide STAR Bank saved tip when navigating away from In Progress tab
  useEffect(() => {
    if (activeTab !== 'inprogress') {
      setShowStarBankSavedTip(false);
    }
  }, [activeTab]);

  // Hide STAR Bank unsave tip when navigating away from STAR Bank tab
  useEffect(() => {
    if (activeTab !== 'starbank') {
      setShowStarUnsaveTip(false);
    }
  }, [activeTab]);

  // Auto-hide tip boxes after 10 seconds
  useEffect(() => {
    if (showStarGeneratedTip) {
      // Clear any existing timeout
      if (starGeneratedTipTimeoutRef.current) {
        clearTimeout(starGeneratedTipTimeoutRef.current);
      }
      // Set new timeout to hide after 10 seconds
      starGeneratedTipTimeoutRef.current = setTimeout(() => {
        setShowStarGeneratedTip(false);
      }, 10000);
    }
    // Cleanup on unmount or when tip is hidden
    return () => {
      if (starGeneratedTipTimeoutRef.current) {
        clearTimeout(starGeneratedTipTimeoutRef.current);
      }
    };
  }, [showStarGeneratedTip]);

  useEffect(() => {
    if (showStarRegeneratedTip) {
      if (starRegeneratedTipTimeoutRef.current) {
        clearTimeout(starRegeneratedTipTimeoutRef.current);
      }
      starRegeneratedTipTimeoutRef.current = setTimeout(() => {
        setShowStarRegeneratedTip(false);
      }, 10000);
    }
    return () => {
      if (starRegeneratedTipTimeoutRef.current) {
        clearTimeout(starRegeneratedTipTimeoutRef.current);
      }
    };
  }, [showStarRegeneratedTip]);

  useEffect(() => {
    if (showStarBankSavedTip) {
      if (starBankSavedTipTimeoutRef.current) {
        clearTimeout(starBankSavedTipTimeoutRef.current);
      }
      starBankSavedTipTimeoutRef.current = setTimeout(() => {
        setShowStarBankSavedTip(false);
      }, 10000);
    }
    return () => {
      if (starBankSavedTipTimeoutRef.current) {
        clearTimeout(starBankSavedTipTimeoutRef.current);
      }
    };
  }, [showStarBankSavedTip]);

  useEffect(() => {
    if (showStarUnsaveTip) {
      if (starUnsaveTipTimeoutRef.current) {
        clearTimeout(starUnsaveTipTimeoutRef.current);
      }
      starUnsaveTipTimeoutRef.current = setTimeout(() => {
        setShowStarUnsaveTip(false);
      }, 10000);
    }
    return () => {
      if (starUnsaveTipTimeoutRef.current) {
        clearTimeout(starUnsaveTipTimeoutRef.current);
      }
    };
  }, [showStarUnsaveTip]);

  useEffect(() => {
    if (showInProgressTip) {
      if (inProgressTipTimeoutRef.current) {
        clearTimeout(inProgressTipTimeoutRef.current);
      }
      inProgressTipTimeoutRef.current = setTimeout(() => {
        setShowInProgressTip(false);
      }, 10000);
    }
    return () => {
      if (inProgressTipTimeoutRef.current) {
        clearTimeout(inProgressTipTimeoutRef.current);
      }
    };
  }, [showInProgressTip]);

  useEffect(() => {
    if (showEditTip) {
      if (editTipTimeoutRef.current) {
        clearTimeout(editTipTimeoutRef.current);
      }
      editTipTimeoutRef.current = setTimeout(() => {
        setShowEditTip(false);
      }, 10000);
    }
    return () => {
      if (editTipTimeoutRef.current) {
        clearTimeout(editTipTimeoutRef.current);
      }
    };
  }, [showEditTip]);

  // Phase 1: Track "Dirty" State - Detect unsaved changes
  useEffect(() => {
    if (!editingExperience) {
      setHasUnsavedChanges(false);
      return;
    }

    const experience = [...experiences, ...inProgressExperiences, ...starBankExperiences].find(
      e => e.id === editingExperience
    );

    if (!experience) {
      setHasUnsavedChanges(false);
      return;
    }

    // Compare all edit fields to original experience data with normalization
    // Use same normalization logic as navigation check to avoid false positives
    const normalize = (val: any) => {
      if (val === null || val === undefined) return '';
      return String(val).trim();
    };
    
    // Special handling for dates - compare as ISO date strings if both are dates
    const normalizeDate = (val: any, orig: any) => {
      if (!val && !orig) return '';
      if (!val || !orig) return String(val || '').trim();
      try {
        const valDate = val instanceof Date ? val : new Date(val);
        const origDate = orig instanceof Date ? orig : new Date(orig);
        if (!isNaN(valDate.getTime()) && !isNaN(origDate.getTime())) {
          return valDate.toISOString().split('T')[0]; // Compare just the date part
        }
      } catch (e) {
        // Not dates, fall through to string comparison
      }
      return String(val).trim();
    };
    
    const isDirty = 
      normalize(editTitle) !== normalize(experience.title) ||
      normalize(editCompany) !== normalize(experience.company) ||
      normalize(editRole) !== normalize(experience.role) ||
      normalizeDate(editDate, experience.date) !== normalizeDate(experience.date, experience.date) ||
      normalize(editProject) !== normalize(experience.project) ||
      normalize(editExperienceTitle) !== normalize(experience.experienceTitle) ||
      normalize(editTags) !== normalize(experience.tags) ||
      normalize(editExperienceText) !== normalize(experience.content);

    setHasUnsavedChanges(isDirty);
    // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
    // State is now managed by ExperienceCard hooks and localStorage utilities
  }, [
    editingExperience,
    editTitle,
    editCompany,
    editRole,
    editDate,
    editProject,
    editExperienceTitle,
    editTags,
    editExperienceText,
    experiences,
    inProgressExperiences,
    starBankExperiences
  ]);
  // Phase 2: Restore unsaved edits from localStorage on page load (after experiences are loaded)
  // Only restore ONCE on initial load, not every time arrays change
  useEffect(() => {
    // Wait for experiences to load and user to be signed in
    if (!isSignedIn || loading) return;
    
    // Only restore once on initial page load
    if (hasRestoredOnLoadRef.current) return;
    
    // Don't restore if already editing something (user might have manually opened edit)
    if (editingExperience !== null) {
      hasRestoredOnLoadRef.current = true; // Mark as processed
      return;
    }

    // Ensure we have experiences loaded before trying to restore
          const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
    if (allExperiences.length === 0) {
      // Experiences not loaded yet, wait
      return;
    }

    try {
      // CODE CLEANUP: Use utility instead of direct localStorage access
      const editData = getEditData();
      if (editData) {
        const { experienceId, editFields } = editData;
        // Check if experience still exists
        const experience = allExperiences.find(e => e.id === experienceId);
        
        if (experience) {
          // Restore edit state
          setEditingExperience(experienceId);
          setEditingExperienceId(experienceId);
          setEditTitle(editFields.title || '');
          setEditCompany(editFields.company || '');
          setEditRole(editFields.role || '');
          setEditDate(editFields.date || '');
          setEditProject(editFields.project || '');
          setEditExperienceTitle(editFields.experienceTitle || '');
          setEditTags(editFields.tags || '');
          setEditExperienceText(editFields.content || '');
          setEditContent(editFields.content || '');
          setHasUnsavedChanges(true);
          
          // Also set selected experience if not already set
          if (!selectedExperienceId) {
            setSelectedExperienceId(experienceId);
          }
          
          hasRestoredOnLoadRef.current = true; // Mark as restored
        } else {
          // Experience no longer exists, clear saved data
          clearEditData();
          hasRestoredOnLoadRef.current = true; // Mark as processed even if no restore
        }
      } else {
        // No saved data, mark as processed
        hasRestoredOnLoadRef.current = true; // Mark as processed even if no restore
      }
    } catch (error) {
      console.error('Error restoring unsaved edits:', error);
      // CODE CLEANUP: Use utility instead of direct localStorage access
      clearEditData();
      hasRestoredOnLoadRef.current = true; // Mark as processed even on error
    }
  }, [isSignedIn, loading, editingExperience, experiences, inProgressExperiences, starBankExperiences, selectedExperienceId]);

  // Phase 2: Auto-save to localStorage (IMMEDIATE - no debounce to prevent data loss on refresh)
  // Save immediately when user types to prevent data loss if they refresh before debounce completes
  useEffect(() => {
    if (!editingExperience) {
      // Don't clear localStorage when collapsing - we need it for restore on refresh
      // Only clear if we've explicitly saved (which clears hasUnsavedChangesByExperience)
      // The restore logic will handle clearing old data
      return;
    }

    // CODE CLEANUP: Use utility instead of direct localStorage access
    // Save immediately (no debounce) to prevent data loss on refresh
    // This ensures data is always in localStorage even if user refreshes immediately after typing
    try {
      saveEditData(editingExperience, {
        title: editTitle,
        company: editCompany,
        role: editRole,
        date: editDate,
        project: editProject,
        experienceTitle: editExperienceTitle,
        tags: editTags,
        content: editExperienceText,
      });
    } catch (error) {
      console.error('Error saving to localStorage:', error);
    }
  }, [
    editingExperience,
    editTitle,
    editCompany,
    editRole,
    editDate,
    editProject,
    editExperienceTitle,
    editTags,
    editExperienceText
    // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience from dependencies
  ]);

  // Phase 5.1: Handle page unload (beforeunload event) - checks both edit and feedback
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      const hasAnyUnsavedChanges = hasUnsavedChanges || hasUnsavedFeedback;
      if (hasAnyUnsavedChanges) {
        e.preventDefault();
        e.returnValue = 'You have unsaved changes. Are you sure you want to leave?';
        return e.returnValue;
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, hasUnsavedFeedback]);

  // Helper function to clear edit state (but preserve localStorage for restore)
  const clearEditState = () => {
    setEditingExperience(null);
    setEditTitle('');
    setEditCompany('');
    setEditRole('');
    setEditDate('');
    setEditProject('');
    setEditExperienceTitle('');
    setEditTags('');
    setEditExperienceText('');
    setEditContent('');
    setHasUnsavedChanges(false);
    // Note: Don't clear localStorage here - let it persist for restore functionality
    setEditShowTitleError(false);
    setEditShowSuccessMessage(false);
  };

  // Phase 5: Clear edit state when navigating to different experience (Option B: Auto-Clear + Restore)
  useEffect(() => {
    // Only act if we're editing an experience and selectedExperienceId has changed
    // Skip on "Add" tab where selectedExperienceId might not be relevant
    if (!editingExperience || !selectedExperienceId) return;
    if (activeTab === 'add') return;
    
    // If selected experience matches the one being edited, no action needed
    if (selectedExperienceId === editingExperience) return;

    // User navigated to a different experience while editing
    if (hasUnsavedChanges) {
      // Show confirmation dialog
      const userChoice = window.confirm(
        'You have unsaved changes. What would you like to do?\n\n' +
        'Click "OK" to save your changes, or "Cancel" to stay on this page.\n\n' +
        'Note: If you want to discard changes, click "Cancel" and then click "Cancel" on the edit form.'
      );

      if (userChoice) {
        // User chose to save - save and clear edit state
        handleSaveEdit(editingExperience).then(() => {
          clearEditState();
        }).catch((error) => {
          console.error('Error saving before navigation:', error);
          // If save failed, restore selectedExperienceId to editingExperience to keep user on current experience
          setSelectedExperienceId(editingExperience);
        });
      } else {
        // User chose to cancel - don't navigate, keep edit state
        // Restore selectedExperienceId to editingExperience to keep user on current experience
        setSelectedExperienceId(editingExperience);
      }
    } else {
      // No unsaved changes, just clear edit state
      clearEditState();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedExperienceId, editingExperience, hasUnsavedChanges, activeTab]);

  // Phase 6: Restore edit state on page load (runs once when experiences are loaded)
  useEffect(() => {
    // Only run once after experiences are loaded
    if (loading || !isSignedIn || hasRestoredOnLoadRef.current) return;
    if (activeTab === 'add') return;
    
    // CODE CLEANUP: Use utility instead of direct localStorage access
    try {
      const editData = getEditData();
      if (editData && editData.experienceId) {
        // Check if experience still exists
        const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
        const experience = allExperiences.find(e => e.id === editData.experienceId);
        
        if (experience) {
          // Mark as restored to prevent re-running
          hasRestoredOnLoadRef.current = true;
          
          // Restore edit state from localStorage
          setEditingExperience(editData.experienceId);
          setEditingExperienceId(editData.experienceId);
          setEditTitle(editData.editFields.title || '');
          setEditCompany(editData.editFields.company || '');
          setEditRole(editData.editFields.role || '');
          setEditDate(editData.editFields.date || '');
          setEditProject(editData.editFields.project || '');
          setEditExperienceTitle(editData.editFields.experienceTitle || '');
          setEditTags(editData.editFields.tags || '');
          setEditExperienceText(editData.editFields.content || '');
          setEditContent(editData.editFields.content || '');
          setHasUnsavedChanges(true);
          
          // Also set the selected experience if not already set
          if (!selectedExperienceId) {
            setSelectedExperienceId(editData.experienceId);
          }
        } else {
          // Experience no longer exists, clear saved data
          clearEditData();
          hasRestoredOnLoadRef.current = true; // Mark as processed
        }
      } else {
        // No saved data, mark as processed
        hasRestoredOnLoadRef.current = true; // Mark as processed
      }
    } catch (error) {
      console.error('Error restoring edit state on page load:', error);
      hasRestoredOnLoadRef.current = true; // Mark as processed even on error
    }
  }, [loading, isSignedIn, activeTab, experiences, inProgressExperiences, starBankExperiences, selectedExperienceId]);

  // Phase 6.1: Restore edit state when returning to same experience (Option B: Auto-Clear + Restore)
  useEffect(() => {
    // Only act if we have a selected experience and we're not currently editing
    // Skip on "Add" tab where selectedExperienceId might not be relevant
    if (!selectedExperienceId || editingExperience) return;
    if (loading || !isSignedIn) return;
    if (activeTab === 'add') return;
    
    // Skip if we already restored on page load
    if (hasRestoredOnLoadRef.current) return;

    // PHASE 3 REFACTOR: Check localStorage directly instead of hasUnsavedChangesByExperience
    // Don't restore if there are unsaved changes in localStorage (user collapsed intentionally)
    const editData = getEditData(selectedExperienceId);
    if (editData && editData.experienceId === selectedExperienceId) {
      // Check if this data actually differs from the original
      const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
      const experience = allExperiences.find(e => e.id === selectedExperienceId);
      if (experience) {
        const hasActualChanges = compareEditFields(editData.editFields, {
          title: experience.title,
          company: experience.company,
          role: experience.role,
          date: experience.date,
          project: experience.project,
          experienceTitle: experience.experienceTitle,
          tags: experience.tags,
          content: experience.content,
        });
        if (hasActualChanges) {
          return; // User collapsed intentionally with unsaved changes, don't auto-restore
        }
      }
    }

    // CODE CLEANUP: Use utility instead of direct localStorage access
    try {
      const editData = getEditData(selectedExperienceId);
      if (editData && editData.experienceId === selectedExperienceId) {
        // Check if experience still exists
        const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
        const experience = allExperiences.find(e => e.id === selectedExperienceId);
        
        if (experience) {
          // Restore edit state from localStorage
          setEditingExperience(selectedExperienceId);
          setEditTitle(editData.editFields.title || '');
          setEditCompany(editData.editFields.company || '');
          setEditRole(editData.editFields.role || '');
          setEditDate(editData.editFields.date || '');
          setEditProject(editData.editFields.project || '');
          setEditExperienceTitle(editData.editFields.experienceTitle || '');
          setEditTags(editData.editFields.tags || '');
          setEditExperienceText(editData.editFields.content || '');
          setEditContent(editData.editFields.content || '');
          setHasUnsavedChanges(true);
        } else {
          // Experience no longer exists, clear saved data
          clearEditData();
        }
      }
    } catch (error) {
      console.error('Error restoring edit state:', error);
    }
  }, [selectedExperienceId, editingExperience, loading, isSignedIn, activeTab, experiences, inProgressExperiences, starBankExperiences]);

  // Hide edit title error when user starts typing in any title-related field
  useEffect(() => {
    if (editTitle || editCompany || editRole || editDate || editProject || editExperienceTitle) {
      setEditShowTitleError(false);
    }
  }, [editTitle, editCompany, editRole, editDate, editProject, editExperienceTitle]);

  // Hide edit success message when user starts typing new content
  // Don't clear if content is being updated programmatically (e.g., after feedback save or after save)
  useEffect(() => {
    if (isUpdatingEditTextProgrammaticallyRef.current) {
      // Reset flag after effect runs
      isUpdatingEditTextProgrammaticallyRef.current = false;
      justSavedEditRef.current = true; // Mark that we just saved
      // Clear the flag after a delay to allow tip box to show
      setTimeout(() => {
        justSavedEditRef.current = false;
      }, 1000); // Give tip box 1 second to appear before allowing it to be cleared
      return; // Don't clear message for programmatic updates
    }
    // Only clear if user is actively typing (not just after save)
    if (editExperienceText.trim() && editShowSuccessMessage && editingExperience && !justSavedEditRef.current) {
      setEditShowSuccessMessage(false);
    }
  }, [editExperienceText, editShowSuccessMessage, editingExperience]);

  // Grade visibility state management (localStorage)
  const getGradeVisibility = (experienceId: string): boolean => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(`starGradeVisibility-${experienceId}`);
    return stored === 'true';
  };

  const setGradeVisibility = (experienceId: string, visible: boolean): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`starGradeVisibility-${experienceId}`, String(visible));
    // Trigger re-render by updating state - update both arrays to ensure re-render works in both tabs
    // Create new array with new object references to ensure React detects the change
    setInProgressExperiences(prev => prev.map(exp => 
      exp.id === experienceId ? { ...exp, updatedAt: exp.updatedAt || new Date().toISOString() } : exp
    ));
    // Also update STAR Bank experiences so re-render works when toggling in STAR Bank tab
    setStarBankExperiences(prev => prev.map(exp => 
      exp.id === experienceId ? { ...exp, updatedAt: exp.updatedAt || new Date().toISOString() } : exp
    ));
  };

  const toggleGradeVisibility = (experienceId: string): void => {
    const currentVisibility = getGradeVisibility(experienceId);
    setGradeVisibility(experienceId, !currentVisibility);
  };

  // Feedback visibility state management (localStorage) - same pattern as grade visibility
  const getFeedbackVisibility = (experienceId: string): boolean => {
    if (typeof window === 'undefined') return false;
    const stored = localStorage.getItem(`starFeedbackVisibility-${experienceId}`);
    return stored === 'true';
  };

  const setFeedbackVisibility = (experienceId: string, visible: boolean): void => {
    if (typeof window === 'undefined') return;
    localStorage.setItem(`starFeedbackVisibility-${experienceId}`, String(visible));
    // Trigger re-render by updating state - update both arrays to ensure re-render works in both tabs
    // Create new array with new object references to ensure React detects the change
    setInProgressExperiences(prev => prev.map(exp => 
      exp.id === experienceId ? { ...exp, updatedAt: exp.updatedAt || new Date().toISOString() } : exp
    ));
    // Also update STAR Bank experiences so re-render works when toggling in STAR Bank tab
    setStarBankExperiences(prev => prev.map(exp => 
      exp.id === experienceId ? { ...exp, updatedAt: exp.updatedAt || new Date().toISOString() } : exp
    ));
  };

  const toggleFeedbackVisibility = (experienceId: string): void => {
    const currentVisibility = getFeedbackVisibility(experienceId);
    const newVisibility = !currentVisibility;
    setFeedbackVisibility(experienceId, newVisibility);
    
    // If showing feedback, trigger scroll after render
    if (newVisibility && experienceId === selectedExperienceId) {
      setShouldScrollToFeedback(true);
    }
  };

  // Reset scroll flag when switching experiences
  useEffect(() => {
    setShouldScrollToFeedback(false);
  }, [selectedExperienceId]);

  // Auto-scroll to FeedbackCard when feedback becomes visible
  useEffect(() => {
    if (shouldScrollToFeedback && feedbackCardRef.current) {
      // Use setTimeout to ensure DOM has fully rendered before scrolling
      const timeoutId = setTimeout(() => {
        feedbackCardRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'start',
          inline: 'nearest'
        });
        setShouldScrollToFeedback(false); // Reset flag after scrolling
      }, 200);
      
      return () => clearTimeout(timeoutId);
    }
  }, [shouldScrollToFeedback]);

  // Normalize list formatting to consistent numbered format (1), (2), (3), etc.
  const normalizeListFormatting = (text: string): string => {
    if (!text) return text;
    
    // Split by STAR sections to reset counter for each section
    const sections = text.split(/(\*\*(?:Situation|Task|Action|Result):\*\*)/);
    
    return sections.map((section) => {
      // If this is a STAR header, return it unchanged
      if (section.match(/\*\*(?:Situation|Task|Action|Result):\*\*/)) {
        return section;
      }
      
      // Process content section line by line
      const lines = section.split('\n');
      let listCounter = 1;
      let inList = false;
      
      return lines.map(line => {
        // Check if line starts with various list formats
        const numberedListMatch = line.match(/^(\s*)(\d+)\.\s+(.+)$/);
        const bulletListMatch = line.match(/^(\s*)([-•*\u2022])\s+(.+)$/);
        const alreadyFormattedMatch = line.match(/^(\s*)\(\d+\)\s+(.+)$/);
        
        if (alreadyFormattedMatch) {
          // Already in (1) format, keep it but extract number and update counter
          const [, indent] = alreadyFormattedMatch;
          const numberMatch = line.match(/\((\d+)\)/);
          if (numberMatch) {
            listCounter = parseInt(numberMatch[1], 10) + 1;
          }
          inList = true;
          return line; // Keep original formatting
        } else if (numberedListMatch) {
          // Convert "1. " to "(1) "
          const [, indent, , content] = numberedListMatch;
          const result = `${indent}(${listCounter}) ${content}`;
          listCounter++;
          inList = true;
          return result;
        } else if (bulletListMatch) {
          // Convert "- ", "• ", "* " to "(1) ", "(2) ", etc.
          const [, indent, , content] = bulletListMatch;
          const result = `${indent}(${listCounter}) ${content}`;
          listCounter++;
          inList = true;
          return result;
        } else {
          // Non-list line - reset counter only if we were in a list and this is a blank line
          if (inList && line.trim().length === 0) {
            listCounter = 1;
            inList = false;
          }
          return line;
        }
      }).join('\n');
    }).join('');
  };

  const loadExperiences = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/experiences`, {
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        const allExperiences = data.experiences || [];
        
        // Normalize all experiences and responses to ensure createdAt exists
        const normalizedExperiences = allExperiences.map((exp: Experience) => {
          // Check for responses without createdAt
          if (exp.responses && exp.responses.some(resp => !resp.createdAt)) {
            devWarn('Experience has responses without createdAt:', exp.id, exp.responses);
          }
          
          const normalizedExp = {
            ...exp,
            createdAt: exp.createdAt || new Date().toISOString(),
            updatedAt: exp.updatedAt || exp.createdAt || new Date().toISOString(),
            responses: exp.responses ? exp.responses.map(resp => {
              if (!resp.createdAt) {
                devWarn('Response missing createdAt, adding fallback:', resp.id);
              }
              return {
                ...resp,
                createdAt: resp.createdAt || new Date().toISOString()
              };
            }) : []
          };
          return normalizedExp;
        });
        
        // Get STAR Bank IDs from localStorage
        const starBankIds = JSON.parse(localStorage.getItem('starBankExperienceIds') || '[]');
        
        // Filter experiences: those with responses are either In Progress or STAR Bank
        // Also filter out any undefined/null experiences and ensure responses have createdAt
        const experiencesWithResponses = normalizedExperiences.filter((exp: Experience) => 
          exp && exp.id && exp.responses && exp.responses.length > 0 && exp.responses[0] && exp.responses[0].createdAt
        );
        
        // Separate into STAR Bank and In Progress
        const starBank = experiencesWithResponses.filter((exp: Experience) => starBankIds.includes(exp.id));
        const inProgress = experiencesWithResponses.filter((exp: Experience) => !starBankIds.includes(exp.id));
        
        // Experiences without responses stay in "Recently Added"
        const experiencesWithoutResponses = normalizedExperiences.filter((exp: Experience) => 
          !exp.responses || exp.responses.length === 0
        );
        
        // Preserve updatedAt for recently saved experiences (within last 30 seconds)
        // This ensures that experiences we just saved appear first even after loadExperiences()
        const now = Date.now();
        const thirtySecondsAgo = now - 30000;
        
        const preserveRecentUpdatedAt = (exp: Experience): Experience => {
          const recentSave = recentlySavedExperiences.current.get(exp.id);
          if (recentSave && recentSave.savedAt > thirtySecondsAgo) {
            // Use the saved updatedAt if it's more recent than what we got from backend
            const savedTimestamp = new Date(recentSave.updatedAt).getTime();
            const backendTimestamp = exp.updatedAt ? new Date(exp.updatedAt).getTime() : 0;
            if (savedTimestamp > backendTimestamp) {
              return { ...exp, updatedAt: recentSave.updatedAt };
            }
          }
          return exp;
        };
        
        const preservedExperiencesWithoutResponses = experiencesWithoutResponses.map(preserveRecentUpdatedAt);
        const preservedInProgress = inProgress.map(preserveRecentUpdatedAt);
        const preservedStarBank = starBank.map(preserveRecentUpdatedAt);
        
        // Clean up old entries from recentlySavedExperiences (older than 30 seconds)
        for (const [id, data] of recentlySavedExperiences.current.entries()) {
          if (data.savedAt <= thirtySecondsAgo) {
            recentlySavedExperiences.current.delete(id);
          }
        }
        
        // Apply sorting to all arrays - most recent activity first
        setExperiences(sortExperiencesByRecent(preservedExperiencesWithoutResponses));
        setInProgressExperiences(sortExperiencesByRecent(preservedInProgress));
        setStarBankExperiences(sortExperiencesByRecent(preservedStarBank));
      }
    } catch (error) {
      console.error('Error loading experiences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExperience = async () => {
    if (!experienceText.trim()) return;
    
    // Check if title is empty (including generated title)
    const currentTitle = title || generateTitle();
    if (!currentTitle.trim()) {
      setShowTitleError(true);
      return;
    }

    // Client-side tags validation (matches backend validation)
    if (tags && tags.trim()) {
      const tagCount = tags.split(',').map(t => t.trim()).filter(t => t.length > 0).length;
      if (tagCount > 20) {
        alert(`Maximum 20 tags allowed. Currently ${tagCount} entered.`);
        return;
      }
      const normalizedTags = tags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0).join(',');
      if (normalizedTags.length > 200) {
        alert('Tags too long (max 200 characters)');
        return;
      }
    }
    
    setIsSubmitting(true);
    try {
      const token = await getToken();
      if (!token && !demoMode) {
        alert('Authentication error: Please sign in again');
        setIsSubmitting(false);
        return;
      }
      
      const requestBody = {
        content: experienceText,
        title: title || experienceText.substring(0, 50) + (experienceText.length > 50 ? '...' : ''),
        company: company || undefined,
        role: role || undefined,
        date: date || undefined,
        project: project || undefined,
        experienceTitle: experienceTitle || undefined,
        tags: tags.trim() || undefined,
      };

      const response = await fetch(`${API_URL}/api/experiences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        setExperiences(prev => sortExperiencesByRecent([result.experience, ...prev]));
        // Reset rotation when new experience is added (new experience appears at top)
        setRecentlyAddedRotationOffset(0);
        
        // Reset form
        setExperienceText('');
        setTitle('');
        setCompany('');
        setRole('');
        setDate('');
        setProject('');
        setExperienceTitle('');
        setTags('');
        
        // Show success message
        setShowSuccessMessage(true);
      } else {
        const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
        const errorMessage = errorData?.error || response.statusText || 'Unknown error';
        console.error('Error saving experience:', response.status, errorMessage);
        alert(`Unable to save experience: ${errorMessage}. Please try again.`);
      }
    } catch (error) {
      console.error('Error saving experience:', error);
      alert(`Network error: ${error instanceof Error ? error.message : 'Failed to connect to server'}. Please check your internet connection and try again.`);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Confirmation handler for saving to STAR Bank (checks for unsaved changes)
  const handleSaveToStarBankWithConfirmation = async (experience: Experience) => {
    // Check for unsaved changes in active editing mode
    const hasActiveUnsavedChanges = hasUnsavedChanges && editingExperienceId === experience.id;
    
    // PHASE 3 REFACTOR: Check for unsaved changes in collapsed mode using localStorage utilities
    const editData = getEditData(experience.id);
    const hasCollapsedUnsavedChanges = editData ? compareEditFields(editData.editFields, {
      title: experience.title,
      company: experience.company,
      role: experience.role,
      date: experience.date,
      project: experience.project,
      experienceTitle: experience.experienceTitle,
      tags: experience.tags,
      content: experience.content,
    }) : false;
    
    // Check localStorage for unsaved changes, but only if they actually differ from original
    const hasUnsavedInStorage = hasActualUnsavedChangesInStorage(experience.id);
    
    const hasAnyUnsavedChanges = hasActiveUnsavedChanges || hasCollapsedUnsavedChanges || hasUnsavedInStorage || hasUnsavedFeedback;
    
    if (!hasAnyUnsavedChanges) {
      // No unsaved changes, proceed with saving to STAR Bank
      await handleSaveToStarBank(experience);
      return;
    }

    // Calculate total unsaved count
    const collapsedCount = hasCollapsedUnsavedChanges ? 1 : 0;
    const storageCount = hasUnsavedInStorage && !hasActiveUnsavedChanges && !hasCollapsedUnsavedChanges ? 1 : 0;
    const totalUnsavedCount = (hasActiveUnsavedChanges ? 1 : 0) + storageCount + collapsedCount + unsavedFeedbackCount;
    const message = totalUnsavedCount > 1
      ? `You have ${totalUnsavedCount} unsaved changes.`
      : 'You have unsaved changes.';

    // Show confirmation dialog
    const userChoice = window.confirm(
      `${message} What would you like to do?\n\n` +
      'Click "OK" to save all changes, or "Cancel" to stay on this page.'
    );

    if (userChoice) {
      // User clicked OK - save all changes (both edit and feedback), then save to STAR Bank
      try {
        let editWasSaved = false;
        let updatedExperienceContent: string | undefined = undefined;
        
        // Priority 1: If form is currently open and editing THIS experience, save from current state
        if (editingExperienceId === experience.id && editingExperience === experience.id) {
          // Form is open, use handleSaveEdit with current edit state
          const result = await handleSaveEdit(editingExperienceId, true);
          if (result) {
            updatedExperienceContent = result.content;
            editWasSaved = true;
          }
        } else {
          // Priority 2: Form is collapsed or not open, save from localStorage
          // This handles both collapsed mode and cases where state was lost
          if ((hasCollapsedUnsavedChanges || hasUnsavedInStorage) && handleSaveInCollapsedMode) {
            try {
              // Save and get the updated experience back
              const updatedExp = await handleSaveInCollapsedMode(experience.id);
              if (updatedExp) {
                editWasSaved = true;
                updatedExperienceContent = updatedExp.content;
                // Update the experience object to use for STAR Bank
                experience = updatedExp;
              } else {
                devWarn('Save completed but no updated experience returned');
              }
            } catch (error) {
              console.error(`Error saving collapsed changes for experience ${experience.id}:`, error);
              throw error; // Re-throw to prevent proceeding with STAR Bank save
            }
          }
        }
        
        // Save feedback changes if any
        if (hasUnsavedFeedback && feedbackSaveAllRef.current) {
          await feedbackSaveAllRef.current(updatedExperienceContent);
        }
        
        // Show success message if edit was saved
        if (editWasSaved) {
          setEditShowSuccessMessage(true);
          setTimeout(() => {
            setEditShowSuccessMessage(false);
          }, 10000);
        }
        
        // After saving, proceed with saving to STAR Bank
        // Use the updated experience (which was modified in place if saved)
        await handleSaveToStarBank(experience);
      } catch (error) {
        console.error('Error saving before STAR Bank:', error);
        // Don't save to STAR Bank if save failed
      }
    }
    // If user clicked Cancel, do nothing (stay on page)
  };

  const handleSaveToStarBank = async (experience: Experience) => {
    // Update updatedAt to reflect user activity (saving to STAR Bank)
    const now = new Date().toISOString();
    const savedAt = Date.now();
    
    // Track this as a recently saved experience
    recentlySavedExperiences.current.set(experience.id, {
      updatedAt: now,
      savedAt: savedAt
    });
    
    const updatedExperience = {
      ...experience,
      updatedAt: now
    };
    
    // Move experience from inProgressExperiences to starBankExperiences
    setInProgressExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
    setStarBankExperiences(prev => {
      // Remove any existing instance and add the updated one at FRONT, then sort
      // Adding to front ensures it's at top even if timestamps are equal
      const filtered = prev.filter(exp => exp.id !== experience.id);
      const sorted = sortExperiencesByRecent([updatedExperience, ...filtered]);
      // Reset rotation offset to 0 so first (most recent) item is displayed
      setStarBankRotationOffset(0);
      // Select the saved experience (should be first after sort)
      if (sorted.length > 0 && sorted[0].id === experience.id) {
        setSelectedExperienceId(experience.id);
      }
      return sorted;
    });
    
    // Save to localStorage for persistence
    const starBankIds = JSON.parse(localStorage.getItem('starBankExperienceIds') || '[]');
    if (!starBankIds.includes(experience.id)) {
      localStorage.setItem('starBankExperienceIds', JSON.stringify([...starBankIds, experience.id]));
    }
    
    // Show success tip (user stays in In Progress tab)
    // Clear other tip boxes to ensure only one is shown at a time
    setShowInProgressTip(false);
    setShowStarRegeneratedTip(false);
    setShowStarBankSavedTip(true);
  };

  const handleUnsaveFromStarBank = async (experience: Experience) => {
    // Update updatedAt to reflect user activity (unsaving from STAR Bank)
    const now = new Date().toISOString();
    const savedAt = Date.now();
    
    // Track this as a recently saved experience
    recentlySavedExperiences.current.set(experience.id, {
      updatedAt: now,
      savedAt: savedAt
    });
    
    const updatedExperience = {
      ...experience,
      updatedAt: now
    };
    
    // Move experience from starBankExperiences back to inProgressExperiences
    setStarBankExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
    setInProgressExperiences(prev => {
      // Remove any existing instance and add the updated one at FRONT, then sort
      // Adding to front ensures it's at top even if timestamps are equal
      const filtered = prev.filter(exp => exp.id !== experience.id);
      const sorted = sortExperiencesByRecent([updatedExperience, ...filtered]);
      // Reset rotation offset to 0 so first (most recent) item is displayed
      setInProgressRotationOffset(0);
      // Select the unsaved experience (should be first after sort)
      if (sorted.length > 0 && sorted[0].id === experience.id) {
        setSelectedExperienceId(experience.id);
      }
      return sorted;
    });
    
    // Remove from localStorage
    const starBankIds = JSON.parse(localStorage.getItem('starBankExperienceIds') || '[]');
    localStorage.setItem('starBankExperienceIds', JSON.stringify(starBankIds.filter((id: string) => id !== experience.id)));
    
    // Preserve grade visibility state - it's already stored in localStorage per experience ID
    // Visibility state persists automatically when moving between tabs since it's keyed by experience ID
    // If grades were shown before saving to STAR Bank, they'll remain shown; if hidden, they'll remain hidden
    
    // Show unsave tip in STAR Bank tab
    // Clear other tip boxes to ensure only one is shown at a time (consistency across tabs)
    setShowStarGeneratedTip(false);
    setShowStarRegeneratedTip(false);
    setShowStarBankSavedTip(false);
    setShowInProgressTip(false);
    setShowStarUnsaveTip(true);
  };

  const handleGenerateSTAR = async (experience: Experience) => {
    devLog('Generating STAR for experience:', experience.id);
    
    // Prevent multiple simultaneous generations for the same experience
    if (generatingExperienceId === experience.id) {
      devWarn('STAR generation already in progress for this experience');
      return;
    }
    
    setGeneratingExperienceId(experience.id);
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/experiences/${experience.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        const result = await response.json();
        devLog('STAR response received for experience:', experience.id, result);
        
        // Check if API call was successful
        if (!result.success) {
          console.error('STAR generation failed:', result.error);
          alert(`Unable to generate STAR response: ${result.error || 'Unknown error'}. Please try again.`);
          return;
        }
        
        // Check if response data is valid
        if (!result.response || !result.response.id) {
          console.error('Invalid response from API:', result);
          alert('STAR response was generated but could not be saved. Please refresh the page and try again.');
          return;
        }
        
        // Backend has updated the experience's updatedAt field
        // Use current time - this will be the newest timestamp and ensure it sorts to top
        // The backend's updatedAt will be very close to this, so using current time is safe
        const now = new Date().toISOString();
        const savedAt = Date.now();
        
        // Track this as a recently saved experience
        recentlySavedExperiences.current.set(experience.id, {
          updatedAt: now,
          savedAt: savedAt
        });
        
        // Ensure response has createdAt - if missing, use current time
        const responseWithTimestamp = {
          ...result.response,
          createdAt: result.response.createdAt || now
        };
        
        const updatedExperience = { 
          ...experience, 
          responses: [responseWithTimestamp],
          updatedAt: now // Current timestamp - guaranteed to be newest for immediate sorting
        };
        
        
        // Use activeTab to determine the correct behavior - be more explicit
        if (activeTab === 'list') {
          // Move experience from "Recently Added" to "In Progress"
          setExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
          setInProgressExperiences(prev => {
            // Remove any existing instance of this experience and add the updated one at FRONT, then sort
            // Adding to front ensures it's at top even if timestamps are equal
            const filtered = prev.filter(exp => exp.id !== experience.id);
            const sorted = sortExperiencesByRecent([updatedExperience, ...filtered]);
            // Reset rotation offset to 0 so first (most recent) item is displayed
            setInProgressRotationOffset(0);
            // Select the generated experience (should be first after sort)
            if (sorted.length > 0 && sorted[0].id === experience.id) {
              setSelectedExperienceId(experience.id);
            }
            return sorted;
          });
          // Set grade visibility to hidden by default for first-time generation
          setGradeVisibility(experience.id, false);
          // Show success tip
          // Clear other tip boxes to ensure only one is shown at a time (consistency across tabs)
          setShowEditTip(false); // Clear edit tip in Recently Added tab
          setShowStarRegeneratedTip(false);
          setShowStarBankSavedTip(false);
          setShowStarUnsaveTip(false);
          setShowInProgressTip(false);
          setShowStarGeneratedTip(true);
        } else if (activeTab === 'inprogress') {
          // Update experience in "In Progress" tab (don't move)
          // Also ensure it's removed from Recently Added tab if it exists there
          setExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
          setInProgressExperiences(prev => {
            // Update the experience and ensure it moves to top by adding at front then sorting
            const filtered = prev.filter(exp => exp.id !== experience.id);
            const sorted = sortExperiencesByRecent([updatedExperience, ...filtered]);
            // Reset rotation offset to 0 so first (most recent) item is displayed
            setInProgressRotationOffset(0);
            // Select the regenerated experience (should be first after sort)
            if (sorted.length > 0 && sorted[0].id === experience.id) {
              setSelectedExperienceId(experience.id);
            }
            return sorted;
          });
          // Preserve current grade visibility state (don't change it on re-generation)
          // Visibility state persists through regeneration (shown stays shown, hidden stays hidden)
          // DO NOT update STAR Bank - experiences only move to starbank when user presses "STAR Bank" button
          // Show re-generation tip (takes priority - hides instructional tip)
          // Clear other tip boxes to ensure only one is shown at a time
          setShowInProgressTip(false);
          setShowStarBankSavedTip(false);
          setShowStarRegeneratedTip(true);
        } else if (activeTab === 'starbank') {
          // Update experience in "STAR Bank" tab (don't move)
          setStarBankExperiences(prev => {
            const filtered = prev.filter(exp => exp.id !== experience.id);
            const sorted = sortExperiencesByRecent([updatedExperience, ...filtered]);
            // Reset rotation offset to 0 so first (most recent) item is displayed
            setStarBankRotationOffset(0);
            // Select the regenerated experience (should be first after sort)
            if (sorted.length > 0 && sorted[0].id === experience.id) {
              setSelectedExperienceId(experience.id);
            }
            return sorted;
          });
          // Also ensure it's removed from other tabs
          setExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
          setInProgressExperiences(prev => sortExperiencesByRecent(prev.filter(exp => exp.id !== experience.id)));
        }
      } else {
        try {
          const errorData = await response.json();
          const errorMessage = errorData?.error || response.statusText || 'Unknown error';
          console.error('STAR generation error:', response.status, errorMessage);
          alert(`Unable to generate STAR response: ${errorMessage}. Please try again.`);
        } catch (e) {
          console.error('Error parsing error response:', e);
          alert(`Unable to generate STAR response. Please try again.`);
        }
      }
    } catch (error) {
      console.error('Error generating STAR response:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unable to connect to server';
      alert(`Network error: ${errorMessage}. Please check your internet connection and try again.`);
    } finally {
      setGeneratingExperienceId(null);
    }
  };

  const handleDeleteExperience = async (experienceId: string) => {
    if (!confirm('Are you sure you want to delete this experience?')) return;
    
    try {
      const token = await getToken();
      const response = await fetch(`${API_URL}/api/experiences/${experienceId}`, {
        method: 'DELETE',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
      });

      if (response.ok) {
        setExperiences(prev => prev.filter(exp => exp.id !== experienceId));
        setInProgressExperiences(prev => prev.filter(exp => exp.id !== experienceId));
        setStarBankExperiences(prev => prev.filter(exp => exp.id !== experienceId));
        
        // Remove from localStorage if it exists
        const starBankIds = JSON.parse(localStorage.getItem('starBankExperienceIds') || '[]');
        localStorage.setItem('starBankExperienceIds', JSON.stringify(starBankIds.filter((id: string) => id !== experienceId)));
      } else {
        alert('Unable to delete experience. Please try again.');
      }
    } catch (error) {
      console.error('Error deleting experience:', error);
      alert('Network error. Please check your internet connection and try again.');
    }
  };

  const handleEditExperience = (experience: Experience) => {
    setEditingExperience(experience.id);
    setEditingExperienceId(experience.id); // Store separately so it persists even if form closes
    
    // CODE CLEANUP: Use utility instead of direct localStorage access
    try {
      const editData = getEditData(experience.id);
      if (editData && editData.experienceId === experience.id) {
        // Restore unsaved changes from localStorage
        setEditTitle(editData.editFields.title || '');
        setEditCompany(editData.editFields.company || '');
        setEditRole(editData.editFields.role || '');
        setEditDate(editData.editFields.date || '');
        setEditProject(editData.editFields.project || '');
        setEditExperienceTitle(editData.editFields.experienceTitle || '');
        setEditTags(editData.editFields.tags || '');
        setEditExperienceText(editData.editFields.content || '');
        setEditContent(editData.editFields.content || '');
        
        // Clear any previous error/success states
        setEditShowTitleError(false);
        setEditShowSuccessMessage(false);
        return; // Exit early, don't overwrite with existing data
      }
    } catch (error) {
      console.error('Error restoring from localStorage:', error);
    }
    
    // No unsaved changes, populate with existing data
    setEditTitle(experience.title || '');
    setEditCompany(experience.company || '');
    setEditRole(experience.role || '');
    setEditDate(experience.date || '');
    setEditProject(experience.project || '');
    setEditExperienceTitle(experience.experienceTitle || '');
    setEditTags(experience.tags || '');
    setEditExperienceText(experience.content || '');
    
    // Also set editContent for backward compatibility
    setEditContent(experience.content || '');
    
    // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
    // State is now managed by ExperienceCard hooks
    setHasUnsavedChanges(false);
    
    // CODE CLEANUP: Use utility instead of direct localStorage access
    // Clear localStorage if it exists for this experience (cleanup stale data)
    // This prevents the save icon from showing due to stale localStorage data
    try {
      const editData = getEditData(experience.id);
      if (editData && editData.experienceId === experience.id) {
        // Clear it since we're opening with original data (no unsaved changes)
        clearEditData();
      }
    } catch (error) {
      // Ignore errors
    }
    
    // Clear any previous error/success states
    setEditShowTitleError(false);
    setEditShowSuccessMessage(false);
  };

  // Handle collapse in edit mode: close edit mode but preserve unsaved changes
  const handleCollapseInEditMode = (experienceId: string) => {
    // Only proceed if we're actually editing this experience
    if (editingExperience !== experienceId) {
      return;
    }
    
    // Find the original experience to compare with
    const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
    const experience = allExperiences.find(e => e.id === experienceId);
    
    // CODE CLEANUP: Use utility for consistent comparison
    // Check if there are actual unsaved changes by comparing to original
    let hasActualUnsavedChanges = false;
    if (experience) {
      hasActualUnsavedChanges = compareEditFields(
        {
          title: editTitle,
          company: editCompany,
          role: editRole,
          date: editDate,
          project: editProject,
          experienceTitle: editExperienceTitle,
          tags: editTags,
          content: editExperienceText,
        },
        {
          title: experience.title,
          company: experience.company,
          role: experience.role,
          date: experience.date,
          project: experience.project,
          experienceTitle: experience.experienceTitle,
          tags: experience.tags,
          content: experience.content,
        }
      );
    }
    
    // CODE CLEANUP: Use utility instead of direct localStorage access
    // IMPORTANT: Always save to localStorage when collapsing in edit mode
    // This ensures data is preserved even if the hasUnsavedChanges flag hasn't been set yet
    // We'll save regardless of whether we think there are changes, to be safe
    try {
      saveEditData(experienceId, {
        title: editTitle,
        company: editCompany,
        role: editRole,
        date: editDate,
        project: editProject,
        experienceTitle: editExperienceTitle,
        tags: editTags,
        content: editExperienceText,
      });
    } catch (error) {
      console.error('Error saving to localStorage on collapse:', error);
    }
    
    // Close edit mode (but don't clear localStorage or edit fields - preserve them)
    setEditingExperience(null);
    // Note: Keep editingExperienceId to preserve state - don't clear it
    
    // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
    // State is now managed by ExperienceCard hooks and localStorage utilities
    if (!hasActualUnsavedChanges) {
      // CODE CLEANUP: Use utility instead of direct localStorage access
      // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
      // State is now managed by ExperienceCard hooks
      try {
        clearEditData();
      } catch (error) {
        console.error('Error clearing localStorage:', error);
      }
    }
  };

  // Handle save in collapsed mode (background save)
  // Returns the updated experience if successful, null otherwise
  const handleSaveInCollapsedMode = async (experienceId: string): Promise<Experience | null> => {
    // PHASE 3 REFACTOR: Check localStorage directly using utilities
    const editData = getEditData(experienceId);
    
    if (!editData || editData.experienceId !== experienceId) {
      return null; // No unsaved changes, nothing to save
    }

    // Save directly from localStorage data (more reliable than restoring state)
    if (editData) {
      try {
        const token = await getToken();
        if (!token && !demoMode) {
          console.error('No authentication token available');
          return null;
        }

        // Build update data directly from localStorage
        const updateData: any = {};
        if (editData.editFields.title?.trim()) updateData.title = editData.editFields.title.trim();
        if (editData.editFields.content?.trim()) updateData.content = editData.editFields.content.trim();
        if (editData.editFields.company?.trim()) updateData.company = editData.editFields.company.trim();
        if (editData.editFields.role?.trim()) updateData.role = editData.editFields.role.trim();
        if (editData.editFields.date) updateData.date = new Date(editData.editFields.date);
        if (editData.editFields.project?.trim()) updateData.project = editData.editFields.project.trim();
        if (editData.editFields.experienceTitle?.trim()) updateData.experienceTitle = editData.editFields.experienceTitle.trim();
        if (editData.editFields.tags?.trim()) updateData.tags = editData.editFields.tags.trim();
        updateData.updatedAt = new Date().toISOString();
        
        const response = await fetch(`${API_URL}/api/experiences/${experienceId}`, {
          method: 'PUT',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          },
          body: JSON.stringify(updateData),
        });
        
        if (response.ok) {
          const result = await response.json();
          const updatedExperience = result.experience;
          
          if (updatedExperience) {
            // Update experience in all arrays
            setExperiences(prev => {
              const updated = prev.map(exp => 
                exp.id === experienceId 
                  ? { ...exp, ...updatedExperience }
                  : exp
              );
              return sortExperiencesByRecent(updated);
            });
            setInProgressExperiences(prev => {
              const updated = prev.map(exp => 
                exp.id === experienceId 
                  ? { ...exp, ...updatedExperience }
                  : exp
              );
              return sortExperiencesByRecent(updated);
            });
            setStarBankExperiences(prev => {
              const updated = prev.map(exp => 
                exp.id === experienceId 
                  ? { ...exp, ...updatedExperience }
                  : exp
              );
              return sortExperiencesByRecent(updated);
            });
            
            // Force a small delay to ensure state updates propagate
            await new Promise(resolve => setTimeout(resolve, 50));
            
            // Clear unsaved changes flag and localStorage
            // CODE CLEANUP: Use utility instead of direct localStorage access
            // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
            try {
              clearEditData();
            } catch (error) {
              console.error('Error clearing localStorage:', error);
            }
            
            return updatedExperience; // Return the updated experience
          } else {
            devWarn('Save response OK but no experience in result');
            return null;
          }
        } else {
          const errorData = await response.json();
          console.error('Error saving collapsed changes:', errorData);
          throw new Error(errorData.error || 'Failed to save');
        }
      } catch (error) {
        console.error('Error saving in collapsed mode:', error);
        throw error; // Re-throw so caller knows save failed
      }
    } else {
      // PHASE 3 REFACTOR: Removed hasUnsavedInState check
      // Fallback: If localStorage is missing, try to restore from current edit state (if still available)
      if (editingExperienceId === experienceId) {
        devWarn('localStorage missing but unsaved changes tracked, attempting to save from current state');
        try {
          // Restore edit state from current values (if they're still in state)
          setEditingExperience(experienceId);
          
          // Small delay to ensure state is set
          await new Promise(resolve => setTimeout(resolve, COLLAPSE_STATE_RESET_DELAY_MS));
          
          // Try to save (will use current edit state values)
          const result = await handleSaveEdit(experienceId, false);
          
          // Close edit mode after save
          setEditingExperience(null);
          
          // Return the saved experience if available
          return result;
        } catch (error) {
          console.error('Error saving from current state:', error);
          setEditingExperience(null);
          alert('Unable to save unsaved changes automatically. Please re-enter edit mode and save manually.');
          return null;
        }
      }
    }
    
    // If we get here, there was no savedEditData but we had unsaved changes tracked
    // This shouldn't happen, but return null to be safe
    return null;
  };

  const handleSaveEdit = async (experienceId: string, skipSuccessMessage: boolean = false): Promise<Experience | null> => {
    // Validate title - use editTitle if user has entered something, otherwise use generated title
    const finalTitle = editTitle.trim() || generateEditTitle();
    if (!finalTitle.trim()) {
      setEditShowTitleError(true);
      return null;
    }

    // Client-side tags validation (matches backend validation)
    if (editTags && editTags.trim()) {
      const tagCount = editTags.split(',').map(t => t.trim()).filter(t => t.length > 0).length;
      if (tagCount > 20) {
        alert(`Maximum 20 tags allowed. Currently ${tagCount} entered.`);
        return null;
      }
      const normalizedTags = editTags.split(',').map(t => t.trim().toLowerCase()).filter(t => t.length > 0).join(',');
      if (normalizedTags.length > 200) {
        alert('Tags too long (max 200 characters)');
        return null;
      }
    }

    setEditIsSubmitting(true);
    setEditShowTitleError(false);

    try {
      const token = await getToken();
      
      const updateData = {
        title: finalTitle,
        content: editExperienceText,
        company: editCompany,
        role: editRole,
        date: editDate,
        project: editProject,
        experienceTitle: editExperienceTitle,
        tags: editTags.trim() || undefined,
        updatedAt: new Date().toISOString()
      };
      
      
      const response = await fetch(`${API_URL}/api/experiences/${experienceId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(updateData),
      });

      if (response.ok) {
        const result = await response.json();
        
        // Get current timestamp to ensure most recent sorting
        const now = new Date().toISOString();
        const savedAt = Date.now();
        
        // Track this as a recently saved experience
        recentlySavedExperiences.current.set(experienceId, {
          updatedAt: now,
          savedAt: savedAt
        });
            
        // Declare updatedExperience outside the if block so it's accessible for return
        let updatedExperience: Experience | null = null;
            
        // Update the local state immediately with the returned data
        if (result.experience) {
          // Ensure updatedAt is set to current time for proper sorting
          updatedExperience = {
            ...result.experience,
            updatedAt: now // Always use current time, not backend response
          };
          
          // Update experience in all arrays and re-sort to ensure most recent appears first
          setExperiences(prev => {
            const updated = prev.map(exp => 
              exp.id === experienceId 
                ? { ...exp, ...updatedExperience }
                : exp
            );
            return sortExperiencesByRecent(updated);
          });
          setInProgressExperiences(prev => {
            const updated = prev.map(exp => 
              exp.id === experienceId 
                ? { ...exp, ...updatedExperience }
                : exp
            );
            const sorted = sortExperiencesByRecent(updated);
            // Reset rotation offset to 0 so first (most recent) item is displayed
            setInProgressRotationOffset(0);
            // Select the saved experience (should be first after sort)
            if (sorted.length > 0 && sorted[0].id === experienceId) {
              setSelectedExperienceId(experienceId);
            }
            return sorted;
          });
          setStarBankExperiences(prev => {
            const updated = prev.map(exp => 
              exp.id === experienceId 
                ? { ...exp, ...updatedExperience }
                : exp
            );
            const sorted = sortExperiencesByRecent(updated);
            // Reset rotation offset to 0 so first (most recent) item is displayed
            setStarBankRotationOffset(0);
            // Select the saved experience (should be first after sort)
            if (sorted.length > 0 && sorted[0].id === experienceId) {
              setSelectedExperienceId(experienceId);
            }
            return sorted;
          });
        }
        
        // Note: We don't call loadExperiences() immediately after save because:
        // 1. We've already updated local state with the saved experience
        // 2. We've already sorted to ensure most recent appears first
        // 3. Calling loadExperiences() might overwrite our sorted state if backend hasn't updated yet
        // The experience will be refreshed on next page load or when user navigates away and back
        
        // Keep user in edit mode - don't close edit mode after save
        // This allows user to continue editing without having to click Edit again
        
        // Update edit fields to match saved experience (so icon changes back to Edit)
        if (updatedExperience) {
          // Mark that we're updating programmatically to prevent clearing success message
          isUpdatingEditTextProgrammaticallyRef.current = true;
          setEditTitle(updatedExperience.title || '');
          setEditCompany(updatedExperience.company || '');
          setEditRole(updatedExperience.role || '');
          setEditDate(updatedExperience.date || '');
          setEditProject(updatedExperience.project || '');
          setEditExperienceTitle(updatedExperience.experienceTitle || '');
          setEditTags(updatedExperience.tags || '');
          setEditExperienceText(updatedExperience.content || '');
          setEditContent(updatedExperience.content || '');
        }
        
        // Clear unsaved changes flag and localStorage
        setHasUnsavedChanges(false);
        // CODE CLEANUP: Use utility instead of direct localStorage access
        // PHASE 3 REFACTOR: Removed hasUnsavedChangesByExperience tracking
        try {
          clearEditData();
        } catch (error) {
          console.error('Error clearing localStorage:', error);
        }
        
        // Show success message (unless skipped for navigation scenarios)
        if (!skipSuccessMessage) {
          setEditShowSuccessMessage(true);
          
          // Auto-hide success message after 10 seconds (consistent with other tip boxes)
          setTimeout(() => {
            setEditShowSuccessMessage(false);
          }, 10000);
        }
        
        // Return the updated experience for use by callers (null if result.experience was not present)
        return updatedExperience;
      } else {
        let errorMessage = 'Unknown error';
        try {
        const errorData = await response.json();
        console.error('Error updating experience:', errorData);
          // Backend returns { success: false, error: "message" } or { error: "message" }
          errorMessage = errorData.error || errorData.message || `HTTP ${response.status}: ${response.statusText}`;
        } catch (parseError) {
          // If response isn't JSON, use status text
          console.error('Error parsing error response:', parseError);
          errorMessage = `HTTP ${response.status}: ${response.statusText || 'Unknown error'}`;
        }
        alert(`Unable to update experience: ${errorMessage}. Please try again.`);
        return null; // Return null on error
      }
    } catch (error) {
      console.error('Error updating experience:', error);
      alert('Network error. Please check your internet connection and try again.');
      return null; // Return null on error
    } finally {
      setEditIsSubmitting(false);
    }
  };

  const handleCancelEdit = () => {
    const currentEditingId = editingExperience;
    setEditingExperience(null);
    setEditingExperienceId(null); // Clear persisted ID
    setEditContent('');
    
    // Clear all edit fields
    setEditTitle('');
    setEditCompany('');
    setEditRole('');
    setEditDate('');
    setEditProject('');
    setEditExperienceTitle('');
    setEditExperienceText('');
    
    // Clear unsaved changes flag and localStorage
    setHasUnsavedChanges(false);
    // CODE CLEANUP: Use utility instead of direct localStorage access
    // PHASE 3 REFACTOR: State is now managed by ExperienceCard hooks and localStorage utilities
    try {
      clearEditData();
    } catch (error) {
      console.error('Error clearing localStorage:', error);
    }
    
    // Clear error/success states
    setEditShowTitleError(false);
    setEditShowSuccessMessage(false);
  };

  // Helper function to check if localStorage data actually differs from original experience
  // CODE CLEANUP: Use utilities instead of duplicating logic
  const hasActualUnsavedChangesInStorage = (experienceId: string): boolean => {
    const editData = getEditData(experienceId);
    if (!editData) return false;
    
    // Find the original experience to compare with
    const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
    const experience = allExperiences.find(e => e.id === experienceId);
    
    if (!experience) return false;
    
    // Use utility function for normalized comparison
    return compareEditFields(editData.editFields, {
      title: experience.title,
      company: experience.company,
      role: experience.role,
      date: experience.date,
      project: experience.project,
      experienceTitle: experience.experienceTitle,
      tags: experience.tags,
      content: experience.content,
    });
  };

  // Phase 5.1: Confirmation dialog handler for navigation (checks both edit and feedback unsaved changes)
  const handleNavigationWithConfirmation = async (navigationAction: () => void) => {
    // Check for unsaved changes in active editing mode - only if actually editing AND there are real changes
    let hasActiveUnsavedChanges = false;
    if (editingExperience && editingExperienceId) {
      // Check if there are actual changes by comparing to original experience
      const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
      const experience = allExperiences.find(e => e.id === editingExperienceId);
      if (experience) {
        // CODE CLEANUP: Use utilities instead of duplicating normalization functions
        hasActiveUnsavedChanges = 
          normalize(editTitle) !== normalize(experience.title) ||
          normalize(editCompany) !== normalize(experience.company) ||
          normalize(editRole) !== normalize(experience.role) ||
          normalizeDate(editDate, experience.date) !== normalizeDate(experience.date, experience.date) ||
          normalize(editProject) !== normalize(experience.project) ||
          normalize(editExperienceTitle) !== normalize(experience.experienceTitle) ||
          normalize(editTags) !== normalize(experience.tags) ||
          normalize(editExperienceText) !== normalize(experience.content);
        
        // Debug logging to help identify false positives
        if (hasActiveUnsavedChanges) {
        }
      }
    }
    
    // CODE CLEANUP: Consolidated check for unsaved changes in collapsed mode
    // Check if there's unsaved data in localStorage for any experience
    let hasCollapsedUnsavedChanges = false;
    let hasUnsavedInStorage = false;
    let storageExperienceId: string | null = null;
    
    const editData = getEditData();
    if (editData && editData.experienceId) {
      const allExperiences = [...experiences, ...inProgressExperiences, ...starBankExperiences];
      const experience = allExperiences.find(e => e.id === editData.experienceId);
      
      if (experience) {
        // Check if this data actually differs from the original experience
        const hasChanges = compareEditFields(editData.editFields, {
          title: experience.title,
          company: experience.company,
          role: experience.role,
          date: experience.date,
          project: experience.project,
          experienceTitle: experience.experienceTitle,
          tags: experience.tags,
          content: experience.content,
        });
        
        // If it's a different experience than the one being edited, count as collapsed unsaved
        if (editData.experienceId !== editingExperienceId && hasChanges) {
          hasCollapsedUnsavedChanges = true;
        }
        
        // If it has changes, also count as storage unsaved (for the confirmation logic)
        if (hasChanges) {
          hasUnsavedInStorage = true;
          storageExperienceId = editData.experienceId;
        }
      }
    }
    
    const hasAnyUnsavedChanges = hasActiveUnsavedChanges || hasCollapsedUnsavedChanges || hasUnsavedInStorage || hasUnsavedFeedback;
    
    if (!hasAnyUnsavedChanges) {
      // No unsaved changes, proceed with navigation
      // PHASE 3 REFACTOR: State is now managed by ExperienceCard hooks
      navigationAction();
      return;
    }

    // PHASE 3 REFACTOR: Calculate total unsaved count using localStorage check
    const collapsedCount = hasCollapsedUnsavedChanges ? 1 : 0;
    const totalUnsavedCount = (hasActiveUnsavedChanges ? 1 : 0) + (hasUnsavedInStorage && !hasActiveUnsavedChanges && collapsedCount === 0 ? 1 : 0) + collapsedCount + unsavedFeedbackCount;
    const message = totalUnsavedCount > 1
      ? `You have ${totalUnsavedCount} unsaved changes.`
      : 'You have unsaved changes.';

    // Show confirmation dialog
    const userChoice = window.confirm(
      `${message} What would you like to do?\n\n` +
      'Click "OK" to save all changes, or "Cancel" to stay on this page.'
    );

    if (userChoice) {
      // User clicked OK - save all changes (both edit and feedback)
      try {
        let editWasSaved = false;
        let updatedExperienceContent: string | undefined = undefined;
        
        // Priority 1: If form is currently open, save from current state
        if (editingExperience && editingExperienceId) {
          // Form is open, use handleSaveEdit with current edit state
          const result = await handleSaveEdit(editingExperienceId, true);
          if (result) {
            updatedExperienceContent = result.content;
                editWasSaved = true;
          }
        }
        
        // PHASE 3 REFACTOR: Save collapsed unsaved changes from localStorage
        // Check localStorage for any unsaved changes
        if (hasUnsavedInStorage && storageExperienceId && !hasActiveUnsavedChanges) {
          try {
            if (handleSaveInCollapsedMode) {
              await handleSaveInCollapsedMode(storageExperienceId);
              editWasSaved = true;
            }
          } catch (error) {
            console.error('Error saving from localStorage:', error);
          }
        }
        
        // Save feedback changes if any
        // Pass updated content if edit was saved, so feedback appends to the updated content
        if (hasUnsavedFeedback && feedbackSaveAllRef.current) {
          await feedbackSaveAllRef.current(updatedExperienceContent);
        }
        
        // Show success message above experience card if edit was saved
        if (editWasSaved) {
          // Set flag to show tip box after navigation completes
          showEditTipAfterNavigationRef.current = true;
        }
        
          // After saving, proceed with navigation
          navigationAction();
          
          // Show tip box after navigation completes (with delay to ensure page renders)
          if (editWasSaved) {
            setTimeout(() => {
              setEditShowSuccessMessage(true);
              setTimeout(() => {
                setEditShowSuccessMessage(false);
                showEditTipAfterNavigationRef.current = false;
              }, 10000); // Auto-hide after 10 seconds
            }, 100); // Small delay to ensure page renders first
          }
      } catch (error) {
          console.error('Error saving before navigation:', error);
          // Don't navigate if save failed
      }
    }
    // If user clicked Cancel, do nothing (stay on page)
  };

  // Confirmation handler for re-generate STAR in in-progress tab (checks both edit and feedback unsaved changes)
  const handleGenerateSTARWithConfirmation = async (experience: Experience) => {
    // Check for unsaved changes in active editing mode (only if editing THIS experience)
    const hasActiveUnsavedChanges = hasUnsavedChanges && editingExperienceId === experience.id;
    
    // PHASE 3 REFACTOR: Check for unsaved changes in collapsed mode using localStorage utilities
    const editData = getEditData(experience.id);
    const hasCollapsedUnsavedChanges = editData ? compareEditFields(editData.editFields, {
      title: experience.title,
      company: experience.company,
      role: experience.role,
      date: experience.date,
      project: experience.project,
      experienceTitle: experience.experienceTitle,
      tags: experience.tags,
      content: experience.content,
    }) : false;
    
    // Check localStorage for unsaved changes, but only if they actually differ from original
    const hasUnsavedInStorage = hasActualUnsavedChangesInStorage(experience.id);
    
    const hasAnyUnsavedChanges = hasActiveUnsavedChanges || hasCollapsedUnsavedChanges || hasUnsavedInStorage || hasUnsavedFeedback;
    
    if (!hasAnyUnsavedChanges) {
      // No unsaved changes, proceed with STAR generation
      await handleGenerateSTAR(experience);
      return;
    }

    // Calculate total unsaved count (include collapsed and storage)
    const collapsedCount = hasCollapsedUnsavedChanges ? 1 : 0;
    const storageCount = hasUnsavedInStorage && !hasActiveUnsavedChanges && !hasCollapsedUnsavedChanges ? 1 : 0;
    const totalUnsavedCount = (hasActiveUnsavedChanges ? 1 : 0) + storageCount + collapsedCount + unsavedFeedbackCount;
    const message = totalUnsavedCount > 1
      ? `You have ${totalUnsavedCount} unsaved changes.`
      : 'You have unsaved changes.';

    // Show confirmation dialog (same as navigation confirmation)
    const userChoice = window.confirm(
      `${message} What would you like to do?\n\n` +
      'Click "OK" to save all changes, or "Cancel" to stay on this page.'
    );

    if (userChoice) {
      // User clicked OK - save all changes (both edit and feedback), then generate STAR
      try {
        let editWasSaved = false;
        let updatedExperienceContent: string | undefined = undefined;
        
        // Priority 1: If form is currently open and editing THIS experience, save from current state
        if (editingExperienceId === experience.id && editingExperience === experience.id) {
          // Form is open, use handleSaveEdit with current edit state
          const result = await handleSaveEdit(editingExperienceId, true);
          if (result) {
            updatedExperienceContent = result.content;
                editWasSaved = true;
              }
            } else {
          // Priority 2: Form is collapsed or not open, save from localStorage
          // This handles both collapsed mode and cases where state was lost
          if ((hasCollapsedUnsavedChanges || hasUnsavedInStorage) && handleSaveInCollapsedMode) {
            try {
              // Save and get the updated experience back
              const updatedExp = await handleSaveInCollapsedMode(experience.id);
              if (updatedExp) {
              editWasSaved = true;
                updatedExperienceContent = updatedExp.content;
                // Update the experience object to use for STAR generation
                experience = updatedExp;
              } else {
                devWarn('Save completed but no updated experience returned');
              }
            } catch (error) {
              console.error(`Error saving collapsed changes for experience ${experience.id}:`, error);
              throw error; // Re-throw to prevent proceeding with STAR generation
            }
          }
        }
        
        // Save feedback changes if any
        // Pass updated content if edit was saved, so feedback appends to the updated content
        if (hasUnsavedFeedback && feedbackSaveAllRef.current) {
          await feedbackSaveAllRef.current(updatedExperienceContent);
        }
        
        // Show success message above experience card if edit was saved
        if (editWasSaved) {
          // Set success message state (will be displayed above experience card)
          setEditShowSuccessMessage(true);
          setTimeout(() => {
            setEditShowSuccessMessage(false);
          }, 10000); // Auto-hide after 10 seconds
        }
        
        // After saving, proceed with STAR generation
        // Use the updated experience (which was modified in place if saved)
        await handleGenerateSTAR(experience);
      } catch (error) {
        console.error('Error saving before STAR generation:', error);
        // Don't generate STAR if save failed
      }
    }
    // If user clicked Cancel, do nothing (don't generate STAR)
  };

  // Voice recording functions
  const startVoiceRecording = () => {
    if (!isVoiceSupported) {
      alert('Voice recording is not supported in your browser. Please use Chrome or Edge for voice input.');
      return;
    }

    // Stop any existing recognition first
    if (recognition) {
      recognition.stop();
      setRecognition(null);
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const newRecognition = new SpeechRecognition();
    
    newRecognition.continuous = true;
    newRecognition.interimResults = true;
    newRecognition.lang = 'en-US';

    newRecognition.onstart = () => {
      setIsListening(true);
    };

    newRecognition.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList[] }) => {
      let finalTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0]?.transcript || '';
        if (result.isFinal) {
          finalTranscript += transcript;
        }
      }

      // Update the textarea with the current transcript
      setExperienceText(prev => prev + finalTranscript);
    };

    newRecognition.onerror = (event: { error: string }) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      setRecognition(null);
      
      // Handle specific error types
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings and try again.');
      } else if (event.error === 'aborted') {
        // Normal when stopping recording, no need to alert user
        devLog('Speech recognition was aborted. This is normal when stopping recording.');
      } else if (event.error === 'no-speech') {
        alert('No speech detected. Please speak clearly and try again.');
      } else if (event.error === 'audio-capture') {
        alert('Audio capture failed. Please check your microphone connection and try again.');
      } else if (event.error === 'network') {
        alert('Network error occurred. Please check your internet connection and try again.');
      }
    };

    newRecognition.onend = () => {
      setIsListening(false);
      setRecognition(null);
    };

    setRecognition(newRecognition);
    newRecognition.start();
  };

  const stopVoiceRecording = () => {
    if (recognition) {
      recognition.stop();
      setRecognition(null);
    }
    setIsListening(false);
  };

  // Voice recording for edit mode
  const startEditVoiceRecording = () => {
    if (!isVoiceSupported) return;
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const newRecognition = new SpeechRecognition();
    
    newRecognition.continuous = false;
    newRecognition.interimResults = false;
    newRecognition.lang = 'en-US';
    
    newRecognition.onresult = (event: { resultIndex: number; results: SpeechRecognitionResultList[] }) => {
      const transcript = event.results[0]?.[0]?.transcript || '';
      setEditExperienceText(prev => prev + (prev ? ' ' : '') + transcript);
    };
    
    newRecognition.onerror = (event: { error: string }) => {
      console.error('Edit speech recognition error:', event.error);
      setEditIsRecording(false);
      
      // Handle specific error types
      if (event.error === 'not-allowed') {
        alert('Microphone access denied. Please allow microphone access in your browser settings and try again.');
      } else if (event.error === 'aborted') {
        // Normal when stopping recording, no need to alert user
        devLog('Edit speech recognition was aborted. This is normal when stopping recording.');
      } else if (event.error === 'no-speech') {
        alert('No speech detected. Please speak clearly and try again.');
      } else if (event.error === 'audio-capture') {
        alert('Audio capture failed. Please check your microphone connection and try again.');
      } else if (event.error === 'network') {
        alert('Network error occurred. Please check your internet connection and try again.');
      }
    };
    
    newRecognition.onend = () => {
      setEditIsRecording(false);
    };
    
    // Stop any existing recognition first
    if (editRecognition) {
      editRecognition.stop();
    }
    
    setEditRecognition(newRecognition);
    newRecognition.start();
    setEditIsRecording(true);
  };

  const stopEditVoiceRecording = () => {
    if (editRecognition) {
      editRecognition.stop();
      setEditRecognition(null);
    }
    setEditIsRecording(false);
  };

  // Generate title from combination of fields
  const generateTitle = () => {
    const parts = [company, role, date, project, experienceTitle].filter(part => part.trim() !== '');
    return parts.join(' - ');
  };

  const generateEditTitle = () => {
    const parts = [editCompany, editRole, editDate, editProject, editExperienceTitle].filter(part => part.trim() !== '');
    return parts.join(' - ');
  };

  if (!isSignedIn) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <Card className="max-w-md mx-auto">
          <CardHeader className="text-center">
            <CardTitle>Please Sign In</CardTitle>
            <CardDescription>
              You need to be signed in to access your dashboard.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-center">
            <Link href="/">
              <Button>Go to Home</Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading your dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Link href="/">
              <Button variant="ghost" className="flex items-center space-x-2 px-3 py-2">
                <ArrowLeft className="h-4 w-16 text-gray-600" />
              </Button>
            </Link>
            <Star className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              worknotesAI<sup className="text-xs text-gray-500">{envLabel}</sup>
            </h1>
            <span className="text-sm text-gray-600 flex items-center mt-1">
              Build your professional story bank, one conversation at a time
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">
              {demoMode ? 'Welcome, Demo User!' : `Welcome, ${user?.firstName}!`}
            </span>
            {!demoMode && <UserButton />}
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Enhanced Tab Navigation */}
        <div className="mb-12 flex justify-center">
          <div className="flex space-x-2 w-fit">
              <button
              onClick={() => handleNavigationWithConfirmation(() => setActiveTab('add'))}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md border-2 transition-all duration-200 ${
                activeTab === 'add'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-102'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span className="font-medium">Add Experience</span>
              </button>
              <button
              onClick={() => handleNavigationWithConfirmation(() => setActiveTab('list'))}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md border-2 transition-all duration-200 ${
                activeTab === 'list'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-102'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span className="font-medium">Recently Added</span>
              </button>
              <button
              onClick={() => handleNavigationWithConfirmation(() => setActiveTab('inprogress'))}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md border-2 transition-all duration-200 ${
                activeTab === 'inprogress'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-102'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <CheckCircle className="h-4 w-4" />
              <span className="font-medium">In Progress</span>
              </button>
              <button
              onClick={() => {
                handleNavigationWithConfirmation(() => setActiveTab('starbank'));
                setShowStarBankSavedTip(false);
              }}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md border-2 transition-all duration-200 ${
                activeTab === 'starbank'
                  ? 'bg-indigo-600 text-white border-indigo-600 shadow-md transform scale-102'
                  : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300 hover:shadow-sm'
              }`}
            >
              <Star className="h-4 w-4" />
              <span className="font-medium">STAR Bank</span>
              </button>
          </div>
        </div>


        {/* Add Experience Tab */}
        {activeTab === 'add' && (
          <div className="max-w-4xl mx-auto">
            {/* Title Error Message */}
            {showTitleError && (
              <div className="mb-6 p-4 bg-red-50 border border-red-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">⚠️</span>
                    <div className="text-sm font-medium text-red-800">
                      Please add a title for your experience. Fill in the title field or add details in the form below.
                    </div>
                  </div>
                  <button
                    onClick={() => setShowTitleError(false)}
                    className="text-red-600 hover:text-red-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            
            {/* Success Message */}
            {showSuccessMessage && (
              <div className="mb-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <div className="flex items-center justify-between">
                  <div className="flex items-center space-x-2">
                    <span className="text-lg">🙌</span>
                    <div className="text-sm font-medium text-green-800">
                      Experience saved! Your story is now in "Recently Added" - ready for STAR transformation.
                    </div>
                  </div>
                  <button
                    onClick={() => setShowSuccessMessage(false)}
                    className="text-green-600 hover:text-green-800 transition-colors"
                  >
                    <X className="h-4 w-4" />
                  </button>
                </div>
              </div>
            )}
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Plus className="h-5 w-5" />
                  <span>Share Experience</span>
                </CardTitle>
                <CardDescription>
              Tell me about a professional experience. I'll help you turn it into a compelling STAR response.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title
                  </label>
                  <input
                    type="text"
                    value={title || generateTitle()}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder={generateTitle() || "company - role - date - project - experience title"}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    style={{ color: title ? 'black' : 'grey' }}
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Experience
                  </label>
                  <div className="relative">
                <textarea
                      value={experienceText}
                      onChange={(e) => setExperienceText(e.target.value)}
                  placeholder="How was your day? I'm here to listen"
                  className="w-full p-4 pr-12 border border-gray-300 rounded-lg resize-y focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500 min-h-[120px] max-h-[400px] overflow-y-auto"
                  rows={6}
                    />
                    {isVoiceSupported && (
                      <button
                        onClick={isListening ? stopVoiceRecording : startVoiceRecording}
                        className={`absolute top-3 right-3 p-2 rounded-full transition-colors ${
                          isListening 
                            ? 'bg-red-500 text-white hover:bg-red-600' 
                            : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                        }`}
                        title={isListening ? 'Stop recording' : 'Start voice recording'}
                      >
                        {isListening ? (
                          <MicOff className="h-4 w-4" />
                        ) : (
                          <Mic className="h-4 w-4" />
                        )}
                      </button>
                    )}
                  </div>
                  {isListening && (
                    <div className="mt-2 text-sm text-red-600 flex items-center">
                      <div className="animate-pulse w-2 h-2 bg-red-500 rounded-full mr-2"></div>
                      Listening... Speak now
                    </div>
                    )}
                  </div>

                {/* Tags input - right after text entry, no border */}
                {experienceText.trim() && (
                  <div className="mt-4">
                    <label className="block text-sm font-medium text-gray-600 mb-1">
                      Tags
                    </label>
                    <input
                      type="text"
                      value={tags}
                      onChange={(e) => setTags(e.target.value)}
                      placeholder="e.g., leadership, technical, teamwork, (separate with commas)"
                      className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                    />
                  </div>
                )}

                {/* Additional form fields - only show when user starts typing */}
                {experienceText.trim() && (
                  <div className="space-y-4 mt-4">
                    <div className="grid grid-cols-3 gap-4">
                    <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Company
                      </label>
                      <input
                        type="text"
                          value={company}
                          onChange={(e) => setCompany(e.target.value)}
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
                          value={role}
                          onChange={(e) => setRole(e.target.value)}
                          placeholder="e.g., software engineer, product manager"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                      <div>
                        <label className="block text-sm font-medium text-gray-600 mb-1">
                          Date
                        </label>
                    <input
                      type="text"
                      value={date}
                      onChange={(e) => setDate(e.target.value)}
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
                          value={project}
                          onChange={(e) => setProject(e.target.value)}
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
                          value={experienceTitle}
                          onChange={(e) => setExperienceTitle(e.target.value)}
                          placeholder="e.g., led team through challenging project"
                        className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                      />
                    </div>
                  </div>
                </div>
                )}

                    <Button
                  onClick={handleSaveExperience}
                    disabled={!experienceText.trim() || isSubmitting}
                  className="w-full bg-indigo-600 text-white hover:bg-indigo-700"
                  >
                    {isSubmitting ? (
                      <>
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                      Saving...
                      </>
                    ) : (
                      <>
                      <Send className="h-4 w-4 mr-2" />
                      Save Experience
                      </>
                    )}
                  </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Experiences List Tab */}
        {activeTab === 'list' && (
          <div className="max-w-4xl mx-auto">
            {experiences.length === 0 ? (
              <Card>
                <CardContent className="text-center py-12">
                  <Clock className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No experiences yet</h3>
                  <p className="text-gray-600 mb-4">Start by sharing your first professional experience</p>
                  <Button onClick={() => setActiveTab('add')} className="bg-indigo-600 text-white hover:bg-indigo-700">
                    <Plus className="h-4 w-4 mr-2" />
                    Add Experience
                  </Button>
                </CardContent>
              </Card>
            ) : (
              <>
                {/* Search Bar with Navigation - Always show when there are experiences */}
                {(() => {
                  // Helper function to rotate array
                  const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                    if (arr.length === 0) return arr;
                    const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length; // Handle negative offsets
                    return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
                  };

                  // When no search: use rotated experiences, when searching: use filtered experiences
                  const experiencesForDisplay = debouncedSearchQuery.trim() 
                    ? filteredExperiences 
                    : rotateArray(experiences, recentlyAddedRotationOffset);
                  
                  // Calculate current position for "x of y" display
                  // When no search: show rotation position (which original experience is first)
                  // When searching: show position in filtered results
                  const currentPosition = debouncedSearchQuery.trim()
                    ? (selectedExperienceId 
                        ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId) + 1
                        : 1)
                    : ((recentlyAddedRotationOffset % experiences.length) + experiences.length) % experiences.length + 1;
                  
                  const totalCount = debouncedSearchQuery.trim() 
                    ? filteredExperiences.length 
                    : experiences.length;

                  return (
                    <ExperienceSearchBar
                      experiences={experiences}
                      filteredExperiences={experiencesForDisplay}
                      selectedExperienceId={debouncedSearchQuery.trim() ? selectedExperienceId : (experiencesForDisplay[0]?.id || null)}
                      currentNumber={currentPosition}
                      totalNumber={totalCount}
                      isRotationMode={!debouncedSearchQuery.trim()}
                      onSearchChange={(query) => {
                        // Component already debounces, so use query directly for filtering
                        setDebouncedSearchQuery(query);
                      }}
                      onExperienceSelect={(id) => {
                        setSelectedExperienceId(id);
                      }}
                      onPrevious={() => {
                        handleNavigationWithConfirmation(() => {
                          if (debouncedSearchQuery.trim()) {
                            // WITH SEARCH: Navigate through filtered results with wrap-around
                            const currentIndex = selectedExperienceId 
                              ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                              : 0;
                            if (filteredExperiences.length > 1) {
                              // Wrap-around: if at first item, go to last item
                              const newIndex = currentIndex > 0 ? currentIndex - 1 : filteredExperiences.length - 1;
                              setSelectedExperienceId(filteredExperiences[newIndex].id);
                            } else if (currentIndex > 0) {
                              // No wrap-around if only one result
                              setSelectedExperienceId(filteredExperiences[currentIndex - 1].id);
                            }
                          } else {
                            // NO SEARCH: Rotate backward (left arrow)
                            setRecentlyAddedRotationOffset(prev => {
                              const newOffset = prev - 1;
                              const normalizedOffset = ((newOffset % experiences.length) + experiences.length) % experiences.length;
                              // Update selectedExperienceId to match first item in rotated array
                              const rotated = [...experiences.slice(normalizedOffset), ...experiences.slice(0, normalizedOffset)];
                              if (rotated.length > 0) {
                                setSelectedExperienceId(rotated[0].id);
                              }
                              return normalizedOffset;
                            });
                          }
                        });
                      }}
                      onNext={() => {
                        handleNavigationWithConfirmation(() => {
                          if (debouncedSearchQuery.trim()) {
                            // WITH SEARCH: Navigate through filtered results with wrap-around
                            const currentIndex = selectedExperienceId 
                              ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                              : 0;
                            if (filteredExperiences.length > 1) {
                              // Wrap-around: if at last item, go to first item
                              const newIndex = currentIndex < filteredExperiences.length - 1 ? currentIndex + 1 : 0;
                              setSelectedExperienceId(filteredExperiences[newIndex].id);
                            } else if (currentIndex < filteredExperiences.length - 1) {
                              // No wrap-around if only one result
                              setSelectedExperienceId(filteredExperiences[currentIndex + 1].id);
                            }
                          } else {
                            // NO SEARCH: Rotate forward (right arrow)
                            setRecentlyAddedRotationOffset(prev => {
                              const newOffset = prev + 1;
                              const normalizedOffset = ((newOffset % experiences.length) + experiences.length) % experiences.length;
                              // Update selectedExperienceId to match first item in rotated array
                              const rotated = [...experiences.slice(normalizedOffset), ...experiences.slice(0, normalizedOffset)];
                              if (rotated.length > 0) {
                                setSelectedExperienceId(rotated[0].id);
                              }
                              return normalizedOffset;
                            });
                          }
                        });
                      }}
                      onSearchInteraction={() => {
                        // Hide tip boxes when user interacts with search (typing, deleting, arrows)
                        setShowEditTip(false);
                        setShowStarGeneratedTip(false);
                      }}
                      placeholder="Search experiences..."
                    />
                  );
                })()}

                {/* Tip Boxes - Appear below search bar and above experience card */}
                {/* STAR Generated Success Tip - Highest priority */}
                {showStarGeneratedTip && (
                  <div className="mb-6">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">🎉</span>
                          <div className="text-sm font-medium text-green-800">
                            STAR response generated! Your experience has moved to the "In Progress" tab where you can continue refining it.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (starGeneratedTipTimeoutRef.current) {
                              clearTimeout(starGeneratedTipTimeoutRef.current);
                            }
                            setShowStarGeneratedTip(false);
                          }}
                          className="text-green-600 hover:text-green-800 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit Saved Success Tip - Show when experience is saved in recently-added tab */}
                {editShowSuccessMessage && activeTab === 'list' && !showStarGeneratedTip && (
                  <div className="mb-6">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <span className="text-lg">🙌</span>
                          <div className="text-sm font-medium text-green-800">
                            Experience updated successfully!
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            setEditShowSuccessMessage(false);
                          }}
                          className="text-green-600 hover:text-green-800 transition-colors"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Edit Tip Box - Only show if STAR generated tip and save tip are not showing */}
                {showEditTip && !showStarGeneratedTip && !editShowSuccessMessage && (
                  <div className="mb-6">
                    <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-2">
                          <Edit className="h-4 w-4 text-green-600" />
                          <div className="text-sm font-medium text-green-800">
                            Add more details and generate STAR response.
                          </div>
                        </div>
                        <button
                          onClick={() => {
                            if (editTipTimeoutRef.current) {
                              clearTimeout(editTipTimeoutRef.current);
                            }
                            setShowEditTip(false);
                          }}
                          className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-100"
                          title="Close tip"
                        >
                          <X className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditional Rendering: List view (no search) vs Focused view (with search) */}
                {debouncedSearchQuery.trim() ? (
                  // WITH SEARCH: Show single focused experience (like In Progress/Star Bank)
                  (() => {
                    const selectedExperience = filteredExperiences.find(
                      exp => exp && exp.id === selectedExperienceId
                    ) || filteredExperiences[0] || null;
                    
                    return (
                      <>
                        {filteredExperiences.length === 0 ? (
                          <div className="text-center py-12">
                            <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                            <h3 className="text-xl font-semibold text-gray-600 mb-2">No experiences match your search</h3>
                            <p className="text-gray-500">Try a different search term or clear your search</p>
                          </div>
                        ) : selectedExperience ? (
                          <div className="space-y-6">
                            <ExperienceCard
                              key={`recently-added-focused-${selectedExperience.id}`}
                              experience={selectedExperience}
                              variant="recently-added"
                              editingExperience={editingExperience}
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
                              editIsRecording={editIsRecording}
                              editIsSubmitting={editIsSubmitting}
                              isVoiceSupported={isVoiceSupported}
                              editShowTitleError={editShowTitleError}
                              setEditShowTitleError={setEditShowTitleError}
                              editShowSuccessMessage={editShowSuccessMessage}
                              setEditShowSuccessMessage={setEditShowSuccessMessage}
                              handleEditExperience={handleEditExperience}
                              handleDeleteExperience={handleDeleteExperience}
                              handleSaveEdit={handleSaveEdit}
                              handleCancelEdit={handleCancelEdit}
                              handleGenerateSTAR={handleGenerateSTAR}
                              generateEditTitle={generateEditTitle}
                              startEditVoiceRecording={startEditVoiceRecording}
                              stopEditVoiceRecording={stopEditVoiceRecording}
                              generatingExperienceId={generatingExperienceId}
                              normalizeListFormatting={normalizeListFormatting}
                              handleCollapseInEditMode={handleCollapseInEditMode}
                              handleSaveInCollapsedMode={handleSaveInCollapsedMode}
                            />
                          </div>
                        ) : null}
                      </>
                    );
                  })()
                ) : (
                  // NO SEARCH: Show all experiences in grid/list view (with rotation applied)
                  (() => {
                    // Apply rotation to experiences array
                    const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                      if (arr.length === 0) return arr;
                      const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
                      return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
                    };
                    const rotatedExperiences = rotateArray(experiences, recentlyAddedRotationOffset);
                    
                    return (
                      <div className="grid gap-6">
                        {rotatedExperiences.map((experience) => (
                      <ExperienceCard
                        key={`recently-added-${experience.id}`}
                        experience={experience}
                        variant="recently-added"
                        editingExperience={editingExperience}
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
                        editIsRecording={editIsRecording}
                        editIsSubmitting={editIsSubmitting}
                        isVoiceSupported={isVoiceSupported}
                        editShowTitleError={editShowTitleError}
                        setEditShowTitleError={setEditShowTitleError}
                        editShowSuccessMessage={editShowSuccessMessage}
                        setEditShowSuccessMessage={setEditShowSuccessMessage}
                        handleEditExperience={handleEditExperience}
                        handleDeleteExperience={handleDeleteExperience}
                        handleSaveEdit={handleSaveEdit}
                        handleCancelEdit={handleCancelEdit}
                        handleGenerateSTAR={handleGenerateSTAR}
                        generateEditTitle={generateEditTitle}
                        startEditVoiceRecording={startEditVoiceRecording}
                        stopEditVoiceRecording={stopEditVoiceRecording}
                        generatingExperienceId={generatingExperienceId}
                        normalizeListFormatting={normalizeListFormatting}
                        handleCollapseInEditMode={handleCollapseInEditMode}
                        handleSaveInCollapsedMode={handleSaveInCollapsedMode}
                      />
                        ))}
                      </div>
                    );
                  })()
                )}
              </>
            )}
          </div>
        )}

        {/* In Progress Tab */}
        {activeTab === 'inprogress' && (
          <div className="max-w-4xl mx-auto">
            {/* Search Bar with Navigation - Only show when there are experiences */}
            {inProgressExperiences.length > 0 && (
              (() => {
                // Helper function to rotate array
                const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                  if (arr.length === 0) return arr;
                  const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
                  return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
                };

                // When no search: use rotated experiences, when searching: use filtered experiences
                const experiencesForDisplay = debouncedSearchQuery.trim() 
                  ? filteredExperiences 
                  : rotateArray(inProgressExperiences, inProgressRotationOffset);
                
                // Calculate current position for "x of y" display
                const currentPosition = debouncedSearchQuery.trim()
                  ? (selectedExperienceId 
                      ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId) + 1
                      : 1)
                  : ((inProgressRotationOffset % inProgressExperiences.length) + inProgressExperiences.length) % inProgressExperiences.length + 1;
                
                const totalCount = debouncedSearchQuery.trim() 
                  ? filteredExperiences.length 
                  : inProgressExperiences.length;

                return (
                  <ExperienceSearchBar
                    experiences={inProgressExperiences}
                    filteredExperiences={experiencesForDisplay}
                    selectedExperienceId={debouncedSearchQuery.trim() ? selectedExperienceId : (experiencesForDisplay[0]?.id || null)}
                    currentNumber={currentPosition}
                    totalNumber={totalCount}
                    isRotationMode={!debouncedSearchQuery.trim()}
                    onSearchChange={(query) => {
                      // Component already debounces, so use query directly for filtering
                      setDebouncedSearchQuery(query);
                    }}
                    onExperienceSelect={(id) => {
                      setSelectedExperienceId(id);
                    }}
                    onPrevious={() => {
                      handleNavigationWithConfirmation(() => {
                        if (debouncedSearchQuery.trim()) {
                          // WITH SEARCH: Navigate through filtered results with wrap-around
                          const currentIndex = selectedExperienceId 
                            ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                            : 0;
                          if (filteredExperiences.length > 1) {
                            // Wrap-around: if at first item, go to last item
                            const newIndex = currentIndex > 0 ? currentIndex - 1 : filteredExperiences.length - 1;
                            setSelectedExperienceId(filteredExperiences[newIndex].id);
                          } else if (currentIndex > 0) {
                            // No wrap-around if only one result
                            setSelectedExperienceId(filteredExperiences[currentIndex - 1].id);
                          }
                        } else {
                          // NO SEARCH: Rotate backward (left arrow)
                          setInProgressRotationOffset(prev => {
                            const newOffset = prev - 1;
                            const normalizedOffset = ((newOffset % inProgressExperiences.length) + inProgressExperiences.length) % inProgressExperiences.length;
                            // Update selectedExperienceId to match first item in rotated array
                            const rotated = [...inProgressExperiences.slice(normalizedOffset), ...inProgressExperiences.slice(0, normalizedOffset)];
                            if (rotated.length > 0) {
                              setSelectedExperienceId(rotated[0].id);
                            }
                            return normalizedOffset;
                          });
                        }
                      });
                    }}
                    onNext={() => {
                      handleNavigationWithConfirmation(() => {
                        if (debouncedSearchQuery.trim()) {
                          // WITH SEARCH: Navigate through filtered results with wrap-around
                          const currentIndex = selectedExperienceId 
                            ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                            : 0;
                          if (filteredExperiences.length > 1) {
                            // Wrap-around: if at last item, go to first item
                            const newIndex = currentIndex < filteredExperiences.length - 1 ? currentIndex + 1 : 0;
                            setSelectedExperienceId(filteredExperiences[newIndex].id);
                          } else if (currentIndex < filteredExperiences.length - 1) {
                            // No wrap-around if only one result
                            setSelectedExperienceId(filteredExperiences[currentIndex + 1].id);
                          }
                        } else {
                          // NO SEARCH: Rotate forward (right arrow)
                          setInProgressRotationOffset(prev => {
                            const newOffset = prev + 1;
                            const normalizedOffset = ((newOffset % inProgressExperiences.length) + inProgressExperiences.length) % inProgressExperiences.length;
                            // Update selectedExperienceId to match first item in rotated array
                            const rotated = [...inProgressExperiences.slice(normalizedOffset), ...inProgressExperiences.slice(0, normalizedOffset)];
                            if (rotated.length > 0) {
                              setSelectedExperienceId(rotated[0].id);
                            }
                            return normalizedOffset;
                          });
                        }
                      });
                    }}
                    onSearchInteraction={() => {
                      // Hide all tip boxes when user interacts with search (typing, deleting, arrows)
                      setShowInProgressTip(false);
                      setShowStarRegeneratedTip(false);
                      setShowStarBankSavedTip(false);
                    }}
                    placeholder="Search experiences..."
                  />
                );
              })()
            )}

            {/* Tip Boxes - Appear below search bar and above experience card */}
            {/* Tip Boxes - Most recent action on top (Priority: Regenerated > Edit Saved > Saved > Instructional) */}
            {/* STAR Regenerated Success Tip - Highest priority (most recent action) */}
            {showStarRegeneratedTip && (
              <div className="mb-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">🎉</span>
                      <div className="text-sm font-medium text-green-800">
                        STAR response re-generated! Add additional details and improve your response or save to STAR Bank.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (starRegeneratedTipTimeoutRef.current) {
                          clearTimeout(starRegeneratedTipTimeoutRef.current);
                        }
                        setShowStarRegeneratedTip(false);
                      }}
                      className="text-green-600 hover:text-green-800 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Edit Saved Success Tip - Second priority */}
            {editShowSuccessMessage && !showStarRegeneratedTip && (
              <div className="mb-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <span className="text-lg">🙌</span>
                      <div className="text-sm font-medium text-green-800">
                        Experience updated successfully!
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        setEditShowSuccessMessage(false);
                      }}
                      className="text-green-600 hover:text-green-800 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* STAR Bank Saved Success Tip - Third priority */}
            {showStarBankSavedTip && !showStarRegeneratedTip && !editShowSuccessMessage && (
              <div className="mb-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Star className="h-4 w-4 text-yellow-500 fill-yellow-500" fill="currentColor" />
                      <div className="text-sm font-medium text-green-800">
                        Great work! Experience saved to your Star Bank.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (starBankSavedTipTimeoutRef.current) {
                          clearTimeout(starBankSavedTipTimeoutRef.current);
                        }
                        setShowStarBankSavedTip(false);
                      }}
                      className="text-green-600 hover:text-green-800 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* In Progress Instructional Tip - Lowest priority (only if no action tips) */}
            {showInProgressTip && !showStarRegeneratedTip && !editShowSuccessMessage && !showStarBankSavedTip && (
              <div className="mb-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Edit className="h-4 w-4 text-green-600" />
                      <div className="text-sm font-medium text-green-800">
                        Add more details and re-generate STAR response.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (inProgressTipTimeoutRef.current) {
                          clearTimeout(inProgressTipTimeoutRef.current);
                        }
                        setShowInProgressTip(false);
                      }}
                      className="text-green-600 hover:text-green-800 transition-colors p-1 rounded hover:bg-green-100"
                      title="Close tip"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Get selected experience or first filtered/rotated experience */}
            {(() => {
              // Helper function to rotate array
              const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                if (arr.length === 0) return arr;
                const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
                return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
              };

              // When no search: use rotated experiences, when searching: use filtered experiences
              const experiencesForDisplay = debouncedSearchQuery.trim() 
                ? filteredExperiences 
                : rotateArray(inProgressExperiences, inProgressRotationOffset);
              
              // Get selected experience from filtered/rotated results
              const selectedExperience = experiencesForDisplay.find(
                exp => exp && exp.id === selectedExperienceId
              ) || experiencesForDisplay[0] || null;
              
              // Get current index for navigation
              const currentIndex = selectedExperience 
                ? experiencesForDisplay.findIndex(exp => exp.id === selectedExperience.id)
                : -1;
              
              return (
                <>
                  {inProgressExperiences.length === 0 ? (
                    <div className="text-center py-12">
                      <CheckCircle className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-600 mb-2">No experiences in progress</h3>
                      <p className="text-gray-500">Generate STAR responses to move experiences here for continued refinement</p>
                    </div>
                  ) : experiencesForDisplay.length === 0 && debouncedSearchQuery.trim() ? (
                    <div className="text-center py-12">
                      <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-600 mb-2">No experiences match your search</h3>
                      <p className="text-gray-500">Try a different search term or clear your search</p>
                    </div>
                  ) : selectedExperience ? (
                    <div className="space-y-6">
                      {/* Selected Experience Card - Only one shown */}
                      <ExperienceCard
                        key={`inprogress-${selectedExperience.id}`}
                        experience={selectedExperience}
                        variant="in-progress"
                        editingExperience={editingExperience}
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
                        editIsRecording={editIsRecording}
                        editIsSubmitting={editIsSubmitting}
                        isVoiceSupported={isVoiceSupported}
                        editShowTitleError={editShowTitleError}
                        setEditShowTitleError={setEditShowTitleError}
                        editShowSuccessMessage={editShowSuccessMessage}
                        setEditShowSuccessMessage={setEditShowSuccessMessage}
                        handleEditExperience={handleEditExperience}
                        handleDeleteExperience={handleDeleteExperience}
                        handleSaveEdit={handleSaveEdit}
                        handleCancelEdit={handleCancelEdit}
                        handleGenerateSTAR={handleGenerateSTARWithConfirmation}
                        handleSaveToStarBank={handleSaveToStarBankWithConfirmation}
                        generateEditTitle={generateEditTitle}
                        startEditVoiceRecording={startEditVoiceRecording}
                        stopEditVoiceRecording={stopEditVoiceRecording}
                        getGradeVisibility={getGradeVisibility}
                        toggleGradeVisibility={toggleGradeVisibility}
                        getFeedbackVisibility={getFeedbackVisibility}
                        toggleFeedbackVisibility={toggleFeedbackVisibility}
                        generatingExperienceId={generatingExperienceId}
                        normalizeListFormatting={normalizeListFormatting}
                        handleCollapseInEditMode={handleCollapseInEditMode}
                        handleSaveInCollapsedMode={handleSaveInCollapsedMode}
                      />
                      {/* FeedbackCard - Show below STAR response if available and feedback visibility is enabled */}
                      {selectedExperience.responses && selectedExperience.responses.length > 0 && selectedExperience.responses[0] && getFeedbackVisibility(selectedExperience.id) && (
                        <div ref={feedbackCardRef}>
                        <FeedbackCard
                          experience={selectedExperience}
                          response={selectedExperience.responses[0]}
                          onUnsavedChangesChange={(hasUnsaved, count) => {
                            setHasUnsavedFeedback(hasUnsaved);
                            setUnsavedFeedbackCount(count);
                          }}
                          saveAllRef={feedbackSaveAllRef}
                          saveEditFormAndGetContent={
                            // If edit form is open for this experience, provide callback to save it first
                            // This ensures edits are saved before feedback is appended (same as "Save All" behavior)
                            (editingExperience === selectedExperience.id || editingExperienceId === selectedExperience.id) && hasUnsavedChanges
                              ? async () => {
                                  // Save edit form and return updated content
                                  if (editingExperienceId) {
                                    const updatedExperience = await handleSaveEdit(editingExperienceId);
                                    if (updatedExperience) {
                                      // handleSaveEdit already sets editShowSuccessMessage, but ensure it's set
                                      // (in case handleSaveEdit was called but didn't set it for some reason)
                                      setEditShowSuccessMessage(true);
                                      setTimeout(() => {
                                        setEditShowSuccessMessage(false);
                                      }, 10000); // Auto-hide after 10 seconds
                                      return updatedExperience.content;
                                    }
                                  }
                                  return null;
                                }
                              : undefined
                          }
                          onContentAppended={async (content, updatedExperience) => {
                            // Refresh the experience to show updated content immediately
                            // After save, the experience moves to position 1 (most recent) and user is navigated to it
                            if (updatedExperience) {
                              // Use the updated experience from API response (more efficient)
                              // The API returns the experience with updatedAt from the database
                              const experienceWithUpdatedAt = {
                                ...updatedExperience,
                                updatedAt: updatedExperience.updatedAt || new Date().toISOString(),
                                createdAt: updatedExperience.createdAt || new Date().toISOString(),
                                responses: updatedExperience.responses ? updatedExperience.responses.map(resp => ({
                                  ...resp,
                                  createdAt: resp.createdAt || new Date().toISOString(),
                                  updatedAt: resp.updatedAt || resp.createdAt || new Date().toISOString()
                                })) : []
                              };
                              
                              // CRITICAL: If edit form is open for this experience, update editExperienceText
                              // This prevents data loss when user saves edit form after saving feedback
                              // The edit form's content must reflect the updated experience content (with appended feedback)
                              if (editingExperience === experienceWithUpdatedAt.id || editingExperienceId === experienceWithUpdatedAt.id) {
                                // Set flag to prevent useEffect from clearing success message
                                isUpdatingEditTextProgrammaticallyRef.current = true;
                                setEditExperienceText(experienceWithUpdatedAt.content || '');
                              }
                              
                              // Update experience in all arrays to reflect new content
                              setExperiences(prev => 
                                prev.map(exp => exp.id === selectedExperience.id ? experienceWithUpdatedAt : exp)
                              );
                              
                              // Update and sort In Progress experiences
                              // After sorting by updatedAt (descending), the updated experience will be at position 1 (most recent)
                              setInProgressExperiences(prev => {
                                const updated = prev.map(exp => exp.id === selectedExperience.id ? experienceWithUpdatedAt : exp);
                                const sorted = sortExperiencesByRecent(updated);
                                
                                // Navigate user to the updated experience (now at position 1)
                                // This ensures user sees "1 of y" and their updated content immediately
                                // The updated experience should be first after sorting by updatedAt
                                if (sorted.length > 0) {
                                  // Check if updated experience is at position 1 (most recent)
                                  if (sorted[0].id === experienceWithUpdatedAt.id) {
                                    // Reset rotation offset to 0 so position 1 is visible
                                    setInProgressRotationOffset(0);
                                    // Navigate to the updated experience
                                    setSelectedExperienceId(experienceWithUpdatedAt.id);
                                  } else {
                                    // If for some reason it's not first, still navigate to it
                                    // Find its position and adjust rotation offset accordingly
                                    const newIndex = sorted.findIndex(exp => exp.id === experienceWithUpdatedAt.id);
                                    if (newIndex >= 0) {
                                      setInProgressRotationOffset(newIndex);
                                      setSelectedExperienceId(experienceWithUpdatedAt.id);
                                    } else {
                                      setSelectedExperienceId(experienceWithUpdatedAt.id);
                                    }
                                  }
                                }
                                
                                return sorted;
                              });
                              
                              setStarBankExperiences(prev => 
                                prev.map(exp => exp.id === selectedExperience.id ? experienceWithUpdatedAt : exp)
                              );
                              
                              // Experience updated from API response
                            } else {
                              // Fallback: reload all experiences if no updated experience provided
                              try {
                                await loadExperiences();
                                // After reload, experiences are sorted by updatedAt
                                // The updated experience should be at position 1, navigate to it
                                // Reset rotation offset to ensure position 1 is visible
                                setInProgressRotationOffset(0);
                                // The loadExperiences function will handle sorting, but we need to ensure
                                // the selected experience is still selected after reload
                                // The useEffect that handles selectedExperienceId should handle this,
                                // but we explicitly set it here to ensure navigation happens
                                if (selectedExperience && selectedExperience.id) {
                                  setSelectedExperienceId(selectedExperience.id);
                                }
                              } catch (error) {
                                console.error('Error reloading experiences after save:', error);
                                // Still show success - content was saved to backend
                              }
                            }
                          }}
                          isVoiceSupported={isVoiceSupported}
                          isRecording={false} // Will be managed per-section in Phase 3
                          onStartRecording={() => {}} // Placeholder
                          onStopRecording={() => {}} // Placeholder
                        />
                        </div>
                      )}
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        )}

        {/* STAR Bank Tab */}
        {activeTab === 'starbank' && (
          <div className="max-w-4xl mx-auto">
            {/* Search Bar with Navigation - Only show when there are experiences */}
            {starBankExperiences.length > 0 && (
              (() => {
                // Helper function to rotate array
                const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                  if (arr.length === 0) return arr;
                  const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
                  return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
                };

                // When no search: use rotated experiences, when searching: use filtered experiences
                const experiencesForDisplay = debouncedSearchQuery.trim() 
                  ? filteredExperiences 
                  : rotateArray(starBankExperiences, starBankRotationOffset);
                
                // Calculate current position for "x of y" display
                const currentPosition = debouncedSearchQuery.trim()
                  ? (selectedExperienceId 
                      ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId) + 1
                      : 1)
                  : ((starBankRotationOffset % starBankExperiences.length) + starBankExperiences.length) % starBankExperiences.length + 1;
                
                const totalCount = debouncedSearchQuery.trim() 
                  ? filteredExperiences.length 
                  : starBankExperiences.length;

                return (
                  <ExperienceSearchBar
                    experiences={starBankExperiences}
                    filteredExperiences={experiencesForDisplay}
                    selectedExperienceId={debouncedSearchQuery.trim() ? selectedExperienceId : (experiencesForDisplay[0]?.id || null)}
                    currentNumber={currentPosition}
                    totalNumber={totalCount}
                    isRotationMode={!debouncedSearchQuery.trim()}
                    onSearchChange={(query) => {
                      // Component already debounces, so use query directly for filtering
                      setDebouncedSearchQuery(query);
                    }}
                    onExperienceSelect={(id) => {
                      setSelectedExperienceId(id);
                    }}
                    onPrevious={() => {
                      handleNavigationWithConfirmation(() => {
                        if (debouncedSearchQuery.trim()) {
                          // WITH SEARCH: Navigate through filtered results with wrap-around
                          const currentIndex = selectedExperienceId 
                            ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                            : 0;
                          if (filteredExperiences.length > 1) {
                            // Wrap-around: if at first item, go to last item
                            const newIndex = currentIndex > 0 ? currentIndex - 1 : filteredExperiences.length - 1;
                            setSelectedExperienceId(filteredExperiences[newIndex].id);
                          } else if (currentIndex > 0) {
                            // No wrap-around if only one result
                            setSelectedExperienceId(filteredExperiences[currentIndex - 1].id);
                          }
                        } else {
                          // NO SEARCH: Rotate backward (left arrow)
                          setStarBankRotationOffset(prev => {
                            const newOffset = prev - 1;
                            const normalizedOffset = ((newOffset % starBankExperiences.length) + starBankExperiences.length) % starBankExperiences.length;
                            // Update selectedExperienceId to match first item in rotated array
                            const rotated = [...starBankExperiences.slice(normalizedOffset), ...starBankExperiences.slice(0, normalizedOffset)];
                            if (rotated.length > 0) {
                              setSelectedExperienceId(rotated[0].id);
                            }
                            return normalizedOffset;
                          });
                        }
                      });
                    }}
                    onNext={() => {
                      handleNavigationWithConfirmation(() => {
                        if (debouncedSearchQuery.trim()) {
                          // WITH SEARCH: Navigate through filtered results with wrap-around
                          const currentIndex = selectedExperienceId 
                            ? filteredExperiences.findIndex(exp => exp.id === selectedExperienceId)
                            : 0;
                          if (filteredExperiences.length > 1) {
                            // Wrap-around: if at last item, go to first item
                            const newIndex = currentIndex < filteredExperiences.length - 1 ? currentIndex + 1 : 0;
                            setSelectedExperienceId(filteredExperiences[newIndex].id);
                          } else if (currentIndex < filteredExperiences.length - 1) {
                            // No wrap-around if only one result
                            setSelectedExperienceId(filteredExperiences[currentIndex + 1].id);
                          }
                        } else {
                          // NO SEARCH: Rotate forward (right arrow)
                          setStarBankRotationOffset(prev => {
                            const newOffset = prev + 1;
                            const normalizedOffset = ((newOffset % starBankExperiences.length) + starBankExperiences.length) % starBankExperiences.length;
                            // Update selectedExperienceId to match first item in rotated array
                            const rotated = [...starBankExperiences.slice(normalizedOffset), ...starBankExperiences.slice(0, normalizedOffset)];
                            if (rotated.length > 0) {
                              setSelectedExperienceId(rotated[0].id);
                            }
                            return normalizedOffset;
                          });
                        }
                      });
                    }}
                    onSearchInteraction={() => {
                      // Hide tip box when user interacts with search (typing, deleting, arrows)
                      setShowStarUnsaveTip(false);
                    }}
                    placeholder="Search experiences..."
                  />
                );
              })()
            )}

            {/* Tip Boxes - Appear below search bar and above experience card */}
            {/* STAR Unsave Tip */}
            {showStarUnsaveTip && (
              <div className="mb-6">
                <div className="p-4 bg-green-50 border border-green-200 rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center space-x-2">
                      <Edit className="h-4 w-4 text-green-600" />
                      <div className="text-sm font-medium text-green-800">
                        Star response moved to "In Progress" tab for continued refinement.
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        if (starUnsaveTipTimeoutRef.current) {
                          clearTimeout(starUnsaveTipTimeoutRef.current);
                        }
                        setShowStarUnsaveTip(false);
                      }}
                      className="text-green-600 hover:text-green-800 transition-colors"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              </div>
            )}

            {/* Get selected experience or first filtered/rotated experience */}
            {(() => {
              // Helper function to rotate array
              const rotateArray = <T,>(arr: T[], offset: number): T[] => {
                if (arr.length === 0) return arr;
                const normalizedOffset = ((offset % arr.length) + arr.length) % arr.length;
                return [...arr.slice(normalizedOffset), ...arr.slice(0, normalizedOffset)];
              };

              // When no search: use rotated experiences, when searching: use filtered experiences
              const experiencesForDisplay = debouncedSearchQuery.trim() 
                ? filteredExperiences 
                : rotateArray(starBankExperiences, starBankRotationOffset);
              
              // Get selected experience from filtered/rotated results
              const selectedExperience = experiencesForDisplay.find(
                exp => exp && exp.id === selectedExperienceId
              ) || experiencesForDisplay[0] || null;
              
              // Get current index for navigation
              const currentIndex = selectedExperience 
                ? experiencesForDisplay.findIndex(exp => exp.id === selectedExperience.id)
                : -1;
              
              return (
                <>
                  {starBankExperiences.length === 0 ? (
                    <div className="text-center py-12">
                      <Star className="h-16 w-16 text-gray-400 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-900 mb-2">No experiences saved to STAR Bank yet</h3>
                      <p className="text-gray-600">Save completed STAR responses from the 'In Progress' tab to build your STAR Bank</p>
                    </div>
                  ) : experiencesForDisplay.length === 0 && debouncedSearchQuery.trim() ? (
                    <div className="text-center py-12">
                      <Search className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                      <h3 className="text-xl font-semibold text-gray-600 mb-2">No experiences match your search</h3>
                      <p className="text-gray-500">Try a different search term or clear your search</p>
                    </div>
                  ) : selectedExperience ? (
                    <div className="space-y-6">
                      {/* Selected Experience Card - Only one shown */}
                      <ExperienceCard
                        key={`starbank-${selectedExperience.id}`}
                        experience={selectedExperience}
                        variant="star-bank"
                        editingExperience={editingExperience}
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
                        editIsRecording={editIsRecording}
                        editIsSubmitting={editIsSubmitting}
                        isVoiceSupported={isVoiceSupported}
                        editShowTitleError={editShowTitleError}
                        setEditShowTitleError={setEditShowTitleError}
                        editShowSuccessMessage={editShowSuccessMessage}
                        setEditShowSuccessMessage={setEditShowSuccessMessage}
                        handleEditExperience={handleEditExperience}
                        handleDeleteExperience={handleDeleteExperience}
                        handleSaveEdit={handleSaveEdit}
                        handleCancelEdit={handleCancelEdit}
                        handleGenerateSTAR={handleGenerateSTAR}
                        handleUnsaveFromStarBank={handleUnsaveFromStarBank}
                        generateEditTitle={generateEditTitle}
                        startEditVoiceRecording={startEditVoiceRecording}
                        stopEditVoiceRecording={stopEditVoiceRecording}
                        getGradeVisibility={getGradeVisibility}
                        toggleGradeVisibility={toggleGradeVisibility}
                        getFeedbackVisibility={getFeedbackVisibility}
                        toggleFeedbackVisibility={toggleFeedbackVisibility}
                        generatingExperienceId={generatingExperienceId}
                        normalizeListFormatting={normalizeListFormatting}
                        handleCollapseInEditMode={handleCollapseInEditMode}
                        handleSaveInCollapsedMode={handleSaveInCollapsedMode}
                      />
                    </div>
                  ) : null}
                </>
              );
            })()}
          </div>
        )}
      </div>
    </div>
  );
}

export default function Dashboard() {
  return <DashboardContent />;
}
