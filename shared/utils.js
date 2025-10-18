/**
 * Shared utilities for the Splice Chrome Extension
 */

class LicenseInfoManager {
  /**
   * Save license information with encryption
   * @param {Object} licenseData - License information object
   * @returns {Promise<boolean>} Success status
   */
  static async saveLicenseInfo(licenseData) {
    try {
      // Validate data first
      const validation = LicenseInfoEncryption.validate(licenseData);
      if (!validation.isValid) {
        throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
      }

      // Encrypt the data
      const encrypted = LicenseInfoEncryption.encrypt(licenseData);
      if (!encrypted) {
        throw new Error('Failed to encrypt license information');
      }

      // Save to storage
      await chrome.storage.local.set({
        licenseInfo: encrypted,
        licenseInfoTimestamp: Date.now()
      });

      return true;
    } catch (error) {
      console.error('Failed to save license info:', error);
      return false;
    }
  }

  /**
   * Get license information with decryption
   * @returns {Promise<Object|null>} License information or null
   */
  static async getLicenseInfo() {
    try {
      const result = await chrome.storage.local.get(['licenseInfo']);

      if (result.licenseInfo) {
        const decrypted = LicenseInfoEncryption.decrypt(result.licenseInfo);
        return decrypted;
      }

      return null;
    } catch (error) {
      console.error('Failed to get license info:', error);
      return null;
    }
  }

  /**
   * Clear license information
   * @returns {Promise<boolean>} Success status
   */
  static async clearLicenseInfo() {
    try {
      await chrome.storage.local.remove(['licenseInfo', 'licenseInfoTimestamp']);
      return true;
    } catch (error) {
      console.error('Failed to clear license info:', error);
      return false;
    }
  }

  /**
   * Check if license information exists
   * @returns {Promise<boolean>} True if license info exists
   */
  static async hasLicenseInfo() {
    try {
      const licenseInfo = await this.getLicenseInfo();
      return licenseInfo !== null;
    } catch (error) {
      console.error('Failed to check license info:', error);
      return false;
    }
  }
}

class ExtensionUtils {
  /**
   * Show notification to user
   * @param {string} message - Notification message
   * @param {string} type - Notification type (info, success, error)
   */
  static showNotification(message, type = 'info') {
    // Create notification element
    const notification = document.createElement('div');
    notification.className = `notification notification-${type}`;
    notification.textContent = message;

    // Add to page
    document.body.appendChild(notification);

    // Remove after 3 seconds
    setTimeout(() => {
      if (notification.parentNode) {
        notification.parentNode.removeChild(notification);
      }
    }, 3000);
  }

  /**
   * Format error message for display
   * @param {Error|string} error - Error object or message
   * @returns {string} Formatted error message
   */
  static formatError(error) {
    if (typeof error === 'string') {
      return error;
    }

    if (error && error.message) {
      return error.message;
    }

    return 'An unknown error occurred';
  }

  /**
   * Debounce function calls
   * @param {Function} func - Function to debounce
   * @param {number} wait - Wait time in milliseconds
   * @returns {Function} Debounced function
   */
  static debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  /**
   * Validate sample names input
   * @param {string} input - Sample names input
   * @returns {Object} Validation result
   */
  static validateSampleInput(input) {
    console.log('validateSampleInput called with:', input);
    console.log('Input type:', typeof input);
    console.log('Input length:', input ? input.length : 'undefined');

    const errors = [];

    if (!input || typeof input !== 'string') {
      console.log('Input validation failed: input is empty or not a string');
      errors.push('Input is required');
      return { isValid: false, errors, samples: [] };
    }

    const samples = input.split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    if (samples.length === 0) {
      errors.push('At least one sample name is required');
    }

    if (samples.length > 20) {
      errors.push('Maximum 20 samples allowed per batch');
    }

    return {
      isValid: errors.length === 0,
      errors,
      samples: errors.length === 0 ? samples : []
    };
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { LicenseInfoManager, ExtensionUtils };
}
