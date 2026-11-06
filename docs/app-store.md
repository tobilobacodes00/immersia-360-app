# App Store submission pack

Everything App Store Connect asks for, ready to paste. Items marked **Decide** need an answer from the business
before submission.

## Before you start

1. **Apple Developer Program.** Enrol at developer.apple.com/programs. An individual account takes about a day or
   two. An organization account (the seller shows as your company) needs a D-U-N-S number and takes longer.
   **Decide:** individual or organization.
2. **Bundle ID.** The app uses `com.immersiavr.immersia360` (in `app.json`). Register it in the developer account,
   or change it in `app.json` before the first build: it cannot change after the app is live.
3. **Expo account.** Log in once with `npx eas-cli@latest login`, then link the project with
   `npx eas-cli@latest init` (this writes the project id into `app.json`).
4. **Sharing server** deployed (see `worker/README.md`), so the Privacy Policy and Terms have public URLs:
   `https://<your share domain>/privacy` and `/terms`.

## Build and submit

```sh
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --latest
```

The build runs in Expo's cloud (no Mac needed). `submit` uploads it to App Store Connect, where it appears under
TestFlight first. Test it there on a real iPhone before sending it for review.

## Listing

| Field                  | Text                                                                                                                          |
| ---------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| Name                   | Immersia 360                                                                                                                  |
| Subtitle (30)          | 360 video booth with slow-mo                                                                                                  |
| Category               | Photo & Video (secondary: Entertainment)                                                                                      |
| Price                  | Free                                                                                                                          |
| Promotional text (170) | Turn any 360 spinner into a full video booth: slow motion, reverse, your own frames and music, and a QR code for every guest. |
| Keywords (100)         | 360,booth,spinner,slow motion,video booth,event,party,wedding,boomerang,qr,photo booth                                        |

**Description**

> Immersia 360 turns your phone and a 360 spinner into a complete video booth.
>
> Every guest gets a short, polished video: normal speed, then a slow-motion moment, then the whole spin played
> backwards, with your overlay frame and your music. Record at up to 240 frames per second for smooth slow motion
> straight from the camera.
>
> • Countdown, recording length and the slow-motion window set exactly how you want, with a live preview of the
> final length
> • Rear and front cameras, every lens, and every resolution and frame rate your phone supports
> • Your own PNG frames and music, chosen per event
> • A QR code on screen after every take: guests scan it and download their video, no app needed
> • A live Display for a TV or laptop that shows the latest videos and their QR codes
> • Albums for each event, a gallery of every video and original, save to Photos, AirDrop and share
> • Works offline: videos are made on the phone, and uploads wait for a connection
>
> No account, no watermark, no subscription.

**Support URL:** **Decide** (a page on immersiavr.com, or `mailto:` is not accepted: it must be a web page).
**Marketing URL:** optional.
**Privacy Policy URL:** `https://<share domain>/privacy`.

## App Privacy ("nutrition label")

Answer in App Store Connect › App Privacy:

- **Do you collect data?** Yes, only when the operator turns on QR sharing.
- **Photos or Videos**: collected. Used for **App Functionality** only. **Not linked** to the user's identity.
  **Not used for tracking.**
- Everything else (contact info, identifiers, usage data, diagnostics, location): **not collected**.

Why: videos and thumbnails are uploaded to the operator's own sharing server only when QR sharing is on, so
guests can download them; nothing else leaves the phone. There is no analytics or advertising SDK in the app.

## Age rating

All answers "None", except "Unrestricted Web Access": No. The result is **4+**.

## Export compliance

The app only uses HTTPS (standard encryption), so it is exempt. `ITSAppUsesNonExemptEncryption` is already set
to `false` in `app.json`, so App Store Connect will not ask.

## Notes for the reviewer

> Immersia 360 is a video booth app for events: the phone is mounted on a 360° spinner arm that rotates around a
> guest. No spinner is needed to review it: hold the phone and tap the camera button on the home screen.
>
> 1. Tap the round camera button, then the red button (or anywhere on the picture). After a 3-second countdown it
>    records for 10 seconds, then makes the video (slow motion in the middle, then played in reverse) and shows it.
> 2. Settings (gear icon) holds the recording, slow-motion and camera options.
> 3. QR sharing needs the operator's own sharing server. A test server is set up for review:
>    Sharing › Set up sharing › server `<review server>`, key `<review key>`. After that, every new video shows a
>    QR code that opens its download page.
>
> The app does not use the microphone; videos carry the music the operator chooses.

**Decide:** deploy a separate review server (or create a review key) and fill in the two placeholders above.

## Screenshots

Required sizes: **iPhone 6.9"** (1320 × 2868 or 1290 × 2796) and, because the app supports iPad, **iPad 13"**
(2064 × 2752). Take them from TestFlight on a real device:

1. Home: the capture button, album chip and bottom bar.
2. Capture: countdown over the live picture, with a frame overlay on.
3. Result: a finished video with its QR code.
4. Settings: the slow-motion timeline and final length.
5. Gallery: an album with several videos.
6. Overlays: the frame grid.
7. The Display on a laptop (iPad/marketing image).

## Review risks to check before submitting

- **4.2 Minimum functionality / 4.3 Spam:** the app is original (own name, icon, design); fine.
- **5.1.1 Data collection:** the permission texts in `app.json` say exactly why camera and Photos are used.
- **2.1 App completeness:** the reviewer must be able to use QR sharing: provide the review server (above).
- **Guideline 1.5 / Developer information:** the support URL must work.
