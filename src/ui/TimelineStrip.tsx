/* eslint-disable react-hooks/refs --
 * The gesture callbacks below read refs, which is only allowed outside render. They run on touch events
 * (runOnJS), never during render, but the compiler cannot tell that through the gesture builder. The refs hold
 * the drag origin and the latest props, so a drag that re-renders its parent keeps working.
 */
import * as Haptics from 'expo-haptics';
import { useLayoutEffect, useRef, useState } from 'react';
import { StyleSheet, View, type LayoutChangeEvent } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import { centreWindowAt, dragWindow, pickDragMode, type DragMode } from '@/domain/timeline-drag';
import type { SlowmoWindow } from '@/domain/timeline';
import { colors, radius, space } from '@/theme';

import { Text } from './Text';

const HEIGHT = 30;
/** How close to an edge (in points) a touch must land to grab it. */
const EDGE_GRAB_PT = 18;
const LABEL_EVERY_S = 3;

/**
 * The take from 0 to `recordS` with the slow-motion window in cobalt (the reference's strip). Drag the window
 * to move it, drag either edge to resize it, tap elsewhere to move it there. Horizontal drags only, so the
 * settings list still scrolls vertically over it. Screen readers use the steppers instead; this announces the
 * window but is not adjustable itself.
 */
export function TimelineStrip({
  recordS,
  window,
  onChange,
  disabled,
}: {
  recordS: number;
  window: SlowmoWindow;
  onChange: (next: SlowmoWindow) => void;
  /** The current camera preset cannot do slow motion (30 fps): the window is shown greyed out. */
  disabled?: boolean;
}) {
  const [width, setWidth] = useState(0);
  const drag = useRef<{ mode: DragMode; from: SlowmoWindow } | null>(null);
  const latest = useRef({ window, recordS, onChange, width });
  useLayoutEffect(() => {
    latest.current = { window, recordS, onChange, width };
  });

  const toSeconds = (x: number) => (x / Math.max(1, latest.current.width)) * latest.current.recordS;

  const pan = Gesture.Pan()
    .runOnJS(true)
    .activeOffsetX([-6, 6])
    .failOffsetY([-12, 12])
    .onStart((e) => {
      const { window: w, recordS: r } = latest.current;
      const picked = pickDragMode(w, toSeconds(e.x - e.translationX), toSeconds(EDGE_GRAB_PT), r);
      drag.current = { mode: picked.mode, from: picked.window };
      if (picked.window !== w) latest.current.onChange(picked.window);
    })
    .onUpdate((e) => {
      if (!drag.current) return;
      const next = dragWindow(
        drag.current.mode,
        drag.current.from,
        toSeconds(e.translationX),
        latest.current.recordS,
      );
      const w = latest.current.window;
      if (next.slowmoStartS !== w.slowmoStartS || next.slowmoDurationS !== w.slowmoDurationS)
        latest.current.onChange(next);
    })
    .onEnd(() => {
      void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    })
    .onFinalize(() => {
      drag.current = null;
    });

  const tap = Gesture.Tap()
    .runOnJS(true)
    .onEnd((e, success) => {
      if (!success) return;
      const { window: w, recordS: r } = latest.current;
      const t = toSeconds(e.x);
      if (t >= w.slowmoStartS && t <= w.slowmoStartS + w.slowmoDurationS) return;
      latest.current.onChange(centreWindowAt(w, t, r));
      void Haptics.selectionAsync();
    });

  const gesture = Gesture.Race(pan, tap);
  const px = (s: number) => (s / recordS) * width;
  const wholeSeconds = Math.floor(recordS);
  const end = window.slowmoStartS + window.slowmoDurationS;

  return (
    <View
      style={styles.wrap}
      accessible
      accessibilityLabel={
        window.slowmoDurationS > 0
          ? `Slow motion from ${window.slowmoStartS.toFixed(1)} to ${end.toFixed(1)} seconds of ${recordS.toFixed(1)}`
          : 'Slow motion off'
      }
    >
      <View style={styles.labels} importantForAccessibility="no-hide-descendants">
        {width > 0 &&
          Array.from(
            { length: Math.floor(wholeSeconds / LABEL_EVERY_S) + 1 },
            (_, i) => i * LABEL_EVERY_S,
          ).map((s) => (
            <Text
              key={s}
              variant="caption"
              tone="faint"
              style={[styles.label, { left: Math.min(px(s), width - 24) }]}
            >
              {s.toFixed(1)}
            </Text>
          ))}
      </View>
      <GestureDetector gesture={gesture}>
        <View
          style={styles.track}
          onLayout={(e: LayoutChangeEvent) => setWidth(e.nativeEvent.layout.width)}
          hitSlop={{ top: 10, bottom: 10 }}
        >
          {width > 0 && (
            <>
              {Array.from({ length: wholeSeconds + 1 }, (_, s) => s).map((s) => (
                <View
                  key={s}
                  style={[
                    styles.tick,
                    s % LABEL_EVERY_S === 0 ? styles.tickMajor : styles.tickMinor,
                    { left: px(s) },
                  ]}
                />
              ))}
              {window.slowmoDurationS > 0 && (
                <View
                  style={[
                    styles.window,
                    disabled && styles.windowDisabled,
                    { left: px(window.slowmoStartS), width: Math.max(4, px(window.slowmoDurationS)) },
                  ]}
                >
                  <View style={[styles.handle, styles.handleLeft]} />
                  <View style={[styles.handle, styles.handleRight]} />
                </View>
              )}
            </>
          )}
        </View>
      </GestureDetector>
      <View style={styles.legend} importantForAccessibility="no-hide-descendants">
        <View style={[styles.dot, disabled && styles.windowDisabled]} />
        <Text variant="caption" tone="muted">
          Slow motion
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { paddingTop: space.sm, paddingBottom: space.xs },
  labels: { height: 18 },
  label: { position: 'absolute', top: 0 },
  track: {
    height: HEIGHT,
    borderRadius: radius.sm / 2,
    backgroundColor: colors.surfaceRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.lineStrong,
    overflow: 'hidden',
  },
  tick: { position: 'absolute', width: StyleSheet.hairlineWidth, backgroundColor: colors.lineStrong },
  tickMajor: { top: 0, bottom: 0 },
  tickMinor: { top: HEIGHT / 2 - 5, height: 10 },
  window: { position: 'absolute', top: 0, bottom: 0, backgroundColor: colors.accent },
  windowDisabled: { backgroundColor: colors.textDisabled },
  handle: {
    position: 'absolute',
    top: 7,
    bottom: 7,
    width: 3,
    borderRadius: 2,
    backgroundColor: colors.onAccent,
    opacity: 0.85,
  },
  handleLeft: { left: 3 },
  handleRight: { right: 3 },
  legend: { flexDirection: 'row', alignItems: 'center', gap: space.xs + 2, marginTop: space.sm },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.accent },
});
