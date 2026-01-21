# Quick Setup - Scan This QR Code

The Expo server is running! Here's how to connect your iPhone:

## 📱 Steps to Connect:

1. **Install Expo Go** (if you haven't)
   - App Store: Search for "Expo Go"
   - Or visit: https://apps.apple.com/app/expo-go/id982107779

2. **Open Camera App** on your iPhone

3. **Scan the QR Code** shown in your terminal
   - Look at the terminal window where you ran `npx expo start`
   - You should see a large ASCII QR code
   - Point your iPhone camera at it

4. **Tap the notification** that appears

5. **App will open in Expo Go!**

## Can't See QR Code?

If the QR code isn't showing in the terminal, press `s` key in the terminal to switch modes until you see "Using Expo Go" and the QR code appears.

## Direct URL

Alternatively, you can manually enter this URL in Expo Go:
```
exp://192.168.1.3:8081
```

Make sure your iPhone and Mac are on the **same WiFi network**!

## Test the Fixed Download

Once the app loads:
1. You'll see the "Download AI Model" prompt again
2. Tap "Download" 
3. The download should work now with the new API!
4. Watch for progress in the console logs

The fix I made migrates from the deprecated API to the new File.downloadAsync() method, so it should work perfectly now.
