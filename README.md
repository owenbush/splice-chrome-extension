# Splice Batch License Generator

A Chrome extension that automates the process of generating licenses for multiple Splice samples at once.

## Features

- **Batch Processing**: Generate licenses for multiple samples simultaneously
- **Session Integration**: Uses your existing Splice.com login session
- **Secure Storage**: Encrypted storage of license information
- **Smart Downloads**: Automatic downloads for small batches, download links for large batches
- **Progress Tracking**: Real-time progress indicators for batch processing

## Installation

1. Download or clone this repository
2. Open Chrome and navigate to `chrome://extensions/`
3. Enable "Developer mode" in the top right
4. Click "Load unpacked" and select the extension directory
5. The extension will appear in your Chrome toolbar

## Setup

1. **Login to Splice.com**: Make sure you're logged in to your Splice account
2. **Configure License Information**:
   - Click the extension icon
   - Click "Settings" to open the options page
   - Enter your full legal name and artist name
   - Save your information

## Usage

1. **Open the Extension**: Click the extension icon in your Chrome toolbar
2. **Enter Sample Names**: Type or paste sample names, one per line
3. **Generate Licenses**: Click "Generate Licenses" to process all samples
4. **Download**: Licenses will be downloaded automatically or shown as download links

## Development

### Project Structure

```
splice-chrome-extension/
├── manifest.json                 # Extension configuration
├── background/
│   └── service-worker.js         # Background script for API coordination
├── popup/
│   ├── popup.html               # Main popup interface
│   ├── popup.css                # Popup styles
│   └── popup.js                 # Popup functionality
├── options/
│   ├── options.html             # Settings page
│   ├── options.css              # Settings styles
│   └── options.js               # Settings functionality
├── content/
│   └── content-script.js         # Content script for Splice.com
├── shared/
│   ├── encryption.js            # Encryption utilities
│   └── utils.js                 # Shared utilities
└── icons/                       # Extension icons
```

### Key Components

- **Service Worker**: Handles session management and API coordination
- **Popup Interface**: Main user interface for sample input and processing
- **Options Page**: Configuration for license information and preferences
- **Content Script**: Session detection on Splice.com
- **Shared Utilities**: Common functions and encryption

### API Integration

The extension uses a "piggyback" authentication approach:
- No authentication handling in the extension
- Uses existing Splice.com session cookies
- Extracts XSRF tokens from the current session
- Makes API calls using the user's established session

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Test thoroughly
5. Submit a pull request

## Support

For issues and questions:
- Check the GitHub Issues page
- Create a new issue with detailed information
- Include browser version and extension version
