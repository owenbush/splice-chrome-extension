/**
 * Simple encryption utilities for license information
 * Uses base64 encoding for basic obfuscation
 */

class LicenseInfoEncryption {
  /**
   * Encrypt license information
   * @param {Object} data - License information object
   * @returns {string|null} Encrypted data or null on error
   */
  static encrypt(data) {
    try {
      const jsonString = JSON.stringify(data);
      const encoded = btoa(jsonString);
      return encoded;
    } catch (error) {
      console.error('Encryption failed:', error);
      return null;
    }
  }

  /**
   * Decrypt license information
   * @param {string} encryptedData - Encrypted data string
   * @returns {Object|null} Decrypted data or null on error
   */
  static decrypt(encryptedData) {
    try {
      const decoded = atob(encryptedData);
      const data = JSON.parse(decoded);
      return data;
    } catch (error) {
      console.error('Decryption failed:', error);
      return null;
    }
  }

  /**
   * Validate license information structure
   * @param {Object} data - License information object
   * @returns {Object} Validation result
   */
  static validate(data) {
    const errors = [];

    if (!data.legalName || typeof data.legalName !== 'string' || data.legalName.trim() === '') {
      errors.push('Legal name is required');
    }

    if (!data.artistName || typeof data.artistName !== 'string' || data.artistName.trim() === '') {
      errors.push('Artist name is required');
    }

    // Optional fields
    if (data.companyName && typeof data.companyName !== 'string') {
      errors.push('Company name must be a string');
    }

    return {
      isValid: errors.length === 0,
      errors: errors
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = LicenseInfoEncryption;
}
