import React, { useMemo, useRef, useState } from 'react';
import {
  LayoutChangeEvent,
  PanResponder,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Haptics from 'expo-haptics';

import type { ClipRange } from '../api/types';
import { colors, fonts, fontSizes, radii, spacing } from '../theme/neumorphic';
import { formatDuration } from '../utils/format';
import { NeuInset } from './Neu';

/** Matches the backend's MIN_CLIP_SECONDS - anything shorter is refused there. */
const MIN_SPAN = 1;
const HANDLE = 26;

/**
 * Two-handle range selector over the source duration.
 *
 * Drives the Tier 1 `clip` option: the backend downloads only this range and
 * cuts on exact frames, so the user gets the 30 seconds they wanted rather than
 * a 12-minute file to trim elsewhere.
 */
export function ClipScrubber({
  duration,
  value,
  onChange,
}: {
  duration: number;
  value: ClipRange;
  onChange: (next: ClipRange) => void;
}) {
  const [width, setWidth] = useState(0);
  // Refs because PanResponder closes over its handlers once, on creation.
  const widthRef = useRef(0);
  const valueRef = useRef(value);
  valueRef.current = value;

  const onLayout = (event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    widthRef.current = next;
    setWidth(next);
  };

  const toSeconds = (px: number) => (px / Math.max(widthRef.current, 1)) * duration;

  const makeResponder = (handle: 'start' | 'end') =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
      onPanResponderMove: (_event, gesture) => {
        const delta = toSeconds(gesture.dx);
        const current = valueRef.current;

        if (handle === 'start') {
          const start = clamp(current.start + delta, 0, current.end - MIN_SPAN);
          onChange({ start, end: current.end });
        } else {
          const end = clamp(current.end + delta, current.start + MIN_SPAN, duration);
          onChange({ start: current.start, end });
        }
      },
      onPanResponderRelease: () => {
        void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      },
    });

  // Created once - rebuilding them mid-gesture would drop the drag.
  const startResponder = useMemo(() => makeResponder('start'), [duration]);
  const endResponder = useMemo(() => makeResponder('end'), [duration]);

  const startX = (value.start / duration) * width;
  const endX = (value.end / duration) * width;

  return (
    <View style={styles.wrap}>
      <View style={styles.readout}>
        <Text style={styles.time}>{formatDuration(value.start)}</Text>
        <Text style={styles.span}>{formatDuration(value.end - value.start)} selected</Text>
        <Text style={styles.time}>{formatDuration(value.end)}</Text>
      </View>

      <NeuInset radius={radii.pill} style={styles.track}>
        <View onLayout={onLayout} style={styles.trackInner}>
          <View
            style={[
              styles.selection,
              { left: startX, width: Math.max(endX - startX, 2) },
            ]}
          />
          <Handle x={startX} responder={startResponder} label="Clip start" />
          <Handle x={endX} responder={endResponder} label="Clip end" />
        </View>
      </NeuInset>
    </View>
  );
}

function Handle({
  x,
  responder,
  label,
}: {
  x: number;
  responder: ReturnType<typeof PanResponder.create>;
  label: string;
}) {
  return (
    <View
      {...responder.panHandlers}
      accessible
      accessibilityRole="adjustable"
      accessibilityLabel={label}
      // hitSlop lifts the effective target to the 48dp Android minimum.
      hitSlop={{ top: 11, bottom: 11, left: 11, right: 11 }}
      style={[styles.handle, { left: x - HANDLE / 2 }]}
    >
      <View style={styles.handleGrip} />
    </View>
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  readout: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  time: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.meta,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  span: {
    fontSize: fontSizes.metaSmall,
    color: colors.accentPressedText,
    fontFamily: fonts.headingSemi,
  },
  track: { height: 34, justifyContent: 'center', paddingHorizontal: HANDLE / 2 },
  trackInner: { flex: 1, height: '100%', justifyContent: 'center' },
  selection: {
    position: 'absolute',
    height: 5,
    borderRadius: 3,
    backgroundColor: colors.accent,
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    borderRadius: HANDLE / 2,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    // A hairline ring keeps the handle readable against the inset track without
    // introducing a second shadow language.
    borderWidth: 1.5,
    borderColor: colors.shadowDark,
  },
  handleGrip: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.accent,
  },
});
