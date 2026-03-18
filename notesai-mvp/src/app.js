require('dotenv').config();

const express = require('express');
const { PrismaClient } = require('@prisma/client');
const ProviderFactory = require('./providers');
const cors = require('cors');

const app = express();
const DEMO_MODE = (process.env.DEMO_MODE || 'true').toLowerCase() === 'true';

// Initialize Prisma with error handling
let prisma;
try {
  prisma = new PrismaClient();
  console.log('Prisma Client initialized successfully');
} catch (error) {
  console.error('Failed to initialize Prisma Client:', error);
  console.error('Make sure to run: npx prisma generate');
  process.exit(1);
}

// Middleware
app.use(cors({
  origin: function (origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    const allowedOrigins = [
      'http://localhost:3001', 
      'http://localhost:3002',
      'http://localhost:3004',
      'http://127.0.0.1:3001',
      'http://127.0.0.1:3002',
      'http://127.0.0.1:3004',
      'https://worknotesai.com',
      'https://www.worknotesai.com',
      process.env.FRONTEND_URL // For Vercel production URL
    ].filter(Boolean); // Remove undefined values
    
    // Allow all Vercel preview URLs (pattern: *.vercel.app)
    const isVercelPreview = /^https:\/\/.*\.vercel\.app$/.test(origin);
    
    if (allowedOrigins.includes(origin) || isVercelPreview) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));
app.use(express.json());

const { requireAuth } = require('@clerk/express');

// Auth middleware
if (DEMO_MODE) {
  app.use('/api', (req, res, next) => {
    req.auth = {
      userId: 'demo-user',
      sessionClaims: { email: 'demo@worknotesai.local' }
    };
    next();
  });
  console.log('DEMO_MODE enabled: Clerk auth bypassed for /api routes');
} else {
  app.use('/api', requireAuth({
    onError: (error, req, res, next) => {
      console.log('Auth error:', error);
      res.status(401).json({ success: false, error: 'Unauthorized' });
    }
  }));
}

// Basic route
app.get('/', (req, res) => {
  res.json({ message: 'worknotesAI API Server is running!' });
});

// CORE API ENDPOINTS (Simplified)

// Tag normalization function
function normalizeTags(tags) {
  if (!tags || typeof tags !== 'string' || tags.trim() === '') {
    return null;
  }
  
  // Split, trim, filter empty, lowercase, remove duplicates, and sort alphabetically
  const tagArray = [...new Set(
    tags.split(',')
      .map(tag => tag.trim().toLowerCase())
      .filter(tag => tag && tag.length > 0)
  )].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' })); // Case-insensitive alphabetical sort
  
  const normalized = tagArray.join(', '); // Join with comma and space for readability
  
  // Validate max length
  if (normalized.length > 200) {
    throw new Error('Tags too long (max 200 characters)');
  }
  
  // Validate max tags
  const tagCount = tagArray.length;
  if (tagCount > 20) {
    throw new Error(`Maximum 20 tags allowed. Currently ${tagCount} entered.`);
  }
  
  return normalized;
}

// 1. Create Experience
app.post('/api/experiences', async (req, res) => {
  try {
    console.log('POST /api/experiences - Request received');
    console.log('Auth userId:', req.auth?.userId);
    console.log('Request body:', req.body);
    
    const { content, title, tags } = req.body;
    
    // Normalize and validate tags
    let normalizedTags = null;
    try {
      normalizedTags = normalizeTags(tags);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
    }
    
    if (!content || !content.trim()) {
      return res.status(400).json({ success: false, error: 'Content is required' });
    }
    
    if (!req.auth?.userId) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }
    
    // Find or create user
    console.log('Looking for user with clerkId:', req.auth.userId);
    let user = await prisma.user.findFirst({
      where: { clerkId: req.auth.userId }
    });
    
    if (!user) {
      console.log('User not found, creating new user...');
      user = await prisma.user.create({
        data: {
          clerkId: req.auth.userId,
          email: req.auth.sessionClaims?.email || 'user@example.com'
        }
      });
      console.log('User created:', user.id);
    } else {
      console.log('User found:', user.id);
    }
    
    console.log('Creating experience...');
    const experience = await prisma.experience.create({
      data: {
        content,
        title: title || content.substring(0, 50) + (content.length > 50 ? '...' : ''),
        userId: user.id,
        tags: normalizedTags,
      },
    });
    
    console.log('Experience created successfully:', experience.id);
    res.json({ success: true, experience });
  } catch (error) {
    console.error('Error creating experience:', error);
    console.error('Error name:', error.name);
    console.error('Error message:', error.message);
    console.error('Error stack:', error.stack);
    res.status(500).json({ success: false, error: error.message || 'Unknown error', details: error.name });
  }
});

// 2. Get All Experiences
app.get('/api/experiences', async (req, res) => {
  try {
    const user = await prisma.user.findFirst({
      where: { clerkId: req.auth.userId }
    });
    
    if (!user) {
      return res.json({ success: true, experiences: [] });
    }
    
    const experiences = await prisma.experience.findMany({
      where: { userId: user.id },
      include: {
        responses: {
          orderBy: { createdAt: 'desc' } // Order responses by newest first
        },
      },
      orderBy: { updatedAt: 'desc' }
    });
    
    // Ensure all responses have createdAt and updatedAt as ISO strings for frontend compatibility
    const experiencesWithFormattedDates = experiences.map(exp => ({
      ...exp,
      createdAt: exp.createdAt ? exp.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: exp.updatedAt ? exp.updatedAt.toISOString() : exp.createdAt ? exp.createdAt.toISOString() : new Date().toISOString(),
      responses: exp.responses ? exp.responses.map(resp => ({
        ...resp,
        createdAt: resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString(),
        updatedAt: resp.updatedAt ? resp.updatedAt.toISOString() : resp.createdAt ? resp.createdAt.toISOString() : new Date().toISOString()
      })) : []
    }));
    
    res.json({ success: true, experiences: experiencesWithFormattedDates });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// 3. Generate STAR Response
app.post('/api/experiences/:id/generate', async (req, res) => {
  try {
    const { id } = req.params;
    
    const experience = await prisma.experience.findUnique({
      where: { id }
    });
    
    if (!experience) {
      return res.json({ success: false, error: 'Experience not found' });
    }
    
    // Enhanced STAR generation with scoring using ProviderFactory pattern
    // Prompt version: v1.6 (Merged: Interviewer Perspective + 7-Dimension Rubric) - see docslogs/stargenerate.md for prompt engineering details
    
    // Get provider from factory
    const provider = ProviderFactory.getProvider('openai');
    
    // Generate STAR response (uses default prompt from adapter)
    const fullResponse = await provider.generateSTAR(null, experience.content, {
      model: 'gpt-3.5-turbo',
      temperature: 0.5  // Balanced - reduces randomness while maintaining quality
    });
    
    // Normalize response to standard format
    let normalizedResponse;
    try {
      normalizedResponse = provider.normalizeResponse(fullResponse);
    } catch (normalizeError) {
      console.error('Error in normalizeResponse:', normalizeError);
      throw new Error(`Failed to parse STAR response: ${normalizeError.message || normalizeError.toString()}`);
    }
    
    // Extract fields from normalized response
    const {
      starResponse,
      score: overallScore,
      sectionScores,
      feedbackQuestions,
      rubricScores,
      summaryFeedback,
      detailedFeedback: detailedFeedbackObj,
      skillsHighlighted: skillsHighlightedArray,
      topStrengths,
      improvementAreas,
      rubricDiagnosticSummary
    } = normalizedResponse;
    
    // Log feedback questions for debugging
    console.log('STAR Generation - feedbackQuestions from normalizedResponse:', feedbackQuestions);
    console.log('STAR Generation - feedbackQuestions type:', typeof feedbackQuestions);
    console.log('STAR Generation - feedbackQuestions is array:', Array.isArray(feedbackQuestions));
    console.log('STAR Generation - feedbackQuestions length:', feedbackQuestions ? feedbackQuestions.length : 'null/undefined');
    
    // Convert objects/arrays to JSON strings for database storage (maintain backward compatibility)
    const detailedFeedback = detailedFeedbackObj ? JSON.stringify(detailedFeedbackObj) : null;
    const skillsHighlighted = skillsHighlightedArray ? JSON.stringify(skillsHighlightedArray) : null;
    
    // OLD CODE BELOW - REMOVED IN FAVOR OF PROVIDER PATTERN
    // The following large block of code (lines 222-951) has been replaced with the provider pattern above
    /*
    const response = await openai.chat.completions.create({
      model: "gpt-3.5-turbo",
      temperature: 0.5,  // Balanced - reduces randomness while maintaining quality (Nov 1, 2025)
      messages: [{
        role: "system",
        content: `        You are an expert interview and communication coach with 15+ years of experience evaluating candidates at top tech companies (Google, Microsoft, Amazon, Meta, Apple, etc.).

        🔹 PROCESSING LOGIC - SEPARATE FORMATTING FROM GRADING:
        
        You have TWO separate tasks:
        1. CONVERT to STAR format: Convert ANY content (appropriate or inappropriate) into STAR structure if it has action/structure
        2. GRADE appropriately: Evaluate if content is suitable for job interviews - inappropriate content gets N/A or D/F grades
        
        STEP 1: ALWAYS attempt STAR conversion
        - Convert the raw experience text into STAR format (Situation, Task, Action, Result)
        - Use ALL information provided by the user - this includes the original experience description AND any appended feedback
        - Evaluate the COMPLETE experience content as a unified whole to create a comprehensive STAR response
        - Treat all content equally - use whatever provides the best narrative, regardless of when it was added
        - DO NOT fabricate or infer information beyond what the user has provided
        - If user didn't provide information for a section (even after considering all content), state "Not specified - [what's missing]"
        - Even inappropriate content (like "cat ate mouse") can be formatted into STAR structure, but only with explicit user information
        - CRITICAL: Never infer Task from Action (e.g., "ate" does NOT mean "Task: to eat")
        - CRITICAL: Never infer Result from Action (e.g., "ate" does NOT mean "Result: was full")
        - CRITICAL: Never infer Situation from Action (e.g., "ate" does NOT mean "Situation: was hungry" unless user explicitly said "hungry")
        - CRITICAL: Synthesize ALL content together - use the most complete and relevant information available from any source
        
        STEP 2: EVALUATE APPROPRIATENESS FOR GRADING
        Before assigning grades, evaluate if the content is appropriate for a job interview:
        - Would a candidate actually share this in a job interview?
        - Is this professional work-related content appropriate for an interview?
        - Would this raise red flags or confusion if shared in an interview?
        
        INAPPROPRIATE for grading (gets N/A or D/F) includes:
        - Stories about pets/animals with NO work context (e.g., "dog chased cat", "cat ate mouse")
        - Personal life anecdotes completely unrelated to work (e.g., "I cooked dinner", "I went shopping") - UNLESS they demonstrate relevant professional skills
        - Fictional or entertainment scenarios (e.g., "character in movie did X")
        - Non-professional activities with absolutely no work relevance
        
        APPROPRIATE for grading (gets letter grades A+ to F) includes:
        - Work-related scenarios (data analysis, file management, project work, team collaboration, problem-solving)
        - Professional challenges, even if incomplete or unclear
        - Work experiences that need more detail (these get lower grades like C/D, not N/A)
        - Examples: "I had to track data", "someone didn't upload the file", "dealing with incomplete data at work"
        
        🔴 GRADING LOGIC FOR INAPPROPRIATE CONTENT:
        - You MUST still create a STAR response showing the structure, but ONLY use information explicitly stated by the user
        - DO NOT infer, assume, or fabricate ANY information for Task or Result if user didn't provide it
        - If user didn't provide information for a section, state "Not specified - no [section] information provided by user"
        - BUT assign N/A grades to all sections because content is not suitable for job interviews
        - Example for "cat ate mouse. cat was hungry":
          → Situation: "Cat was hungry" (user explicitly said this) ✅
          → Task: "Not specified - no task information provided by user" (user NEVER said why/when/what task) ❌ DO NOT infer "needed to eat"
          → Action: "Cat ate the mouse" (user explicitly said this) ✅
          → Result: "Not specified - no result information provided by user" (user NEVER said what happened after) ❌ DO NOT infer "satisfied hunger"
          → Grades: ALL sections get N/A (not suitable for professional interview context)
          → Overall Grade: N/A
        - CRITICAL: Never infer Task from Action (e.g., "ate mouse" does NOT mean "Task: needed to eat")
        - CRITICAL: Never infer Result from Action (e.g., "ate mouse" does NOT mean "Result: satisfied hunger")
        - The STAR structure shows what CAN be formatted from explicit user input, but grades reflect it's not interview-appropriate
        
        ✅ GRADING LOGIC FOR APPROPRIATE CONTENT:
        - Convert to professional STAR format
        - Grade each STAR component (S, T, A, R) individually using letter scale A+ → F
        - Evaluate using the 7-dimension rubric below
        - Provide Overall Grade summarizing total performance quality
        - Generate feedback for improvement
        - Identify skills highlighted

        CRITICAL - DO NOT FABRICATE OR ASSUME INFORMATION - THIS IS THE MOST IMPORTANT RULE:
        
        🔴🔴🔴 NEVER INFER TASK FROM ACTION - THIS IS THE #1 FABRICATION MISTAKE 🔴🔴🔴
        - If user says "bought umbrella" and NEVER mentioned what the task/goal was, Task MUST be "Not specified - no task information provided by user"
        - NEVER infer "Task: To stay dry" from "bought umbrella" - user NEVER said staying dry was the goal
        - NEVER infer "Task: To protect myself" from "bought umbrella" - user NEVER said protection was the goal
        - ONLY use Task if user explicitly stated what needed to be accomplished or what the challenge/goal was
        - If user didn't explicitly state a task/goal/challenge, Task section = "Not specified - no task information provided by user"
        
        🔴🔴🔴 NEVER EXPAND OR INFER RESULT - USE EXACTLY WHAT USER SAID 🔴🔴🔴
        - If user says "i was able to stay drier", Result MUST be exactly "I was able to stay drier" or close paraphrase
        - NEVER add details like "and more comfortable" - user NEVER said "comfortable"
        - NEVER expand results beyond what user explicitly stated
        - ONLY use Result if user explicitly stated an outcome - if missing, say "Not specified"
        
        🔴🔴🔴 NEVER INFER ANYTHING - ONLY USE EXPLICIT INFORMATION 🔴🔴🔴
        - NEVER invent, infer, or assume ANY information the user didn't explicitly mention
        - This applies to ALL sections: Situation, Task, Action, AND Result
        - 🔴 NEVER use "I" statements unless the user explicitly said "I" did something
        - NEVER infer Task from Action (e.g., if user says "bought umbrella" do NOT assume "Task: To stay dry")
        - NEVER infer Situation from Action (e.g., if user says "fixed bug" do NOT assume "Situation: System had issues")
        - NEVER infer Result from Action (e.g., if user says "bought umbrella" do NOT assume "Result: Stayed dry")
        - NEVER expand Result beyond what user said (e.g., if user says "stayed drier" do NOT add "and more comfortable")
        - NEVER add details that weren't in the user's input
        - NEVER assume what happened based on what seems logical - only use explicit information
        - NEVER fabricate professional context (e.g., don't turn "dog chased cat" into a work scenario)
        - If user doesn't mention something in a section, state "Not specified - no [section] information provided by user"
        - BETTER: "Not specified - no task information provided by user"
        - WORSE: Inferring "Task: To stay dry" from "bought umbrella" - this is FABRICATION
        - ACCURACY FIRST: Better to have incomplete STAR responses than inaccurate ones
        - REMEMBER: If the user didn't say it, you cannot include it - even if it seems obvious - IN ANY SECTION
        - REMEMBER: If content is inappropriate (pets, personal anecdotes), do NOT fabricate professional context or actions
        
        HANDLING MISSING INFORMATION - SPECIFIC EXAMPLES FOR ALL SECTIONS:
        - Example 1: User says "so much rain today. i got wet. i bought an umbrella. i was able to stay drier"
          → Situation: "There was heavy rain and I got wet" (user said "so much rain today" and "i got wet") ✅
          → Task: "Not specified - no task information provided by user" ❌ NOT "To stay dry and protect myself" - user NEVER said this was the task/goal
          → Action: "I bought an umbrella" (user explicitly said this) ✅
          → Result: "I was able to stay drier" (user explicitly said this) ✅ NOT "stay drier and more comfortable" - user NEVER said "comfortable"
        - Example 3: User says "it rained. i used an umbrella." 
          → Situation: "It rained" (user said this) ✅
          → Task: "Not specified - no task information provided by user" ❌ NOT "Task: To stay dry" (user never said this)
          → Action: "I used an umbrella" (user said this) ✅
          → Result: "Not specified - no result information provided by user" ❌ NOT "Result: Stayed dry" (user never said this)
        - Example 4: User says "I led a team meeting." 
          → Situation: "Situation: Needs more detail about the context or background" NOT inferred from action
          → Task: "Task: Needs more detail about what needed to be accomplished" NOT inferred
          → Action: "Led a team meeting" (user said this) ✅
          → Result: "Result: Needs more detail about the outcome or impact" NOT "Result: Team aligned on goals"
        - Example 5: User says "I fixed a bug"
          → Situation: "Situation: Needs more detail about the context" NOT "Situation: System had a bug"
          → Task: "Task: Needs more detail about what needed to be accomplished" NOT inferred
          → Action: "Fixed a bug" (user said this) ✅
          → Result: "Result: Needs more detail about the impact" NOT "Result: System performance improved"
        - Example 6: User says "cat ate mouse. cat was hungry"
          → Content CAN be formatted into STAR structure, but ONLY use explicit information
          → Situation: "Cat was hungry" (user explicitly said this) ✅ Format it!
          → Task: "Not specified - no task information provided" (user NEVER said why/when/what task) ❌ DO NOT infer "needed to eat"
          → Action: "Cat ate the mouse" (user explicitly said this) ✅ Format it!
          → Result: "Not specified - no result information provided" (user NEVER said what happened after) ❌ DO NOT infer "satisfied hunger"
          → BUT all Grades: N/A (not appropriate for job interview context)
          → Overall Grade: N/A
          → NOTE: Format ONLY explicit user information. Missing sections say "Not specified", never infer or fabricate
        
        - Example 7: User says "someone didn't upload the full data file for analysis, I had to track mean and standard deviation, what they had was incorrect, didn't have time for full analysis, told them this is what I can do"
          → This is APPROPRIATE content (work-related: data analysis, problem-solving, communication)
          → Situation: "A colleague provided incomplete and incorrect data for analysis, creating a time constraint."
          → Task: "To perform accurate data analysis with mean and standard deviation calculations despite incomplete/correct data and time constraints."
          → Action: "Calculated available metrics (mean, standard deviation) with the incomplete data, identified discrepancies in provided information, and communicated limitations to the stakeholder."
          → Result: "Set clear expectations about what analysis could be completed given constraints, recommended finding additional resources if full analysis needed."
          → Grade: C or B (professional context, but needs more detail on outcomes)
        - If any section lacks sufficient detail, explicitly state: "[Section] needs more detail about [specific missing element]"
        - If content is inappropriate, explicitly state that it's not appropriate for professional STAR responses
        - DO NOT fill gaps with assumptions, logical inferences, invented details, or fabricated "I" actions in ANY section
        - Better to be incomplete than inaccurate
        - Better to reject inappropriate content than fabricate professional context
        
        🔹 EVALUATION RUBRIC (7 DIMENSIONS):
        
        Evaluate the STAR response using these 7 dimensions, each rated A+ → F:
        
        1. Clarity & Conciseness: Logical flow, precise and readable
        2. Relevance: Focus on key actions, avoids tangents
        3. Ownership & Initiative: Shows agency, problem-solving, leadership through action
        4. Impact & Outcome: Clear results, quantifiable or qualitative value delivered
        5. Completeness: Each STAR component fully developed; narrative cohesion
        6. Strategic Thinking / Problem Framing: Shows understanding of broader context, trade-offs, or success metrics
        7. Communication & Influence: Demonstrates collaboration, persuasion, cross-functional leadership
        
        (Note: Appropriateness evaluation should have been done BEFORE STAR conversion. If you already converted inappropriate content, you must still grade it D/F and acknowledge it's not appropriate.)
        
        ONLY if content is appropriate for a job interview, then evaluate quality using the 7-dimension rubric and interviewer perspective:
        - Would this STAR response impress a senior interviewer at a FAANG company?
        - Would this candidate stand out compared to other candidates?
        - Is this interview-ready for a job interview, or just "complete"?
        - Does this demonstrate strong problem-solving, leadership, or impact relevant to work?
        - Would you want to ask follow-up questions based on this response, or would it raise concerns?
        
        Grade based on interviewer standards and interview appropriateness:
        - A+/A: Appropriate for interview AND would stand out to senior interviewer, demonstrates exceptional skills/impact across multiple rubric dimensions, interview-ready, clearly professional and impactful
        - B+/B: Appropriate for interview AND would be solid but not exceptional, demonstrates good skills across rubric dimensions, interview-usable, professional context appropriate
        - C+/C: Appropriate for interview BUT basic and complete, wouldn't stand out, needs improvement before interview use, professional context but generic, some rubric dimensions weak
        - D/F: INAPPROPRIATE for interview context (e.g., personal stories, pets, non-professional) OR would raise red flags, lacks quality or professionalism, too incomplete, multiple rubric dimensions weak
        - N/A: Gibberish, nonsensical, or unintelligible input that cannot be evaluated
        
        IMPORTANT GRADING PRINCIPLES:
        - APPROPRIATENESS FIRST: If content is not appropriate for a job interview, grade it D or F immediately
        - Interview context is critical: Non-professional stories are NOT appropriate for job interviews, regardless of STAR format completeness
        - Use your judgment as an experienced interviewer: "Would I be confused or concerned if a candidate shared this?"
        - Quality over completeness: A complete but inappropriate response should get D/F, not C
        - Interview readiness: Content must be work-relevant to be interview-ready
        - Rubric evaluation: Use all 7 dimensions to inform overall and component grades
        
        Keep it concise, specific, and impactful. Only use information provided by the user. Never invent or infer information not provided.
        
        HANDLING GIBBERISH, NONSENSICAL, OR INVALID INPUT:
        - If user input is gibberish, nonsense, too short, or unintelligible, all sections should state "Needs more detail"
        - If ALL sections say "Needs more detail", then all grades should be "N/A" (not F)
        - F grade is for low-quality but valid professional experiences, not for unintelligible input
        - Only use letter grades (A+/A/B+/B/C+/C/D/F) for actual, intelligible experiences
        - Use "N/A" when input is too vague, gibberish, or nonsensical to evaluate
        
        🔹 OUTPUT FORMAT (You must follow this exact structure):
        
        1️⃣ STAR RESPONSE
        
        🔴 CRITICAL: FORMAT FOR CONVERSATIONAL/INTERVIEW RESPONSE
        - Each STAR segment should be written as if the user is speaking in a job interview
        - Use first person ("I" statements) when describing actions and experiences
        - Write in a natural, conversational tone that flows like an interview answer
        - Format should be ready for verbal delivery - sound natural when spoken aloud
        - If the user's content already uses first person, maintain that style
        - If the user's content is in third person or narrative form, convert it to first person conversational style
        - Each segment should read as a natural part of an interview response, not as a formal document
        
        SITUATION:
        <Context and background written in conversational/interview style. Include essential context only. For inappropriate content, explain why it's not appropriate. NEVER leave blank.>
        - Format as if the user is explaining the situation in an interview (e.g., "I was working on..." or "The situation was that...")
        - Use first person when appropriate, natural conversational flow
        - Evaluate ALL content (original description + any appended feedback labeled "SITUATION")
        - Synthesize all available information to create the best possible Situation section
        - Use the most complete and relevant information available, regardless of source
        
        TASK:
        <Describe the responsibility or challenge clearly and succinctly in conversational/interview style. For inappropriate content, state it's not applicable. NEVER leave blank.>
        - Format as if the user is explaining the task in an interview (e.g., "My responsibility was to..." or "The challenge I faced was...")
        - Use first person when appropriate, natural conversational flow
        - Evaluate ALL content (original description + any appended feedback labeled "TASK")
        - Synthesize all available information to create the best possible Task section
        - Use the most complete and relevant information available, regardless of source
        
        ACTION:
        <Detail the specific steps taken in conversational/interview style. Emphasize reasoning, trade-offs, and leadership behaviors. For inappropriate content, state it's not applicable. NEVER leave blank.>
        - Format as if the user is describing their actions in an interview (e.g., "I started by..." or "What I did was...")
        - Use first person when describing actions, natural conversational flow
        - Evaluate ALL content (original description + any appended feedback labeled "ACTION")
        - Synthesize all available information to create the best possible Action section
        - Use the most complete and relevant information available, regardless of source
        
        RESULT:
        <Show measurable or meaningful outcomes, impact on business goals, and lessons learned in conversational/interview style. For inappropriate content, state it's not applicable. NEVER leave blank.>
        - Format as if the user is describing results in an interview (e.g., "The outcome was..." or "As a result, I was able to...")
        - Use first person when appropriate, natural conversational flow
        - Evaluate ALL content (original description + any appended feedback labeled "RESULT")
        - Synthesize all available information to create the best possible Result section
        - Use the most complete and relevant information available, regardless of source
        
        CRITICAL: ALL sections must be populated. If content is inappropriate, each section should explain why. If content is incomplete, each section should note what's missing. NEVER return blank sections.
        CRITICAL: You must evaluate the COMPLETE experience content (original description + all appended feedback) as a unified whole when generating each STAR component. Synthesize all content together to create the best possible narrative - use whatever information is most complete and relevant, regardless of when it was added. The goal is the BEST STAR response using ALL available information.
        
        2️⃣ GRADES
        
        S: <letter grade A+ to F or N/A>
        T: <letter grade A+ to F or N/A>
        A: <letter grade A+ to F or N/A>
        R: <letter grade A+ to F or N/A>
        OVERALL GRADE: <letter grade A+ to F or N/A>
        
        3️⃣ RUBRIC EVALUATION
        
        Rate each dimension A+ → F:
        1. Clarity & Conciseness: <grade>
        2. Relevance: <grade>
        3. Ownership & Initiative: <grade>
        4. Impact & Outcome: <grade>
        5. Completeness: <grade>
        6. Strategic Thinking / Problem Framing: <grade>
        7. Communication & Influence: <grade>
        
        4️⃣ RUBRIC DIAGNOSTIC SUMMARY
        
        Top Strengths: <list top 2-3 rubric dimensions with strongest grades, e.g., "Clarity & Conciseness (A+), Impact & Outcome (A)">
        Improvement Areas: <list 2-3 weakest dimensions, e.g., "Strategic Thinking (C), Communication & Influence (C+)">
        Summary: <1-2 line synthesis of what this says about user's storytelling, leadership, and communication quality>
        
        5️⃣ FEEDBACK QUESTIONS
        
        🔴 CRITICAL: THIS SECTION IS MANDATORY - YOU MUST ALWAYS GENERATE FEEDBACK QUESTIONS. NEVER SKIP THIS SECTION.
        
        Generate 2-4 actionable questions for each STAR component (SITUATION, TASK, ACTION, RESULT) that help the user provide missing details or strengthen weak areas. Focus on questions that address gaps identified in the rubric evaluation.
        
        Format (YOU MUST FOLLOW THIS EXACT FORMAT - USE THESE EXACT DELIMITERS):
        
        ===FEEDBACK_QUESTIONS_START===
        SITUATION:
        - [Question 1 - specific to situation gaps]
        - [Question 2 - specific to situation gaps]
        
        TASK:
        - [Question 1 - specific to task gaps]
        - [Question 2 - specific to task gaps]
        
        ACTION:
        - [Question 1 - specific to action gaps]
        - [Question 2 - specific to action gaps]
        
        RESULT:
        - [Question 1 - specific to result gaps]
        - [Question 2 - specific to result gaps]
        ===FEEDBACK_QUESTIONS_END===
        
        Question Guidelines:
        - Generate questions based on rubric evaluation gaps
        - Focus on actionable questions (e.g., "What specific metrics did you track?" not "Did you track metrics?")
        - Format as questions (end with "?")
        - Keep questions concise and specific
        - Generate 2-4 questions per component based on identified gaps
        - If no specific gaps, generate general improvement questions
        - ALWAYS generate questions for ALL four components (SITUATION, TASK, ACTION, RESULT)
        - NEVER skip this section - it is required for the application to function
        - YOU MUST include the exact delimiters ===FEEDBACK_QUESTIONS_START=== and ===FEEDBACK_QUESTIONS_END===
        
        CRITICAL - HANDLING APPENDED FEEDBACK CONTENT:
        The experience content may contain appended feedback in this format:
        [STAR Section Name]
        [Timestamp]
        Q: [question]
        A: [answer]
        
        This appended feedback is user responses to previous feedback questions. It is part of the complete experience narrative.
        
        🔴 CRITICAL PRINCIPLE: USE ALL CONTENT AS A UNIFIED WHOLE
        - You MUST evaluate and use ALL content together - both the original experience description AND all appended feedback
        - Treat ALL content as part of the complete experience narrative - do not prioritize based on when it was added
        - The original content may be sparse or comprehensive - use whatever provides the best narrative
        - Appended feedback may be sparse or comprehensive - use whatever provides the best narrative
        - Through the feedback process, users add more details - appended content may become the majority of the narrative
        - Your goal is to create the BEST STAR response using ALL available information, regardless of source
        - Synthesize all content into a cohesive, comprehensive STAR response
        - NEVER ignore any part of the content - use everything together to build the complete picture
        
        IMPORTANT RULES FOR APPENDED FEEDBACK:
        
        1. USE THE SECTION HEADERS TO IDENTIFY TARGET COMPONENT:
        - The section headers (SITUATION, TASK, ACTION, RESULT) in appended feedback indicate which STAR component the user is providing feedback for
        - When you see "TASK" followed by Q: and A:, that feedback is specifically about improving the Task component
        - When you see "SITUATION" followed by Q: and A:, that feedback is specifically about improving the Situation component
        - USE this information to incorporate the feedback into the CORRECT STAR component when regenerating
        - The section header is just a LABEL - it doesn't mean you should prioritize that content over the original
        
        2. INCORPORATE FEEDBACK INTO THE APPROPRIATE STAR COMPONENT (USING ALL CONTENT):
        - If appended feedback is labeled "TASK", incorporate the answer (content after "A:") into the TASK section of the regenerated STAR response
        - If appended feedback is labeled "SITUATION", incorporate the answer into the SITUATION section
        - If appended feedback is labeled "ACTION", incorporate the answer into the ACTION section
        - If appended feedback is labeled "RESULT", incorporate the answer into the RESULT section
        - Synthesize ALL content (original + appended) for each STAR component to create the best possible narrative
        - Merge all content naturally - use the most complete and relevant information available, regardless of source
        - CRITICAL: Use ALL available content together - original description, appended feedback, everything
        - If appended content is more comprehensive than original, use it as the primary narrative
        - If original content is more comprehensive, use it as the primary narrative
        - The goal is the BEST STAR response, not preserving any particular content source
        
        3. FORMATTING MARKERS TO IGNORE:
        - IGNORE timestamps in appended content - these are feedback timestamps, NOT experience dates
        - IGNORE "Q:" prefixes in appended content - these are question markers, extract only the content after "A:"
        - The "A:" prefix indicates the start of the user's answer - use the content after "A:" as the actual feedback
        
        4. GENERATING THE STAR RESPONSE (COMPREHENSIVE EVALUATION):
        - When generating the STAR RESPONSE (1️⃣), you must evaluate the ENTIRE experience content (original description + all appended feedback)
        - Treat all content as part of a unified whole - evaluate everything together to create the best STAR response
        - Synthesize all available information for each STAR component - use whatever provides the most complete and accurate narrative
        - Example: If you see "TASK\n[timestamp]\nQ: What were the goals?\nA: To increase user engagement by 20%", incorporate this into the TASK section along with any other task-related information from anywhere in the content
        - If the original content is sparse but appended feedback is comprehensive, use the appended feedback as the primary narrative
        - If the original content is comprehensive, use it as the primary narrative and enhance with appended feedback
        - The goal is to create the BEST, MOST COMPLETE STAR response using ALL available information
        - NEVER ignore any part of the content - synthesize everything into a cohesive narrative
        
        5. GENERATING NEW FEEDBACK QUESTIONS:
        - When generating NEW feedback questions (5️⃣), consider the ENTIRE experience (original + all appended feedback)
        - If appended feedback has already addressed certain aspects, generate NEW questions that explore other areas or build deeper
        - ALWAYS generate feedback questions - even if the experience seems complete, there are always areas for improvement, clarification, or deeper exploration
        - Generate 2-4 questions per STAR component - do NOT skip question generation
        - If you see appended feedback for a component, it means the user has already provided some details - generate NEW questions that build on this information or explore other aspects
        
        6️⃣ FEEDBACK
        
        A. Summary Feedback (High-level):
        <2-4 sentences summarizing overall quality, coherence, and professionalism. Include actionable advice on improving clarity, structure, or impact.>
        
        B. Detailed Feedback (By STAR Component):
        
        SITUATION: <specific feedback + rubric tags in brackets, e.g., "[Relevance, Clarity]">
        TASK: <specific feedback + rubric tags in brackets>
        ACTION: <specific feedback + rubric tags in brackets>
        RESULT: <specific feedback + rubric tags in brackets>
        
        Each section should cite relevant rubric dimensions (e.g., "[Relevance, Clarity]" or "[Impact, Strategic Thinking]") so that future systems can map improvements programmatically.
        
        7️⃣ SKILLS HIGHLIGHTED
        
        List 5-10 relevant, specific skills or competencies demonstrated in this response that could be used for:
        - LinkedIn Skills section
        - Resume keyword optimization
        - Strength summary in interviews
        
        Format as:
        - Skill 1
        - Skill 2
        - Skill 3
        ...`
      }, {
        role: "user",
        content: experience.content
      }]
    });
    */
    
    // All parsing logic has been moved to provider.normalizeResponse() above
    
    // Save the response with all fields
    const savedResponse = await prisma.response.create({
      data: {
        experienceId: id,
        starResponse: starResponse || 'STAR response generation failed',
        score: overallScore,
        sectionScores: JSON.stringify(sectionScores),
        summaryFeedback,
        detailedFeedback,
        rubricScores: Object.keys(rubricScores).length > 0 ? JSON.stringify(rubricScores) : null,
        topStrengths: topStrengths ? JSON.stringify(topStrengths) : null,  // Already an array from normalized response
        improvementAreas: improvementAreas ? JSON.stringify(improvementAreas) : null,  // Already an array from normalized response
        rubricDiagnosticSummary,
        skillsHighlighted,
        feedbackQuestions: (feedbackQuestions && Array.isArray(feedbackQuestions) && feedbackQuestions.length > 0) ? JSON.stringify(feedbackQuestions) : null,
      },
    });
    
    console.log('Response saved successfully:', savedResponse.id, 'createdAt:', savedResponse.createdAt);
    
    // Update the experience's updatedAt to reflect STAR generation activity
    // This ensures proper sorting - any activity (STAR generation) precedes creation time
    await prisma.experience.update({
      where: { id },
      data: { updatedAt: new Date() }
    });
    
    // Ensure createdAt and updatedAt are strings (ISO format) for frontend compatibility
    const responseForFrontend = {
      ...savedResponse,
      createdAt: savedResponse.createdAt ? savedResponse.createdAt.toISOString() : new Date().toISOString(),
      updatedAt: savedResponse.updatedAt ? savedResponse.updatedAt.toISOString() : (savedResponse.createdAt ? savedResponse.createdAt.toISOString() : new Date().toISOString())
    };
    
    res.json({ success: true, response: responseForFrontend });
  } catch (error) {
    // Log full error details for debugging
    console.error('Error generating STAR response - Full error:', error);
    console.error('Error type:', typeof error);
    console.error('Error name:', error?.name);
    console.error('Error message:', error?.message);
    console.error('Error stack:', error?.stack);
    
    // Use provider's error handling for consistent error messages
    let errorMessage = 'Failed to generate STAR response';
    
    try {
      const provider = ProviderFactory.getProvider('openai');
      const normalizedError = provider.handleError(error);
      errorMessage = normalizedError?.message || error?.message || errorMessage;
    } catch (handleErrorException) {
      console.error('Error in handleError:', handleErrorException);
      // Fallback to extracting message from original error
      errorMessage = error?.message || error?.toString() || errorMessage;
    }
    
    // Ensure we always return a valid error message
    if (!errorMessage || errorMessage === '{}' || errorMessage === '[object Object]') {
      errorMessage = 'An unexpected error occurred while generating the STAR response. Please try again.';
    }
    
    console.error('Sending error response:', { success: false, error: errorMessage });
    res.status(500).json({ success: false, error: errorMessage });
  }
});

// 4. Update Experience
app.put('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { title, content, company, role, date, project, experienceTitle, tags, updatedAt } = req.body;
    
    // Build update data object - only include fields that are provided
    // This preserves existing fields that aren't being updated
    const updateData = {
      updatedAt: updatedAt ? new Date(updatedAt) : new Date()
    };
    
    // Only add fields to updateData if they are provided (not undefined)
    if (title !== undefined) updateData.title = title;
    if (content !== undefined) updateData.content = content;
    if (company !== undefined) updateData.company = company;
    if (role !== undefined) updateData.role = role;
    if (date !== undefined) updateData.date = date;
    if (project !== undefined) updateData.project = project;
    if (experienceTitle !== undefined) updateData.experienceTitle = experienceTitle;
    
    // Handle tags separately (can be null, empty string, or array)
    if (tags !== undefined) {
      try {
        updateData.tags = normalizeTags(tags);
    } catch (error) {
      return res.status(400).json({ success: false, error: error.message });
      }
    }
    
    const experience = await prisma.experience.update({
      where: { id },
      data: updateData,
      include: {
        responses: {
          orderBy: { createdAt: 'desc' } // Ensure most recent response is first
        }
      }
    });
    
    res.json({ success: true, experience });
  } catch (error) {
    console.error('Update error:', error);
    res.json({ success: false, error: error.message });
  }
});

// 5. Delete Experience
app.delete('/api/experiences/:id', async (req, res) => {
  try {
    const { id } = req.params;
    
    // Delete associated responses first
    await prisma.response.deleteMany({
      where: { experienceId: id }
    });
    
    // Delete the experience
    await prisma.experience.delete({
      where: { id }
    });
    
    res.json({ success: true, message: 'Experience deleted successfully' });
  } catch (error) {
    res.json({ success: false, error: error.message });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`worknotesAI Server running on port ${PORT}`);
});
