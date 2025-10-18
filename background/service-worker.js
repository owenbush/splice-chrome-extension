/**
 * Service Worker for Splice Batch License Generator
 * Handles session management, API coordination, and background tasks
 */

class SpliceSessionManager {
  constructor() {
    this.sessionCache = null;
    this.sessionTimestamp = null;
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  /**
   * Check if user is logged in to Splice
   * @returns {Promise<Object>} Authentication status and user data
   */
  async checkUserLoggedIn() {
    try {
      // Check cache first
      if (this.sessionCache && this.isSessionCacheValid()) {
        return this.sessionCache;
      }

      // Get current active tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url.includes('splice.com')) {
        // If not on Splice.com, check if we have a Splice tab open
        const spliceTabs = await chrome.tabs.query({ url: 'https://splice.com/*' });

        if (spliceTabs.length === 0) {
          return {
            loggedIn: false,
            error: 'Not on Splice.com',
            timestamp: Date.now()
          };
        }

        // Use the first Splice tab
        const spliceTab = spliceTabs[0];

        // Send message to content script to check session
        try {
          const response = await chrome.tabs.sendMessage(spliceTab.id, { action: 'getSessionData' });

          if (response && response.loggedIn) {
            const authStatus = {
              loggedIn: true,
              user: response.user || { username: 'Unknown' },
              timestamp: Date.now()
            };

            this.sessionCache = authStatus;
            this.sessionTimestamp = Date.now();

            return authStatus;
          } else {
            const authStatus = {
              loggedIn: false,
              error: 'Not logged in to Splice',
              timestamp: Date.now()
            };

            this.sessionCache = authStatus;
            this.sessionTimestamp = Date.now();

            return authStatus;
          }
        } catch (error) {
          console.error('Content script communication failed:', error);
          console.error('Error details:', error.message);

          // Handle different types of communication errors
          if (error.message.includes('Receiving end does not exist') ||
              error.message.includes('Extension context invalidated')) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: spliceTab.id },
                files: ['content/content-script.js']
              });

              // Wait a moment for the script to initialize
              await new Promise(resolve => setTimeout(resolve, 2000));

              // Try the message again
              const response = await chrome.tabs.sendMessage(spliceTab.id, { action: 'getSessionData' });

              if (response && response.loggedIn) {
                const authStatus = {
                  loggedIn: true,
                  user: response.user || { username: 'Unknown' },
                  timestamp: Date.now()
                };

                this.sessionCache = authStatus;
                this.sessionTimestamp = Date.now();

                return authStatus;
              }
            } catch (injectionError) {
              console.error('Failed to inject content script:', injectionError);
            }
          }

          return {
            loggedIn: false,
            error: 'Cannot communicate with Splice.com',
            timestamp: Date.now()
          };
        }
      } else {
        // We're on Splice.com, check session via content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSessionData' });

          if (response && response.loggedIn) {
            const authStatus = {
              loggedIn: true,
              user: response.user || { username: 'Unknown' },
              timestamp: Date.now()
            };

            this.sessionCache = authStatus;
            this.sessionTimestamp = Date.now();

            return authStatus;
          } else {
            const authStatus = {
              loggedIn: false,
              error: 'Not logged in to Splice',
              timestamp: Date.now()
            };

            this.sessionCache = authStatus;
            this.sessionTimestamp = Date.now();

            return authStatus;
          }
        } catch (error) {
          console.error('Content script communication failed:', error);
          console.error('Error details:', error.message);

          // Try to inject content script if it's not loaded
          if (error.message.includes('Receiving end does not exist')) {
            try {
              await chrome.scripting.executeScript({
                target: { tabId: tab.id },
                files: ['content/content-script.js']
              });

              // Wait a moment for the script to initialize
              await new Promise(resolve => setTimeout(resolve, 1000));

              // Try the message again
              const response = await chrome.tabs.sendMessage(tab.id, { action: 'getSessionData' });

              if (response && response.loggedIn) {
                const authStatus = {
                  loggedIn: true,
                  user: response.user || { username: 'Unknown' },
                  timestamp: Date.now()
                };

                this.sessionCache = authStatus;
                this.sessionTimestamp = Date.now();

                return authStatus;
              }
            } catch (injectionError) {
              console.error('Failed to inject content script:', injectionError);
            }
          }

          return {
            loggedIn: false,
            error: 'Cannot communicate with Splice.com',
            timestamp: Date.now()
          };
        }
      }
    } catch (error) {
      console.error('Session check failed:', error);
      return {
        loggedIn: false,
        error: error.message,
        timestamp: Date.now()
      };
    }
  }

  /**
   * Get XSRF token from session
   * @returns {Promise<string|null>} XSRF token or null
   */
  async getXSRFToken() {
    try {
      // Get current active tab or Splice tab
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url.includes('splice.com')) {
        // If not on Splice.com, check if we have a Splice tab open
        const spliceTabs = await chrome.tabs.query({ url: 'https://splice.com/*' });

        if (spliceTabs.length === 0) {
          console.error('No Splice.com tab found for XSRF token');
          return null;
        }

        // Use the first Splice tab
        const spliceTab = spliceTabs[0];

        // Send message to content script to get XSRF token
        try {
          const response = await chrome.tabs.sendMessage(spliceTab.id, { action: 'getXSRFToken' });
          return response?.token || null;
        } catch (error) {
          console.error('Content script communication failed for XSRF token:', error);
          return null;
        }
      } else {
        // We're on Splice.com, get XSRF token via content script
        try {
          const response = await chrome.tabs.sendMessage(tab.id, { action: 'getXSRFToken' });
          return response?.token || null;
        } catch (error) {
          console.error('Content script communication failed for XSRF token:', error);
          return null;
        }
      }
    } catch (error) {
      console.error('XSRF token fetch failed:', error);
      return null;
    }
  }

  /**
   * Check if session cache is still valid
   * @returns {boolean} True if cache is valid
   */
  isSessionCacheValid() {
    if (!this.sessionTimestamp) return false;
    return (Date.now() - this.sessionTimestamp) < this.cacheTimeout;
  }

  /**
   * Clear session cache
   */
  clearSessionCache() {
    this.sessionCache = null;
    this.sessionTimestamp = null;
  }
}

class SpliceAPIManager {
  constructor() {
    this.sessionManager = new SpliceSessionManager();
  }

  /**
   * Make authenticated API request
   * @param {string} endpoint - API endpoint
   * @param {Object} data - Request data
   * @param {string} method - HTTP method
   * @returns {Promise<Object>} API response
   */
  async makeAuthenticatedRequest(endpoint, data = null, method = 'GET') {
    try {
      // Get XSRF token
      const tokenResponse = await this.sessionManager.getXSRFToken();
      if (!tokenResponse) {
        throw new Error('Failed to get XSRF token');
      }

      const headers = {
        'Accept': `*/*; xsrf=${tokenResponse}`,
        'Origin': 'https://splice.com',
        'Referer': 'https://splice.com/',
        'Cache-Control': 'no-cache'
      };

      if (data && method !== 'GET') {
        headers['Content-Type'] = 'application/json';
      }

      const requestOptions = {
        method,
        credentials: 'include',
        headers
      };

      if (data && method !== 'GET') {
        requestOptions.body = JSON.stringify(data);
      }

      const response = await fetch(`https://api.splice.com${endpoint}`, requestOptions);

      if (!response.ok) {
        throw new Error(`API request failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } catch (error) {
      console.error('Authenticated request failed:', error);
      throw error;
    }
  }

  /**
   * Search for samples
   * @param {string} query - Search query
   * @returns {Promise<Object>} Search results
   */
  async searchSamples(query) {
    try {

      // Use the direct Splice search URL pattern
      const searchUrl = `https://splice.com/sounds/search/samples?filepath=${encodeURIComponent(query)}`;

      // Try to use content script to navigate to search page and extract results
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url.includes('splice.com')) {
        // If not on Splice.com, check if we have a Splice tab open
        const spliceTabs = await chrome.tabs.query({ url: 'https://splice.com/*' });

        if (spliceTabs.length === 0) {
          throw new Error('No Splice.com tab found for search');
        }

        // Use the first Splice tab
        const spliceTab = spliceTabs[0];

        try {
          await chrome.tabs.update(spliceTab.id, { url: searchUrl });

          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 3000));

          const response = await chrome.tabs.sendMessage(spliceTab.id, {
            action: 'extractSearchResults'
          });

          if (response && response.success) {
            return {
              query,
              results: response.results || [],
              total: response.total || 0,
              success: true
            };
          } else {
            throw new Error(response?.error || 'Search extraction failed');
          }
        } catch (error) {
          console.error('Search extraction failed:', error);
          throw error;
        }
      } else {
        // We're on Splice.com, navigate to search page
        try {
          await chrome.tabs.update(tab.id, { url: searchUrl });

          // Wait for page to load
          await new Promise(resolve => setTimeout(resolve, 3000));

          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'extractSearchResults'
          });

          if (response && response.success) {
            return {
              query,
              results: response.results || [],
              total: response.total || 0,
              success: true
            };
          } else {
            throw new Error(response?.error || 'Search extraction failed');
          }
        } catch (error) {
          console.error('Search extraction failed:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('Search failed:', error);
      return {
        query,
        results: [],
        error: error.message,
        success: false
      };
    }
  }

  /**
   * Add sample to library
   * @param {string} sampleId - Sample ID
   * @returns {Promise<Object>} Add result
   */
  async addSampleToLibrary(sampleId) {
    try {

      // Get XSRF token first
      const xsrfToken = await this.sessionManager.getXSRFToken();
      if (!xsrfToken) {
        throw new Error('Could not get XSRF token');
      }

      // Make request to add sample to library
      const response = await fetch('https://api.splice.com/www/sounds/library', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': 'https://splice.com',
          'Referer': 'https://splice.com/',
          'X-XSRF-TOKEN': xsrfToken
        },
        body: JSON.stringify({
          sound_id: sampleId
        })
      });

      if (!response.ok) {
        throw new Error(`Add to library request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      return {
        sampleId,
        success: true,
        result: result
      };
    } catch (error) {
      console.error('Add to library failed:', error);
      return {
        sampleId,
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Generate license for sample
   * @param {string} sampleId - Sample ID
   * @param {Object} licenseInfo - License information
   * @returns {Promise<Object>} License generation result
   */
  async generateLicense(sampleId, licenseInfo) {
    try {

      // Use content script to make the GraphQL request from Splice.com context
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });

      if (!tab || !tab.url.includes('splice.com')) {
        // If not on Splice.com, check if we have a Splice tab open
        const spliceTabs = await chrome.tabs.query({ url: 'https://splice.com/*' });

        if (spliceTabs.length === 0) {
          throw new Error('No Splice.com tab found for license generation');
        }

        // Use the first Splice tab
        const spliceTab = spliceTabs[0];

        try {
          const response = await chrome.tabs.sendMessage(spliceTab.id, {
            action: 'generateLicense',
            sampleId: sampleId,
            sampleName: licenseInfo.sampleName || null, // Pass sample name if available
            licenseInfo: licenseInfo
          });

          if (response && response.success) {
            return {
              sampleId,
              success: true,
              result: response.result,
              downloadUrl: response.downloadUrl,
              licenseInfo: licenseInfo
            };
          } else {
            throw new Error(response?.error || 'License generation failed');
          }
        } catch (error) {
          console.error('License generation failed:', error);
          throw error;
        }
      } else {
        // We're on Splice.com, use current tab
        try {
          const response = await chrome.tabs.sendMessage(tab.id, {
            action: 'generateLicense',
            sampleId: sampleId,
            sampleName: licenseInfo.sampleName || null, // Pass sample name if available
            licenseInfo: licenseInfo
          });

          if (response && response.success) {
            return {
              sampleId,
              success: true,
              result: response.result,
              downloadUrl: response.downloadUrl,
              licenseInfo: licenseInfo
            };
          } else {
            throw new Error(response?.error || 'License generation failed');
          }
        } catch (error) {
          console.error('License generation failed:', error);
          throw error;
        }
      }
    } catch (error) {
      console.error('License generation failed:', error);
      return {
        sampleId,
        success: false,
        error: error.message,
        licenseInfo: licenseInfo
      };
    }
  }
}

// Initialize managers
const sessionManager = new SpliceSessionManager();
const apiManager = new SpliceAPIManager();

// Handle messages from popup and content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle async operations properly
  const handleMessage = async () => {
    try {

      switch (message.action) {
        case 'checkAuth':
          const authStatus = await sessionManager.checkUserLoggedIn();
          return authStatus;

        case 'getXSRFToken':
          const token = await sessionManager.getXSRFToken();
          return { token };

        case 'searchSamples':
          const searchResults = await apiManager.searchSamples(message.query);
          return searchResults;

        case 'addSampleToLibrary':
          const addResult = await apiManager.addSampleToLibrary(message.sampleId);
          return addResult;

        case 'generateLicense':
          const licenseResult = await apiManager.generateLicense(message.sampleId, message.licenseInfo);
          return licenseResult;

        case 'clearSessionCache':
          sessionManager.clearSessionCache();
          return { success: true };

        case 'testContentScript':
          // Test if we can communicate with content script
          try {
            const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
            if (tab && tab.url.includes('splice.com')) {
              const response = await chrome.tabs.sendMessage(tab.id, { action: 'test' });
              return { success: true, response };
            } else {
              return { success: false, error: 'Not on Splice.com' };
            }
          } catch (error) {
            return { success: false, error: error.message };
          }

        default:
          return { error: 'Unknown action' };
      }
    } catch (error) {
      console.error('Message handler error:', error);
      return {
        error: error.message,
        loggedIn: false,
        timestamp: Date.now()
      };
    }
  };

  // Execute async handler and send response
  handleMessage().then(response => {
    sendResponse(response);
  }).catch(error => {
    console.error('Handler execution failed:', error);
    sendResponse({
      error: error.message,
      loggedIn: false,
      timestamp: Date.now()
    });
  });

  // Return true to indicate we will send a response asynchronously
  return true;
});

// Handle extension installation
chrome.runtime.onInstalled.addListener((details) => {

  if (details.reason === 'install') {
    // Open options page for initial setup
    chrome.runtime.openOptionsPage();
  }
});

// Handle tab updates to clear session cache when navigating away from Splice
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.url && !tab.url.includes('splice.com')) {
    sessionManager.clearSessionCache();
  }
});

