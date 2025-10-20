/**
 * Service Worker for Splice License Batch Generator
 * Handles session management, API coordination, and background tasks
 */

class SpliceSessionManager {
  constructor() {
    this.sessionCache = null;
    this.sessionTimestamp = null;
    this.cacheTimeout = 30 * 1000; // 30 seconds (reduced from 5 minutes)
  }

  /**
   * Check authentication via cookies (most reliable method)
   * @returns {Promise<Object|null>} Cookie-based auth status or null if inconclusive
   */
  async checkAuthViaCookies() {
    try {
      // Get all cookies for splice.com and subdomains
      const cookies = await chrome.cookies.getAll({
        domain: 'splice.com'
      });

      // Check .splice.com (with leading dot for all subdomains)
      const domainCookies = await chrome.cookies.getAll({
        domain: '.splice.com'
      });

      // Also check auth.splice.com for Auth0 tokens
      const authCookies = await chrome.cookies.getAll({
        domain: 'auth.splice.com'
      });

      // Combine and deduplicate cookies
      const allCookies = [...cookies, ...domainCookies, ...authCookies];
      const uniqueCookies = Array.from(
        new Map(allCookies.map(c => [c.name + c.domain, c])).values()
      );


      // If we have no cookies at all, user is definitely not logged in
      if (uniqueCookies.length === 0) {
        return {
          loggedIn: false,
          method: 'cookies',
          reason: 'no_cookies'
        };
      }

      // Look for Splice-specific authentication cookies
      // Based on testing: _splice_token_prod is the most reliable indicator
      // auth0 cookie persists even after logout, so we can't rely on it alone
      const auth0Cookie = uniqueCookies.find(c => c.name === 'auth0');
      const spliceTokenCookie = uniqueCookies.find(c => c.name === '_splice_token_prod');
      const xsrfCookie = uniqueCookies.find(c => c.name === 'XSRF-TOKEN');

      const hasAuth0 = !!auth0Cookie;
      const hasSpliceToken = !!spliceTokenCookie;

      // Check if auth0 cookie is expired
      if (auth0Cookie) {
        const now = Date.now() / 1000; // Convert to seconds
        const expiry = auth0Cookie.expirationDate;
        const isExpired = expiry && expiry < now;

        if (isExpired) {
          return {
            loggedIn: false,
            method: 'cookies',
            reason: 'auth0_expired'
          };
        }
      }

      // User is logged in ONLY if we have the Splice token
      // The _splice_token_prod is deleted on logout, making it reliable
      if (hasSpliceToken) {
        return {
          loggedIn: true,
          method: 'cookies',
          user: null // Will be extracted from DOM
        };
      }

      // If we only have auth0 but no splice token, user is logged out
      if (hasAuth0 && !hasSpliceToken) {
        return {
          loggedIn: false,
          method: 'cookies',
          reason: 'no_splice_token'
        };
      }

      // We have cookies but no specific auth cookie
      // This could mean logged in or out - return inconclusive
      return null; // Fall through to DOM check
    } catch (error) {
      console.error('Cookie check failed:', error);
      return null; // Inconclusive, fall back to other methods
    }
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

      // FIRST: Try cookie-based authentication (most reliable)
      const cookieAuth = await this.checkAuthViaCookies();

      if (cookieAuth && cookieAuth.loggedIn === false) {
        // Cookies indicate NOT logged in - return immediately
        const authStatus = {
          loggedIn: false,
          method: 'cookies',
          timestamp: Date.now()
        };
        this.sessionCache = authStatus;
        this.sessionTimestamp = Date.now();
        return authStatus;
      }

      // If cookies indicate logged in OR inconclusive, continue to get username from DOM

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
            // If cookies said logged in but DOM says not, trust the cookies
            if (cookieAuth && cookieAuth.loggedIn === true) {
              const authStatus = {
                loggedIn: true,
                user: null,
                method: 'cookies_override',
                timestamp: Date.now()
              };
              this.sessionCache = authStatus;
              this.sessionTimestamp = Date.now();
              return authStatus;
            }

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
            // If cookies said logged in but DOM says not, trust the cookies
            if (cookieAuth && cookieAuth.loggedIn === true) {
              const authStatus = {
                loggedIn: true,
                user: null,
                method: 'cookies_override',
                timestamp: Date.now()
              };
              this.sessionCache = authStatus;
              this.sessionTimestamp = Date.now();
              return authStatus;
            }

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
   * Force a fresh session check by clearing the cache
   */
  forceFreshCheck() {
    this.sessionCache = null;
    this.sessionTimestamp = null;
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
      // Use GraphQL API via content script - no navigation needed!
      // Just need ANY Splice tab to execute the query

      let spliceTabs = await chrome.tabs.query({ url: 'https://splice.com/*' });
      let targetTab;

      if (spliceTabs.length === 0) {
        // Create a hidden background tab at the Splice home page
        targetTab = await chrome.tabs.create({
          url: 'https://splice.com/',
          active: false // Keep it hidden
        });

        // Wait for the tab to load
        await new Promise(resolve => setTimeout(resolve, 3000));
      } else {
        // Use an existing Splice tab (any one will do)
        targetTab = spliceTabs[0];
      }

      // Use the content script to search via GraphQL (no navigation!)
      try {
        const response = await chrome.tabs.sendMessage(targetTab.id, {
          action: 'searchSampleViaGraphQL',
          sampleName: query
        });

        if (response && response.success) {
          // Convert GraphQL response format to our expected format
          const result = response.sample ? {
            id: response.sample.assetUuid,
            name: query,
            url: null,
            inLibrary: response.sample.licensed || false,
            metadata: {}
          } : null;

          return {
            query,
            results: result ? [result] : [],
            total: result ? 1 : 0,
            success: true
          };
        } else {
          return {
            query,
            results: [],
            success: false,
            error: response?.error || 'Sample not found'
          };
        }
      } catch (error) {
        // Handle connection errors gracefully
        if (error.message && error.message.includes('Receiving end does not exist')) {
          return {
            query,
            results: [],
            success: false,
            error: 'Please refresh the Splice.com page and try again.'
          };
        }

        console.error('Search failed:', error);
        return {
          query,
          results: [],
          success: false,
          error: error.message || 'Search failed'
        };
      }
    } catch (error) {
      console.error('Search failed:', error);
      return {
        query,
        results: [],
        error: error.message || 'Search failed. Please try again.',
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
          // Handle connection errors gracefully
          if (error.message && error.message.includes('Receiving end does not exist')) {
            return {
              sampleId,
              success: false,
              error: 'Please refresh the Splice.com page and try again.',
              licenseInfo: licenseInfo
            };
          }

          console.error('License generation failed:', error);
          return {
            sampleId,
            success: false,
            error: error.message || 'License generation failed',
            licenseInfo: licenseInfo
          };
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
          // Handle connection errors gracefully
          if (error.message && error.message.includes('Receiving end does not exist')) {
            return {
              sampleId,
              success: false,
              error: 'Please refresh the Splice.com page and try again.',
              licenseInfo: licenseInfo
            };
          }

          console.error('License generation failed:', error);
          return {
            sampleId,
            success: false,
            error: error.message || 'License generation failed',
            licenseInfo: licenseInfo
          };
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

        case 'debugCookies':
          // Debug: List all Splice cookies
          try {
            const spliceCookies = await chrome.cookies.getAll({ domain: 'splice.com' });
            const spliceDomainCookies = await chrome.cookies.getAll({ domain: '.splice.com' });
            const authCookies = await chrome.cookies.getAll({ domain: 'auth.splice.com' });

            // Combine and deduplicate
            const allCookies = [...spliceCookies, ...spliceDomainCookies, ...authCookies];
            const uniqueCookies = Array.from(
              new Map(allCookies.map(c => [c.name + c.domain, c])).values()
            );

            return {
              success: true,
              spliceCookies: uniqueCookies.map(c => ({
                name: c.name,
                domain: c.domain,
                value: c.value.substring(0, 20) + '...',
                secure: c.secure,
                httpOnly: c.httpOnly
              })),
              authCookies: [] // Keep for backward compat but already included above
            };
          } catch (error) {
            return { success: false, error: error.message };
          }

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

// Listen for cookie changes to detect login/logout
chrome.cookies.onChanged.addListener((changeInfo) => {
  // Only care about Splice cookies
  if (!changeInfo.cookie.domain.includes('splice.com')) {
    return;
  }

  // Check if it's an auth-related cookie
  const authCookieNames = ['auth0', '_splice_token_prod', 'XSRF-TOKEN'];
  const isAuthCookie = authCookieNames.some(name =>
    changeInfo.cookie.name === name
  );

  if (isAuthCookie) {
    // Clear cache to force re-check on next popup open
    sessionManager.clearSessionCache();
  }
});

