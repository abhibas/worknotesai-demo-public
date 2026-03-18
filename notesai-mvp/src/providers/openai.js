/**
 * OpenAIAdapter - OpenAI-specific implementation
 * 
 * Implements BaseProvider interface for OpenAI GPT models.
 * Handles OpenAI API calls, response normalization, and error handling.
 * 
 * This adapter maintains exact backward compatibility with the previous
 * implementation in app.js (lines 217-997).
 * 
 * @module providers/openai
 */

const BaseProvider = require('./base');

/**
 * OpenAIAdapter - OpenAI provider implementation
 * 
 * This adapter wraps OpenAI's API and normalizes responses to the common
 * STARResponse format. It maintains backward compatibility with the current
 * implementation in app.js.
 * 
 * **Prompt Version**: v1.6 (Merged: Interviewer Perspective + 7-Dimension Rubric)
 * See docslogs/stargenerate.md for prompt engineering details.
 */
class OpenAIAdapter extends BaseProvider {
  constructor() {
    super();
    // OpenAI client will be initialized lazily in generateSTAR method
    // to ensure environment variables are available
    this.client = null;
  }
  
  /**
   * Initialize OpenAI client (lazy initialization)
   * @private
   */
  _initializeClient() {
    if (!this.client) {
      const OpenAI = require('openai');
      this.client = new OpenAI({
        apiKey: process.env.OPENAI_API_KEY,
      });
    }
    return this.client;
  }
  
  /**
   * Get the STAR generation prompt (v1.6)
   * 
   * This is the exact prompt used in the current implementation.
   * Maintained as a method for easy updates and versioning.
   * 
   * @returns {string} System prompt for STAR generation
   * @private
   */
  _getSTARPrompt() {
    return `        You are an expert interview and communication coach with 15+ years of experience evaluating candidates at top tech companies (Google, Microsoft, Amazon, Meta, Apple, etc.).

        🔹 PROCESSING LOGIC - SEPARATE FORMATTING FROM GRADING:
        
        You have TWO separate tasks:
        1. CONVERT to STAR format: Convert ANY content (appropriate or inappropriate) into STAR structure if it has action/structure
        2. GRADE appropriately: Evaluate if content is suitable for job interviews - inappropriate content gets N/A or D/F grades
        
        STEP 1: ALWAYS attempt STAR conversion (BUT DO NOT FABRICATE)
        - Convert the raw experience text into STAR format (Situation, Task, Action, Result)
        - Use ALL information provided by the user - this includes the original experience description AND any appended feedback
        - Evaluate the COMPLETE experience content as a unified whole to create a comprehensive STAR response
        - Treat all content equally - use whatever provides the best narrative, regardless of when it was added
        - DO NOT fabricate or infer information beyond what the user has provided
        - If user didn't provide information for a section (even after considering all content), state "Not specified - [what's missing]" or "Needs more detail about [what's missing]"
        - Even inappropriate content (like "cat ate mouse") can be formatted into STAR structure, but only with explicit user information
        - CRITICAL: Never infer Task from Action (e.g., "ate" does NOT mean "Task: to eat")
        - CRITICAL: Never infer Result from Action (e.g., "ate" does NOT mean "Result: was full")
        - CRITICAL: Never infer Situation from Action (e.g., "ate" does NOT mean "Situation: was hungry" unless user explicitly said "hungry")
        - CRITICAL: Synthesize ALL content together - use the most complete and relevant information available from any source
        
        🔴🔴🔴 CRITICAL: DO NOT FABRICATE FROM VAGUE OR GIBBERISH INPUT 🔴🔴🔴
        - If original content is vague (e.g., "650 pm just edited test another day") → DO NOT fabricate a full narrative
        - If original content is gibberish → DO NOT fabricate meaning from it
        - If appended feedback is gibberish (e.g., "aa", "tt", "ss", "rr") → DO NOT fabricate meaning from it
        - If you cannot extract meaningful information from content, state "Needs more detail" - DO NOT fabricate
        - Example BAD: Input "650 pm just edited test another day" + "A: aa" → DO NOT create "I was working on editing a test on another day"
        - Example GOOD: Input "650 pm just edited test another day" + "A: aa" → Situation: "Needs more detail about the context", Task: "Needs more detail about what needed to be accomplished"
        - CRITICAL: Better to have incomplete STAR responses than fabricated STAR responses
        
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
        
        🔴 CRITICAL: DETECT GIBBERISH BEFORE PROCESSING
        
        Gibberish/nonsensical input includes (but not limited to):
        - Random character strings: "asdfgh", "tt", "ss", "adadafd", "qwerty", "zxcvbn"
        - Repeated single characters: "aaaa", "tttt", "ssss"
        - Random letter combinations with no meaning: "jklmn", "hgfds", "poiuyt"
        - Single words with no context: "today", "hello", "test", "good night", "good morning", "goodbye" (unless part of a work scenario)
        - Very short input (< 10 characters) with no work context
        - Nonsensical combinations: "cat dog", "red blue", "123 abc" (unless work-related)
        - Greetings or casual phrases: "good night", "good morning", "hello", "hi", "bye" (unless work-related)
        - Input that cannot be parsed as a coherent work experience or story
        
        🔴 DETECTION RULES (GENERAL PRINCIPLES):
        1. If input lacks work-related context (no professional scenario, no work actions, no business impact) → GIBBERISH
        2. If input is too short/vague to understand as a work experience (< 10 characters with no work keywords) → GIBBERISH
        3. If input is only random characters, single words, or casual phrases with no work context → GIBBERISH
        4. If input cannot be understood as a coherent work experience or professional story → GIBBERISH
        
        🔴 GENERAL PRINCIPLE: If the input does not describe a work-related scenario, professional challenge, or business situation, treat it as gibberish and return "Needs more detail" for all sections.
        
        🔴 HANDLING GIBBERISH:
        - If user input is gibberish, nonsense, too short, or unintelligible:
          → ALL sections (Situation, Task, Action, Result) MUST state "Needs more detail"
          → ALL grades (S, T, A, R, Overall) MUST be "N/A" (NOT F)
          → ALL rubric dimensions MUST be "N/A"
          → Summary feedback should note: "Input is too vague or unintelligible to evaluate"
        - F grade is for low-quality but VALID professional experiences, NOT for unintelligible input
        - Only use letter grades (A+/A/B+/B/C+/C/D/F) for actual, intelligible professional experiences
        - Use "N/A" when input is too vague, gibberish, or nonsensical to evaluate
        
        🔴 EXAMPLES:
        - Input: "asdfgh" → All sections: "Needs more detail", All grades: "N/A"
        - Input: "tt" → All sections: "Needs more detail", All grades: "N/A"
        - Input: "today" → All sections: "Needs more detail", All grades: "N/A"
        - Input: "good night" → All sections: "Needs more detail", All grades: "N/A" (NOT "I had multiple situations arise")
        - Input: "today is a sunny day" → All sections: "Needs more detail" (no work context), All grades: "N/A"
        - Input: "I fixed a bug" → Valid input, process normally (may get lower grades if incomplete)
        
        🔴 CRITICAL: For gibberish input like "good night", DO NOT create narratives like "I had multiple situations arise" or "In one instance, it was nighttime". Simply state "Needs more detail" for ALL sections.
        
        🔹 OUTPUT FORMAT (You must follow this exact structure):
        
        🔴 CRITICAL: YOU MUST USE EXPLICIT DELIMITERS FOR ALL SECTIONS. THIS IS REQUIRED FOR PARSING.
        🔴 CRITICAL: Include the exact delimiters ===SECTION_START=== and ===SECTION_END=== for each section.
        🔴 CRITICAL: Use THREE EQUAL SIGNS (===) on BOTH sides - NOT hash symbols (###), NOT asterisks (***), NOT dashes (---).
        🔴 CRITICAL: Example: ===STAR_RESPONSE_START=== (CORRECT) NOT ### STAR_RESPONSE_START ### (WRONG)
        🔴 CRITICAL: Never skip delimiters - they are required for the application to function correctly.
        🔴 CRITICAL: Output each section ONLY ONCE - do NOT repeat sections.
        
        ===STAR_RESPONSE_START===
        
        🔴 CRITICAL: FORMAT FOR CONVERSATIONAL/INTERVIEW RESPONSE
        - Each STAR segment should be written as if the user is speaking in a job interview
        - Use first person ("I" statements) when describing actions and experiences
        - Write in a natural, conversational tone that flows like an interview answer
        - Format should be ready for verbal delivery - sound natural when spoken aloud
        - If the user's content already uses first person, maintain that style
        - If the user's content is in third person or narrative form, convert it to first person conversational style
        - Each segment should read as a natural part of an interview response, not as a formal document
        
        SITUATION:
        <Context and background written in conversational/interview style. Include essential context only. For inappropriate content or gibberish, state "Needs more detail about the context". NEVER fabricate narratives. NEVER leave blank.>
        - Format as if the user is explaining the situation in an interview (e.g., "I was working on..." or "The situation was that...")
        - Use first person when appropriate, natural conversational flow
        - Evaluate ALL content (original description + any appended feedback labeled "SITUATION")
        - Synthesize all available information to create the best possible Situation section
        - Use the most complete and relevant information available, regardless of source
        - 🔴 CRITICAL: If input is gibberish (e.g., "good night", "tt", "ss"), state "Needs more detail about the context" - DO NOT create narratives like "I had multiple situations arise" or "In one instance, it was nighttime"
        
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
        
        ===STAR_RESPONSE_END===
        
        ===GRADES_START===
        
        S: <letter grade A+ to F or N/A>
        T: <letter grade A+ to F or N/A>
        A: <letter grade A+ to F or N/A>
        R: <letter grade A+ to F or N/A>
        OVERALL GRADE: <letter grade A+ to F or N/A>
        
        ===GRADES_END===
        
        ===RUBRIC_EVALUATION_START===
        
        Rate each dimension A+ → F:
        1. Clarity & Conciseness: <grade>
        2. Relevance: <grade>
        3. Ownership & Initiative: <grade>
        4. Impact & Outcome: <grade>
        5. Completeness: <grade>
        6. Strategic Thinking / Problem Framing: <grade>
        7. Communication & Influence: <grade>
        
        ===RUBRIC_EVALUATION_END===
        
        ===RUBRIC_DIAGNOSTIC_SUMMARY_START===
        
        Top Strengths: <list top 2-3 rubric dimensions with strongest grades, e.g., "Clarity & Conciseness (A+), Impact & Outcome (A)">
        Improvement Areas: <list 2-3 weakest dimensions, e.g., "Strategic Thinking (C), Communication & Influence (C+)">
        Summary: <1-2 line synthesis of what this says about user's storytelling, leadership, and communication quality>
        
        ===RUBRIC_DIAGNOSTIC_SUMMARY_END===
        
        ===FEEDBACK_QUESTIONS_START===
        
        🔴 CRITICAL: THIS SECTION IS MANDATORY - YOU MUST ALWAYS GENERATE FEEDBACK QUESTIONS. NEVER SKIP THIS SECTION.
        
        Generate 2-4 actionable questions for each STAR component (SITUATION, TASK, ACTION, RESULT) that help the user provide missing details or strengthen weak areas. Focus on questions that address gaps identified in the rubric evaluation.
        
        Format (YOU MUST FOLLOW THIS EXACT FORMAT):
        
        SITUATION:
        - What specific context or background details can you provide about the situation?
        - Can you elaborate on the challenges or constraints you faced?
        
        TASK:
        - What specific goals or objectives needed to be accomplished?
        - What were the key responsibilities or deliverables?
        
        ACTION:
        - What specific steps did you take to address the challenge?
        - Can you provide more detail about your approach or methodology?
        
        RESULT:
        - What measurable outcomes or impacts resulted from your actions?
        - Can you quantify the results or describe the business value delivered?
        
        🔴 CRITICAL: Generate ACTUAL, SPECIFIC questions based on the gaps you identified in the rubric evaluation. Each question should be:
        - A complete, actionable question that ends with "?"
        - Specific to the gaps you identified (e.g., if clarity is weak, ask about clarity)
        - Tailored to the STAR component (Situation, Task, Action, or Result)
        - NOT generic placeholder text like "[Question 1 - specific to situation gaps]"
        - NOT instruction text like "Generate a REAL, specific question"
        
        Example GOOD questions:
        - "What specific metrics did you use to measure success?"
        - "Can you describe the team structure and your role in more detail?"
        - "What challenges did you encounter during implementation?"
        
        Example BAD (DO NOT USE):
        - "[Question 1 - specific to situation gaps]"
        - "Generate a REAL, specific question about situation gaps"
        - Any text in square brackets or instruction format
        
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
        
        🔴 CRITICAL: All sections must use explicit delimiters. This ensures reliable parsing across all AI providers.
        
        CRITICAL - HANDLING APPENDED FEEDBACK CONTENT:
        The experience content may contain appended feedback in this format:
        [STAR Section Name]
        Q: [question]
        A: [answer]
        
        Note: Timestamps have been automatically removed - they are metadata, not experience content.
        This appended feedback is user responses to previous feedback questions. It is part of the complete experience narrative.
        
        🔴 CRITICAL PRINCIPLE: USE ALL CONTENT AS A UNIFIED WHOLE (BUT DO NOT FABRICATE)
        - You MUST evaluate and use ALL content together - both the original experience description AND all appended feedback
        - Treat ALL content as part of the complete experience narrative - do not prioritize based on when it was added
        - The original content may be sparse or comprehensive - use whatever provides the best narrative
        - Appended feedback may be sparse or comprehensive - use whatever provides the best narrative
        - Through the feedback process, users add more details - appended content may become the majority of the narrative
        - Your goal is to create the BEST STAR response using ALL available information, regardless of source
        - Synthesize all content into a cohesive, comprehensive STAR response
        - NEVER ignore any part of the content - use everything together to build the complete picture
        
        🔴🔴🔴 CRITICAL: DO NOT FABRICATE FROM GIBBERISH OR SHORT INPUT 🔴🔴🔴
        - If appended feedback is gibberish (e.g., "aa", "tt", "ss", "rr", "aa2") → DO NOT fabricate meaning
        - If appended feedback is too short (< 5 characters) → DO NOT expand it into a full narrative
        - If appended feedback is just random letters → DO NOT invent work context around it
        - If original content is gibberish AND appended feedback is gibberish → ALL sections should say "Needs more detail"
        - DO NOT create narratives from gibberish - better to have incomplete STAR than fabricated STAR
        - Examples of GIBBERISH appended feedback that should NOT be expanded:
          * "aa", "tt", "ss", "rr" → These are gibberish, NOT meaningful content
          * "aa test" → Still too short/vague to fabricate a narrative from
          * Single letters or random characters → DO NOT fabricate
        - If you cannot extract meaningful content from appended feedback, treat it as missing information
        - CRITICAL: Fabricating narratives from gibberish is WORSE than having incomplete STAR responses
        
        🔴 EXAMPLES:
        - Input: "I led a project in November 2024. TASK\nQ: What were the goals?\nA: To increase revenue by 20%"
          → Use "November 2024" in Situation (user-provided date) ✅
          → Use "To increase revenue by 20%" in Task (from A:) ✅
        - Input: "TASK\nQ: What did you do?\nA: I analyzed the data"
          → Use "I analyzed the data" in Task ✅
        - Input: "TASK\nQ: What were the goals?\nA: tt"
          → "tt" is gibberish, IGNORE it ❌
          → Task section should say "Needs more detail about what needed to be accomplished" ✅
        - Input: "ACTION\nQ: What did you do?\nA: aa"
          → "aa" is gibberish, IGNORE it ❌
          → Action section should say "Needs more detail about the actions taken" ✅
        
        5. GENERATING NEW FEEDBACK QUESTIONS:
        - When generating NEW feedback questions (5️⃣), consider the ENTIRE experience (original + all appended feedback)
        - If appended feedback has already addressed certain aspects, generate NEW questions that explore other areas or build deeper
        - ALWAYS generate feedback questions - even if the experience seems complete, there are always areas for improvement, clarification, or deeper exploration
        - Generate 2-4 questions per STAR component - do NOT skip question generation
        - If you see appended feedback for a component, it means the user has already provided some details - generate NEW questions that build on this information or explore other aspects
        
        ===FEEDBACK_START===
        
        A. Summary Feedback (High-level):
        <2-4 sentences summarizing overall quality, coherence, and professionalism. Include actionable advice on improving clarity, structure, or impact.>
        
        B. Detailed Feedback (By STAR Component):
        
        SITUATION: <specific feedback + rubric tags in brackets, e.g., "[Relevance, Clarity]">
        TASK: <specific feedback + rubric tags in brackets>
        ACTION: <specific feedback + rubric tags in brackets>
        RESULT: <specific feedback + rubric tags in brackets>
        
        Each section should cite relevant rubric dimensions (e.g., "[Relevance, Clarity]" or "[Impact, Strategic Thinking]") so that future systems can map improvements programmatically.
        
        ===FEEDBACK_END===
        
        ===SKILLS_HIGHLIGHTED_START===
        
        List 5-10 relevant, specific skills or competencies demonstrated in this response that could be used for:
        - LinkedIn Skills section
        - Resume keyword optimization
        - Strength summary in interviews
        
        Format as:
        - Skill 1
        - Skill 2
        - Skill 3
        ...
        
        ===SKILLS_HIGHLIGHTED_END===
        
        🔴 CRITICAL REMINDER: You MUST include all delimiters for all sections:
        - ===STAR_RESPONSE_START=== / ===STAR_RESPONSE_END===
        - ===GRADES_START=== / ===GRADES_END===
        - ===RUBRIC_EVALUATION_START=== / ===RUBRIC_EVALUATION_END===
        - ===RUBRIC_DIAGNOSTIC_SUMMARY_START=== / ===RUBRIC_DIAGNOSTIC_SUMMARY_END===
        - ===FEEDBACK_QUESTIONS_START=== / ===FEEDBACK_QUESTIONS_END===
        - ===FEEDBACK_START=== / ===FEEDBACK_END===
        - ===SKILLS_HIGHLIGHTED_START=== / ===SKILLS_HIGHLIGHTED_END===
        
        These delimiters are REQUIRED for the application to parse your response correctly.`;
  }
  
  /**
   * Detect if input is likely gibberish/nonsensical
   * 
   * This provides early detection of obvious gibberish before sending to AI,
   * making the system more efficient and reliable.
   * 
   * @param {string} experience - User experience content
   * @returns {boolean} True if input appears to be gibberish
   */
  _isGibberish(experience) {
    if (!experience || typeof experience !== 'string') {
      return true;
    }
    
    const trimmed = experience.trim();
    
    // Rule 1: Too short (< 10 characters) with no work context
    if (trimmed.length < 10) {
      // Check for work-related keywords
      const workKeywords = ['work', 'project', 'team', 'task', 'meeting', 'client', 'manager', 'code', 'bug', 'data', 'analysis', 'report', 'presentation', 'deadline', 'deliverable'];
      const hasWorkContext = workKeywords.some(keyword => trimmed.toLowerCase().includes(keyword));
      if (!hasWorkContext) {
        console.log('STAR Generation - Detected gibberish: Too short (< 10 chars) with no work context');
        return true;
      }
    }
    
    // Rule 2: Only random letters/characters (no real words)
    // Pattern: Mostly random letter combinations (e.g., "asdfgh", "qwerty", "zxcvbn")
    const randomLetterPattern = /^[a-z]{2,}$/i;
    if (randomLetterPattern.test(trimmed) && trimmed.length < 20) {
      // Check if it's a known random string pattern
      const knownGibberish = ['asdf', 'qwerty', 'zxcvbn', 'hjkl', 'fghj', 'tyui', 'bnm', 'cvbn', 'xcvb'];
      if (knownGibberish.some(pattern => trimmed.toLowerCase().includes(pattern))) {
        console.log('STAR Generation - Detected gibberish: Random letter pattern');
        return true;
      }
      // Check if it's repeated characters (e.g., "aaaa", "tttt")
      const repeatedChars = /^(.)\1{2,}$/i;
      if (repeatedChars.test(trimmed)) {
        console.log('STAR Generation - Detected gibberish: Repeated characters');
        return true;
      }
    }
    
    // Rule 3: Single common word with no context (e.g., "today", "hello", "test")
    const singleWordPattern = /^[a-z]+$/i;
    if (singleWordPattern.test(trimmed)) {
      const commonWords = ['today', 'hello', 'test', 'hi', 'yes', 'no', 'ok', 'okay', 'thanks', 'thank', 'please'];
      if (commonWords.includes(trimmed.toLowerCase())) {
        console.log('STAR Generation - Detected gibberish: Single common word with no context');
        return true;
      }
    }
    
    // Rule 4: Very short with no meaningful structure
    if (trimmed.length < 15) {
      // Check if it has any structure (spaces, punctuation, capitalization)
      const hasStructure = trimmed.includes(' ') || trimmed.includes('.') || trimmed.includes(',') || 
                          trimmed.match(/[A-Z]/) !== null;
      if (!hasStructure) {
        console.log('STAR Generation - Detected gibberish: Very short with no structure');
        return true;
      }
    }
    
    return false;
  }
  
  /**
   * Pre-process experience content to remove appended feedback timestamps
   * 
   * Timestamps in appended feedback are metadata (when feedback was added), not part of the experience.
   * We remove them before sending to AI to prevent confusion.
   * 
   * Format: [STAR Section]\n[Timestamp]\nQ: [question]\nA: [answer]
   * Example: "TASK\nNov 22, 2025, 7:13 PM\nQ: What were the goals?\nA: tt"
   * 
   * @param {string} experience - Raw experience content with appended feedback
   * @returns {string} Cleaned experience content without timestamps
   */
  _cleanAppendedFeedbackTimestamps(experience) {
    if (!experience || typeof experience !== 'string') {
      return experience;
    }
    
    // Pattern: Section header (SITUATION/TASK/ACTION/RESULT) followed by timestamp, then Q: and A:
    // Timestamp format: "Nov 22, 2025, 7:13 PM" or "Dec 1, 2025 11:08 AM" (with or without comma after day)
    // We want to remove the timestamp line but keep the section header and Q:/A: content
    
    // Match pattern: [Section]\n[Timestamp]\nQ: ...\nA: ...
    // Replace with: [Section]\nQ: ...\nA: ...
    const cleaned = experience.replace(
      /(SITUATION|TASK|ACTION|RESULT)\n(?:[A-Z][a-z]{2}\s+\d{1,2},?\s+\d{4},?\s+\d{1,2}:\d{2}\s+(?:AM|PM))\n/g,
      '$1\n'
    );
    
    return cleaned;
  }
  
  /**
   * Generate STAR response using OpenAI API
   * 
   * @param {string} prompt - System prompt for STAR generation (optional, uses default if not provided)
   * @param {string} experience - User experience content (may include appended feedback)
   * @param {object} options - OpenAI-specific options
   * @param {string} [options.model='gpt-3.5-turbo'] - Model name
   * @param {number} [options.temperature=0.5] - Temperature setting (0-2)
   * @param {number} [options.maxTokens] - Maximum tokens in response
   * @returns {Promise<string>} Raw response string from OpenAI API
   * @throws {Error} If generation fails
   */
  async generateSTAR(prompt, experience, options = {}) {
    const client = this._initializeClient();
    
    // Use provided prompt or default STAR prompt
    const systemPrompt = prompt || this._getSTARPrompt();
    
    // Pre-process: Remove appended feedback timestamps (they're metadata, not experience content)
    const cleanedExperience = this._cleanAppendedFeedbackTimestamps(experience);
    
    // Log content preview for debugging
    const contentPreview = cleanedExperience.substring(0, 500);
    const hasAppendedFeedback = cleanedExperience.includes('Q:') || cleanedExperience.includes('A:');
    console.log('STAR Generation - Content preview (first 500 chars):', contentPreview);
    console.log('STAR Generation - Has appended feedback:', hasAppendedFeedback);
    console.log('STAR Generation - Timestamps removed:', experience !== cleanedExperience);
    
    // Early gibberish detection (code-level validation)
    // Note: We still send to AI for final judgment, but log detection for monitoring
    const isLikelyGibberish = this._isGibberish(cleanedExperience);
    if (isLikelyGibberish) {
      console.warn('STAR Generation - WARNING: Input appears to be gibberish. AI will make final determination.');
    }
    
    try {
      const response = await client.chat.completions.create({
        model: options.model || 'gpt-3.5-turbo',
        temperature: options.temperature !== undefined ? options.temperature : 0.5, // Balanced - reduces randomness while maintaining quality
        max_tokens: options.maxTokens,
        messages: [{
          role: 'system',
          content: systemPrompt
        }, {
          role: 'user',
          content: cleanedExperience
        }]
      });
      
      const fullResponse = response.choices[0].message.content;
      
      // Log AI response preview for debugging
      console.log('STAR Generation - AI response preview (first 2000 chars):', fullResponse.substring(0, 2000));
      console.log('STAR Generation - AI response length:', fullResponse.length);
      console.log('STAR Generation - Has FEEDBACK QUESTIONS section (5️⃣):', fullResponse.includes('5️⃣'));
      console.log('STAR Generation - Has FEEDBACK QUESTIONS section (text):', fullResponse.includes('FEEDBACK QUESTIONS'));
      console.log('STAR Generation - Has 6️⃣ FEEDBACK section:', fullResponse.includes('6️⃣'));
      
      return fullResponse;
    } catch (error) {
      // Re-throw error for handleError to process
      throw error;
    }
  }
  
  /**
   * Normalize OpenAI response to common STARResponse format
   * 
   * This method extracts all fields from the raw OpenAI response and
   * normalizes them to the standard STARResponse structure.
   * 
   * @param {string} rawResponse - Raw response string from OpenAI API
   * @returns {STARResponse} Normalized response object
   * @throws {Error} If normalization fails
   */
  normalizeResponse(rawResponse) {
    if (!rawResponse || typeof rawResponse !== 'string') {
      throw new Error('Invalid raw response: must be a non-empty string');
    }
    
    const fullResponse = rawResponse;
    
    /**
     * Helper function to extract content between delimiters
     * This is the primary, reliable method for parsing sections
     * @param {string} text - Full response text
     * @param {string} startDelimiter - Start delimiter (e.g., "===STAR_RESPONSE_START===")
     * @param {string} endDelimiter - End delimiter (e.g., "===STAR_RESPONSE_END===")
     * @returns {string|null} Extracted content, or null if delimiters not found
     */
    const extractBetweenDelimiters = (text, startDelimiter, endDelimiter) => {
      // Try primary format first (===)
      let startIndex = text.indexOf(startDelimiter);
      let endIndex = text.indexOf(endDelimiter);
      
      // If not found, try fallback format (###)
      if (startIndex < 0 || endIndex < 0) {
        const fallbackStart = startDelimiter.replace(/===/g, '###');
        const fallbackEnd = endDelimiter.replace(/===/g, '###');
        startIndex = text.indexOf(fallbackStart);
        endIndex = text.indexOf(fallbackEnd);
        
        if (startIndex >= 0 && endIndex > startIndex) {
          console.warn(`STAR Generation - Using fallback delimiter format (###) for ${startDelimiter}`);
          return text.substring(startIndex + fallbackStart.length, endIndex).trim();
        }
      }
      
      if (startIndex >= 0 && endIndex > startIndex) {
        // Extract only the FIRST occurrence to avoid repeated sections
        const content = text.substring(startIndex + startDelimiter.length, endIndex).trim();
        
        // Check for repeated sections (if content contains delimiter markers, it's likely duplicated)
        const hasRepeatedSections = content.includes('===STAR_RESPONSE_START===') || 
                                    content.includes('### STAR_RESPONSE_START ###') ||
                                    content.includes('===GRADES_START===');
        
        if (hasRepeatedSections) {
          console.warn('STAR Generation - WARNING: Detected repeated sections in response. Extracting first occurrence only.');
          // Extract only up to the first occurrence of the next section
          const firstRepeat = content.indexOf('===STAR_RESPONSE_START===');
          if (firstRepeat > 0) {
            return content.substring(0, firstRepeat).trim();
          }
        }
        
        return content.length > 0 ? content : null;
      }
      return null;
    };
    
    // ============================================
    // EXTRACT STAR RESPONSE (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let starResponseContent = extractBetweenDelimiters(
      fullResponse,
      '===STAR_RESPONSE_START===',
      '===STAR_RESPONSE_END==='
    );
    
    // If delimiters not found, fall back to regex-based extraction (backward compatibility)
    if (!starResponseContent) {
      console.log('STAR Generation - Delimiters not found, using fallback regex extraction');
      
      /**
       * Helper function to extract section text with multiple pattern attempts (FALLBACK)
       * @param {string} text - Full response text
       * @param {string} sectionName - Section name (SITUATION, TASK, ACTION, RESULT)
       * @param {string} nextSectionName - Next section name (for boundary detection)
       * @param {string} defaultValue - Default text if section not found
       * @returns {string} Extracted section text
       */
      const extractSection = (text, sectionName, nextSectionName, defaultValue) => {
      // Normalize section name for pattern matching
      const sectionUpper = sectionName.toUpperCase();
      const sectionTitle = sectionName.charAt(0).toUpperCase() + sectionName.slice(1).toLowerCase();
      const nextSectionUpper = nextSectionName ? nextSectionName.toUpperCase() : null;
      const nextSectionTitle = nextSectionName ? nextSectionName.charAt(0).toUpperCase() + nextSectionName.slice(1).toLowerCase() : null;
      
      // Pattern 1: With emoji marker and exact format (SITUATION:, TASK:, etc.)
      const patterns = [
        // Pattern 1: Emoji + SITUATION: (exact format)
        new RegExp(`1️⃣\\s*STAR RESPONSE\\s*\\n\\n${sectionUpper}:\\s*(.+?)\\n\\n${nextSectionUpper}:`, 'is'),
        // Pattern 2: SITUATION: (all caps, no emoji)
        new RegExp(`${sectionUpper}:\\s*(.+?)(?=\\n\\n?${nextSectionUpper}:|$)`, 'is'),
        // Pattern 3: Situation: (title case, no emoji)
        new RegExp(`${sectionTitle}:\\s*(.+?)(?=\\n\\n?${nextSectionTitle}:|$)`, 'is'),
        // Pattern 4: **SITUATION:** (bold, all caps)
        new RegExp(`\\*\\*${sectionUpper}:\\*\\*\\s*(.+?)(?=\\n\\n?\\*\\*${nextSectionUpper}:|$)`, 'is'),
        // Pattern 5: **Situation:** (bold, title case)
        new RegExp(`\\*\\*${sectionTitle}:\\*\\*\\s*(.+?)(?=\\n\\n?\\*\\*${nextSectionTitle}:|$)`, 'is'),
        // Pattern 6: **TASK:** (bold, all caps - handle broken markdown)
        new RegExp(`\\*\\*${sectionUpper}\\*\\*\\s*(.+?)(?=\\n\\n?\\*\\*${nextSectionUpper}|$)`, 'is'),
        // Pattern 7: Loose pattern - any header format
        new RegExp(`(?:\\*\\*)?${sectionUpper}:?(?:\\*\\*)?\\s*(.+?)(?=\\n\\n?(?:\\*\\*)?${nextSectionUpper}:?(?:\\*\\*)?|$)`, 'is'),
      ];
      
      // Try each pattern in order
      for (const pattern of patterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          let extracted = match[1].trim();
          // Remove any stray markdown markers at the start
          extracted = extracted.replace(/^\*\*+\s*/, '').trim();
          // Remove instruction text that might leak in
          extracted = extracted.replace(/CRITICAL:.*$/i, '').trim();
          if (extracted.length > 0) {
            return extracted;
          }
        }
      }
      
      // If no pattern matched, return default
      return defaultValue;
    };
    
    /**
     * Helper function to extract Result section (special handling for end of response)
     * @param {string} text - Full response text
     * @returns {string} Extracted Result text
     */
    const extractResultSection = (text) => {
      const defaultValue = 'Needs more detail about the outcome or impact';
      
      // Find Result section and extract content, stopping at ANY section marker
      // Section markers: **GRADES**, **RUBRIC**, **FEEDBACK**, **SKILLS**, emoji sections, etc.
      const sectionBoundaryPattern = /(\n\n\*\*GRADES?\*\*|\n\n\*\*RUBRIC|\n\n\*\*FEEDBACK|\n\n\*\*SKILLS|\n\nGRADES?\s*$|\n\nRUBRIC|\n\nFEEDBACK|\n\nSKILLS|\n\n[2-7]️⃣|\n\nOVERALL\s+GRADE:|\n\n\(?\d+\)\s*[STAR]:|\n\n===FEEDBACK_QUESTIONS_START===)/i;
      
      // Pattern 1: RESULT: ... (stops at section boundary)
      const resultPatterns = [
        // Pattern 1: RESULT: ... (stops at section boundary - more specific patterns)
        new RegExp(`RESULT:\\s*(.+?)(?=\\n\\n\\*\\*GRADES?\\*\\*|\\n\\n\\*\\*RUBRIC|\\n\\n\\*\\*FEEDBACK|\\n\\n\\*\\*SKILLS|\\n\\nGRADES?\\s*$|\\n\\nRUBRIC|\\n\\nFEEDBACK|\\n\\nSKILLS|\\n\\n[2-7]️⃣|\\n\\nOVERALL\\s+GRADE:|\\n\\n\\(?\\d+\\)\\s*[STAR]:|\\n\\n===FEEDBACK_QUESTIONS_START===|$)`, 'is'),
        // Pattern 2: Result: ... (title case)
        new RegExp(`Result:\\s*(.+?)(?=\\n\\n\\*\\*GRADES?\\*\\*|\\n\\n\\*\\*RUBRIC|\\n\\n\\*\\*FEEDBACK|\\n\\n\\*\\*SKILLS|\\n\\nGRADES?\\s*$|\\n\\nRUBRIC|\\n\\nFEEDBACK|\\n\\nSKILLS|\\n\\n[2-7]️⃣|\\n\\nOVERALL\\s+GRADE:|\\n\\n\\(?\\d+\\)\\s*[STAR]:|\\n\\n===FEEDBACK_QUESTIONS_START===|$)`, 'is'),
        // Pattern 3: **RESULT:** ... (bold, all caps)
        new RegExp(`\\*\\*RESULT:\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*GRADES?\\*\\*|\\n\\n\\*\\*RUBRIC|\\n\\n\\*\\*FEEDBACK|\\n\\n\\*\\*SKILLS|\\n\\nGRADES?\\s*$|\\n\\nRUBRIC|\\n\\nFEEDBACK|\\n\\nSKILLS|\\n\\n[2-7]️⃣|\\n\\nOVERALL\\s+GRADE:|\\n\\n\\(?\\d+\\)\\s*[STAR]:|\\n\\n===FEEDBACK_QUESTIONS_START===|$)`, 'is'),
        // Pattern 4: **Result:** ... (bold, title case)
        new RegExp(`\\*\\*Result:\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*GRADES?\\*\\*|\\n\\n\\*\\*RUBRIC|\\n\\n\\*\\*FEEDBACK|\\n\\n\\*\\*SKILLS|\\n\\nGRADES?\\s*$|\\n\\nRUBRIC|\\n\\nFEEDBACK|\\n\\nSKILLS|\\n\\n[2-7]️⃣|\\n\\nOVERALL\\s+GRADE:|\\n\\n\\(?\\d+\\)\\s*[STAR]:|\\n\\n===FEEDBACK_QUESTIONS_START===|$)`, 'is'),
        // Pattern 5: **RESULT** ... (broken markdown - missing colon)
        new RegExp(`\\*\\*RESULT\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*GRADES?\\*\\*|\\n\\n\\*\\*RUBRIC|\\n\\n\\*\\*FEEDBACK|\\n\\n\\*\\*SKILLS|\\n\\nGRADES?\\s*$|\\n\\nRUBRIC|\\n\\nFEEDBACK|\\n\\nSKILLS|\\n\\n[2-7]️⃣|\\n\\nOVERALL\\s+GRADE:|\\n\\n\\(?\\d+\\)\\s*[STAR]:|\\n\\n===FEEDBACK_QUESTIONS_START===|$)`, 'is'),
      ];
      
      // Try each pattern
      for (const pattern of resultPatterns) {
        const match = text.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          let extracted = match[1].trim();
          // Remove any stray markdown markers at the start
          extracted = extracted.replace(/^\*\*+\s*/, '').trim();
          // Remove instruction text that might leak in
          extracted = extracted.replace(/CRITICAL:.*$/i, '').trim();
          
          // Additional safety: Check if extracted content contains section markers
          // If so, truncate at the first section marker
          const boundaryMatch = extracted.match(sectionBoundaryPattern);
          if (boundaryMatch && boundaryMatch.index !== undefined) {
            extracted = extracted.substring(0, boundaryMatch.index).trim();
          }
          
          if (extracted.length > 0) {
            return extracted;
          }
        }
      }
      
      return defaultValue;
    };
    
      // Extract each section using improved extraction logic (FALLBACK)
      const situationText = extractSection(fullResponse, 'SITUATION', 'TASK', 'Needs more detail about the context');
      const taskText = extractSection(fullResponse, 'TASK', 'ACTION', 'Needs more detail about what needed to be accomplished');
      const actionText = extractSection(fullResponse, 'ACTION', 'RESULT', 'Needs more detail about the actions taken');
      const resultText = extractResultSection(fullResponse);
      
      // Build STAR response with consistent formatting
      starResponseContent = `**Situation:** ${situationText}\n\n**Task:** ${taskText}\n\n**Action:** ${actionText}\n\n**Result:** ${resultText}`;
    }
    
    // Parse STAR sections from extracted content
    // Extract Situation, Task, Action, Result from the STAR response content
    const extractSTARSection = (content, sectionName) => {
      // Case-sensitive patterns to avoid duplicates
      const patterns = [
        // Pattern 1: Exact match (case-sensitive for section name)
        new RegExp(`${sectionName}:\\s*(.+?)(?=\\n\\n(?:TASK|ACTION|RESULT|Task|Action|Result):|$)`, 'is'),
        // Pattern 2: Bold format
        new RegExp(`\\*\\*${sectionName}:\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*(?:TASK|ACTION|RESULT|Task|Action|Result):|$)`, 'is'),
        // Pattern 3: Bold without colon
        new RegExp(`\\*\\*${sectionName}\\*\\*\\s*(.+?)(?=\\n\\n\\*\\*(?:TASK|ACTION|RESULT|Task|Action|Result)|$)`, 'is'),
      ];
      
      for (const pattern of patterns) {
        const match = content.match(pattern);
        if (match && match[1] && match[1].trim().length > 0) {
          let extracted = match[1].trim();
          // Remove any duplicate section headers that might be inside
          extracted = extracted.replace(new RegExp(`\\n\\n(?:${sectionName}|TASK|ACTION|RESULT|Task|Action|Result):`, 'gi'), '');
          return extracted;
        }
      }
      
      return null;
    };
    
    // Extract sections - try uppercase first, then title case (to avoid duplicates)
    let situationText = extractSTARSection(starResponseContent, 'SITUATION') || 
                        extractSTARSection(starResponseContent, 'Situation') ||
                        'Needs more detail about the context';
    
    // For Task, only extract once (uppercase preferred, fallback to title case)
    let taskText = extractSTARSection(starResponseContent, 'TASK');
    if (!taskText) {
      taskText = extractSTARSection(starResponseContent, 'Task') || 'Needs more detail about what needed to be accomplished';
    } else {
      // If we found uppercase TASK, make sure we didn't also extract title case Task
      // Remove any duplicate Task sections
      taskText = taskText.split(/\n\n(?:Task|TASK):/)[0].trim() || 'Needs more detail about what needed to be accomplished';
    }
    
    let actionText = extractSTARSection(starResponseContent, 'ACTION') || 
                     extractSTARSection(starResponseContent, 'Action') ||
                     'Needs more detail about the actions taken';
    let resultText = extractSTARSection(starResponseContent, 'RESULT') || 
                     extractSTARSection(starResponseContent, 'Result') ||
                     'Needs more detail about the outcome or impact';
    
    // Clean up extracted text to remove any duplicate section headers
    const cleanSection = (text) => {
      if (!text) return text;
      // Remove any duplicate section headers that might be inside the text
      return text
        .replace(/\n\n(?:TASK|Task|ACTION|Action|RESULT|Result|SITUATION|Situation):\s*/gi, '')
        .replace(/\*\*(?:TASK|Task|ACTION|Action|RESULT|Result|SITUATION|Situation):\*\*\s*/gi, '')
        .trim();
    };
    
    situationText = cleanSection(situationText);
    taskText = cleanSection(taskText);
    actionText = cleanSection(actionText);
    resultText = cleanSection(resultText);
    
    // Build final STAR response with consistent formatting
    let starResponse = `**Situation:** ${situationText}\n\n**Task:** ${taskText}\n\n**Action:** ${actionText}\n\n**Result:** ${resultText}`;
    
    // Normalize headers to consistent format and remove duplicates
    starResponse = starResponse
      .replace(/\*\*SITUATION:\*\*/gi, '**Situation:**')
      .replace(/\*\*TASK:\*\*/gi, '**Task:**')
      .replace(/\*\*ACTION:\*\*/gi, '**Action:**')
      .replace(/\*\*RESULT:\*\*/gi, '**Result:**')
      .replace(/\*\*SITUATION\*\*/gi, '**Situation:**')
      .replace(/\*\*TASK\*\*/gi, '**Task:**')
      .replace(/\*\*ACTION\*\*/gi, '**Action:**')
      .replace(/\*\*RESULT\*\*/gi, '**Result:**')
      // Remove duplicate Task sections (both "TASK:" and "Task:")
      .replace(/\*\*Task:\*\*[\s\S]*?\*\*Task:\*\*/gi, '**Task:**')
      .replace(/\*\*TASK:\*\*[\s\S]*?\*\*Task:\*\*/gi, '**Task:**')
      .replace(/\*\*Task:\*\*[\s\S]*?\*\*TASK:\*\*/gi, '**Task:**');
    
    // Aggressive cleanup: Remove ANY content that appears after the Result section
    // This ensures we only display Situation, Task, Action, Result - nothing else
    // Handle various delimiter formats and section markers
    starResponse = starResponse
      // Remove everything after Result section markers (delimiters, GRADES, etc.)
      .replace(/(\*\*Result:\*\*[^\n]+(?:\n[^\n]+)*?)(\n\n(?:===|###|GRADES|RUBRIC|FEEDBACK|SKILLS|OVERALL|S:\s*[A-F]|T:\s*[A-F]|A:\s*[A-F]|R:\s*[A-F])[\s\S]*)$/i, '$1')
      // Remove any delimiter markers that leaked in
      .replace(/===STAR_RESPONSE_START===|===STAR_RESPONSE_END===|### STAR_RESPONSE_START ###|### STAR_RESPONSE_END ###/gi, '')
      .replace(/===GRADES_START===|===GRADES_END===|### GRADES_START ###|### GRADES_END ###/gi, '')
      .replace(/===RUBRIC_EVALUATION_START===|===RUBRIC_EVALUATION_END===/gi, '')
      .replace(/===FEEDBACK_QUESTIONS_START===|===FEEDBACK_QUESTIONS_END===/gi, '')
      // Remove any remaining section markers
      .replace(/\n\n(GRADES|RUBRIC|FEEDBACK|SKILLS|OVERALL)[\s\S]*$/i, '')
      // Remove any markdown separators
      .replace(/\n+\*{3,}[\s\S]*$/i, '')
      .replace(/\n+-{3,}[\s\S]*$/i, '')
      // Final trim
      .trim();
    
    // ============================================
    // EXTRACT GRADES (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let gradesContent = extractBetweenDelimiters(
      fullResponse,
      '===GRADES_START===',
      '===GRADES_END==='
    );
    
    // Extract overall score and section scores
    let overallScore = 'N/A';
    let sectionScores = {
      situation: 'N/A',
      task: 'N/A',
      action: 'N/A',
      result: 'N/A'
    };
    
    if (gradesContent) {
      // Extract from delimited content
      const overallScoreMatch = gradesContent.match(/OVERALL GRADE:\s*([A-F][+-]?|N\/A)/i);
      overallScore = overallScoreMatch ? overallScoreMatch[1] : 'N/A';
      
      const situationMatch = gradesContent.match(/S:\s*([A-F][+-]?|N\/A)/i);
      const taskMatch = gradesContent.match(/T:\s*([A-F][+-]?|N\/A)/i);
      const actionMatch = gradesContent.match(/A:\s*([A-F][+-]?|N\/A)/i);
      const resultMatch = gradesContent.match(/R:\s*([A-F][+-]?|N\/A)/i);
      
      sectionScores = {
        situation: situationMatch ? situationMatch[1] : 'N/A',
        task: taskMatch ? taskMatch[1] : 'N/A',
        action: actionMatch ? actionMatch[1] : 'N/A',
        result: resultMatch ? resultMatch[1] : 'N/A'
      };
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - GRADES delimiters not found, using fallback regex');
      const overallScoreMatch = fullResponse.match(/OVERALL GRADE:\s*([A-F][+-]?|N\/A)/i);
      overallScore = overallScoreMatch ? overallScoreMatch[1] : 'N/A';
      
      const situationMatch = fullResponse.match(/S:\s*([A-F][+-]?|N\/A)/i);
      const taskMatch = fullResponse.match(/T:\s*([A-F][+-]?|N\/A)/i);
      const actionMatch = fullResponse.match(/A:\s*([A-F][+-]?|N\/A)/i);
      const resultMatch = fullResponse.match(/R:\s*([A-F][+-]?|N\/A)/i);
      
      sectionScores = {
        situation: situationMatch ? situationMatch[1] : 'N/A',
        task: taskMatch ? taskMatch[1] : 'N/A',
        action: actionMatch ? actionMatch[1] : 'N/A',
        result: resultMatch ? resultMatch[1] : 'N/A'
      };
    }
    
    // If ANY section score is N/A, overall grade must also be N/A
    if (Object.values(sectionScores).includes('N/A')) {
      overallScore = 'N/A';
    }
    
    // ============================================
    // EXTRACT RUBRIC EVALUATION (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let rubricContent = extractBetweenDelimiters(
      fullResponse,
      '===RUBRIC_EVALUATION_START===',
      '===RUBRIC_EVALUATION_END==='
    );
    
    let rubricScores = {
      clarity: 'N/A',
      relevance: 'N/A',
      ownership: 'N/A',
      impact: 'N/A',
      completeness: 'N/A',
      strategic: 'N/A',
      communication: 'N/A'
    };
    
    if (rubricContent) {
      // Extract rubric scores from delimited content
      const clarityMatch = rubricContent.match(/1\.\s*Clarity\s*&\s*Conciseness:\s*([A-F][+-]?|N\/A)/i);
      const relevanceMatch = rubricContent.match(/2\.\s*Relevance:\s*([A-F][+-]?|N\/A)/i);
      const ownershipMatch = rubricContent.match(/3\.\s*Ownership\s*&\s*Initiative:\s*([A-F][+-]?|N\/A)/i);
      const impactMatch = rubricContent.match(/4\.\s*Impact\s*&\s*Outcome:\s*([A-F][+-]?|N\/A)/i);
      const completenessMatch = rubricContent.match(/5\.\s*Completeness:\s*([A-F][+-]?|N\/A)/i);
      const strategicMatch = rubricContent.match(/6\.\s*Strategic\s*Thinking\s*\/\s*Problem\s*Framing:\s*([A-F][+-]?|N\/A)/i);
      const communicationMatch = rubricContent.match(/7\.\s*Communication\s*&\s*Influence:\s*([A-F][+-]?|N\/A)/i);
      
      rubricScores = {
        clarity: clarityMatch ? clarityMatch[1] : 'N/A',
        relevance: relevanceMatch ? relevanceMatch[1] : 'N/A',
        ownership: ownershipMatch ? ownershipMatch[1] : 'N/A',
        impact: impactMatch ? impactMatch[1] : 'N/A',
        completeness: completenessMatch ? completenessMatch[1] : 'N/A',
        strategic: strategicMatch ? strategicMatch[1] : 'N/A',
        communication: communicationMatch ? communicationMatch[1] : 'N/A'
      };
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - RUBRIC_EVALUATION delimiters not found, using fallback regex');
      const clarityMatch = fullResponse.match(/1\.\s*Clarity\s*&\s*Conciseness:\s*([A-F][+-]?|N\/A)/i);
      const relevanceMatch = fullResponse.match(/2\.\s*Relevance:\s*([A-F][+-]?|N\/A)/i);
      const ownershipMatch = fullResponse.match(/3\.\s*Ownership\s*&\s*Initiative:\s*([A-F][+-]?|N\/A)/i);
      const impactMatch = fullResponse.match(/4\.\s*Impact\s*&\s*Outcome:\s*([A-F][+-]?|N\/A)/i);
      const completenessMatch = fullResponse.match(/5\.\s*Completeness:\s*([A-F][+-]?|N\/A)/i);
      const strategicMatch = fullResponse.match(/6\.\s*Strategic\s*Thinking\s*\/\s*Problem\s*Framing:\s*([A-F][+-]?|N\/A)/i);
      const communicationMatch = fullResponse.match(/7\.\s*Communication\s*&\s*Influence:\s*([A-F][+-]?|N\/A)/i);
      
      rubricScores = {
        clarity: clarityMatch ? clarityMatch[1] : 'N/A',
        relevance: relevanceMatch ? relevanceMatch[1] : 'N/A',
        ownership: ownershipMatch ? ownershipMatch[1] : 'N/A',
        impact: impactMatch ? impactMatch[1] : 'N/A',
        completeness: completenessMatch ? completenessMatch[1] : 'N/A',
        strategic: strategicMatch ? strategicMatch[1] : 'N/A',
        communication: communicationMatch ? communicationMatch[1] : 'N/A'
      };
    }
    
    // ============================================
    // EXTRACT RUBRIC DIAGNOSTIC SUMMARY (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let diagnosticContent = extractBetweenDelimiters(
      fullResponse,
      '===RUBRIC_DIAGNOSTIC_SUMMARY_START===',
      '===RUBRIC_DIAGNOSTIC_SUMMARY_END==='
    );
    
    let topStrengths = null;
    let improvementAreas = null;
    let rubricDiagnosticSummary = null;
    
    if (diagnosticContent) {
      const strengthsMatch = diagnosticContent.match(/Top Strengths:\s*(.+?)(?=\n\nImprovement Areas:|$)/is);
      const improvementMatch = diagnosticContent.match(/Improvement Areas:\s*(.+?)(?=\n\nSummary:|$)/is);
      const summaryMatch = diagnosticContent.match(/Summary:\s*(.+?)$/is);
      
      topStrengths = strengthsMatch ? strengthsMatch[1].trim() : null;
      improvementAreas = improvementMatch ? improvementMatch[1].trim() : null;
      rubricDiagnosticSummary = summaryMatch ? summaryMatch[1].trim() : null;
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - RUBRIC_DIAGNOSTIC_SUMMARY delimiters not found, using fallback regex');
      const strengthsMatch = fullResponse.match(/Top Strengths:\s*(.+?)(?=\n\nImprovement Areas:|$)/is);
      const improvementMatch = fullResponse.match(/Improvement Areas:\s*(.+?)(?=\n\nSummary:|$)/is);
      const summaryMatch = fullResponse.match(/Summary:\s*(.+?)(?=\n\n(?:5️⃣|FEEDBACK QUESTIONS|6️⃣|FEEDBACK)|$)/is);
      
      topStrengths = strengthsMatch ? strengthsMatch[1].trim() : null;
      improvementAreas = improvementMatch ? improvementMatch[1].trim() : null;
      rubricDiagnosticSummary = summaryMatch ? summaryMatch[1].trim() : null;
    }
    
    // ============================================
    // EXTRACT FEEDBACK QUESTIONS (Primary: Delimiters, Fallback: Regex)
    // ============================================
    console.log('STAR Generation - Checking for FEEDBACK_QUESTIONS section...');
    console.log('STAR Generation - Has FEEDBACK_QUESTIONS_START:', fullResponse.includes('===FEEDBACK_QUESTIONS_START==='));
    console.log('STAR Generation - Has FEEDBACK_QUESTIONS_END:', fullResponse.includes('===FEEDBACK_QUESTIONS_END==='));
    
    let questionsContent = extractBetweenDelimiters(
      fullResponse,
      '===FEEDBACK_QUESTIONS_START===',
      '===FEEDBACK_QUESTIONS_END==='
    );
    
    // Clean up questions content - remove instruction text but preserve actual questions
    // The AI sometimes includes the prompt instructions in the output - remove those
    if (questionsContent) {
      // Use line-by-line filtering to preserve question lines while removing instruction text
      const lines = questionsContent.split('\n');
      const cleanedLines = [];
      
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i].trim();
        
        // Skip empty lines (but preserve structure)
        if (!line) {
          if (cleanedLines.length > 0 && cleanedLines[cleanedLines.length - 1] !== '') {
            cleanedLines.push('');
          }
          continue;
        }
        
        // ALWAYS KEEP: Section headers (SITUATION, TASK, ACTION, RESULT)
        if (/^(SITUATION|TASK|ACTION|RESULT):?\s*$/i.test(line)) {
          cleanedLines.push(line);
          continue;
        }
        
        // ALWAYS KEEP: Question lines (start with bullet, number, or end with ?)
        if (line.match(/^[-*•]\s+|^\d+\.\s+|.*\?$/)) {
          cleanedLines.push(line);
          continue;
        }
        
        // SKIP: Instruction text patterns (even if they start with bullets)
        if (line.match(/🔴 CRITICAL|MANDATORY|NEVER SKIP|Generate 2-4|Focus on questions|Format \(YOU MUST|Each question should be|Example GOOD|Example BAD|A complete, actionable question|Specific to the gaps|Tailored to the STAR component|NOT generic placeholder|NOT instruction text/i)) {
          continue; // Skip this instruction line
        }
        
        // SKIP: Lines that are clearly instruction text even if they start with "- "
        // These are guidelines from the prompt, not actual questions
        if (line.match(/^- (A complete|Specific to|Tailored to|NOT generic|NOT instruction)/i)) {
          continue; // Skip instruction text that looks like a question
        }
        
        // SKIP: Lines without "?" that are clearly instruction text (not questions)
        // Real questions should end with "?" unless they're very long
        if (!line.endsWith('?') && line.match(/^(A complete|Specific to|Tailored to|NOT)/i) && line.length < 80) {
          continue; // Skip instruction text
        }
        
        // For other lines, keep them if they're substantial (might be part of a multi-line question)
        if (line.length > 15) {
          cleanedLines.push(line);
        }
      }
      
      questionsContent = cleanedLines.join('\n')
        .replace(/\n{3,}/g, '\n\n')
        .trim();
      
      // Log what we have after cleanup for debugging
      console.log('STAR Generation - Questions content after cleanup (first 1000 chars):', questionsContent.substring(0, 1000));
    }
    
    let feedbackQuestions = [];
    
    if (!questionsContent) {
      console.warn('STAR Generation - WARNING: FEEDBACK_QUESTIONS section not found with delimiters!');
      console.warn('STAR Generation - Response preview (last 2000 chars):', fullResponse.substring(Math.max(0, fullResponse.length - 2000)));
    }
    
    if (questionsContent) {
      console.log('STAR Generation - Questions content found (first 500 chars):', questionsContent.substring(0, 500));
      
      // Extract questions from delimited content
      // SYSTEMATIC APPROACH: Consistent extraction and filtering for all components
      // Design principles: Flexible, Scalable, Adaptable, Consistent
      const extractQuestionsForComponent = (componentName, questionsText) => {
        // Normalize component name variations (SITUATION, Situation, SITUATION:, etc.)
        const normalizedComponentName = componentName.toUpperCase().replace(/:/g, '');
        
        // CONSISTENT PATTERN: Same regex for all components
        // Match component header, then content until next component or end marker
        // Stop at: next component header, end delimiter, or instruction text markers
        const stopPattern = `(?:TASK|ACTION|RESULT|SITUATION):|===FEEDBACK_QUESTIONS_END===|🔴 CRITICAL:|Each question should be|Example GOOD|Example BAD|$`;
        
        // Try primary pattern first (with newline before component)
        const componentRegex = new RegExp(
          `(?:^|\\n)${normalizedComponentName}:?\\s*\\n([\\s\\S]+?)(?=\\n\\n?(?:${stopPattern}))`, 
          'i'
        );
        let sectionMatch = questionsText.match(componentRegex);
        
        // Fallback: Try without requiring newline before component (for cases where component is at start of text)
        if (!sectionMatch) {
          const fallbackRegex = new RegExp(
            `${normalizedComponentName}:?\\s*\\n([\\s\\S]+?)(?=\\n\\n?(?:${stopPattern}))`, 
            'i'
          );
          sectionMatch = questionsText.match(fallbackRegex);
        }
        
        // Fallback 2: Try matching with more flexible whitespace
        if (!sectionMatch) {
          const flexibleRegex = new RegExp(
            `${normalizedComponentName}:?\\s*[\\r\\n]+([\\s\\S]+?)(?=[\\r\\n]+(?:${stopPattern})|$)`, 
            'i'
          );
          sectionMatch = questionsText.match(flexibleRegex);
        }
        
        if (!sectionMatch) {
          // Debug: Show what we're searching for and a sample of the text
          const searchPattern = normalizedComponentName;
          const sampleText = questionsText.substring(0, 500);
          console.log(`STAR Generation - No section found for ${componentName}. Searching for: "${searchPattern}". Sample text:`, sampleText);
          return [];
        }
        
        const sectionText = sectionMatch[1];
        
        // CONSISTENT PARSING: Same logic for all components
        const lines = sectionText.split(/\r?\n/);
        const questions = [];
        
        // Instruction text patterns to filter out (applied consistently)
        const instructionPatterns = [
          /^A complete, actionable question/i,
          /^Specific to the gaps/i,
          /^Tailored to the STAR component/i,
          /^NOT generic placeholder/i,
          /^NOT instruction text/i,
          /^Generate.*question/i,
          /^Each question should/i
        ];
        
        for (const line of lines) {
          const trimmed = line.trim();
          
          // Skip empty lines
          if (!trimmed) continue;
          
          // CONSISTENT EXTRACTION: Support multiple bullet formats
          let question = null;
          
          if (trimmed.startsWith('- ')) {
            question = trimmed.substring(2).trim();
          } else if (trimmed.startsWith('* ')) {
            question = trimmed.substring(2).trim();
          } else if (trimmed.startsWith('• ')) {
            question = trimmed.substring(2).trim();
          } else if (/^\d+\.\s+/.test(trimmed)) {
            question = trimmed.replace(/^\d+\.\s+/, '').trim();
          } else if (trimmed.endsWith('?') && trimmed.length > 10) {
            question = trimmed;
          }
          
          if (!question || question.length === 0) continue;
          
          // Clean formatting artifacts
          question = question.replace(/^[-*•]\s*/, '').replace(/^\d+\.\s*/, '').trim();
          if (question.length === 0) continue;
          
          // CONSISTENT FILTERING: Apply same validation rules to all components
          // 1. Skip instruction text
          const isInstruction = instructionPatterns.some(pattern => pattern.test(question));
          if (isInstruction) {
            console.log(`STAR Generation - Skipping instruction text in ${componentName}: ${question.substring(0, 50)}`);
            continue;
          }
          
          // 2. Must end with "?" or be substantial question-like text
          if (!question.endsWith('?') && question.length < 30) {
            continue; // Too short and no question mark = likely not a question
          }
          
          // 3. Must be substantial (min length) and question-like
          if (question.length > 10 && (question.endsWith('?') || (question.length > 30 && /^(what|how|can you|did you|were|who|when|where|why)/i.test(question)))) {
            questions.push(question);
          }
        }
        
        if (questions.length === 0) {
          console.log(`STAR Generation - No questions extracted for ${componentName}. Section preview:`, sectionText.substring(0, 200));
        }
        
        return questions;
      };
      
      const situationQuestions = extractQuestionsForComponent('SITUATION', questionsContent);
      const taskQuestions = extractQuestionsForComponent('TASK', questionsContent);
      const actionQuestions = extractQuestionsForComponent('ACTION', questionsContent);
      const resultQuestions = extractQuestionsForComponent('RESULT', questionsContent);
      
      console.log('STAR Generation - Extracted questions:', {
        situation: situationQuestions.length,
        task: taskQuestions.length,
        action: actionQuestions.length,
        result: resultQuestions.length
      });
      
      // Debug: Log actual extracted questions if any found
      if (situationQuestions.length > 0) {
        console.log('STAR Generation - Sample situation questions:', situationQuestions.slice(0, 2));
      } else {
        console.warn('STAR Generation - WARNING: No situation questions extracted!');
      }
      if (taskQuestions.length > 0) {
        console.log('STAR Generation - Sample task questions:', taskQuestions.slice(0, 2));
      } else {
        console.warn('STAR Generation - WARNING: No task questions extracted!');
      }
      if (actionQuestions.length > 0) {
        console.log('STAR Generation - Sample action questions:', actionQuestions.slice(0, 2));
      } else {
        console.warn('STAR Generation - WARNING: No action questions extracted!');
      }
      if (resultQuestions.length > 0) {
        console.log('STAR Generation - Sample result questions:', resultQuestions.slice(0, 2));
      } else {
        console.warn('STAR Generation - WARNING: No result questions extracted!');
      }
      
      // Add extracted questions for each component
      situationQuestions.forEach(q => {
        feedbackQuestions.push({ component: 'situation', question: q });
      });
      taskQuestions.forEach(q => {
        feedbackQuestions.push({ component: 'task', question: q });
      });
      actionQuestions.forEach(q => {
        feedbackQuestions.push({ component: 'action', question: q });
      });
      resultQuestions.forEach(q => {
        feedbackQuestions.push({ component: 'result', question: q });
      });
      
      // ALWAYS add default question as the last question for each component
      // This gives users an opportunity to add their own details
      ['situation', 'task', 'action', 'result'].forEach(component => {
        feedbackQuestions.push({
          component: component,
          question: 'Add your question and/or any additional details'
        });
      });
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - FEEDBACK_QUESTIONS delimiters not found, using fallback regex');
      
      // Try fallback patterns
      let questionsSectionMatch = fullResponse.match(/5️⃣\s*FEEDBACK QUESTIONS\s*\n([\s\S]+?)(?=\n\n6️⃣|$)/is);
      
      if (!questionsSectionMatch) {
        questionsSectionMatch = fullResponse.match(/\*\*FEEDBACK QUESTIONS\*\*\s*\n([\s\S]+?)(?=\n\n(?:6️⃣|\*\*FEEDBACK|\*\*SKILLS|$))/is);
      }
      
      if (!questionsSectionMatch) {
        questionsSectionMatch = fullResponse.match(/\*\*FEEDBACK QUESTIONS\*\*\s*\n([\s\S]+)/is);
      }
      
      if (questionsSectionMatch && questionsSectionMatch[1]) {
        const questionsText = questionsSectionMatch[1];
        // Use the same flexible line-by-line extraction logic (provider-agnostic)
        const extractQuestionsForComponent = (componentName, questionsText) => {
          const normalizedComponentName = componentName.toUpperCase().replace(/:/g, '');
          const componentRegex = new RegExp(
            `(?:^|\\n)${normalizedComponentName}:?\\s*\\n([\\s\\S]+?)(?=\\n\\n?(?:[A-Z]+:|===|$)`, 
            'i'
          );
          const sectionMatch = questionsText.match(componentRegex);
          
          if (!sectionMatch) {
            return [];
          }
          
          const sectionText = sectionMatch[1];
          const lines = sectionText.split(/\r?\n/);
          const questions = [];
          
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed) continue;
            
            let question = null;
            if (trimmed.startsWith('- ')) {
              question = trimmed.substring(2).trim();
            } else if (trimmed.startsWith('* ')) {
              question = trimmed.substring(2).trim();
            } else if (trimmed.startsWith('• ')) {
              question = trimmed.substring(2).trim();
            } else if (/^\d+\.\s+/.test(trimmed)) {
              question = trimmed.replace(/^\d+\.\s+/, '').trim();
            } else if (trimmed.endsWith('?') && trimmed.length > 10) {
              question = trimmed;
            }
            
            if (question && question.length > 0) {
              question = question
                .replace(/^[-*•]\s*/, '')
                .replace(/^\d+\.\s*/, '')
                .trim();
              
              // Skip placeholder/template text - these are not real questions
              const isPlaceholder = /\[Question \d+|\[.*specific to.*gaps\]|\[.*Generate.*REAL|Generate a REAL|placeholder|template/i.test(question);
              if (isPlaceholder) {
                console.log(`STAR Generation - Skipping placeholder question: ${question.substring(0, 50)}`);
                continue; // Skip this line, it's a placeholder
              }
              
              // Skip instruction text that got extracted as a question
              // These are guidelines from the prompt that the AI copied
              const isInstruction = /Generate.*question|NOT the placeholder|instruction format|A complete, actionable question|Specific to the gaps|Tailored to the STAR component|NOT generic placeholder|NOT instruction text/i.test(question);
              if (isInstruction) {
                console.log(`STAR Generation - Skipping instruction text: ${question.substring(0, 50)}`);
                continue;
              }
              
              // Skip if it doesn't end with "?" (real questions should end with ?)
              // But allow longer text that might be a question without the ? if it's substantial
              if (!question.endsWith('?') && question.length < 30) {
                console.log(`STAR Generation - Skipping non-question text: ${question.substring(0, 50)}`);
                continue;
              }
              
              // Only add if it's a real question (ends with ? or is substantial and looks like a question)
              if (question.length > 10 && (question.endsWith('?') || (question.length > 30 && /^(what|how|can you|did you|were|who|when|where|why)/i.test(question)))) {
                questions.push(question);
              }
            }
          }
          
          return questions;
        };
        
        const situationQuestions = extractQuestionsForComponent('SITUATION', questionsText);
        const taskQuestions = extractQuestionsForComponent('TASK', questionsText);
        const actionQuestions = extractQuestionsForComponent('ACTION', questionsText);
        const resultQuestions = extractQuestionsForComponent('RESULT', questionsText);
        
        situationQuestions.forEach(q => {
          feedbackQuestions.push({ component: 'situation', question: q });
        });
        taskQuestions.forEach(q => {
          feedbackQuestions.push({ component: 'task', question: q });
        });
        actionQuestions.forEach(q => {
          feedbackQuestions.push({ component: 'action', question: q });
        });
        resultQuestions.forEach(q => {
          feedbackQuestions.push({ component: 'result', question: q });
        });
      }
    }
    
    // ============================================
    // EXTRACT FEEDBACK (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let feedbackContent = extractBetweenDelimiters(
      fullResponse,
      '===FEEDBACK_START===',
      '===FEEDBACK_END==='
    );
    
    let summaryFeedback = null;
    let detailedFeedback = null;
    
    if (feedbackContent) {
      // Extract from delimited content
      const summaryMatch = feedbackContent.match(/A\.\s*Summary Feedback[^:]*:\s*(.+?)(?=\n\nB\.|$)/is);
      const detailedMatch = feedbackContent.match(/B\.\s*Detailed Feedback[^:]*:\s*SITUATION:\s*(.+?)TASK:\s*(.+?)ACTION:\s*(.+?)RESULT:\s*(.+?)(?=$)/is);
      
      summaryFeedback = summaryMatch ? summaryMatch[1].trim() : null;
      
      if (detailedMatch) {
        detailedFeedback = {
          situation: detailedMatch[1].trim(),
          task: detailedMatch[2].trim(),
          action: detailedMatch[3].trim(),
          result: detailedMatch[4].trim()
        };
      }
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - FEEDBACK delimiters not found, using fallback regex');
      const summaryFeedbackMatch = fullResponse.match(/A\.\s*Summary Feedback[^:]*:\s*(.+?)(?=\n\nB\.|$)/is);
      const detailedFeedbackMatch = fullResponse.match(/B\.\s*Detailed Feedback[^:]*:\s*SITUATION:\s*(.+?)TASK:\s*(.+?)ACTION:\s*(.+?)RESULT:\s*(.+?)(?=\n\n7️⃣|$)/is);
      
      summaryFeedback = summaryFeedbackMatch ? summaryFeedbackMatch[1].trim() : null;
      
      if (detailedFeedbackMatch) {
        detailedFeedback = {
          situation: detailedFeedbackMatch[1].trim(),
          task: detailedFeedbackMatch[2].trim(),
          action: detailedFeedbackMatch[3].trim(),
          result: detailedFeedbackMatch[4].trim()
        };
      }
    }
    
    // ============================================
    // EXTRACT SKILLS HIGHLIGHTED (Primary: Delimiters, Fallback: Regex)
    // ============================================
    let skillsContent = extractBetweenDelimiters(
      fullResponse,
      '===SKILLS_HIGHLIGHTED_START===',
      '===SKILLS_HIGHLIGHTED_END==='
    );
    
    let skillsHighlighted = null;
    
    if (skillsContent) {
      // Extract skills from delimited content
      const skillsList = skillsContent.match(/^-\s*.+$/gm);
      if (skillsList && skillsList.length > 0) {
        skillsHighlighted = skillsList.map(skill => skill.replace(/^-\s*/, '').trim());
      }
    } else {
      // Fallback: Extract from full response (backward compatibility)
      console.log('STAR Generation - SKILLS_HIGHLIGHTED delimiters not found, using fallback regex');
      const skillsMatch = fullResponse.match(/7️⃣\s*SKILLS HIGHLIGHTED\s*\n([\s\S]+?)(?=\n\n|$)/is);
      
      if (skillsMatch && skillsMatch[1]) {
        const skillsList = skillsMatch[1].match(/^-\s*.+$/gm);
        if (skillsList && skillsList.length > 0) {
          skillsHighlighted = skillsList.map(skill => skill.replace(/^-\s*/, '').trim());
        }
      }
    }
    
    // ============================================
    // VALIDATE AND NORMALIZE STAR RESPONSE
    // ============================================
    
    // Validate extracted sections and ensure all are present
    const validateSection = (sectionText, sectionName) => {
      // Check if section is missing or too short
      if (!sectionText || sectionText.trim().length < 10) {
        return false;
      }
      // Check if section is just a default message
      if (sectionText.match(/^(Needs more detail|Unable to|Not specified|No information|Unfortunately, there is no specific information)/i)) {
        return false;
      }
      // Detect fabricated content patterns (AI inventing work context from non-work input)
      // Patterns like "I was working on a project" when user never mentioned a project
      const fabricationPatterns = [
        /I was working on (?:a|an|the) (?:project|assignment|task|work)/i,
        /My responsibility was to complete (?:a|an|the) (?:specific )?(?:assignment|project|task)/i,
        /(?:The|A) (?:project|assignment|task) (?:on|at) (?:November|December|January|February|March|April|May|June|July|August|September|October)/i,
        /(?:specific|given|clear|particular).*(?:goal|task|assignment|project|timeframe)/i,
        /I had (?:a|an) (?:clear|specific|particular) (?:goal|task|objective|purpose)/i,
      ];
      
      // If section contains fabrication patterns, flag it as potentially fabricated
      const hasFabricationPattern = fabricationPatterns.some(pattern => pattern.test(sectionText));
      
      // Also check for generic/vague language that suggests fabrication
      const isGeneric = sectionText.match(/(?:specific|given|clear|particular|related to).*(?:assignment|project|task|goal|timeframe|backdrop)/i);
      
      // Check if section mentions dates/times that weren't in user input (common fabrication)
      const hasSpecificDate = sectionText.match(/(?:November|December|January|February|March|April|May|June|July|August|September|October) \d{1,2}, \d{4}/i);
      const hasSpecificTime = sectionText.match(/\d{1,2}:\d{2} (?:AM|PM)/i);
      
      // If section has fabrication patterns AND (is generic OR has specific dates/times), flag it
      if (hasFabricationPattern && (isGeneric || hasSpecificDate || hasSpecificTime)) {
        // This looks like fabricated content - return false to use safe default
        console.log(`⚠️ Detected potentially fabricated content in ${sectionName} section:`, sectionText.substring(0, 100));
        return false;
      }
      
      return true;
    };
    
    // Validate each section
    const situationValid = validateSection(situationText, 'Situation');
    const taskValid = validateSection(taskText, 'Task');
    const actionValid = validateSection(actionText, 'Action');
    const resultValid = validateSection(resultText, 'Result');
    
    // If any section is invalid, use safe defaults
    if (!situationValid || !taskValid || !actionValid || !resultValid) {
      // Rebuild with validated sections
      const finalSituation = situationValid ? situationText : 'Needs more detail about the context';
      const finalTask = taskValid ? taskText : 'Needs more detail about what needed to be accomplished';
      const finalAction = actionValid ? actionText : 'Needs more detail about the actions taken';
      const finalResult = resultValid ? resultText : 'Needs more detail about the outcome or impact';
      
      starResponse = `**Situation:** ${finalSituation}\n\n**Task:** ${finalTask}\n\n**Action:** ${finalAction}\n\n**Result:** ${finalResult}`;
    }
    
    // Final fallback: if still empty or too short, provide helpful message
    if (!starResponse || starResponse.length < 20) {
      starResponse = `**Situation:** Unable to extract STAR response from input. Please ensure the experience describes a work-related scenario.

**Task:** Unable to determine task from provided content. 

**Action:** Unable to determine actions from provided content.

**Result:** Unable to determine results from provided content.`;
      overallScore = 'N/A';
      sectionScores = {
        situation: 'N/A',
        task: 'N/A',
        action: 'N/A',
        result: 'N/A'
      };
    }
    
    // Check if all sections say "Needs more detail" - indicates gibberish/unintelligible input
    const needsMoreDetailPattern = /Needs more detail|No outcome specified|No information/i;
    const allSectionsNeedDetail = 
      needsMoreDetailPattern.test(starResponse.match(/\*\*Situation:\*\*\s*(.+?)(?=\*\*Task:|$)/is)?.[1] || '') &&
      needsMoreDetailPattern.test(starResponse.match(/\*\*Task:\*\*\s*(.+?)(?=\*\*Action:|$)/is)?.[1] || '') &&
      needsMoreDetailPattern.test(starResponse.match(/\*\*Action:\*\*\s*(.+?)(?=\*\*Result:|$)/is)?.[1] || '') &&
      needsMoreDetailPattern.test(starResponse.match(/\*\*Result:\*\*\s*(.+?)(?=$)/is)?.[1] || '');
    
    // If all sections need detail AND any score is F, convert to N/A (gibberish/unintelligible, not low quality)
    if (allSectionsNeedDetail && (overallScore === 'F' || Object.values(sectionScores).includes('F'))) {
      overallScore = 'N/A';
      sectionScores = {
        situation: sectionScores.situation === 'F' ? 'N/A' : sectionScores.situation,
        task: sectionScores.task === 'F' ? 'N/A' : sectionScores.task,
        action: sectionScores.action === 'F' ? 'N/A' : sectionScores.action,
        result: sectionScores.result === 'F' ? 'N/A' : sectionScores.result
      };
    }
    
    // Note: Default questions are now added immediately after extraction (above)
    // This ensures they always appear as the last question for each component
    
    // Log extracted data for debugging
    console.log('STAR Generation - Extracted feedbackQuestions count:', feedbackQuestions.length);
    if (feedbackQuestions.length === 4) {
      console.warn('STAR Generation - WARNING: Only generic questions found, no specific questions extracted!');
      console.warn('STAR Generation - This may indicate the AI did not generate the FEEDBACK_QUESTIONS section correctly.');
    }
    console.log('STAR Generation - Summary feedback extracted:', summaryFeedback ? 'Yes' : 'No');
    console.log('STAR Generation - Skills highlighted count:', skillsHighlighted ? skillsHighlighted.length : 0);
    
    // Convert rubricScores keys to match expected format (clarity, relevance, etc.)
    const formattedRubricScores = {
      clarity: rubricScores.clarity || 'N/A',
      relevance: rubricScores.relevance || 'N/A',
      ownership: rubricScores.ownership || 'N/A',
      impact: rubricScores.impact || 'N/A',
      completeness: rubricScores.completeness || 'N/A',
      strategic: rubricScores.strategic || 'N/A',
      communication: rubricScores.communication || 'N/A'
    };
    
    // Build and return normalized STARResponse object
    return {
      starResponse,
      score: overallScore,
      sectionScores,
      feedbackQuestions,
      rubricScores: formattedRubricScores,
      summaryFeedback,
      detailedFeedback,
      skillsHighlighted,
      // Additional fields for future extensibility
      topStrengths: topStrengths ? [topStrengths] : null,
      improvementAreas: improvementAreas ? [improvementAreas] : null,
      rubricDiagnosticSummary
    };
  }
  
  /**
   * Handle OpenAI-specific errors
   * 
   * Normalizes OpenAI API errors to user-friendly error messages.
   * 
   * @param {Error} error - Error from OpenAI API
   * @returns {Error} Normalized error object with user-friendly message
   */
  handleError(error) {
    console.error('OpenAI API Error:', error);
    console.error('Error details:', {
      name: error.name,
      message: error.message,
      code: error.code,
      stack: error.stack
    });
    
    // Handle specific OpenAI error types
    if (error.code === 'insufficient_quota') {
      return new Error('OpenAI API quota exceeded. Please check your API key billing settings.');
    }
    
    if (error.code === 'invalid_api_key') {
      return new Error('Invalid OpenAI API key. Please check your environment variables.');
    }
    
    if (error.code === 'rate_limit_exceeded') {
      return new Error('OpenAI API rate limit exceeded. Please try again in a moment.');
    }
    
    if (error.message && error.message.includes('timeout')) {
      return new Error('Request to OpenAI API timed out. Please try again.');
    }
    
    // Generic error message
    return new Error(error.message || 'Failed to generate STAR response');
  }
}

module.exports = OpenAIAdapter;
