# Testing the SLM App - Quick Guide

## ✅ Easiest Method: Expo Go on Your iPhone

Since you have an iPhone, this is the FASTEST way to test:

### Steps:
1. **Install Expo Go** (if you haven't already)
   - Download from App Store: https://apps.apple.com/app/expo-go/id982107779
   
2. **Connect to same WiFi**
   - Make sure your iPhone and Mac are on the same WiFi network

3. **Scan QR Code**
   - The Expo dev server is already running on your Mac
   - Open the terminal where `npx expo start --web` is running
   - Look for the QR code in the terminal
   - Open Camera app on your iPhone
   - Point at the QR code
   - Tap the notification to open in Expo Go

4. **Test the App!**
   - When the app loads, you'll see a prompt to download the TinyLlama model
   - Tap "Download" to get the real AI model (~600MB)
   - Once downloaded, you can use offline AI!
   - Try turning off WiFi to verify it works completely offline

## Alternative: iOS Simulator

If you want to use the simulator instead, run these commands:

```bash
# List available simulators
xcrun simctl list devices available

# Boot a specific simulator (replace UDID with one from the list)
xcrun simctl boot <SIMULATOR_UDID>

# Open Simulator app
open -a Simulator

# Then in another terminal
cd /Users/chiragarora/Desktop/Side\ Projects/slm
npx expo start
# Press 'i' to open in iOS simulator
```

## What to Test

Once the app is running on your iPhone:

### 1. Model Download
- ✅ Accept the download prompt
- ✅ Watch the download progress
- ✅ Verify download completes successfully

### 2. Offline AI Chat
- ✅ Send a message
- ✅ Verify you get a real AI response (not a mock)
- ✅ Turn OFF WiFi
- ✅ Send another message
- ✅ Confirm it still works without internet!

### 3. Battery Optimization
- ✅ Check console logs for battery status
- ✅ Verify batching behavior based on battery level

### 4. Context Window
- ✅ Send several messages
- ✅ Verify older messages get archived
- ✅ Check if relevant old messages are retrieved

### 5. Storage Persistence
- ✅ Close and reopen the app
- ✅ Verify messages are still there (loaded from SQLite)

## Expected Behavior

**First Launch:**
```
1. App initializes services
2. Detects device RAM and recommends quantization
3. Shows "Download AI Model" prompt
4. User taps "Download"
5. Downloads TinyLlama model
6. Shows "Success!" message
```

**After Model Download:**
```
1. User types message
2. Message saved to SQLite
3. Embedding generated
4. Context built (active + relevant archived)
5. Battery status checked
6. Real AI inference happens (offline!)
7. Response displayed
8. Response saved to SQLite
```

## Troubleshooting

**If you don't see the QR code:**
```bash
# In the terminal where expo is running, press 's' to show QR code
```

**If app doesn't load on iPhone:**
- Make sure both devices are on same WiFi
- Make sure Expo Go is installed
- Try closing Expo Go and scanning again

**If download fails:**
- Check your internet connection
- Make sure you have ~1GB free space
- Try closing other apps
