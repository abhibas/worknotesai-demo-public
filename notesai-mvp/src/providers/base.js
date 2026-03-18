/**
 * BaseProvider - Common interface for all AI providers
 * 
 * All provider adapters must extend this class and implement all methods.
 * This ensures consistent behavior across different AI providers.
 * 
 * @module providers/base
 */

/**
 * BaseProvider - Abstract base class for AI provider adapters
 * 
 * This class defines the contract that all provider adapters must follow.
 * Each provider (OpenAI, Claude, Gemini) will implement these methods
 * according to their specific API requirements.
 * 
 * **Extensibility Design**:
 * This interface is designed to evolve over time. New fields should be:
 * - Added as optional initially (@property {type} [fieldName])
 * - Documented with version when added
 * - Made required only after all providers support them
 * - Always maintain backward compatibility
 */
class BaseProvider {
  /**
   * Generate STAR response from experience content
   * 
   * @param {string} prompt - System prompt for STAR generation
   * @param {string} experience - User experience content (may include appended feedback)
   * @param {object} options - Provider-specific options
   * @param {string} [options.model] - Model name (e.g., 'gpt-3.5-turbo', 'gpt-4')
   * @param {number} [options.temperature] - Temperature setting (0-2)
   * @param {number} [options.maxTokens] - Maximum tokens in response
   * @returns {Promise<STARResponse>} STAR response object with all components
   * @throws {Error} If generation fails
   */
  async generateSTAR(prompt, experience, options = {}) {
    throw new Error('generateSTAR must be implemented by provider');
  }
  
  /**
   * Normalize provider response to common format
   * 
   * Different providers may return responses in different formats.
   * This method ensures all providers return the same structure.
   * 
   * **Implementation Notes**:
   * - Must return all CORE and STANDARD fields (see STARResponse typedef)
   * - Optional fields can be omitted if not available
   * - Should handle missing data gracefully (use null/undefined for optional fields)
   * 
   * @param {any} rawResponse - Raw response from provider API
   * @returns {STARResponse} Normalized response object
   * @throws {Error} If normalization fails
   */
  normalizeResponse(rawResponse) {
    throw new Error('normalizeResponse must be implemented by provider');
  }
  
  /**
   * Handle provider-specific errors
   * 
   * Different providers may have different error formats.
   * This method normalizes errors to a consistent format.
   * 
   * @param {Error} error - Error from provider API
   * @returns {Error} Normalized error object with user-friendly message
   */
  handleError(error) {
    throw new Error('handleError must be implemented by provider');
  }
}

/**
 * STARResponse - Structure for normalized STAR response
 * 
 * **Version History**:
 * - v1.0: Core fields (starResponse, score, sectionScores)
 * - v1.1: Added feedback fields (feedbackQuestions, summaryFeedback, detailedFeedback, rubricScores, skillsHighlighted)
 * - v2.0: (Future) Add reflection, lessonsLearned, and other extensible fields
 * 
 * **Extensibility Strategy**:
 * - CORE fields: Never change, always required
 * - STANDARD fields: Current implementation, required for now
 * - EXTENSIBLE fields: Optional, can be added incrementally
 * - New fields should be added as optional initially, then made required after all providers support them
 * 
 * @typedef {Object} STARResponse
 * 
 * // ============================================
 * // CORE FIELDS (Required) - Never change
 * // ============================================
 * 
 * @property {string} starResponse - Formatted STAR text with markdown
 *   Format: "**Situation:** ...\n\n**Task:** ...\n\n**Action:** ...\n\n**Result:** ..."
 *   This is the primary display content shown to users.
 * 
 * @property {string} score - Overall grade (A+ to F or N/A)
 *   Letter grade representing overall STAR response quality.
 * 
 * @property {Object<string, string>} sectionScores - Individual section grades
 *   @property {string} sectionScores.situation - Situation grade (A+ to F or N/A)
 *   @property {string} sectionScores.task - Task grade (A+ to F or N/A)
 *   @property {string} sectionScores.action - Action grade (A+ to F or N/A)
 *   @property {string} sectionScores.result - Result grade (A+ to F or N/A)
 * 
 * // ============================================
 * // STANDARD FIELDS (Required) - Current implementation
 * // ============================================
 * 
 * @property {Array<Object>} feedbackQuestions - Feedback questions by component
 *   Each object: {component: 'situation'|'task'|'action'|'result', question: string}
 *   Used to guide users in improving their STAR responses.
 * 
 * @property {Object<string, string>} rubricScores - 7-dimension rubric scores
 *   Keys: 'clarity', 'relevance', 'ownership', 'impact', 'completeness', 'strategic', 'communication'
 *   Values: A+ to F grades for each dimension
 *   Used for detailed quality assessment.
 * 
 * @property {string} summaryFeedback - High-level summary feedback (2-4 sentences)
 *   Overall quality assessment and actionable advice.
 * 
 * @property {Object<string, string>} detailedFeedback - Detailed feedback by STAR component
 *   Keys: 'situation', 'task', 'action', 'result'
 *   Values: Component-specific feedback with rubric tags (e.g., "[Relevance, Clarity]")
 * 
 * @property {Array<string>} skillsHighlighted - List of skills demonstrated (5-10 skills)
 *   Skills that can be used for LinkedIn, resume, or interview preparation.
 * 
 * // ============================================
 * // EXTENSIBLE FIELDS (Optional) - Future additions
 * // ============================================
 * 
 * @property {string} [reflection] - Reflection section (optional, v2.0+)
 *   User's reflection on the experience, lessons learned, or future improvements.
 *   Format: Plain text or markdown.
 * 
 * @property {string} [lessonsLearned] - Lessons learned section (optional, v2.1+)
 *   Key takeaways or insights from the experience.
 *   Format: Plain text or markdown.
 * 
 * @property {Array<string>} [relatedSkills] - Related skills not in main list (optional, v2.2+)
 *   Additional skills that complement the main skillsHighlighted list.
 * 
 * @property {Object<string, any>} [metadata] - Additional metadata (optional, v2.0+)
 *   Provider-specific or future extensible fields.
 *   Use this for fields that don't fit the standard structure.
 *   Example: {provider: 'openai', model: 'gpt-4', tokensUsed: 1500}
 */

module.exports = BaseProvider;

