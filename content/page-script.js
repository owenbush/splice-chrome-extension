/**
 * Page context script for accessing localStorage and auth tokens
 * This script runs in the page context and can access localStorage
 */

(function() {
  // Listen for auth token requests from content script
  window.addEventListener('message', function(event) {
    // Only accept messages from same origin
    if (event.source !== window) return;

    if (event.data && event.data.type === 'GET_AUTH_TOKEN') {

      try {
        let authToken = null;
        let tokenSource = null;

        // Method 1: Check localStorage for auth0 data
        try {
          const authData = localStorage.getItem('auth0.ssodata');
          if (authData) {
            const parsed = JSON.parse(authData);
            authToken = parsed.access_token || parsed.id_token;
            if (authToken) tokenSource = 'auth0.ssodata';
          }
        } catch (e) {
          console.warn('Failed to parse auth0.ssodata:', e);
        }

        // Method 2: Search all localStorage keys for auth/token
        // IMPORTANT: Prioritize access_token over id_token
        if (!authToken) {
          let idToken = null;
          let idTokenSource = null;

          for (let i = 0; i < localStorage.length; i++) {
            const key = localStorage.key(i);
            if (key && (key.includes('auth') || key.includes('token') || key.includes('@@auth0spajs@@'))) {
              const value = localStorage.getItem(key);
              try {
                const parsed = JSON.parse(value);

                // Check for access_token in body first (highest priority)
                if (parsed.body && parsed.body.access_token) {
                  authToken = parsed.body.access_token;
                  tokenSource = key + ' (body.access_token)';
                  break;
                }

                // Check for access_token at root level (high priority)
                if (parsed.access_token) {
                  authToken = parsed.access_token;
                  tokenSource = key + ' (access_token)';
                  break;
                }

                // Store id_token as fallback but keep looking for access_token
                if (parsed.id_token && !idToken) {
                  idToken = parsed.id_token;
                  idTokenSource = key + ' (id_token)';
                }
              } catch (e) {
                // Not JSON, might be the token itself
                if (value && value.startsWith('eyJ') && !idToken) {
                  idToken = value;
                  idTokenSource = key + ' (raw token)';
                }
              }
            }
          }

          // If we didn't find access_token, use id_token as fallback
          if (!authToken && idToken) {
            authToken = idToken;
            tokenSource = idTokenSource;
          }
        }

        // Send response back to content script
        window.postMessage({
          type: 'AUTH_TOKEN_RESPONSE',
          requestId: event.data.requestId,
          token: authToken
        }, '*');
      } catch (error) {
        console.error('🔑 Error getting auth token:', error);
        window.postMessage({
          type: 'AUTH_TOKEN_RESPONSE',
          requestId: event.data.requestId,
          token: null
        }, '*');
      }
    }
  });
})();

