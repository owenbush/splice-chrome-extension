# Store Assets Directory

This directory contains all assets needed for Chrome Web Store submission.

## 📁 Directory Structure

```
store-assets/
├── screenshots/          # Store screenshots (1-5 images)
│   ├── 1-main-popup.png
│   ├── 2-results.png
│   └── 3-settings.png
├── promotional/          # Promotional tiles
│   ├── small-tile-440x280.png      (REQUIRED)
│   ├── large-tile-920x680.png      (optional)
│   └── marquee-1400x560.png        (optional)
└── README.md            # This file
```

## 📸 Screenshots

### Save Your Screenshots Here:
**Location**: `store-assets/screenshots/`

### Naming Convention:
- `1-main-popup.png` - Main extension popup interface
- `2-results.png` - Results showing successful license generation
- `3-settings.png` - Settings/options page
- `4-[optional].png` - Additional screenshot if needed
- `5-[optional].png` - Additional screenshot if needed

### Requirements:
- **Size**: 1280x800 or 640x400 pixels
- **Format**: PNG or JPEG
- **Count**: 1-5 screenshots (you have 3, which is perfect!)
- **Quality**: High resolution, clear text

### What You Have:
✅ 3 screenshots - this is the sweet spot! Shows enough without overwhelming.

## 🎨 Promotional Tiles

### Still Needed (Generate with AI):
**Location**: `store-assets/promotional/`

1. **Small Tile** (REQUIRED)
   - Size: 440x280 pixels
   - Use prompts from `AI_GRAPHICS_PROMPTS.md`

2. **Large Tile** (Optional but recommended)
   - Size: 920x680 pixels

3. **Marquee** (Optional)
   - Size: 1400x560 pixels

## 📋 Current Status

- [x] Screenshots folder created
- [ ] 3 screenshots saved (save your files here!)
- [ ] Small promotional tile (440x280)
- [ ] Large promotional tile (920x680) - optional
- [ ] Marquee tile (1400x560) - optional

## 🎯 Next Steps

1. **Save your 3 screenshots** to `store-assets/screenshots/`
   - Name them: `1-main-popup.png`, `2-results.png`, `3-settings.png`

2. **Generate promotional tile**
   - Use AI prompts from `AI_GRAPHICS_PROMPTS.md`
   - Save to `store-assets/promotional/small-tile-440x280.png`

3. **Verify dimensions**
   - Check screenshot sizes (should be 1280x800 or 640x400)
   - Check tile sizes match requirements

4. **You're ready for submission!**

## 💡 Tips

### For Screenshots:
- Make sure no sensitive information is visible
- Ensure text is clear and readable
- Use consistent browser theme across all screenshots
- Show actual functionality, not mockups

### For Promotional Tiles:
- Keep design simple and clear
- Use your brand colors (purple gradient)
- Include extension name clearly
- Show key features or benefits

## 📐 Quick Dimension Check

Use this command to check image dimensions:
```bash
# macOS
sips -g pixelWidth -g pixelHeight store-assets/screenshots/*.png

# Linux
identify store-assets/screenshots/*.png

# Or use any image viewer
```

## ✅ Ready to Submit Checklist

- [ ] 3 screenshots saved and properly sized
- [ ] Small promotional tile (440x280)
- [ ] All images are PNG or JPEG
- [ ] No sensitive information visible
- [ ] Text is clear and readable
- [ ] Files are organized in this directory

---

**Once you've saved your screenshots, you'll be almost ready for Chrome Web Store submission!** 🚀

