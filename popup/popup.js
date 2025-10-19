/**
 * Popup JavaScript for Splice Batch License Generator
 * Handles user interface interactions and communication with service worker
 */

class PopupManager {
  constructor() {
    this.isProcessing = false;
    this.currentResults = [];
    this.STATE_KEY = 'popup_state';
    this.saveStateTimeout = null;
    this.setupGlobalErrorHandler();
    this.init();
  }

  /**
   * Setup global error handler to prevent popup from closing
   */
  setupGlobalErrorHandler() {
    // Catch unhandled errors
    window.addEventListener('error', (event) => {
      event.preventDefault();
      console.error('Unhandled error:', event.error);

      // Check if extension context is invalidated
      if (event.error && event.error.message &&
          event.error.message.includes('Extension context invalidated')) {
        ExtensionUtils.showNotification(
          'Extension was reloaded. Please close and reopen this popup.',
          'error'
        );
      } else {
        ExtensionUtils.showNotification(
          'An unexpected error occurred. Please try again.',
          'error'
        );
      }
    });

    // Catch unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      event.preventDefault();
      console.error('Unhandled promise rejection:', event.reason);

      const errorMessage = event.reason?.message || String(event.reason);

      // Check if extension context is invalidated
      if (errorMessage.includes('Extension context invalidated')) {
        ExtensionUtils.showNotification(
          'Extension was reloaded. Please close and reopen this popup.',
          'error'
        );
      } else if (errorMessage.includes('Receiving end does not exist')) {
        ExtensionUtils.showNotification(
          'Please refresh the Splice.com page and try again.',
          'error'
        );
      } else {
        ExtensionUtils.showNotification(
          'An unexpected error occurred. Please try again.',
          'error'
        );
      }
    });
  }

  /**
   * Safe wrapper for chrome.runtime.sendMessage with error handling
   */
  async safeSendMessage(message) {
    try {
      // Check if chrome.runtime is available
      if (!chrome.runtime || !chrome.runtime.id) {
        throw new Error('Extension context invalidated');
      }

      return await chrome.runtime.sendMessage(message);
    } catch (error) {
      // Handle specific errors
      if (error.message.includes('Extension context invalidated')) {
        throw new Error('Extension was reloaded. Please close and reopen this popup.');
      } else if (error.message.includes('Receiving end does not exist')) {
        throw new Error('Cannot communicate with extension. Please try again.');
      }
      throw error;
    }
  }

  /**
   * Initialize the popup
   */
  async init() {
    this.setupEventListeners();

    // Restore previous state first
    await this.restoreState();

    // Force a fresh authentication check (clear cache)
    try {
      await this.safeSendMessage({ action: 'clearSessionCache' });
    } catch (error) {
      console.error('Failed to clear session cache:', error);
    }

    // Add retry mechanism for initialization
    let retryCount = 0;
    const maxRetries = 3;

    while (retryCount < maxRetries) {
      try {
        await this.checkAuthentication();
        await this.checkLicenseInfo();
        this.updateSampleCount();
        break; // Success, exit retry loop
      } catch (error) {
        retryCount++;
        console.error(`Init attempt ${retryCount} failed:`, error);

        if (retryCount < maxRetries) {
          await new Promise(resolve => setTimeout(resolve, 1000));
        } else {
          console.error('All initialization attempts failed');
          this.showLoginPrompt('Failed to initialize extension. Please try refreshing the page.');
        }
      }
    }
  }

  /**
   * Save popup state to chrome.storage.local
   */
  async saveState() {
    try {
      const sampleInput = document.getElementById('sampleInput');
      if (!sampleInput) return; // Element not ready yet

      const state = {
        input: sampleInput.value,
        results: this.currentResults,
        timestamp: Date.now()
      };
      await chrome.storage.local.set({ [this.STATE_KEY]: state });
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }

  /**
   * Restore popup state from chrome.storage.local
   */
  async restoreState() {
    try {
      const data = await chrome.storage.local.get(this.STATE_KEY);
      const state = data[this.STATE_KEY];

      if (!state) return;

      // Only restore if state is less than 1 hour old
      const oneHour = 60 * 60 * 1000;
      if (Date.now() - state.timestamp > oneHour) {
        await chrome.storage.local.remove(this.STATE_KEY);
        return;
      }

      // Restore input
      if (state.input) {
        const sampleInput = document.getElementById('sampleInput');
        sampleInput.value = state.input;
      }

      // Restore results
      if (state.results && state.results.length > 0) {
        this.currentResults = state.results;
        this.showResults(state.results);
      }
    } catch (error) {
      console.error('Failed to restore state:', error);
    }
  }

  /**
   * Clear saved state
   */
  async clearState() {
    try {
      await chrome.storage.local.remove(this.STATE_KEY);
    } catch (error) {
      console.error('Failed to clear state:', error);
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Save state when popup loses visibility (gets minimized/closed)
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        this.saveState();
      }
    });

    // Save state when window is about to unload (popup closing)
    window.addEventListener('pagehide', () => {
      this.saveState();
    });

    // Also save state periodically if there are results
    setInterval(() => {
      if (this.currentResults && this.currentResults.length > 0) {
        this.saveState();
      }
    }, 5000); // Save every 5 seconds if there are results

    // Sample input handling
    const sampleInput = document.getElementById('sampleInput');
    sampleInput.addEventListener('input', () => {
      this.updateSampleCount();
      // Removed validateInput() call to prevent console warnings during typing

      // Save state when input changes (debounced)
      clearTimeout(this.saveStateTimeout);
      this.saveStateTimeout = setTimeout(() => this.saveState(), 500);
    });

    // Button handlers
    document.getElementById('processSamples').addEventListener('click', () => {
      this.processSamples();
    });

    document.getElementById('clearInput').addEventListener('click', () => {
      this.clearInput();
    });

    document.getElementById('clearResults').addEventListener('click', () => {
      this.clearResults();
    });

    // Navigation handlers
    document.getElementById('openSplice').addEventListener('click', () => {
      chrome.tabs.create({ url: 'https://splice.com' });
    });

    document.getElementById('openOptions').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('openOptionsFooter').addEventListener('click', () => {
      chrome.runtime.openOptionsPage();
    });

    document.getElementById('openHelp').addEventListener('click', () => {
      this.showHelp();
    });
  }

  /**
   * Check user authentication status
   */
  async checkAuthentication() {
    try {
      const response = await this.safeSendMessage({ action: 'checkAuth' });

      // Handle undefined or null response
      if (!response) {
        this.showLoginPrompt('No response from service worker');
        return;
      }

      // Ensure response has expected structure
      const authResponse = {
        loggedIn: response.loggedIn || false,
        user: response.user || null,
        error: response.error || null,
        timestamp: response.timestamp || Date.now()
      };

      if (authResponse.loggedIn) {
        this.showAuthenticatedState(authResponse.user);
      } else {
        this.showLoginPrompt(authResponse.error || 'Not logged in');
      }
    } catch (error) {

      // Handle specific error types
      if (error.message.includes('Extension context invalidated')) {
        this.showLoginPrompt('Extension needs to be reloaded. Please refresh the extension and try again.');
      } else if (error.message.includes('Could not establish connection')) {
        this.showLoginPrompt('Cannot connect to Splice.com. Please make sure you have a Splice.com tab open.');
      } else {
        this.showLoginPrompt('Authentication check failed: ' + error.message);
      }
    }
  }

  /**
   * Check license information status
   */
  async checkLicenseInfo() {
    try {
      const result = await chrome.storage.local.get(['licenseInfo']);

      if (result.licenseInfo) {
        const licenseInfo = LicenseInfoEncryption.decrypt(result.licenseInfo);
        if (licenseInfo) {
          this.showLicenseInfoStatus(licenseInfo);
        } else {
          this.showLicenseInfoPrompt();
        }
      } else {
        this.showLicenseInfoPrompt();
      }
    } catch (error) {
      this.showLicenseInfoPrompt();
    }
  }

  /**
   * Show authenticated state
   */
  showAuthenticatedState(user) {
    document.getElementById('authStatus').style.display = 'flex';
    document.getElementById('statusIndicator').className = 'status-indicator success';

    // Handle different user data structures to get username
    let username = null;

    if (user) {
      if (typeof user === 'string') {
        username = user;
      } else if (user.username) {
        username = user.username;
      } else if (user.name) {
        username = user.name;
      } else if (user.email) {
        username = user.email;
      }
    }

    // Validate username isn't generic text
    if (username) {
      const lowerUsername = username.toLowerCase();
      const genericTerms = ['unknown', 'user avatar', 'avatar', 'user', 'log in', 'login'];
      if (genericTerms.some(term => lowerUsername === term || lowerUsername.includes(term))) {
        username = null;
      }
    }

    // Display appropriate text based on whether we have a username
    if (username) {
      document.getElementById('statusText').textContent = `Logged in as ${username}`;
    } else {
      document.getElementById('statusText').textContent = 'Logged in to Splice';
    }

    document.getElementById('statusDetails').textContent = 'Ready to generate licenses';
    document.getElementById('mainInterface').style.display = 'flex';
  }

  /**
   * Show login prompt
   */
  showLoginPrompt(errorMessage = 'Not logged in') {
    document.getElementById('loginPrompt').style.display = 'flex';
    document.getElementById('statusIndicator').className = 'status-indicator error';
    document.getElementById('statusText').textContent = errorMessage;
    document.getElementById('statusDetails').textContent = 'Please log in to Splice.com first';
  }

  /**
   * Show license info status
   */
  showLicenseInfoStatus(licenseInfo) {
    document.getElementById('licenseInfoStatus').style.display = 'flex';
    document.getElementById('licenseStatusIndicator').className = 'status-indicator success';
    document.getElementById('licenseStatusText').textContent = `License info configured`;
    document.getElementById('licenseStatusDetails').textContent = `${licenseInfo.legalName} (${licenseInfo.artistName})`;
    document.getElementById('processSamples').disabled = false;
  }

  /**
   * Show license info prompt
   */
  showLicenseInfoPrompt() {
    document.getElementById('licenseInfoPrompt').style.display = 'flex';
    document.getElementById('licenseStatusIndicator').className = 'status-indicator warning';
    document.getElementById('licenseStatusText').textContent = 'License information not configured';
  }

  /**
   * Update sample count display
   */
  updateSampleCount() {
    const input = document.getElementById('sampleInput');
    const count = document.getElementById('sampleCount');

    const samples = input.value.split('\n')
      .map(name => name.trim())
      .filter(name => name.length > 0);

    count.textContent = `${samples.length} samples`;

    // Update button state
    const processButton = document.getElementById('processSamples');
    processButton.disabled = samples.length === 0 || this.isProcessing;
  }

  /**
   * Validate input
   */
  validateInput() {
    const input = document.getElementById('sampleInput');
    const validation = ExtensionUtils.validateSampleInput(input.value);

    // Only log validation errors if there's actually content to validate
    // Don't show errors for empty input during typing
    if (!validation.isValid && input.value.trim().length > 0) {
      console.warn('Validation errors:', validation.errors);
    }
  }

  /**
   * Process samples
   */
  async processSamples() {
    if (this.isProcessing) return;

    const input = document.getElementById('sampleInput');

    const validation = ExtensionUtils.validateSampleInput(input.value);

    if (!validation.isValid) {
      ExtensionUtils.showNotification(`Validation failed: ${validation.errors.join(', ')}`, 'error');
      return;
    }

    this.isProcessing = true;
    this.setProcessingState(true);
    this.showProgressSection();

    try {
      const results = await this.processSamplesBatch(validation.samples);
      this.showResults(results);
      await this.saveState();
    } catch (error) {
      ExtensionUtils.showNotification(`Processing failed: ${ExtensionUtils.formatError(error)}`, 'error');
    } finally {
      this.isProcessing = false;
      this.setProcessingState(false);
    }
  }

  /**
   * Process samples batch
   */
  async processSamplesBatch(samples) {
    const results = [];
    const total = samples.length;

    for (let i = 0; i < samples.length; i++) {
      const sample = samples[i];

      try {
        // Update progress
        this.updateProgress(i + 1, total, `Processing: ${sample}`);

        // Step 1: Search for sample
        const searchResult = await this.safeSendMessage({
          action: 'searchSamples',
          query: sample
        });

        if (!searchResult.success || searchResult.results.length === 0) {
          results.push({
            sample,
            success: false,
            error: searchResult.error || 'Sample not found on Splice. Please verify the sample name is correct.'
          });
          continue;
        }

        // Find best match (exact match preferred)
        const bestMatch = this.findBestMatch(sample, searchResult.results);
        if (!bestMatch) {
          results.push({
            sample,
            success: false,
            error: 'No suitable match found'
          });
          continue;
        }

        // Check if sample is in library
        if (bestMatch.inLibrary === false) {
          results.push({
            sample,
            success: false,
            error: 'Sample not in your library. Please add this sample to your Splice library before generating a license.'
          });
          continue;
        }

        // Step 2: Generate license using API
        const licenseInfo = await this.getLicenseInfo();

        if (!licenseInfo) {
          results.push({
            sample,
            success: false,
            error: 'License information not configured. Please set up your license details in the extension options.'
          });
          continue;
        }


      // Pass both the sample ID and the sample name

      // Decode license info before sending
      let decodedLicenseInfo;
      try {
        const decoded = atob(licenseInfo);
        decodedLicenseInfo = JSON.parse(decoded);
      } catch (e) {
        results.push({
          sample,
          success: false,
          error: 'Failed to decode license information'
        });
        continue;
      }

      const licenseResult = await this.safeSendMessage({
        action: 'generateLicense',
        sampleId: bestMatch.id,
        licenseInfo: {
          ...decodedLicenseInfo,
          sampleName: sample // Pass the original sample name for GraphQL lookup
        }
      });


        if (!licenseResult.success) {
          results.push({
            sample,
            success: false,
            error: licenseResult.error || 'Failed to generate license'
          });
          continue;
        }

        // Success!
        results.push({
          sample,
          success: true,
          sampleId: bestMatch.id,
          downloadUrl: licenseResult.downloadUrl,
          sampleInfo: bestMatch,
          message: 'License generated successfully'
        });

      } catch (error) {
        results.push({
          sample,
          success: false,
          error: ExtensionUtils.formatError(error)
        });
      }

      // Small delay to avoid overwhelming the API
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    return results;
  }

  /**
   * Find best match for sample name
   */
  findBestMatch(sampleName, searchResults) {
    if (!searchResults || searchResults.length === 0) {
      return null;
    }

    // Try exact match first
    const exactMatch = searchResults.find(result =>
      result.name && result.name.toLowerCase() === sampleName.toLowerCase()
    );
    if (exactMatch) {
      return exactMatch;
    }

    // Try partial match
    const partialMatch = searchResults.find(result =>
      result.name && result.name.toLowerCase().includes(sampleName.toLowerCase())
    );
    if (partialMatch) {
      return partialMatch;
    }

    // Return first result as fallback
    return searchResults[0];
  }

  /**
   * Get license information from storage
   */
  async getLicenseInfo() {
    try {
      const result = await chrome.storage.local.get(['licenseInfo']);
      return result.licenseInfo;
    } catch (error) {
      return null;
    }
  }

  /**
   * Set processing state
   */
  setProcessingState(processing) {
    const button = document.getElementById('processSamples');
    const buttonText = button.querySelector('.btn-text');
    const buttonLoading = button.querySelector('.btn-loading');

    if (processing) {
      button.disabled = true;
      button.classList.add('loading');
      buttonText.style.display = 'none';
      buttonLoading.style.display = 'inline';
    } else {
      button.disabled = false;
      button.classList.remove('loading');
      buttonText.style.display = 'inline';
      buttonLoading.style.display = 'none';
    }
  }

  /**
   * Show progress section
   */
  showProgressSection() {
    document.getElementById('progressSection').style.display = 'block';
    document.getElementById('resultsSection').style.display = 'none';
  }

  /**
   * Update progress
   */
  updateProgress(current, total, details) {
    const progressText = document.getElementById('progressText');
    const progressCount = document.getElementById('progressCount');
    const progressFill = document.getElementById('progressFill');
    const progressDetails = document.getElementById('progressDetails');

    progressText.textContent = 'Processing samples...';
    progressCount.textContent = `${current} / ${total}`;
    progressFill.style.width = `${(current / total) * 100}%`;
    progressDetails.textContent = details;
  }

  /**
   * Show results
   */
  showResults(results) {
    this.currentResults = results;

    const resultsSection = document.getElementById('resultsSection');
    const resultsContent = document.getElementById('resultsContent');

    resultsSection.style.display = 'flex';
    resultsContent.innerHTML = '';

    const successCount = results.filter(r => r.success).length;
    const totalCount = results.length;

    // Add summary
    const summary = document.createElement('div');
    summary.className = 'result-summary';
    const summaryEmoji = successCount === totalCount ? '✅' : successCount > 0 ? '⚠️' : '❌';
    summary.innerHTML = `
      <div class="summary-header">${summaryEmoji} <strong>Results</strong></div>
      <div class="summary-stats">${successCount} of ${totalCount} license${totalCount !== 1 ? 's' : ''} generated successfully</div>
    `;
    resultsContent.appendChild(summary);

    // Add individual results
    results.forEach(result => {
      const item = document.createElement('div');
      item.className = `result-item ${result.success ? 'success' : 'error'}`;

      if (result.success) {
        // Create a cleaner sample name display (remove .wav extension for display)
        const displayName = result.sample.replace(/\.wav$/i, '');

        const itemHeader = document.createElement('div');
        itemHeader.className = 'result-item-header';
        itemHeader.innerHTML = `<span class="result-icon">✅</span><span class="result-name">${displayName}</span>`;
        item.appendChild(itemHeader);

        // Add download button if available
        if (result.downloadUrl) {
          const downloadDiv = document.createElement('div');
          downloadDiv.className = 'download-link';

          const downloadBtn = document.createElement('button');
          downloadBtn.className = 'download-btn';
          downloadBtn.innerHTML = '📥 Download License';
          downloadBtn.addEventListener('click', () => {
            // Open in new tab without closing popup
            chrome.tabs.create({ url: result.downloadUrl, active: false });
          });

          downloadDiv.appendChild(downloadBtn);
          item.appendChild(downloadDiv);
        }
      } else {
        const displayName = result.sample.replace(/\.wav$/i, '');
        const itemHeader = document.createElement('div');
        itemHeader.className = 'result-item-header';
        itemHeader.innerHTML = `<span class="result-icon">❌</span><span class="result-name">${displayName}</span>`;
        item.appendChild(itemHeader);

        const errorDiv = document.createElement('div');
        errorDiv.className = 'result-error';
        errorDiv.textContent = result.error;
        item.appendChild(errorDiv);
      }

      resultsContent.appendChild(item);
    });
  }

  /**
   * Clear input
   */
  async clearInput() {
    document.getElementById('sampleInput').value = '';
    this.updateSampleCount();
    await this.saveState();
  }

  /**
   * Clear results
   */
  async clearResults() {
    document.getElementById('resultsSection').style.display = 'none';
    document.getElementById('resultsContent').innerHTML = '';
    this.currentResults = [];
    await this.saveState();
  }

  /**
   * Show help
   */
  showHelp() {
    const helpText = `
Splice Batch License Generator Help

1. Make sure you're logged in to Splice.com
2. Configure your license information in Settings
3. Enter sample names, one per line
4. Click "Generate Licenses" to process
5. Download the generated licenses

For support, visit the extension's GitHub page.
    `.trim();

    alert(helpText);
  }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new PopupManager();
});
