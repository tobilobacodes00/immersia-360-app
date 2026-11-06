import Constants from 'expo-constants';

/**
 * Values that belong to the business rather than the code. `null` hides whatever depends on it until it is
 * filled in (the Help rows stay hidden rather than linking nowhere).
 */
export const config = {
  /** Support address for Settings > Contact. Needed before App Store submission. */
  supportEmail: null as string | null,
  /** Page or playlist of tutorial videos for Settings > Video tutorials. */
  tutorialsUrl: null as string | null,
  appVersion: Constants.expoConfig?.version ?? '1.0.0',
} as const;
