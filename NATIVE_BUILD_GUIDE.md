# Building Native Client for Real Offline AI

## ⚠️ Important: Why Expo Go Doesn't Work

**`llama.rn` is a native module** that requires custom native code (Swift/Objective-C for iOS, Java/Kotlin for Android). Expo Go only supports built-in Expo SDK modules, so it **cannot run llama.rn**.

To use real offline AI, you need to create a **development build** (also called a "development client").

---

## 🎯 Two Options

### Option 1: Local Development Build (Recommended for Testing)

Build and run on your Mac with the iOS Simulator:

```bash
# 1. Install iOS dependencies
cd /Users/chiragarora/Desktop/Side\ Projects/slm
npx pod-install

# 2. Create native iOS project
npx expo prebuild --platform ios --clean

# 3. Build and run on iOS Simulator
npx expo run:ios
```

This will:
- Generate native iOS/Android folders
- Install llama.rn native dependencies
- Build the app with real native code
- Run on iOS Simulator (or connected iPhone)

### Option 2: EAS Build (For Physical Device Testing)

Use Expo's cloud build service to create an installable app:

```bash
# 1. Install EAS CLI
npm install -g eas-cli

# 2. Login to Expo account
eas login

# 3. Configure EAS build
eas build:configure

# 4. Build development client for iOS
eas build --profile development --platform ios

# 5. Install on your iPhone via TestFlight or direct install
```

---

## 🚀 Quick Start (Local Build)

### Prerequisites
- ✅ Xcode installed (for iOS)
- ✅ CocoaPods installed: `sudo gem install cocoapods`
- ✅ Node.js and npm

### Steps

1. **Generate Native Code**
   ```bash
   cd /Users/chiragarora/Desktop/Side\ Projects/slm
   npx expo prebuild --clean
   ```

2. **Install iOS Dependencies**
   ```bash
   npx pod-install
   ```

3. **Run on iOS Simulator**
   ```bash
   npx expo run:ios
   ```

4. **Or Run on Physical iPhone**
   ```bash
   # Connect your iPhone via USB
   npx expo run:ios --device
   ```

---

## 📱 What Happens After Building

Once you build the development client:

1. **Real llama.rn** will be available
2. **Download TinyLlama** model (~1.1GB) on first launch
3. **Chat works 100% offline** - no internet needed!
4. **GPU acceleration** available on device (Metal for iOS)

---

## ⚡ Testing Real Offline AI

After the development build is running:

1. Launch the app on your device/simulator
2. Tap "Download" when prompted
3. Wait for model download (~1.1GB, takes 2-5 minutes)
4. Send a message - get real AI response!
5. Turn OFF WiFi - still works! 🎉

---

## 🐛 Troubleshooting

### "Cannot read property 'install' of null"
- This means you're still using Expo Go
- Solution: Build development client as described above

### Build Fails
```bash
# Clean and rebuild
rm -rf ios android
npx expo prebuild --clean
npx pod-install
npx expo run:ios
```

### Model Download Fails
- Check internet connection
- Make sure you have ~2GB free space
- Try downloading again from the app

---

## 📊 Current vs Future State

| Feature | Expo Go (Current) | Development Build (After Setup) |
|---------|-------------------|--------------------------------|
| UI/UX Testing | ✅ Works | ✅ Works |
| Mock Responses | ✅ Works | ✅ Works (fallback) |
| **Real AI** | ❌ Not  Available | ✅ **Fully Working!** |
| Model Download | ❌ Fails | ✅ Works |
| Offline Inference | ❌ N/A | ✅ **100% Offline** |
| llama.rn | ❌ Not loaded | ✅ Loaded |

---

## 🎓 Why This Is Necessary

- **Expo Go** = Sandbox with only built-in Expo modules
- **llama.rn** = Custom native C++ library (llama.cpp bindings)
- **Solution** = Build custom app with llama.rn included

This is a one-time setup. After building once, hot reload works normally!

---

## 🔥 Next Steps

**Choose your path:**

### For Quick Testing (iOS Simulator)
```bash
npx expo prebuild --clean
npx pod-install
npx expo run:ios
```

### For Real Device Testing (Your iPhone)
```bash
# Option A: USB Connected
npx expo run:ios --device

# Option B: EAS Build (Cloud)
eas build --profile development --platform ios
```

**Then:** Download model → Chat with real AI → Test offline! 🚀
