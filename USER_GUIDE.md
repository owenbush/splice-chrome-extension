# Splice Batch License Generator - User Guide

## Table of Contents
1. [Introduction](#introduction)
2. [Installation](#installation)
3. [Getting Started](#getting-started)
4. [Using the Extension](#using-the-extension)
5. [Configuration](#configuration)
6. [Troubleshooting](#troubleshooting)
7. [Tips and Best Practices](#tips-and-best-practices)
8. [FAQ](#faq)

---

## Introduction

The **Splice Batch License Generator** is a Chrome extension that streamlines the process of generating certified licenses for multiple Splice samples at once. Instead of manually generating licenses one by one through the Splice website, this extension automates the process, saving you time and effort.

### Key Features
- ✅ **Batch Processing**: Generate licenses for multiple samples simultaneously
- ✅ **Auto-Detection**: Automatically detects your Splice login status
- ✅ **Library Checking**: Verifies samples are in your library before generating licenses
- ✅ **State Persistence**: Remembers your input and results across sessions
- ✅ **Error Handling**: Clear error messages with actionable guidance
- ✅ **One-Click Downloads**: Download licenses with a single click

---

## Installation

### Prerequisites
- Google Chrome browser (version 88 or higher)
- Active Splice.com account

### Installation Steps

1. **Download the Extension**
   - Clone or download this repository to your computer
   - Extract the files if downloaded as a ZIP

2. **Load Extension in Chrome**
   - Open Chrome and navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top-right corner)
   - Click "Load unpacked"
   - Select the extension directory (the folder containing `manifest.json`)

3. **Verify Installation**
   - You should see "Splice Batch License Generator" in your extensions list
   - The extension icon will appear in your Chrome toolbar

---

## Getting Started

### First-Time Setup

#### Step 1: Configure License Information
Before you can generate licenses, you need to provide your license information:

1. Click the extension icon in your Chrome toolbar
2. Click "Open Settings" at the bottom of the popup
3. Fill in the required information:
   - **Full Legal Name**: Your complete legal name as it should appear on licenses
   - **Artist Name**: Your professional or stage name

4. Click "Save License Information"

> **💡 Tip**: This information is stored locally in your browser and is encrypted for security.

#### Step 2: Log in to Splice
1. Open a new tab and navigate to [splice.com](https://splice.com)
2. Log in to your account if you're not already logged in
3. Keep this tab open while using the extension

---

## Using the Extension

### Basic Workflow

#### 1. Open the Extension
- Click the extension icon in your Chrome toolbar
- The popup will automatically detect if you're logged in to Splice

#### 2. Enter Sample Names
In the text area, enter the names of the samples you want to generate licenses for:
- **One sample per line**
- Use the exact filename including the `.wav` extension
- Example:
  ```
  DBM_TC2_124_Erhu_Loop_A_Heroes_Tale_C#min.wav
  SS_DR_90_perc_loop_cabasa_straight.wav
  OS_AFR2_94_songstarter_reverse_lekki_views_Gm.wav
  ```

#### 3. Process Samples
- Click the "Process Samples" button
- The extension will:
  1. Search for each sample on Splice
  2. Check if the sample is in your library
  3. Generate a license (if in library)
  4. Provide download links

#### 4. Download Licenses
- Once processing is complete, you'll see results for each sample
- Click the "Download License" button next to successful generations
- PDFs will open in new background tabs

#### 5. Reset (Optional)
- Click "Reset" to clear results and start fresh
- Your input text is automatically saved and will be restored next time

### Understanding Results

The extension shows three types of results:

#### ✅ Success
```
✓ Sample_Name.wav
  Download License
```
- Sample found in your library
- License generated successfully
- Ready to download

#### ❌ Error
```
✗ Sample_Name.wav
  Sample not in your library. Please add this sample to your
  Splice library before generating a license.
```
- Sample not in your library
- Cannot generate license
- Add to library first, then try again

#### ⚠️ Warning
```
⚠ Sample_Name.wav
  Sample not found on Splice. Please verify the sample name is correct.
```
- Sample name doesn't match any sample on Splice
- Check for typos or incorrect filename

---

## Configuration

### License Information

#### Viewing Current Settings
1. Click the extension icon
2. Your current license configuration is shown at the top:
   - ✅ License information configured
   - ⚠️ License information not configured

#### Updating Settings
1. Click "Open Settings"
2. Modify your information
3. Click "Save License Information"

#### Exporting Settings (Backup)
1. Open Settings
2. Click "Export License Data"
3. Save the JSON file to your computer

#### Importing Settings (Restore)
1. Open Settings
2. Click "Import License Data"
3. Select your previously exported JSON file

#### Clearing Settings
1. Open Settings
2. Click "Clear All Data"
3. Confirm the action

> **⚠️ Warning**: Clearing data removes your license information. You'll need to re-enter it.

---

## Troubleshooting

### Common Issues and Solutions

#### "Not logged in to Splice"
**Problem**: Extension shows you're not logged in, but you are.

**Solutions**:
1. Refresh the Splice.com tab
2. Close and reopen the extension popup
3. Log out and log back in to Splice
4. Clear your browser cookies and log in again

---

#### "Sample not in your library"
**Problem**: Extension says sample isn't in your library, but you downloaded it.

**Solutions**:
1. **Add to library on Splice**: Downloading ≠ Adding to library
   - Go to the sample page on Splice.com
   - Click "Add to library" (heart icon or button)
   - Try generating the license again

2. **Verify sample name**: Make sure you're using the exact filename
   - Check the filename in your Splice downloads folder
   - Include the `.wav` extension
   - Match capitalization exactly

---

#### "Sample not found on Splice"
**Problem**: Extension can't find the sample on Splice.

**Solutions**:
1. **Check filename**: Ensure you have the correct sample name
   - Copy from your Splice downloads folder
   - Include file extension (`.wav`)
   - Check for special characters (#, &, etc.)

2. **Sample might be removed**: Some samples get removed from Splice
   - Try searching for it manually on Splice.com
   - If not found there either, it may no longer be available

---

#### Extension Closes Unexpectedly
**Problem**: Popup closes while processing.

**Solutions**:
1. **Keep Splice tab open**: Extension needs an active Splice.com tab
   - Open splice.com in a tab
   - Keep it open while using the extension

2. **Reload extension**: If issues persist
   - Go to `chrome://extensions/`
   - Click the reload icon on this extension
   - Try again

---

#### "Please refresh the Splice.com page"
**Problem**: Extension can't communicate with Splice.com.

**Solutions**:
1. Refresh any open Splice.com tabs
2. If no Splice tabs are open, open splice.com
3. Make sure you're logged in
4. Try the operation again

---

#### Downloads Open But Are Blank
**Problem**: License PDFs open but show no content.

**Solutions**:
1. **Check popup blocker**: Make sure Chrome's popup blocker isn't interfering
2. **Try again**: Temporary issue, click "Download License" again
3. **Check network**: Ensure you have a stable internet connection

---

## Tips and Best Practices

### For Best Results

#### 1. Prepare Your Sample List
- ✅ Copy filenames directly from your Splice downloads folder
- ✅ Include the `.wav` extension
- ✅ Use one sample per line
- ✅ Remove any extra spaces or blank lines

#### 2. Keep Splice Tab Open
- The extension needs an active Splice.com tab to work
- You can minimize the tab, but don't close it
- Keep yourself logged in to Splice

#### 3. Process in Batches
- For many samples, process in groups of 10-20
- This prevents timeouts and makes it easier to track progress
- Results are saved, so you can process more later

#### 4. Download Immediately
- Download licenses right after generation
- Links may expire after a certain time
- Use the "Reset" button only when you're done downloading

#### 5. Verify Library Status First
- Make sure all samples are in your library before processing
- On Splice.com, check for the heart icon or "In Library" status
- This prevents "not in library" errors

### Keyboard Shortcuts
- **Ctrl/Cmd + A**: Select all text in the input area
- **Ctrl/Cmd + V**: Paste sample names
- **Enter**: Submit (when input has focus)

### Performance Tips
- **Close other tabs**: Reduces memory usage
- **Process during off-peak hours**: Faster API responses
- **Stable internet**: Ensures reliable license generation

---

## FAQ

### General Questions

**Q: How many samples can I process at once?**
A: There's no hard limit, but we recommend batches of 10-20 samples for best performance. Processing too many at once may cause timeouts.

**Q: Do I need to keep the extension popup open?**
A: Yes, keep it open while processing. Your progress is saved automatically, so you can close and reopen between batches.

**Q: Are my credentials stored by the extension?**
A: No, the extension uses your existing Splice.com login session. It never stores your username or password.

**Q: What information is stored locally?**
A: Only your license information (Full Legal Name, Artist Name) and your input/results state. All data is stored in your browser and never sent anywhere except to Splice.com for license generation.

**Q: Can I use this extension on multiple computers?**
A: Yes, but you'll need to configure your license information on each computer. Use the Export/Import feature to transfer settings.

---

### Technical Questions

**Q: Why do I need a Splice tab open?**
A: The extension needs access to Splice.com's authentication tokens. Having a tab open ensures proper authentication for API requests.

**Q: What permissions does the extension need?**
A: The extension only requests necessary permissions:
- Access to splice.com (to interact with the website)
- Storage (to save your settings)
- Tabs (to manage Splice tabs)
- Downloads (to save licenses)
- Cookies (to detect login status)

**Q: Is my data encrypted?**
A: Your license information is encoded (Base64) before storage, providing basic security. It's stored locally in your browser.

**Q: Will this work with Splice Sounds (app)?**
A: No, this is a web extension for Chrome. It only works with splice.com in your browser.

---

### Licensing Questions

**Q: Can I generate licenses for samples I haven't downloaded?**
A: Yes, as long as the sample is in your Splice library. You don't need to have downloaded it locally.

**Q: What if a sample I need isn't in my library?**
A: You must add it to your library on Splice.com first. The extension will show an error for samples not in your library.

**Q: How long are license download links valid?**
A: Links are generated fresh each time and should be used immediately. Download right after generation.

**Q: Can I regenerate a license if I lost it?**
A: Yes, simply process the sample again. Each generation creates a new license with a new timestamp.

---

## Support

### Getting Help

If you encounter issues not covered in this guide:

1. **Check Recent Changes**: Look at `activeContext.md` in the memory-bank folder
2. **Review Technical Docs**: See `techContext.md` for technical details
3. **Report Issues**: Create an issue in the project repository

### Contributing

Contributions are welcome! If you'd like to improve the extension:

1. Fork the repository
2. Make your changes
3. Submit a pull request
4. Update documentation as needed

---

## Changelog

### Version 1.0.0 (Current)
- ✅ Initial release
- ✅ Batch license generation
- ✅ Cookie-based authentication
- ✅ GraphQL API integration
- ✅ Library status detection
- ✅ State persistence
- ✅ Comprehensive error handling

---

## License

This extension is provided as-is for personal use with Splice.com. Always comply with Splice's Terms of Service when using this tool.

---

**Made with ❤️ by Owen Bush**

*Last updated: October 2025*

