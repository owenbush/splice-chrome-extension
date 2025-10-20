/**
 * Options page JavaScript for Splice License Batch Generator
 * Handles license information configuration and settings management
 */

class OptionsManager {
  constructor() {
    this.init();
  }

  /**
   * Initialize the options page
   */
  async init() {
    this.setupEventListeners();
    await this.loadSettings();
    await this.loadLicenseInfo();
  }

  /**
   * Setup event listeners
   */
  setupEventListeners() {
    // License form
    document.getElementById('licenseForm').addEventListener('submit', (e) => {
      e.preventDefault();
      this.saveLicenseInfo();
    });

    // Clear license info
    document.getElementById('clearLicenseInfo').addEventListener('click', () => {
      this.clearLicenseInfo();
    });

    // Data management
    document.getElementById('exportData').addEventListener('click', () => {
      this.exportData();
    });

    document.getElementById('importData').addEventListener('click', () => {
      this.importData();
    });

    document.getElementById('clearAllData').addEventListener('click', () => {
      this.clearAllData();
    });

    // About actions
    document.getElementById('openGitHub').addEventListener('click', () => {
      window.open('https://github.com/owen/splice-chrome-extension', '_blank');
    });

    document.getElementById('reportIssue').addEventListener('click', () => {
      window.open('https://github.com/owen/splice-chrome-extension/issues', '_blank');
    });

    // Status message close
    document.getElementById('closeStatus').addEventListener('click', () => {
      this.hideStatusMessage();
    });
  }

  /**
   * Load settings from storage
   */
  async loadSettings() {
    try {
      // No download preferences to load anymore
    } catch (error) {
      console.error('Failed to load settings:', error);
    }
  }

  /**
   * Load license information from storage
   */
  async loadLicenseInfo() {
    try {
      const licenseInfo = await LicenseInfoManager.getLicenseInfo();

      if (licenseInfo) {
        document.getElementById('legalName').value = licenseInfo.legalName || '';
        document.getElementById('artistName').value = licenseInfo.artistName || '';
      }
    } catch (error) {
    }
  }

  /**
   * Save license information
   */
  async saveLicenseInfo() {
    const legalName = document.getElementById('legalName').value.trim();
    const artistName = document.getElementById('artistName').value.trim();

    // Validate required fields
    if (!legalName || !artistName) {
      this.showStatusMessage('Please fill in all required fields', 'error');
      return;
    }

    const licenseData = {
      legalName,
      artistName
    };

    try {
      const success = await LicenseInfoManager.saveLicenseInfo(licenseData);

      if (success) {
        this.showStatusMessage('License information saved successfully', 'success');
      } else {
        this.showStatusMessage('Failed to save license information', 'error');
      }
    } catch (error) {
      this.showStatusMessage('Failed to save license information', 'error');
    }
  }

  /**
   * Clear license information
   */
  async clearLicenseInfo() {
    if (!confirm('Are you sure you want to clear your license information?')) {
      return;
    }

    try {
      const success = await LicenseInfoManager.clearLicenseInfo();

      if (success) {
        document.getElementById('legalName').value = '';
        document.getElementById('artistName').value = '';
        this.showStatusMessage('License information cleared', 'success');
      } else {
        this.showStatusMessage('Failed to clear license information', 'error');
      }
    } catch (error) {
      this.showStatusMessage('Failed to clear license information', 'error');
    }
  }


  /**
   * Export data
   */
  async exportData() {
    try {
      const result = await chrome.storage.local.get(null);
      const exportData = {
        licenseInfo: result.licenseInfo,
        exportDate: new Date().toISOString(),
        version: '1.0.0'
      };

      const dataStr = JSON.stringify(exportData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });

      const link = document.createElement('a');
      link.href = URL.createObjectURL(dataBlob);
      link.download = 'splice-extension-data.json';
      link.click();

      this.showStatusMessage('Data exported successfully', 'success');
    } catch (error) {
      console.error('Export data failed:', error);
      this.showStatusMessage('Failed to export data', 'error');
    }
  }

  /**
   * Import data
   */
  async importData() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';

    input.onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;

      try {
        const text = await file.text();
        const importData = JSON.parse(text);

        // Validate import data
        if (!importData.licenseInfo) {
          throw new Error('Invalid data format');
        }

        // Import license info
        if (importData.licenseInfo) {
          await chrome.storage.local.set({ licenseInfo: importData.licenseInfo });
        }

        // Reload the page to reflect changes
        await this.loadSettings();
        await this.loadLicenseInfo();

        this.showStatusMessage('Data imported successfully', 'success');
      } catch (error) {
        console.error('Import data failed:', error);
        this.showStatusMessage('Failed to import data: Invalid file format', 'error');
      }
    };

    input.click();
  }

  /**
   * Clear all data
   */
  async clearAllData() {
    if (!confirm('Are you sure you want to clear ALL data? This cannot be undone.')) {
      return;
    }

    try {
      await chrome.storage.local.clear();

      // Reset form
      document.getElementById('legalName').value = '';
      document.getElementById('artistName').value = '';

      this.showStatusMessage('All data cleared', 'success');
    } catch (error) {
      console.error('Clear all data failed:', error);
      this.showStatusMessage('Failed to clear all data', 'error');
    }
  }

  /**
   * Show status message
   */
  showStatusMessage(message, type = 'success') {
    const statusMessage = document.getElementById('statusMessage');
    const statusText = document.getElementById('statusText');

    statusText.textContent = message;
    statusMessage.className = `status-message ${type}`;
    statusMessage.style.display = 'flex';

    // Auto-hide after 5 seconds
    setTimeout(() => {
      this.hideStatusMessage();
    }, 5000);
  }

  /**
   * Hide status message
   */
  hideStatusMessage() {
    document.getElementById('statusMessage').style.display = 'none';
  }
}

// Initialize options page when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  new OptionsManager();
});
