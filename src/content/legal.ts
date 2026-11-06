/**
 * The Privacy Policy and Terms of Use shown in the app (Settings › Help). The same text is served by the
 * sharing server for the App Store listing's links. Plain language on purpose: guests read these too.
 *
 * DRAFT: to be approved by the business before release (name of the company, contact address).
 */

export type LegalDoc = { title: string; updated: string; sections: { heading: string; body: string[] }[] };

export const PRIVACY: LegalDoc = {
  title: 'Privacy Policy',
  updated: '6 November 2026',
  sections: [
    {
      heading: 'The short version',
      body: [
        'Immersia 360 records 360 videos at events. The videos stay on the booth’s phone unless the booth operator turns on QR sharing. There are no accounts, no advertising and no tracking.',
      ],
    },
    {
      heading: 'What the app records',
      body: [
        'Video from the camera, only while a recording is running. The app does not use the microphone: the sound in a video is the music the operator chose.',
        'Videos, their original clips and thumbnails are stored inside the app on the booth’s phone, until the operator deletes them.',
      ],
    },
    {
      heading: 'QR sharing',
      body: [
        'When QR sharing is on, each finished video and its thumbnail are uploaded to the sharing server the operator set up, and a QR code links to a download page for that video.',
        'Anyone with the link can watch and download that video until the link expires (7, 30 or 90 days, chosen by the operator). The video is then deleted from the server. The operator can delete a link earlier.',
        'The download page sets no cookies and loads nothing from third parties. The server keeps the standard technical logs a web service needs to run.',
      ],
    },
    {
      heading: 'The Display',
      body: [
        'A Display is a screen the operator pairs with the booth to show recent videos. It shows videos that were shared by QR, with their QR codes.',
      ],
    },
    {
      heading: 'Photos and files',
      body: [
        'The app adds a video to Photos only when the operator asks it to (or turns on saving to Photos automatically). It reads from Photos or Files only to import an overlay frame or a song the operator picks.',
      ],
    },
    {
      heading: 'Guests',
      body: [
        'The booth operator is responsible for telling guests that they are being recorded and how their videos are shared, and for getting any consent the law requires where the event takes place.',
        'A guest who wants their video removed can ask the operator, who can delete it from the phone and its link from the server.',
      ],
    },
    {
      heading: 'Children',
      body: ['The app is a tool for event operators and is not directed at children.'],
    },
    {
      heading: 'Changes and contact',
      body: [
        'If this policy changes, the new version is published in the app and on the sharing server with its date.',
        'Questions: use the contact address in Settings › Help, or the one in the App Store listing.',
      ],
    },
  ],
};

export const TERMS: LegalDoc = {
  title: 'Terms of Use',
  updated: '6 November 2026',
  sections: [
    {
      heading: 'Using the app',
      body: [
        'Immersia 360 is a tool for running a 360 video booth. You may use it at your own events and at events you run for others.',
      ],
    },
    {
      heading: 'Your responsibilities',
      body: [
        'Tell guests they are being recorded and how their videos are shared, and get any consent the law requires.',
        'Use only overlay artwork and music you have the rights to use.',
        'Keep your sharing key private. Anyone with it can upload to and delete from your sharing server.',
        'Run the spinner hardware safely and follow its maker’s instructions. The app does not control the spinner.',
      ],
    },
    {
      heading: 'Your content',
      body: ['The videos you make are yours (and your guests’). The app does not claim any rights in them.'],
    },
    {
      heading: 'No warranty',
      body: [
        'The app is provided as it is. We work to make it reliable, but we cannot promise that it will never fail, so keep originals until videos are delivered. To the extent the law allows, we are not liable for lost videos, missed events or indirect losses.',
      ],
    },
    {
      heading: 'Changes',
      body: [
        'These terms may be updated; the date above shows when. Using the app after a change means accepting it.',
      ],
    },
  ],
};
