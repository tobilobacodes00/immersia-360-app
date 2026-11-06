# Immersia 360

A 360 spinner-booth app for iPhone and iPad. A guest stands on the platform, the phone on the arm records a
high-frame-rate clip, and the app turns it into a share-ready video: normal speed, then slow motion, then the
whole thing in reverse, with an overlay frame and music. Guests scan a QR code to get it, and a Display screen
shows the latest videos live.

Built with Expo (SDK 57) and Expo Router. iOS ships first; the Android video engine follows.

## Running it

```sh
npm install
npx expo start
```

Scan the QR code with **Expo Go** on an iPhone. Inside Expo Go the app uses stand-ins for the two native parts
it cannot load there: the camera records at 30 fps (so there is no slow motion), and the video engine passes
the clip through unchanged. Everything else (every screen, setting, gallery action, upload and the Display)
works as it does in the real app.

The real 120/240 fps camera and the video engine need a development build, made in the cloud with EAS:

```sh
npx eas-cli@latest build --profile development --platform ios
```

That needs an Apple Developer Program membership.

## Layout

| Path           | What it is                                                                                      |
| -------------- | ----------------------------------------------------------------------------------------------- |
| `src/app`      | Screens. Every file is a route (Expo Router).                                                   |
| `src/theme`    | Every colour, size and font. Restyling the app means editing `tokens.ts` only.                  |
| `src/ui`       | The component kit: rows, steppers, segmented controls, the timeline strip.                      |
| `src/domain`   | Pure logic with tests: the timeline (how a take becomes the final video), settings, formatting. |
| `src/data`     | SQLite (albums, takes) and the settings store.                                                  |
| `src/features` | Screen parts too large for a route file.                                                        |
| `src/platform` | Expo Go detection and the native stand-ins.                                                     |

`src/domain/timeline.ts` is the single source of truth for slow motion and reverse: the settings screen's
length readout, the capture screen's progress ring and the native engine all read the same plan.

## Checks

CI runs types, lint, formatting, the Jest suite and `expo-doctor` on every push and pull request
(`.github/workflows/ci.yml`).
