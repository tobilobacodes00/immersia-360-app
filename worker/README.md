# Immersia 360 sharing server

A Cloudflare Worker that makes QR sharing and the Display work:

- the phone uploads each finished video straight into your own Cloudflare R2 storage;
- guests scan the QR code and land on a download page (`/v/<id>`);
- links delete themselves after 7, 30 or 90 days;
- a TV or laptop opens `/display` and shows the latest videos live.

It runs on Cloudflare's free tier for a typical event business (R2 has no download fees). Nothing here tracks
guests: no cookies, no analytics, no third-party scripts.

## Set it up (once, about 20 minutes)

You need a free Cloudflare account and Node 22 on a computer.

1. **Turn on R2.** Cloudflare dashboard › R2 › enable (a card is asked for, but the free allowance is plenty).
2. **Create the bucket.** R2 › Create bucket › name it `immersia-360-videos`.
3. **Make links expire.** Open the bucket › Settings › Object lifecycle rules › add these rules:

   | Prefix                | Delete objects after |
   | --------------------- | -------------------- |
   | `v/7d/` and `t/7d/`   | 7 days               |
   | `v/30d/` and `t/30d/` | 30 days              |
   | `v/90d/` and `t/90d/` | 90 days              |
   | `m/`                  | 91 days              |

4. **Create an upload key for the phone.** R2 › Manage R2 API tokens › Create API token › permission
   "Object Read & Write", limited to the `immersia-360-videos` bucket. Note the **Access Key ID** and the
   **Secret Access Key**. Your **Account ID** is on the R2 overview page.
5. **Deploy.** In this folder:

   ```sh
   npm install
   npx wrangler login
   ```

   Put your Account ID into `wrangler.jsonc` (`vars.R2_ACCOUNT_ID`), then set the secrets:

   ```sh
   openssl rand -base64 32                       # this is your sharing key: keep it
   npx wrangler secret put SHARING_KEY           # paste the key from the line above
   npx wrangler secret put R2_ACCESS_KEY_ID      # from step 4
   npx wrangler secret put R2_SECRET_ACCESS_KEY  # from step 4
   npx wrangler deploy
   ```

   The deploy prints your server's address, like `https://immersia-360.<you>.workers.dev`.

6. **Connect the app.** In Immersia 360: Sharing › Set up sharing › paste the server address and the sharing
   key › Test and save.
7. **Optional: your own domain.** Cloudflare › Workers › immersia-360 › Settings › Domains › add, for example,
   `share.immersiavr.com`. Use that address in the app instead.

The **sharing key** is what lets a phone upload to and delete from your server: keep it private. To change it,
run `npx wrangler secret put SHARING_KEY` again and enter the new key in the app.

The App Store listing needs `https://<your server>/privacy` (Privacy Policy) and `/terms` (Terms of Use).
Both are served here from the same text the app shows.

## How it works

| Path            | What it is                                                                          |
| --------------- | ----------------------------------------------------------------------------------- |
| `src/index.ts`  | Routes                                                                              |
| `src/shares.ts` | Creating, completing and deleting shares; presigned upload links (`src/presign.ts`) |
| `src/files.ts`  | Streams videos with HTTP Range support (iPhones need it to play and seek)           |
| `src/hub.ts`    | `BoothHub`, the Durable Object behind the Display: pairing, sockets, recent videos  |
| `src/pages/`    | The guest page, the Display, Privacy and Terms                                      |

Storage in R2: `v/<days>d/<id>.mp4` (video), `t/<days>d/<id>.jpg` (thumbnail), `m/<id>.json` (details). The
expiry is in the key prefix, so the lifecycle rules above delete each file on time; the Worker also refuses
to serve a link after its date.

## API (for the app)

Every `/api` route except the Display's own needs `Authorization: Bearer <SHARING_KEY>`. Errors are
`{ "error": "<readable message>" }` with the right status code.

| Request                                                                              | Answer                                                                                                                                           |
| ------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `GET /api/health`                                                                    | `{ ok: true }`                                                                                                                                   |
| `POST /api/shares` `{ expiryDays: 7\|30\|90, album, takenAt (ms), bytes }`           | 201 `{ id, url, videoUploadUrl, thumbUploadUrl, expiresAt }`                                                                                     |
| `PUT <videoUploadUrl>` with `Content-Type: video/mp4` (straight to R2, valid 1 hour) | 200                                                                                                                                              |
| `PUT <thumbUploadUrl>` with `Content-Type: image/jpeg`                               | 200                                                                                                                                              |
| `POST /api/shares/:id/upload-urls`                                                   | `{ videoUploadUrl, thumbUploadUrl }` for the same share (404 / 409 already uploaded / 410 expired)                                               |
| `POST /api/shares/:id/complete`                                                      | the share, `status: "ready"` (409 if the video is not uploaded yet)                                                                              |
| `DELETE /api/shares/:id`                                                             | 204, also when it was already gone                                                                                                               |
| `POST /api/displays/claim` `{ code }`                                                | `{ id, name }` (404 unknown, 410 expired)                                                                                                        |
| `GET /api/displays/list`                                                             | `{ displays: [{ id, name, pairedAt, connected, lastSeenAt }] }`                                                                                  |
| `DELETE /api/displays/:id`                                                           | 204: the screen goes back to its pairing code                                                                                                    |
| `POST /api/hub/events`                                                               | `{ type: "booth.recording", countdownS, recordS }`, `{ type: "booth.creating" }`, `{ type: "booth.idle" }` or `{ type: "album.changed", album }` |

The Display (no key; its 64-character token is its secret):

| Request                           | Answer                                                                                                                                                                                                                                                                                           |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /api/displays`              | 201 `{ code, token, expiresAt }`: a 6-character code, valid 10 minutes. At most 10 per network per 10 minutes (429).                                                                                                                                                                             |
| `GET /api/displays/:token`        | `{ state: "pending" \| "expired" \| "paired" \| "unknown", paired, name? }`                                                                                                                                                                                                                      |
| `GET /api/displays/:token/socket` | WebSocket. First message `{ type: "hello", album, recent: [{ id, url, thumbUrl, album, takenAt }] }`, then the booth events above plus `{ type: "video.ready", video }` and `{ type: "video.deleted", id }`. Closed with code **4001** when the booth disconnects it. Send `ping` to get `pong`. |

The pairing QR on the Display encodes `immersia360://pair?code=<CODE>`, which opens the app and pairs in one
step.

## Develop

```sh
npm install
npx vitest run     # tests run inside the Workers runtime (Miniflare), with real R2 and Durable Object storage
npx wrangler dev   # local server on http://localhost:8787
```
