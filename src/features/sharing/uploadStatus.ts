import { daysLeft } from '@/data/uploads';
import { WAITING_FOR_WIFI, type Upload } from '@/jobs/uploads';

/** The upload in a few words, for the QR card, the gallery chip and the uploads list. */
export function uploadStatusText(upload: Upload | null | undefined): string {
  if (!upload) return 'Getting the link…';
  switch (upload.status) {
    case 'online': {
      const days = daysLeft(upload.expiresAt);
      return days === null
        ? 'Ready'
        : days === 0
          ? 'Link expired'
          : `Ready · link works for ${days} more day${days === 1 ? '' : 's'}`;
    }
    case 'uploading':
      return `Uploading ${Math.round(upload.progress * 100)}% · the link works as soon as it finishes`;
    case 'queued':
      return upload.error === WAITING_FOR_WIFI ? 'Waiting for Wi-Fi to upload' : 'Waiting to upload';
    case 'failed':
      return 'Upload paused, retrying automatically';
  }
}
