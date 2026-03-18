/**
 * ProviderFactory - Returns appropriate provider adapter
 * 
 * This factory pattern allows easy switching between different AI providers
 * (OpenAI, Anthropic Claude, Google Gemini) without changing calling code.
 * 
 * @module providers
 */

/**
 * ProviderFactory - Factory class for creating provider adapter instances
 * 
 * This factory pattern allows easy switching between different AI providers
 * (OpenAI, Anthropic Claude, Google Gemini) without changing calling code.
 * 
 * Usage:
 *   const provider = ProviderFactory.getProvider('openai');
 *   const response = await provider.generateSTAR(prompt, experience);
 */
class ProviderFactory {
  /**
   * Get a provider adapter instance
   * 
   * @param {string} [providerName='openai'] - Name of provider ('openai', 'gemini', 'claude')
   *   Case-insensitive, whitespace is trimmed. Defaults to 'openai' if not provided.
   * @returns {BaseProvider} Provider adapter instance
   * @throws {Error} If provider name is invalid or not supported
   * 
   * @example
   *   // Get OpenAI provider (default)
   *   const provider = ProviderFactory.getProvider();
   *   const provider = ProviderFactory.getProvider('openai');
   *   
   *   // Case-insensitive and trims whitespace
   *   const provider = ProviderFactory.getProvider('  OPENAI  '); // Works
   *   
   *   // Invalid provider throws error
   *   ProviderFactory.getProvider('invalid'); // Throws Error
   */
  static getProvider(providerName = 'openai') {
    // Handle null/undefined by using default
    if (providerName === null || providerName === undefined) {
      providerName = 'openai';
    }
    
    // Normalize provider name (lowercase, trim)
    const normalizedName = String(providerName).toLowerCase().trim();
    
    // Validate provider name (should not be empty after normalization)
    if (!normalizedName || normalizedName.length === 0) {
      const supported = this.getSupportedProviders().join(', ');
      throw new Error(
        `Provider name cannot be empty. Supported providers: ${supported}`
      );
    }
    
    // Route to appropriate provider
    switch (normalizedName) {
      case 'openai':
        const OpenAIAdapter = require('./openai');
        return new OpenAIAdapter();
      
      // Future providers will be added here:
      // case 'gemini':
      //   const GeminiAdapter = require('./gemini');
      //   return new GeminiAdapter();
      // case 'claude':
      // case 'anthropic':
      //   const ClaudeAdapter = require('./claude');
      //   return new ClaudeAdapter();
      
      default:
        const supported = this.getSupportedProviders().join(', ');
        throw new Error(
          `Unsupported provider: "${providerName}". ` +
          `Supported providers: ${supported}`
        );
    }
  }
  
  /**
   * Get list of supported providers
   * 
   * @returns {string[]} Array of supported provider names (lowercase)
   * 
   * @example
   *   const providers = ProviderFactory.getSupportedProviders();
   *   // Returns: ['openai']
   */
  static getSupportedProviders() {
    return ['openai'];
    // Future: return ['openai', 'gemini', 'claude'];
  }
}

module.exports = ProviderFactory;

