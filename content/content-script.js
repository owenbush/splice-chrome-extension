/**
 * Content script for Splice.com
 * Handles session detection and communication with the extension
 */

class SpliceContentScript {
  constructor() {
    this.sampleUuidCache = new Map(); // Cache sample names to UUIDs
    this.init();
  }

  /**
   * Initialize the content script
   */
  init() {
    this.setupEventListeners();
    this.setupMessageListener();
    this.detectSession();
    this.extractPageData();
    this.interceptAnalytics();
    this.injectPageScript();
  }

  /**
   * Intercept Splice's analytics events to capture sample UUIDs
   */
  interceptAnalytics() {
    try {
      // Intercept fetch calls to analytics endpoints
      const originalFetch = window.fetch;
      const self = this;

      window.fetch = async function(...args) {
        const response = await originalFetch.apply(this, args);

        // Check if this is an analytics request
        if (args[0] && typeof args[0] === 'string' && args[0].includes('segment')) {
          try {
            const requestBody = args[1]?.body;

            if (requestBody) {
              const bodyText = typeof requestBody === 'string' ? requestBody : requestBody.toString();

              try {
                const bodyJson = JSON.parse(bodyText);

                // Check if this contains sample UUID information
                if (bodyJson.properties && bodyJson.properties.object_uuid && bodyJson.properties.object_display_name) {
                  const uuid = bodyJson.properties.object_uuid;
                  const displayName = bodyJson.properties.object_display_name;

                  // Extract just the filename from the display name
                  const filename = displayName.split('/').pop();

                  self.sampleUuidCache.set(filename, uuid);
                }
              } catch (e) {
                // Ignore JSON parse errors
              }
            }
          } catch (e) {
            // Ignore errors in analytics interception
          }
        }

        return response;
      };

    } catch (error) {
      console.error('Failed to intercept analytics:', error);
    }
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // Listen for page changes (SPA navigation)
    let lastUrl = location.href;
    new MutationObserver(() => {
      const url = location.href;
      if (url !== lastUrl) {
        lastUrl = url;
        this.handlePageChange();
      }
    }).observe(document, { subtree: true, childList: true });

    // Listen for storage changes
    chrome.storage.onChanged.addListener((changes, namespace) => {
      if (namespace === 'local' && changes.licenseInfo) {
        this.handleLicenseInfoChange(changes.licenseInfo);
      }
    });
  }

  /**
   * Detect user session on Splice.com
   */
  detectSession() {
    try {
      // Check for user data in global variables
      const userData = this.extractUserData();

      if (userData) {
        this.sendSessionData(userData);
      } else {
        this.sendSessionData(null);
      }
    } catch (error) {
      console.error('Session detection failed:', error);
      this.sendSessionData(null);
    }
  }

  /**
   * Extract user data from the page
   */
  extractUserData() {
    try {
      // Check URL for auth-related paths first (before any DOM access)
      const url = window.location.href;
      if (url.includes('/login') || url.includes('/auth') || url.includes('/signin')) {
        return { loggedIn: false, detected: true, reason: 'auth_page' };
      }

      // FIRST: Check for login/logout buttons to detect logged out state
      // Wrap in try-catch as DOM queries can throw on some pages
      try {
        const loginButtons = [
          document.querySelector('a[href*="login"]'),
          document.querySelector('button[class*="login"]'),
          document.querySelector('[data-testid*="login"]'),
          document.querySelector('a[href*="signin"]'),
          document.querySelector('button[class*="signin"]')
        ];

        // If we find login buttons, user is definitely not logged in
        if (loginButtons.some(button => button !== null && button.offsetParent !== null)) {
          return { loggedIn: false, detected: true, reason: 'login_button_found' };
        }
      } catch (domError) {
        // DOM query failed, continue to other methods
      }

      // Method 1: Check for user data in window object (most reliable)
      try {
        if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.user) {
          return { loggedIn: true, user: window.__INITIAL_STATE__.user };
        }
      } catch (stateError) {
        // Can't access __INITIAL_STATE__, continue to other methods
      }

      // Method 2: Check for user data in other common locations
      try {
        if (window.user) {
          return { loggedIn: true, user: window.user };
        }
      } catch (userError) {
        // Can't access window.user, continue to other methods
      }

      // Method 3: Try to extract user info from DOM elements
      try {
        const userInfo = this.extractUserInfoFromDOM();
        if (userInfo) {
          return { loggedIn: true, user: userInfo };
        }
      } catch (domError) {
        // DOM extraction failed, continue
      }

      // If we got here and didn't find login buttons, assume not logged in
      return { loggedIn: false, detected: false, reason: 'no_indicators_found' };
    } catch (error) {
      console.error('User data extraction failed:', error);
      return { loggedIn: false, error: String(error), reason: 'exception' };
    }
  }

  /**
   * Extract user information from DOM elements
   */
  extractUserInfoFromDOM() {
    try {
      // List of words to exclude (login/signup related AND generic placeholders)
      const excludeWords = [
        'log in', 'login', 'sign in', 'signin', 'sign up', 'signup',
        'try now', 'get started', 'register', 'user avatar', 'avatar',
        'profile picture', 'profile image', 'user icon', 'account',
        'menu', 'button', 'image', 'icon'
      ];

      // Look for user name in very specific places only
      const userNameSelectors = [
        '[data-testid="user-name"]',
        '[data-testid="username"]',
        '[data-testid="profile-name"]',
        '.user-name',
        '.username',
        '.profile-name'
      ];

      for (const selector of userNameSelectors) {
        const element = document.querySelector(selector);
        if (element) {
          const text = (element.textContent || '').trim();
          const lowerText = text.toLowerCase();

          // Validate it's actually a username and not a login button or generic text
          if (text && text.length > 1 && text.length < 30 &&
              !excludeWords.some(word => lowerText.includes(word)) &&
              !lowerText.startsWith('user') && // Don't accept "User avatar", "User menu", etc.
              !lowerText.endsWith('avatar') &&
              !lowerText.endsWith('menu')) {
            return {
              username: text,
              detected: true
            };
          }
        }
      }

      // Skip avatar/image alt text extraction - too unreliable
      // It often contains generic text like "User avatar" instead of actual usernames

      return null;
    } catch (error) {
      console.error('DOM user info extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract XSRF token from the page
   */
  async extractXSRFToken() {
    try {

      // Method 1: Check meta tag
      const metaTag = document.querySelector('meta[name="xsrf-token"]');
      if (metaTag) {
        return metaTag.content;
      }

      // Method 2: Check for token in script tags
      const scripts = document.querySelectorAll('script');
      for (const script of scripts) {
        const content = script.textContent;
        if (content && content.includes('xsrf')) {
          const match = content.match(/xsrf["\s]*[:=]["\s]*([^"'\s,}]+)/);
          if (match) {
            return match[1];
          }
        }
      }

      // Method 3: Check for token in data attributes
      const elements = document.querySelectorAll('[data-xsrf-token]');
      if (elements.length > 0) {
        return elements[0].getAttribute('data-xsrf-token');
      }

      // Method 4: Check window object for XSRF token
      if (window.__INITIAL_STATE__ && window.__INITIAL_STATE__.xsrf) {
        return window.__INITIAL_STATE__.xsrf;
      }

      // Method 5: Check for token in cookies
      const cookies = document.cookie.split(';');
      for (const cookie of cookies) {
        const [name, value] = cookie.trim().split('=');
        if (name === 'xsrf' || name === 'XSRF-TOKEN') {
          return value;
        }
      }

      // Method 6: Check for token in localStorage/sessionStorage
      const localStorageToken = localStorage.getItem('xsrf') || localStorage.getItem('XSRF-TOKEN');
      if (localStorageToken) {
        return localStorageToken;
      }

      const sessionStorageToken = sessionStorage.getItem('xsrf') || sessionStorage.getItem('XSRF-TOKEN');
      if (sessionStorageToken) {
        return sessionStorageToken;
      }

      // Method 7: Try to get token via API call (content script can make same-origin requests)
      try {
        const response = await fetch('/session?features=true', {
          credentials: 'include',
          headers: {
            'Accept': '*/*',
            'Origin': window.location.origin,
            'Referer': window.location.href
          }
        });

        if (response.ok) {
          const sessionData = await response.json();
          if (sessionData.xsrf) {
            return sessionData.xsrf;
          }
        }
      } catch (apiError) {
      }

      return null;
    } catch (error) {
      console.error('XSRF token extraction failed:', error);
      return null;
    }
  }

  /**
   * Extract page data for the extension
   */
  extractPageData() {
    try {
      const pageData = {
        url: window.location.href,
        title: document.title,
        userAgent: navigator.userAgent,
        timestamp: Date.now()
      };

      // Extract additional Splice-specific data
      const spliceData = this.extractSpliceData();
      if (spliceData) {
        Object.assign(pageData, spliceData);
      }

      this.sendPageData(pageData);
    } catch (error) {
      console.error('Page data extraction failed:', error);
    }
  }

  /**
   * Extract Splice-specific data from the page
   */
  extractSpliceData() {
    try {
      const data = {};

      // Extract user information
      const userData = this.extractUserData();
      if (userData) {
        data.user = userData;
      }

      // Extract XSRF token
      const xsrfToken = this.extractXSRFToken();
      if (xsrfToken) {
        data.xsrfToken = xsrfToken;
      }

      // Extract page type
      const pageType = this.detectPageType();
      if (pageType) {
        data.pageType = pageType;
      }

      return data;
    } catch (error) {
      console.error('Splice data extraction failed:', error);
      return null;
    }
  }

  /**
   * Detect the type of Splice page
   */
  detectPageType() {
    const url = window.location.href;
    const pathname = window.location.pathname;

    if (pathname === '/' || pathname === '/sounds') {
      return 'sounds';
    } else if (pathname.includes('/sounds/')) {
      return 'sound-detail';
    } else if (pathname.includes('/library')) {
      return 'library';
    } else if (pathname.includes('/search')) {
      return 'search';
    } else if (pathname.includes('/auth') || pathname.includes('/login')) {
      return 'auth';
    } else {
      return 'other';
    }
  }

  /**
   * Handle page changes (SPA navigation)
   */
  handlePageChange() {
    // Debounce page change detection
    clearTimeout(this.pageChangeTimeout);
    this.pageChangeTimeout = setTimeout(() => {
      this.detectSession();
      this.extractPageData();
    }, 500);
  }

  /**
   * Handle license information changes
   */
  handleLicenseInfoChange(licenseInfo) {
    // Could be used to update UI or perform actions based on license info
  }

  /**
   * Send session data to the extension
   */
  sendSessionData(userData) {
    try {
      chrome.runtime.sendMessage({
        action: 'sessionData',
        data: userData,
        timestamp: Date.now()
      });
    } catch (error) {
    }
  }

  /**
   * Send page data to the extension
   */
  sendPageData(pageData) {
    try {
      chrome.runtime.sendMessage({
        action: 'pageData',
        data: pageData,
        timestamp: Date.now()
      });
    } catch (error) {
    }
  }

  /**
   * Search for samples on the current page
   */
  async searchSamplesOnPage(query) {
    try {

      // Try to find and use the search functionality on Splice.com
      const searchInput = document.querySelector('input[type="search"], input[placeholder*="search"], input[placeholder*="Search"]');

      if (searchInput) {

        // Clear and fill the search input
        searchInput.value = '';
        searchInput.focus();
        searchInput.value = query;

        // Trigger search (try different events)
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));

        // Try to find and click search button
        const searchButton = document.querySelector('button[type="submit"], button[aria-label*="search"], button[aria-label*="Search"]');
        if (searchButton) {
          searchButton.click();
        } else {
          // Try pressing Enter
          searchInput.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
        }

        // Wait for search results to load
        await new Promise(resolve => setTimeout(resolve, 2000));

        // Extract search results from the page
        const results = this.extractSearchResults();

        return {
          success: true,
          results: results,
          total: results.length,
          query: query
        };
      } else {
        return {
          success: false,
          error: 'No search functionality found on current page',
          results: [],
          total: 0
        };
      }
    } catch (error) {
      console.error('Search on page failed:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        total: 0
      };
    }
  }

  /**
   * Extract search results from the current page
   */
  async extractSearchResults() {
    try {

      const results = [];

      // Wait a bit for the page to fully load
      await new Promise(resolve => setTimeout(resolve, 1000));

      // Look for Splice-specific search result selectors based on the table structure
      const resultSelectors = [
        // Based on the table structure from the search results page
        'tr', // Table rows
        'tbody tr', // Table body rows
        '[data-testid*="sound"]',
        '[class*="sound"]',
        '[class*="sample"]',
        '[class*="result"]',
        '.sound-item',
        '.sample-item',
        '.search-result',
        // Look for elements that contain sample names
        'div[class*="item"]',
        'article',
        '[role="listitem"]'
      ];

      for (const selector of resultSelectors) {
        const elements = document.querySelectorAll(selector);

        for (let i = 0; i < elements.length; i++) {
          const element = elements[i];

          // Debug: show the structure of the first few elements
          if (i < 3) {
          }

          const result = this.extractSampleFromElement(element);
          if (result) {
            results.push(result);
          } else {
          }
        }
      }

      // Also look for any text that matches the search query
      const searchQuery = this.getSearchQueryFromURL();
      if (searchQuery) {
        const matchingElements = this.findElementsByText(searchQuery);

        for (const element of matchingElements) {
          const result = this.extractSampleFromElement(element);
          if (result) {
            results.push(result);
          }
        }
      }


      // Check for problematic IDs in results
      results.forEach((result, index) => {
        // Check if this result has a problematic ID
        if (result.id === 'samples' || result.id === 'sample' || result.id === '') {
          console.warn(`⚠️ Problematic ID found in result ${index + 1}:`, result.id);
          console.warn('Full result object:', result);
        }
      });

      return {
        success: true,
        results: results,
        total: results.length,
        query: searchQuery
      };
    } catch (error) {
      console.error('Failed to extract search results:', error);
      return {
        success: false,
        error: error.message,
        results: [],
        total: 0
      };
    }
  }

  /**
   * Get search query from URL
   */
  getSearchQueryFromURL() {
    try {
      const url = new URL(window.location.href);
      const filepath = url.searchParams.get('filepath');
      return filepath;
    } catch (error) {
      console.error('Failed to get search query from URL:', error);
      return null;
    }
  }

  /**
   * Find elements that contain specific text
   */
  findElementsByText(searchText) {
    const elements = [];
    const walker = document.createTreeWalker(
      document.body,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    let node;
    while (node = walker.nextNode()) {
      if (node.textContent.includes(searchText)) {
        // Find the closest parent element that might be a result
        let parent = node.parentElement;
        while (parent && parent !== document.body) {
          if (parent.tagName === 'DIV' || parent.tagName === 'ARTICLE' || parent.tagName === 'LI') {
            elements.push(parent);
            break;
          }
          parent = parent.parentElement;
        }
      }
    }

    return elements;
  }

  /**
   * Extract sample information from a DOM element
   */
  extractSampleFromElement(element) {
    try {
      // Check if this sample is in the library (has the green checkmark)
      const inLibrary = this.isSampleInLibrary(element);

      // Only process samples that are in the library
      if (!inLibrary) {
        return null;
      }


      // Try to find sample name from the filename column
      const nameSelectors = [
        'td:nth-child(2)', // Filename column
        '[data-testid*="name"]',
        '.name',
        '.title',
        '.sound-name',
        '.sample-name',
        'h3', 'h4', 'h5',
        'a[href*="sound"]'
      ];

      let name = null;
      for (const selector of nameSelectors) {
        const nameElement = element.querySelector(selector);
        if (nameElement && nameElement.textContent.trim()) {
          name = nameElement.textContent.trim();
          break;
        }
      }

      if (!name) {
        // Try to get text content from the element itself
        name = element.textContent.trim();
        if (name.length > 100) {
          name = name.substring(0, 100) + '...';
        }
      }

      if (!name) {
        return null;
      }

      // Try to find sample ID or link
      // Look for individual sample links (not pack links)
      const sampleLinkSelectors = [
        'a[href*="/sounds/"]',  // Individual sample links
        'a[href*="/sound/"]',   // Alternative sample link pattern
        'a[href*="sample"]',    // Sample-specific links
        'a'                     // Fallback to any link
      ];

      let linkElement = null;
      for (const selector of sampleLinkSelectors) {
        linkElement = element.querySelector(selector);
        if (linkElement && linkElement.href) {

          // Check if this is a pack URL (contains 'samples' or 'packs')
          if (linkElement.href.includes('/packs/') || linkElement.href.includes('/samples')) {
            linkElement = null;
            continue;
          }

          // Check if this looks like an individual sample URL
          if (linkElement.href.includes('/sounds/') && !linkElement.href.includes('/packs/')) {
            break;
          }
        }
      }

      let id = null;

      if (linkElement && linkElement.href) {
        const hrefParts = linkElement.href.split('/');
        id = hrefParts[hrefParts.length - 1];

        // Validate that this looks like a UUID (not 'samples' or other text)
        if (id === 'samples' || id === 'sample' || id.length < 10) {
          id = null;
        }
      } else {
        // Try to find ID in data attributes
        const dataId = element.getAttribute('data-id') ||
                      element.getAttribute('data-sample-id') ||
                      element.getAttribute('data-asset-id');
        if (dataId) {
          id = dataId;
        }
      }

      // If still no ID, try to extract from the row's data attributes
      if (!id) {
        const rowElement = element.closest('[data-id]') || element.closest('[data-sample-id]');
        if (rowElement) {
          id = rowElement.getAttribute('data-id') || rowElement.getAttribute('data-sample-id');
        }
      }

      // If still no valid ID, try to find UUID in the element's data attributes or text content
      if (!id || id === 'samples' || id === 'sample' || id.length < 10) {

        // Look for UUID patterns in data attributes
        const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

        // Check all data attributes for UUIDs
        const allAttributes = element.attributes;
        for (let i = 0; i < allAttributes.length; i++) {
          const attr = allAttributes[i];
          if (attr.value && uuidPattern.test(attr.value)) {
            id = attr.value;
            break;
          }
        }

        // If still no UUID, check parent elements
        if (!id || id === 'samples' || id === 'sample' || id.length < 10) {
          let parent = element.parentElement;
          let depth = 0;
          while (parent && depth < 5) {
            const parentAttributes = parent.attributes;
            for (let i = 0; i < parentAttributes.length; i++) {
              const attr = parentAttributes[i];
              if (attr.value && uuidPattern.test(attr.value)) {
                id = attr.value;
                break;
              }
            }
            if (id && id !== 'samples' && id !== 'sample' && id.length >= 10) {
              break;
            }
            parent = parent.parentElement;
            depth++;
          }
        }
      }

      // Debug: Log all available data attributes to help identify the correct UUID
      const allAttributes = element.attributes;
      for (let i = 0; i < allAttributes.length; i++) {
        const attr = allAttributes[i];
      }

      // Also check parent elements
      let parent = element.parentElement;
      let depth = 0;
      while (parent && depth < 3) {
        const parentAttributes = parent.attributes;
        for (let i = 0; i < parentAttributes.length; i++) {
          const attr = parentAttributes[i];
        }
        parent = parent.parentElement;
        depth++;
      }

      // Try to find UUID in the element's innerHTML or text content
      const elementHTML = element.innerHTML;
      const uuidPattern = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      const uuidMatches = elementHTML.match(uuidPattern);
      if (uuidMatches) {
        // Use the first UUID found
        if (uuidMatches.length > 0) {
          id = uuidMatches[0];
        }
      }

      // Also check parent elements for UUIDs
      if (!id || id === 'samples' || id === 'sample' || id.length < 10) {
        let parent = element.parentElement;
        let depth = 0;
        while (parent && depth < 5) {
          const parentHTML = parent.innerHTML;
          const parentUuidMatches = parentHTML.match(uuidPattern);
          if (parentUuidMatches && parentUuidMatches.length > 0) {
            id = parentUuidMatches[0];
            break;
          }
          parent = parent.parentElement;
          depth++;
        }
      }

      // Try to extract UUID from Angular/React component data
      if (!id || id === 'samples' || id === 'sample' || id.length < 10) {

        // Look for Angular component data
        const ngData = element.__ngContext__ || element.__ng_context__;
        if (ngData) {
        }

        // Try to find UUID in any data properties
        for (const key in element) {
          if (key.startsWith('__') || key.startsWith('ng') || key.startsWith('_')) {
            const value = element[key];
            if (value && typeof value === 'object') {
              const jsonStr = JSON.stringify(value);
              const uuidMatch = jsonStr.match(uuidPattern);
              if (uuidMatch) {
                id = uuidMatch[0];
                break;
              }
            }
          }
        }
      }

      // If still no UUID found, try to extract from window.__INITIAL_STATE__ or other global state
      if (!id || id === 'samples' || id === 'sample' || id.length < 10) {

        // Try to find the sample in window state by matching the name
        if (window.__INITIAL_STATE__ || window.__REDUX_STATE__ || window.__ANGULAR_STATE__) {
          const state = window.__INITIAL_STATE__ || window.__REDUX_STATE__ || window.__ANGULAR_STATE__;
          const stateStr = JSON.stringify(state);

          // Look for the sample name in the state
          if (name && stateStr.includes(name)) {

            // Try to find UUID near the sample name
            const nameIndex = stateStr.indexOf(name);
            const contextBefore = stateStr.substring(Math.max(0, nameIndex - 500), nameIndex);
            const contextAfter = stateStr.substring(nameIndex, Math.min(stateStr.length, nameIndex + 500));
            const context = contextBefore + contextAfter;

            const contextUuidMatch = context.match(uuidPattern);
            if (contextUuidMatch) {
              id = contextUuidMatch[0];
            }
          }
        }
      }

      // Extract additional metadata
      const metadata = this.extractSampleMetadata(element);

      // Find the ellipsis menu button for this sample
      const menuButton = this.findMenuButton(element);

      // Ensure menuButton is a proper DOM element
      if (menuButton && typeof menuButton.click === 'function') {
      } else {
        console.error('Menu button is not a valid DOM element:', menuButton);
      }

      const finalId = id || Math.random().toString(36).substr(2, 9);

      return {
        id: finalId,
        name: name,
        url: linkElement ? linkElement.href : null,
        inLibrary: true,
        metadata: metadata,
        menuButton: menuButton,
        element: element
      };
    } catch (error) {
      console.error('Failed to extract sample from element:', error);
      return null;
    }
  }

  /**
   * Find the ellipsis menu button for a sample
   */
  findMenuButton(element) {
    try {

      // Look for ellipsis menu buttons with more comprehensive selectors
      const menuSelectors = [
        'button[aria-label*="menu"]',
        'button[aria-label*="Menu"]',
        'button[aria-label*="options"]',
        'button[aria-label*="Options"]',
        'button[aria-label*="more"]',
        'button[aria-label*="More"]',
        'button[aria-label*="actions"]',
        'button[aria-label*="Actions"]',
        'button[class*="menu"]',
        'button[class*="ellipsis"]',
        'button[class*="more"]',
        'button[class*="actions"]',
        'button[class*="dropdown"]',
        'button svg use[xlink\\:href*="ellipsis"]',
        'button svg use[xlink\\:href*="menu"]',
        'button svg use[xlink\\:href*="more"]',
        'button svg use[xlink\\:href*="dots"]',
        'button svg use[xlink\\:href*="vertical"]',
        'button svg use[xlink\\:href*="three"]'
      ];

      for (const selector of menuSelectors) {
        const menuButton = element.querySelector(selector);
        if (menuButton) {
          return menuButton;
        }
      }

      // Look for any button in the actions column (last column)
      const actionColumn = element.querySelector('td:last-child');
      if (actionColumn) {
        const buttons = actionColumn.querySelectorAll('button');

        for (let i = 0; i < buttons.length; i++) {
          const button = buttons[i];

          // Check if it's likely a menu button (has ellipsis icon or similar)
          const icon = button.querySelector('svg use');
          if (icon) {
            const href = icon.getAttribute('xlink:href') || '';
            if (href.includes('ellipsis') || href.includes('menu') || href.includes('more') || href.includes('dots')) {
              return button;
            }
          }

          // Also check by text content or other attributes
          const text = button.textContent.toLowerCase();
          const ariaLabel = (button.getAttribute('aria-label') || '').toLowerCase();
          if (text.includes('menu') || text.includes('more') || text.includes('options') ||
              ariaLabel.includes('menu') || ariaLabel.includes('more') || ariaLabel.includes('options')) {
            return button;
          }
        }
      }

      // If no specific action column, look for any button in the element
      const allButtons = element.querySelectorAll('button');

      for (let i = 0; i < allButtons.length; i++) {
        const button = allButtons[i];

        // Check for ellipsis or menu indicators
        const icon = button.querySelector('svg use');
        if (icon) {
          const href = icon.getAttribute('xlink:href') || '';
          if (href.includes('ellipsis') || href.includes('menu') || href.includes('more') || href.includes('dots')) {
            return button;
          }
        }
      }

      // Last resort: look for any clickable element that might be a menu
      const clickableElements = element.querySelectorAll('button, [role="button"], [onclick], [class*="click"], [class*="menu"], [class*="action"]');

      for (let i = 0; i < clickableElements.length; i++) {
        const element = clickableElements[i];

        // If it's in the last column or has menu-like attributes, try it
        const isInLastColumn = element.closest('td:last-child') !== null;
        const hasMenuAttributes = element.className.includes('menu') ||
                                 element.className.includes('action') ||
                                 element.className.includes('more') ||
                                 element.getAttribute('aria-label')?.includes('menu') ||
                                 element.getAttribute('aria-label')?.includes('more');

        if (isInLastColumn || hasMenuAttributes) {
          return element;
        }
      }

      return null;
    } catch (error) {
      console.error('Failed to find menu button:', error);
      return null;
    }
  }

  /**
   * Check if a sample is in the library (has green checkmark)
   */
  isSampleInLibrary(element) {
    try {

      // Look for the green checkmark icon
      const checkIcon = element.querySelector('sp-svg-icon svg use[xlink\\:href="#icon-check-circle-solid"]');
      if (checkIcon) {
        return true;
      }

      // Also check for other indicators
      const inLibrarySelectors = [
        '[class*="check"]',
        '[class*="library"]',
        'svg use[xlink\\:href*="check"]',
        'svg use[xlink\\:href*="circle"]',
        'sp-svg-icon svg use[xlink\\:href*="check"]',
        'sp-svg-icon svg use[xlink\\:href*="circle"]'
      ];

      for (const selector of inLibrarySelectors) {
        const indicator = element.querySelector(selector);
        if (indicator) {
          return true;
        }
      }

      // Also check for any element with check-related classes or attributes
      const checkElements = element.querySelectorAll('[class*="check"], [class*="library"], [data-checked="true"]');
      if (checkElements.length > 0) {
        for (const checkEl of checkElements) {
        }
        return true;
      }

      return false;
    } catch (error) {
      console.error('Failed to check if sample is in library:', error);
      return false;
    }
  }

  /**
   * Extract additional metadata from the sample element
   */
  extractSampleMetadata(element) {
    try {
      const metadata = {};

      // Extract BPM
      const bpmElement = element.querySelector('td:nth-child(5)'); // BPM column
      if (bpmElement) {
        metadata.bpm = bpmElement.textContent.trim();
      }

      // Extract Key
      const keyElement = element.querySelector('td:nth-child(4)'); // Key column
      if (keyElement) {
        metadata.key = keyElement.textContent.trim();
      }

      // Extract Time
      const timeElement = element.querySelector('td:nth-child(3)'); // Time column
      if (timeElement) {
        metadata.time = timeElement.textContent.trim();
      }

      // Extract tags
      const tagElements = element.querySelectorAll('[class*="tag"], .tag, [data-testid*="tag"]');
      if (tagElements.length > 0) {
        metadata.tags = Array.from(tagElements).map(tag => tag.textContent.trim());
      }

      return metadata;
    } catch (error) {
      console.error('Failed to extract metadata:', error);
      return {};
    }
  }

  /**
   * Highlight a sample row to help user find it
   */
  highlightSampleRow(sample) {
    try {

      if (sample.element) {
        // Add a highlight style to the sample row
        sample.element.style.border = '3px solid #ff6b35';
        sample.element.style.backgroundColor = '#fff3cd';
        sample.element.style.boxShadow = '0 0 10px rgba(255, 107, 53, 0.5)';

        // Scroll the element into view
        sample.element.scrollIntoView({
          behavior: 'smooth',
          block: 'center'
        });

      } else {
        console.error('No sample element available for highlighting');
      }
    } catch (error) {
      console.error('Failed to highlight sample row:', error);
    }
  }

  /**
   * Re-find menu button from sample element
   */
  refindMenuButton(sample) {
    try {

      if (!sample.element) {
        console.error('No sample element available');
        return null;
      }

      const menuButton = this.findMenuButton(sample.element);
      if (menuButton && typeof menuButton.click === 'function') {
        return menuButton;
      } else {
        console.error('Could not re-find valid menu button');
        return null;
      }
    } catch (error) {
      console.error('Failed to re-find menu button:', error);
      return null;
    }
  }

  /**
   * Get sample details via GraphQL SamplesSearch query
   */
  async getSampleDetails(sampleName) {
    try {

      const graphqlRequest = {
        operationName: 'SamplesSearch',
        variables: {
          order: 'DESC',
          limit: 1,
          sort: 'popularity',
          includeSubscriberOnlyResults: false,
          filepath: sampleName,
          tags: [],
          tags_exclude: [],
          attributes: [],
          bundled_content_daws: [],
          legacy: true
        },
        query: `query SamplesSearch($filepath: String, $limit: Int = 50) {
          assetsSearch(
            filter: {legacy: true, published: true, asset_type_slug: sample, filepath: $filepath}
            pagination: {limit: $limit}
          ) {
            items {
              ... on IAsset {
                uuid
                name
                liked
                licensed
                asset_type_slug
                __typename
              }
              ... on SampleAsset {
                uuid
                name
                __typename
              }
              ... on ILegacyAsset {
                catalog_uuid
                __typename
              }
              __typename
            }
            __typename
          }
        }`
      };


      const response = await fetch('https://surfaces-graphql.splice.com/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json',
          'Origin': 'https://splice.com',
          'Referer': 'https://splice.com/'
        },
        body: JSON.stringify(graphqlRequest)
      });

      if (!response.ok) {
        console.error('SamplesSearch request failed:', response.status, response.statusText);
        const errorText = await response.text();
        console.error('Error response body:', errorText);
        throw new Error(`SamplesSearch request failed: ${response.status}`);
      }

      const result = await response.json();

      if (result.data && result.data.assetsSearch && result.data.assetsSearch.items && result.data.assetsSearch.items.length > 0) {
        const sample = result.data.assetsSearch.items[0];

        // Check if sample has catalog_uuid (this might be the object UUID we need)
        if (sample.catalog_uuid) {
          return {
            assetUuid: sample.uuid,
            objectUuid: sample.catalog_uuid,
            name: sample.name,
            licensed: sample.licensed
          };
        } else {
          console.warn('⚠️ Sample does not have catalog_uuid, using asset UUID');
          return {
            assetUuid: sample.uuid,
            objectUuid: sample.uuid, // Fallback to asset UUID
            name: sample.name,
            licensed: sample.licensed
          };
        }
      } else {
        throw new Error('Sample not found in search results');
      }
    } catch (error) {
      console.error('Failed to get sample details:', error);
      throw error;
    }
  }

  /**
   * Generate license via GraphQL API from Splice.com context
   * Uses page context to ensure proper authentication
   */
  async generateLicenseViaGraphQL(sampleId, licenseInfo) {
    try {

      // Validate sample ID
      if (!sampleId || sampleId === 'samples' || sampleId === 'sample' || sampleId.length < 5) {
        throw new Error(`Invalid sample ID: "${sampleId}". Expected a valid sample identifier.`);
      }


      // Prepare GraphQL request
      const graphqlRequest = {
        operationName: 'GenerateCertifiedLicense',
        variables: {
          fullLegalName: licenseInfo.legalName,
          artistName: licenseInfo.artistName,
          assetUuids: [sampleId]
        },
        query: `mutation GenerateCertifiedLicense($fullLegalName: String!, $artistName: String!, $assetUuids: [String!]!) {
          proofOfLicense: createProofOfLicense(
            fullLegalName: $fullLegalName
            artistName: $artistName
            assetUuids: $assetUuids
          ) {
            record {
              uuid
              userUuid
              fullLegalName
              artistName
              assetUuids
              licenseIssued
              __typename
            }
            downloadUrl
            __typename
          }
        }`
      };


      // Inject script into page context to make the request with full authentication
      const result = await this.executeInPageContext(graphqlRequest);

      return result;
    } catch (error) {
      console.error('GraphQL license generation failed:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Get auth token from page context
   */
  async getAuthToken() {
    return new Promise((resolve) => {
      const requestId = `auth_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

      const responseHandler = (event) => {
        if (event.data && event.data.type === 'AUTH_TOKEN_RESPONSE' && event.data.requestId === requestId) {
          window.removeEventListener('message', responseHandler);
          resolve(event.data.token);
        }
      };

      window.addEventListener('message', responseHandler);

      // Send request to page context
      window.postMessage({
        type: 'GET_AUTH_TOKEN',
        requestId: requestId
      }, '*');

      // Timeout after 5 seconds
      setTimeout(() => {
        window.removeEventListener('message', responseHandler);
        resolve(null);
      }, 5000);
    });
  }

  /**
   * Execute GraphQL request in page context to preserve authentication
   */
  async executeInPageContext(graphqlRequest) {
    try {
      // Get the auth token from page context
      const authToken = await this.getAuthToken();

      if (!authToken) {
        throw new Error('Unable to retrieve authentication token. Please make sure you are logged in to Splice.com');
      }

      // Make the request from content script with the auth token
      const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'apollographql-client-name': 'splice-web',
        'apollographql-client-version': '71c416924acf9f5dc5a05e729bc68846b6d92b3b',
        'Authorization': `Bearer ${authToken}`
      };

      const response = await fetch('https://surfaces-graphql.splice.com/graphql', {
        method: 'POST',
        credentials: 'include',
        headers: headers,
        body: JSON.stringify(graphqlRequest)
      });

      if (!response.ok) {
        throw new Error(`Request failed: ${response.status} ${response.statusText}`);
      }

      const result = await response.json();

      // Check for GraphQL errors
      if (result.errors && result.errors.length > 0) {
        const errorMessages = result.errors.map(e => e.message).join(', ');

        // Provide user-friendly error messages
        if (errorMessages.includes('403') || errorMessages.includes('Forbidden')) {
          throw new Error('Sample not in your library. Add this sample to your library before generating a license.');
        } else if (errorMessages.includes('401') || errorMessages.includes('Unauthorized')) {
          throw new Error('Authentication expired. Please refresh the Splice.com page and try again.');
        } else if (errorMessages.includes('404') || errorMessages.includes('Not Found')) {
          throw new Error('Sample not found on Splice. Please check the sample name.');
        } else {
          throw new Error(`Failed to generate license: ${errorMessages}`);
        }
      }

      // Handle GraphQL response format
      if (result.data && result.data.proofOfLicense) {
        const proofOfLicense = result.data.proofOfLicense;
        return {
          success: true,
          result: proofOfLicense,
          downloadUrl: proofOfLicense.downloadUrl
        };
      } else {
        throw new Error('Invalid response from Splice. Please try again.');
      }
    } catch (error) {
      throw error;
    }
  }

  /**
   * Inject page script to handle auth token extraction
   */
  injectPageScript() {
    // Only inject once
    if (document.querySelector('script[data-splice-extension="auth"]')) {
      return;
    }

    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('content/page-script.js');
    script.dataset.spliceExtension = 'auth';
    (document.head || document.documentElement).appendChild(script);
    script.onload = () => {
    };
  }

  /**
   * Click the ellipsis menu and find the "Generate Certified License" option
   */
  async clickGenerateLicense(sample) {
    try {

      // This method is no longer used since we're using GraphQL API approach
      // The actual license generation will be handled by the generateLicense method
      return {
        success: true,
        message: 'License generation will be handled via GraphQL API'
      };

    } catch (error) {
      console.error('Failed to generate license:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Find the "Generate Certified License" option in the menu
   */
  findLicenseOption() {
    try {

      // Look for the license option in various ways
      const licenseSelectors = [
        'button:contains("Generate Certified License")',
        'button:contains("Generate License")',
        'button:contains("Certified License")',
        'button:contains("License")',
        '[role="menuitem"]:contains("Generate Certified License")',
        '[role="menuitem"]:contains("Generate License")',
        '[role="menuitem"]:contains("Certified License")',
        '[role="menuitem"]:contains("License")',
        'div:contains("Generate Certified License")',
        'div:contains("Generate License")',
        'div:contains("Certified License")',
        'div:contains("License")'
      ];

      for (const selector of licenseSelectors) {
        const elements = document.querySelectorAll(selector);
        for (const element of elements) {
          if (element.textContent.includes('Generate') && element.textContent.includes('License')) {
            return element;
          }
        }
      }

      // Also look for any clickable elements that might contain the license text
      const allElements = document.querySelectorAll('button, [role="menuitem"], div[class*="menu"], div[class*="option"], a, [onclick]');

      for (let i = 0; i < allElements.length; i++) {
        const element = allElements[i];
        const text = element.textContent.toLowerCase();

        if (text.includes('generate') && text.includes('license')) {
          return element;
        }

        // Also check for partial matches
        if (text.includes('license') || text.includes('certified')) {
        }
      }

      // Look for any visible menu items
      const visibleElements = document.querySelectorAll('*');
      const visibleMenuItems = [];

      for (const element of visibleElements) {
        const style = window.getComputedStyle(element);
        if (style.display !== 'none' && style.visibility !== 'hidden' && element.offsetParent !== null) {
          const text = element.textContent.toLowerCase();
          if (text.includes('license') || text.includes('generate') || text.includes('certified')) {
            visibleMenuItems.push({
              element: element,
              text: element.textContent.trim(),
              tagName: element.tagName,
              className: element.className
            });
          }
        }
      }

      for (let i = 0; i < visibleMenuItems.length; i++) {
        const item = visibleMenuItems[i];
      }

      return null;
    } catch (error) {
      console.error('Failed to find license option:', error);
      return null;
    }
  }

  /**
   * Listen for messages from the extension
   */
  setupMessageListener() {
    chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
      try {
        switch (message.action) {
          case 'getSessionData':
            const sessionData = this.extractUserData();
            sendResponse(sessionData);
            break;

          case 'getXSRFToken':
            this.extractXSRFToken().then(token => {
              sendResponse({ token });
            }).catch(error => {
              console.error('XSRF token extraction failed:', error);
              sendResponse({ error: error.message });
            });
            return true; // Indicate we will send response asynchronously

          case 'getPageData':
            const pageData = this.extractPageData();
            sendResponse(pageData);
            break;

          case 'extractSearchResults':
            this.extractSearchResults().then(results => {
              sendResponse(results);
            }).catch(error => {
              console.error('Search extraction failed:', error);
              sendResponse({ success: false, error: error.message });
            });
            return true; // Indicate we will send response asynchronously

          case 'searchSamples':
            this.searchSamplesOnPage(message.query).then(results => {
              sendResponse(results);
            }).catch(error => {
              console.error('Search failed:', error);
              sendResponse({ success: false, error: error.message });
            });
            return true; // Indicate we will send response asynchronously

          case 'generateLicense':

            // If we have a sample name, use it to get the proper UUID via GraphQL
            if (message.sampleName) {
              this.getSampleDetails(message.sampleName).then(sampleDetails => {
                // Use the objectUuid (catalog_uuid) for license generation
                return this.generateLicenseViaGraphQL(sampleDetails.objectUuid, message.licenseInfo);
              }).then(result => {
                sendResponse(result);
              }).catch(error => {
                console.error('❌ License generation failed:', error);
                sendResponse({ success: false, error: error.message });
              });
            } else {
              // Fallback to using the provided sample ID
              this.generateLicenseViaGraphQL(message.sampleId, message.licenseInfo).then(result => {
                sendResponse(result);
              }).catch(error => {
                console.error('❌ License generation failed:', error);
                sendResponse({ success: false, error: error.message });
              });
            }
            return true; // Indicate we will send response asynchronously

          case 'test':
            sendResponse({ success: true, message: 'Content script is working', timestamp: Date.now() });
            break;

          case 'ping':
            sendResponse({ pong: true, timestamp: Date.now() });
            break;

          default:
            sendResponse({ error: 'Unknown action' });
        }
      } catch (error) {
        console.error('Message handler error:', error);
        sendResponse({ error: error.message });
      }
    });
  }
}

// Initialize content script when DOM is ready

// Test basic functionality
try {
} catch (error) {
  console.error('Basic functionality test failed:', error);
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    try {
      new SpliceContentScript();
    } catch (error) {
      console.error('Failed to initialize SpliceContentScript:', error);
    }
  });
} else {
  try {
    new SpliceContentScript();
  } catch (error) {
    console.error('Failed to initialize SpliceContentScript:', error);
  }
}

