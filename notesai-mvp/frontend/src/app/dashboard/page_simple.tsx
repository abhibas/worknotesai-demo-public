'use client';

import { useUser, useAuth } from '@clerk/nextjs';
import { UserButton } from '@clerk/nextjs';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { 
  Plus,
  Star,
  Trash2,
  Sparkles,
  Clock,
  CheckCircle
} from 'lucide-react';
import Link from 'next/link';
import { useState, useEffect } from 'react';

interface Experience {
  id: string;
  content: string;
  title: string;
  createdAt: string;
  responses?: Response[];
}

interface Response {
  id: string;
  starResponse: string;
  createdAt: string;
}

export default function Dashboard() {
  const { isSignedIn, user } = useUser();
  const { getToken } = useAuth();
  
  // Simple state management
  const [experiences, setExperiences] = useState<Experience[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'add' | 'list'>('add');
  
  // Form state
  const [experienceText, setExperienceText] = useState('');
  const [title, setTitle] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);

  // Load experiences on mount
  useEffect(() => {
    if (isSignedIn) {
      loadExperiences();
    }
  }, [isSignedIn]);

  const loadExperiences = async () => {
    try {
      const token = await getToken();
      const response = await fetch('http://localhost:3000/api/experiences', {
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });
      
      if (response.ok) {
        const data = await response.json();
        setExperiences(data.experiences || []);
      }
    } catch (error) {
      console.error('Error loading experiences:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveExperience = async () => {
    if (!experienceText.trim()) return;
    
    setIsSubmitting(true);
    try {
      const token = await getToken();
      const requestBody = {
        content: experienceText,
        title: title || experienceText.substring(0, 50) + (experienceText.length > 50 ? '...' : ''),
      };

      const response = await fetch('http://localhost:3000/api/experiences', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (response.ok) {
        const result = await response.json();
        setExperiences(prev => [result.experience, ...prev]);
        
        // Reset form
        setExperienceText('');
        setTitle('');
        
        // Switch to list tab
        setActiveTab('list');
      } else {
        alert('Error saving experience');
      }
    } catch (error) {
      console.error('Error saving experience:', error);
      alert('Network error');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleGenerateSTAR = async (experience: Experience) => {
    setIsGenerating(true);
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:3000/api/experiences/${experience.id}/generate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        const result = await response.json();
        setExperiences(prev => prev.map(exp => 
          exp.id === experience.id 
            ? { ...exp, responses: [result.response] }
            : exp
        ));
      } else {
        alert('Error generating STAR response');
      }
    } catch (error) {
      console.error('Error generating STAR response:', error);
      alert('Network error');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDeleteExperience = async (experienceId: string) => {
    if (!confirm('Are you sure you want to delete this experience?')) return;
    
    try {
      const token = await getToken();
      const response = await fetch(`http://localhost:3000/api/experiences/${experienceId}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`,
        },
      });

      if (response.ok) {
        setExperiences(prev => prev.filter(exp => exp.id !== experienceId));
      } else {
        alert('Error deleting experience');
      }
    } catch (error) {
      console.error('Error deleting experience:', error);
      alert('Network error');
    }
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
            <Star className="h-6 w-6 text-indigo-600" />
            <h1 className="text-2xl font-bold text-gray-900">worknotesAI Dashboard</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <span className="text-sm text-gray-600">Welcome, {user?.firstName}!</span>
            <UserButton />
            <Link href="/">
              <Button variant="ghost">Back to Home</Button>
            </Link>
          </div>
        </div>
      </header>

      <div className="container mx-auto px-4 py-8">
        {/* Simple Tab Navigation */}
        <div className="mb-8">
          <div className="flex space-x-1 bg-gray-100 p-1 rounded-lg w-fit">
            <button
              onClick={() => setActiveTab('add')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'add'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Plus className="h-4 w-4" />
              <span>Add Experience</span>
            </button>
            <button
              onClick={() => setActiveTab('list')}
              className={`flex items-center space-x-2 px-4 py-2 rounded-md transition-colors ${
                activeTab === 'list'
                  ? 'bg-white text-indigo-600 shadow-sm'
                  : 'text-gray-600 hover:text-gray-900'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>My Experiences</span>
            </button>
          </div>
        </div>

        {/* Add Experience Tab */}
        {activeTab === 'add' && (
          <div className="max-w-2xl mx-auto">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center space-x-2">
                  <Plus className="h-5 w-5" />
                  <span>Share Your Experience</span>
                </CardTitle>
                <CardDescription>
                  Tell me about your professional experience. I&apos;ll help you turn it into a compelling STAR response.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Title (optional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Auto-generated from content"
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Your Experience
                  </label>
                  <Textarea
                    value={experienceText}
                    onChange={(e) => setExperienceText(e.target.value)}
                    placeholder="Describe what happened at work today, a project you worked on, or any professional experience..."
                    className="min-h-[200px] resize-none"
                  />
                </div>

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
                      <Plus className="h-4 w-4 mr-2" />
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
            <div className="mb-6">
              <h2 className="text-2xl font-bold text-gray-900 mb-2">Your Experiences</h2>
              <p className="text-gray-600">Manage and develop your professional stories</p>
            </div>

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
              <div className="grid gap-6">
                {experiences.map((experience) => (
                  <Card key={experience.id} className="hover:shadow-lg transition-shadow">
                    <CardHeader>
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <CardTitle className="text-lg">{experience.title}</CardTitle>
                          <div className="flex items-center space-x-2 mt-2">
                            {experience.responses && experience.responses.length > 0 ? (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                STAR Generated
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                                <Clock className="h-3 w-3 mr-1" />
                                Draft
                              </span>
                            )}
                          </div>
                        </div>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleDeleteExperience(experience.id)}
                          className="text-red-600 hover:text-red-700"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </CardHeader>
                    <CardContent>
                      <p className="text-gray-700 mb-4 line-clamp-3">{experience.content}</p>
                      
                      {experience.responses && experience.responses.length > 0 ? (
                        <div className="bg-gray-50 p-4 rounded-lg">
                          <h4 className="font-medium text-gray-900 mb-2">STAR Response</h4>
                          <div className="prose max-w-none text-sm">
                            <div dangerouslySetInnerHTML={{ 
                              __html: experience.responses[0].starResponse.replace(/\n/g, '<br>') 
                            }} />
                          </div>
                        </div>
                      ) : (
                        <Button
                          onClick={() => handleGenerateSTAR(experience)}
                          disabled={isGenerating}
                          className="bg-indigo-600 text-white hover:bg-indigo-700"
                        >
                          {isGenerating ? (
                            <>
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                              Generating...
                            </>
                          ) : (
                            <>
                              <Sparkles className="h-4 w-4 mr-2" />
                              Generate STAR Response
                            </>
                          )}
                        </Button>
                      )}
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
