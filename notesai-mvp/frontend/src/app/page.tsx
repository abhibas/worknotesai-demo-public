'use client';

import { useUser, useAuth } from '@clerk/nextjs';
import { SignInButton, SignUpButton, UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ArrowRight, Star, Users, Zap, MessageCircle, Heart, Shield, Brain, Zap as Lightning, Coffee, Dog, User, PenTool, FileText, Lightbulb, Target, Zap as ZapIcon, Flame, Send, Mic, MicOff } from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import { API_URL } from '@/lib/api';
import { devLog } from '@/utils/devLogger';

export default function Home() {
  const demoMode = (process.env.NEXT_PUBLIC_DEMO_MODE || 'true').toLowerCase() === 'true';
  const clerkUser = demoMode ? null : useUser();
  const clerkAuth = demoMode ? null : useAuth();
  const isSignedIn = demoMode ? true : !!clerkUser?.isSignedIn;
  const user = demoMode ? ({ id: 'demo-user', firstName: 'Demo' } as any) : clerkUser?.user;
  const getToken = demoMode
    ? async () => null
    : (clerkAuth?.getToken || (async () => null));
  const [experienceText, setExperienceText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submittedExperience, setSubmittedExperience] = useState('');
  const [isListening, setIsListening] = useState(false);
  const [isVoiceSupported, setIsVoiceSupported] = useState(false);
  const [hasPendingExperience, setHasPendingExperience] = useState(false);

  // Determine environment label
  const getEnvLabel = () => {
    if (API_URL.includes('localhost')) return 'local';
    if (API_URL.includes('staging') || typeof window !== 'undefined' && window.location.hostname.includes('staging')) return 'stage';
    return 'beta'; // production - show beta
  };
  const envLabel = getEnvLabel();

  // Load experience text from localStorage on component mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedText = localStorage.getItem('pendingExperience');
      if (savedText && !submittedExperience) {
        // Only restore if we haven't successfully submitted
        setExperienceText(savedText);
        setHasPendingExperience(true);
      }
    }
  }, []);

  // Check for voice support and pending experience when user signs in
  useEffect(() => {
    console.log('useEffect triggered - isSignedIn:', isSignedIn);
    
    // Check if browser supports speech recognition
    if (typeof window !== 'undefined' && ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window)) {
      setIsVoiceSupported(true);
    }

    if (isSignedIn) {
      console.log('User is signed in, checking for pending experience...');
      const pendingExperience = localStorage.getItem('pendingExperience');
      console.log('Pending experience from localStorage:', pendingExperience);
      
      if (pendingExperience) {
        console.log('Found pending experience, restoring draft text...');
        setExperienceText(pendingExperience);
        setHasPendingExperience(true);
        // Do NOT auto-submit - wait for user to click "Save Experience" button
      } else {
        console.log('No pending experience found');
      }
    }
  }, [isSignedIn]);

  // Auto-save experience text to localStorage as user types (debounced)
  useEffect(() => {
    if (typeof window !== 'undefined' && experienceText.trim() && !submittedExperience) {
      // Save to localStorage immediately when text changes
      localStorage.setItem('pendingExperience', experienceText);
      console.log('Auto-saved experience text to localStorage');
    }
  }, [experienceText, submittedExperience]);

  // Removed: Periodic auto-submit interval
  // Experiences should only be saved when user clicks "Save Experience" button

  const startVoiceRecording = () => {
    if (!isVoiceSupported) {
      console.log('Voice recording is not supported in your browser. Please use Chrome or Edge.');
      return;
    }

    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognition();
    
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = 'en-US';

    recognition.onstart = () => {
      setIsListening(true);
    };

    recognition.onresult = (event) => {
      let finalTranscript = '';
      let interimTranscript = '';

      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          finalTranscript += transcript;
        } else {
          interimTranscript += transcript;
        }
      }

      // Update the textarea with the current transcript
      setExperienceText(prev => prev + finalTranscript);
    };

    recognition.onerror = (event) => {
      console.error('Speech recognition error:', event.error);
      setIsListening(false);
      if (event.error === 'not-allowed') {
        console.log('Microphone access denied. Please allow microphone access and try again.');
      }
    };

    recognition.onend = () => {
      setIsListening(false);
    };

    recognition.start();
  };

  const stopVoiceRecording = () => {
    setIsListening(false);
    // The recognition will stop automatically when onend is called
  };

  const submitPendingExperience = async (experienceContent: string) => {
    if (!experienceContent.trim()) return;
    
    console.log('Starting to submit pending experience:', experienceContent);
    setIsSubmitting(true);
    
    try {
      const token = await getToken();
      console.log('Token for pending experience:', token ? 'Present' : 'Missing');
      
      if (!token && !demoMode) {
        console.error('No token available for pending experience submission');
        return;
      }
      
      const requestBody = {
        content: experienceContent,
        title: experienceContent.substring(0, 50) + (experienceContent.length > 50 ? '...' : ''),
        userId: user?.id,
      };
      console.log('Pending experience request body:', requestBody);

      const response = await fetch(`${API_URL}/api/experiences`, {
        method: 'POST',
        headers: {
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      const data = await response.json();
      console.log('Pending experience response:', data);

      if (data.success) {
        setSubmittedExperience(experienceContent);
        setExperienceText('');
        setHasPendingExperience(false);
        // Only remove from localStorage after successful submission
        localStorage.removeItem('pendingExperience');
        // Set flag to redirect to Recently Added tab when user goes to dashboard
        localStorage.setItem('redirectToRecentlyAdded', 'true');
        console.log('Pending experience submitted successfully!');
        // Show success message (removed alert for cleaner UX)
      } else {
        console.error('Failed to submit pending experience:', data.error);
      }
    } catch (error) {
      console.error('Error submitting pending experience:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleShareExperience = async () => {
    if (!experienceText.trim()) return;
    
    // ALWAYS save to localStorage first (for both signed in and anonymous users)
    localStorage.setItem('pendingExperience', experienceText);
    devLog('Experience saved to localStorage:', experienceText);
    
    if (!isSignedIn) {
      // For anonymous users, show signup prompt (removed alert for cleaner UX)
      return;
    }

    setIsSubmitting(true);
    try {
      const token = await getToken();
      devLog('Token:', token ? 'Present' : 'Missing');
      
      const requestBody = {
        content: experienceText,
        title: experienceText.substring(0, 50) + (experienceText.length > 50 ? '...' : ''),
        userId: user?.id, // Add userId to the request
      };
      devLog('Request body:', requestBody);

      const response = await fetch(`${API_URL}/api/experiences`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
        },
        body: JSON.stringify(requestBody),
      });

      devLog('Response status:', response.status);
      devLog('Response ok:', response.ok);

      if (response.ok) {
        const result = await response.json();
        devLog('Success response:', result);
        setSubmittedExperience(experienceText);
        setExperienceText('');
        // Remove from localStorage after successful submission
        localStorage.removeItem('pendingExperience');
        // Set flag to redirect to Recently Added tab when user goes to dashboard
        localStorage.setItem('redirectToRecentlyAdded', 'true');
        devLog('Experience submitted successfully and removed from localStorage');
      } else {
        const errorText = await response.text();
        console.error('Error response:', errorText);
      }
    } catch (error) {
      console.error('Error saving experience:', error);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      {/* Header */}
      <header className="border-b bg-white/80 backdrop-blur-sm">
        <div className="container mx-auto px-4 py-4 flex justify-between items-center">
          <div className="flex items-center space-x-2">
            <Star className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">
              worknotesAI<sup className="text-xs text-gray-500">{envLabel}</sup>
            </h1>
            <span className="text-sm text-gray-600 flex items-center mt-1">
              Build your professional story bank, one conversation at a time
            </span>
          </div>
          
          <div className="flex items-center space-x-4">
            {isSignedIn ? (
              <div className="flex items-center space-x-4">
                <span className="text-sm text-gray-600">
                  {demoMode ? 'Demo mode' : `Welcome, ${user?.firstName}!`}
                </span>
                {!demoMode && <UserButton />}
                <Link href="/dashboard">
                  <Button>Go to Dashboard</Button>
                </Link>
              </div>
            ) : (
              <div className="flex items-center space-x-2">
                <SignInButton mode="modal">
                  <Button variant="ghost">Sign In</Button>
                </SignInButton>
                <SignUpButton mode="modal">
                  <Button>Get Started</Button>
                </SignUpButton>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <main className="container mx-auto px-4 py-16">
        <div className="text-center max-w-4xl mx-auto">
          
          <h1 className="text-4xl font-bold text-gray-900 mb-6">
            How was work? Tell me what&apos;s on your mind
          </h1>
          
          <p className="text-xl text-gray-600 mb-8 max-w-3xl mx-auto">
            Turn your professional experiences into powerful stories, one conversation at a time
          </p>
          

          {!isSignedIn && (
            <div className="flex justify-center space-x-4 mb-12">
              <Button 
                size="lg" 
                className="px-8 bg-indigo-600 text-white hover:bg-indigo-700"
                onClick={() => {
                  document.getElementById('sharing-box')?.scrollIntoView({ behavior: 'smooth' });
                }}
              >
                Start Sharing
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            </div>
          )}

          {/* Features Grid */}
          <div className="grid md:grid-cols-3 gap-8 mt-16">
            <Card className="text-center">
              <CardHeader className="pb-4">
                <div className="mx-auto w-12 h-12 bg-indigo-100 rounded-lg flex items-center justify-center mb-4">
                  <Coffee className="h-6 w-6 text-indigo-600" />
                </div>
                <CardTitle className="min-h-[3rem] flex items-center justify-center">Trusted Confidant</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Like talking to a supportive friend: a comfortable, judgment-free conversation experience
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-4">
                <div className="mx-auto w-12 h-12 bg-green-100 rounded-lg flex items-center justify-center mb-4">
                  <Brain className="h-6 w-6 text-green-600" />
                </div>
                <CardTitle className="min-h-[3rem] flex items-center justify-center">Easy Capture</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  No pressure to be perfect, just start sharing your professional experiences
                </CardDescription>
              </CardContent>
            </Card>

            <Card className="text-center">
              <CardHeader className="pb-4">
                <div className="mx-auto w-12 h-12 bg-purple-100 rounded-lg flex items-center justify-center mb-4">
                  <Star className="h-6 w-6 text-purple-600" />
                </div>
                <CardTitle className="min-h-[3rem] flex items-center justify-center">Powerful Stories</CardTitle>
              </CardHeader>
              <CardContent>
                <CardDescription>
                  Transform experiences into compelling stories that build your professional narrative
                </CardDescription>
              </CardContent>
            </Card>
          </div>
        </div>
      </main>

      {/* CTA Section */}
      <section className="bg-indigo-600 text-white py-16">
        <div className="container mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold mb-4">
            Ready to Share Your Story?
          </h2>
          <p className="text-xl mb-8 opacity-90">
            Join thousands of professionals who&apos;ve built a stronger professional narrative
          </p>
          
          {/* Sharing Box in CTA Section */}
          <div id="sharing-box" className="max-w-2xl mx-auto mb-8">
            <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
              <div className="space-y-4">
                <div className="relative">
                  <textarea
                    value={experienceText}
                    onChange={(e) => {
                      const newText = e.target.value;
                      setExperienceText(newText);
                      // Auto-save to localStorage immediately as user types
                      if (typeof window !== 'undefined' && newText.trim() && !submittedExperience) {
                        localStorage.setItem('pendingExperience', newText);
                      }
                    }}
                    placeholder="How was your day? I'm here to listen"
                    className="w-full p-4 pr-12 border border-gray-300 rounded-lg resize-y min-h-[120px] max-h-[400px] overflow-y-auto focus:ring-2 focus:ring-indigo-500 focus:border-transparent bg-white text-gray-900 placeholder-gray-500"
                    rows={4}
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
                
                <div className="flex flex-col space-y-3">
                  <div className="flex items-center space-x-2">
                    {isSignedIn ? (
                      <>
                        <Button
                          onClick={handleShareExperience}
                          disabled={!experienceText.trim() || isSubmitting}
                          className={`flex items-center space-x-2 ${
                            experienceText.trim() && !isSubmitting
                              ? 'bg-indigo-600 text-white hover:bg-indigo-700' // Active when text is present
                              : submittedExperience
                              ? 'bg-indigo-200 text-indigo-700' // Light blue after submission
                              : 'bg-indigo-200 text-indigo-600' // Light blue when no text
                          }`}
                        >
                          {isSubmitting ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                              <span>Saving...</span>
                            </>
                          ) : (
                            <>
                              <Send className="h-4 w-4" />
                              <span>Save Experience</span>
                            </>
                          )}
                        </Button>
                        <Link href="/dashboard?tab=experiences">
                          <Button 
                            size="sm" 
                            className={`${
                              experienceText.trim() && !submittedExperience
                                ? 'bg-gray-400 text-gray-600 hover:bg-gray-500' // Muted when text is present but not saved
                                : 'bg-gray-900 text-white hover:bg-gray-800' // Active when no text or after saving
                            }`}
                          >
                            Go To Dashboard
                          </Button>
                        </Link>
                        <span className="text-sm text-gray-600 ml-2">Transform experiences to STAR responses</span>
                      </>
                    ) : (
                      <div className="flex items-center space-x-2">
                        <SignUpButton mode="modal">
                          <Button size="sm" className="bg-indigo-600 text-white hover:bg-indigo-700">
                            Save Experience
                          </Button>
                        </SignUpButton>
                        <span className="text-sm text-gray-500">sign up and build your STAR Bank</span>
                      </div>
                    )}
                  </div>
                  
                  {/* Clean experience submission - no debug elements */}
                </div>
                
                {submittedExperience && (
                  <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
                    <div className="text-sm font-medium text-green-800">
                      <div className="flex items-start space-x-2">
                        <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div>Experience saved! 🙌 Great work getting started!</div>
                      </div>
                      <div className="flex items-start space-x-2 mt-1">
                        <div className="h-2 w-2 bg-green-500 rounded-full mt-2 flex-shrink-0"></div>
                        <div>Check your dashboard to generate STAR responses and add more details</div>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

        </div>
      </section>

      {/* Invite Friends Section */}
      <section className="bg-gray-50 py-16">
        <div className="container mx-auto px-4 text-center">
          <div className="max-w-2xl mx-auto">
        <h3 className="text-2xl font-bold text-gray-900 mb-6">
          Help a friend capture their professional experiences<br />
            and be ready for their next career adventure
        </h3>
            
            <div className="bg-white rounded-lg p-6 shadow-lg border border-gray-200">
              <div className="flex space-x-2">
                <input
                  type="email"
                  placeholder="Enter friend's email address"
                  className="flex-1 px-4 py-3 rounded-md border border-gray-300 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
                />
                <Button 
                  className="bg-indigo-600 text-white hover:bg-indigo-700 px-8"
                  onClick={() => {
                    // TODO: Implement invite functionality
                    console.log('Invite functionality coming soon!');
                  }}
                >
                  Send Invite
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>
  );
}