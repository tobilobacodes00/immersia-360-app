import { StyleSheet, View } from 'react-native';

import { formatSeconds } from '@/domain/format';
import { AUTO_START_CHOICES, LIMITS, type Settings } from '@/domain/settings';
import { finalLengthS, fitWindow, formatLength, slowFactor } from '@/domain/timeline';
import { Row, Section, Segmented, Stepper, Text, TimelineStrip, Toggle } from '@/ui';
import { space } from '@/theme';

const COMPARE_FPS = [60, 120, 240] as const;

/**
 * Countdown, record time, the slow-motion window (steppers and the draggable strip), reverse, the final length
 * readout and the ways a take can start.
 *
 * @param cameraFps frame rate of the active camera's preset, or null while it is still "best available".
 */
export function RecordingSection({
  draft,
  edit,
  cameraFps,
}: {
  draft: Settings;
  edit: (change: (s: Settings) => Settings) => void;
  cameraFps: number | null;
}) {
  const r = draft.recording;
  const setRecording = (patch: Partial<Settings['recording']>) =>
    edit((s) => {
      const recording = { ...s.recording, ...patch };
      // A shorter take pulls the slow-motion window back inside it.
      return { ...s, recording: { ...recording, ...fitWindow(recording, recording.recordS) } };
    });
  const noSlowmo = cameraFps !== null && slowFactor(cameraFps) === 1;

  return (
    <Section title="Recording">
      <Row
        label="Countdown"
        value={r.countdownS === 0 ? 'Off' : String(r.countdownS)}
        right={
          <Stepper
            label="Countdown"
            value={r.countdownS}
            {...LIMITS.countdownS}
            format={(v) => (v === 0 ? 'Off' : `${v} seconds`)}
            onChange={(countdownS) => setRecording({ countdownS })}
          />
        }
      />
      <Row
        label="Record time"
        value={formatSeconds(r.recordS)}
        right={
          <Stepper
            label="Record time"
            value={r.recordS}
            {...LIMITS.recordS}
            format={(v) => `${formatSeconds(v)} seconds`}
            onChange={(recordS) => setRecording({ recordS })}
          />
        }
      />
      <Row
        label="Slowmo start time"
        value={formatSeconds(r.slowmoStartS)}
        right={
          <Stepper
            label="Slow motion start time"
            value={r.slowmoStartS}
            min={0}
            max={r.recordS - r.slowmoDurationS}
            step={LIMITS.slowmoStartS.step}
            format={(v) => `${formatSeconds(v)} seconds`}
            onChange={(slowmoStartS) => setRecording({ slowmoStartS })}
          />
        }
      />
      <Row
        label="Slowmo duration"
        value={r.slowmoDurationS === 0 ? 'Off' : formatSeconds(r.slowmoDurationS)}
        right={
          <Stepper
            label="Slow motion duration"
            value={r.slowmoDurationS}
            min={0}
            max={r.recordS - r.slowmoStartS}
            step={LIMITS.slowmoDurationS.step}
            format={(v) => (v === 0 ? 'Off' : `${formatSeconds(v)} seconds`)}
            onChange={(slowmoDurationS) => setRecording({ slowmoDurationS })}
          />
        }
      />
      <Row
        label="Reverse"
        detail="Plays the whole video again backwards"
        right={<Toggle label="Reverse" value={r.reverse} onChange={(reverse) => setRecording({ reverse })} />}
      />
      <View style={styles.timeline}>
        <TimelineStrip recordS={r.recordS} window={r} disabled={noSlowmo} onChange={(w) => setRecording(w)} />
        <FinalLength draft={draft} cameraFps={cameraFps} />
      </View>
      <Row
        label="Auto-start"
        detail="Starts the countdown by itself when the camera opens"
        below={
          <Segmented
            label="Auto-start"
            style={styles.below}
            value={r.autoStartS}
            onChange={(autoStartS) => setRecording({ autoStartS })}
            options={AUTO_START_CHOICES.map((s) => ({
              value: s,
              label: s === 0 ? 'Off' : `${s} s`,
              accessibilityLabel: s === 0 ? 'Off' : `After ${s} seconds`,
            }))}
          />
        }
      />
      <Row
        label="Tap anywhere to start"
        detail="The whole camera screen works as the record button"
        right={
          <Toggle
            label="Tap anywhere to start"
            value={r.tapAnywhere}
            onChange={(tapAnywhere) => setRecording({ tapAnywhere })}
          />
        }
      />
      <Row
        label="Countdown beep"
        right={
          <Toggle
            label="Countdown beep"
            value={r.countdownBeep}
            onChange={(countdownBeep) => setRecording({ countdownBeep })}
          />
        }
      />
      <Row
        label="Show frame on camera"
        detail="Draws the overlay frame over the live picture to help framing"
        right={
          <Toggle
            label="Show frame on camera"
            value={r.showFrameOnCamera}
            onChange={(showFrameOnCamera) => setRecording({ showFrameOnCamera })}
          />
        }
      />
    </Section>
  );
}

/** "Final video: 0:46 with this camera (240 fps)" and the comparison the reference shows. */
function FinalLength({ draft, cameraFps }: { draft: Settings; cameraFps: number | null }) {
  const r = draft.recording;
  const compare = COMPARE_FPS.map((fps) => `${formatLength(finalLengthS(r, fps))} at ${fps}`).join(' · ');
  return (
    <View style={styles.length} accessibilityLiveRegion="polite">
      {cameraFps !== null && (
        <Text variant="callout">
          Final video:{' '}
          <Text variant="callout" style={styles.bold}>
            {formatLength(finalLengthS(r, cameraFps))}
          </Text>{' '}
          with this camera ({Math.round(cameraFps)} fps)
          {slowFactor(cameraFps) === 1 ? ', no slow motion' : ''}
        </Text>
      )}
      <Text variant="footnote" tone="faint">
        {compare} fps
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  timeline: { paddingHorizontal: space.lg, paddingBottom: space.md },
  length: { marginTop: space.md, gap: space.xs },
  bold: { fontWeight: '700' },
  below: { marginTop: space.sm, marginBottom: space.xs },
});
