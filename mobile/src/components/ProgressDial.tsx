import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';

import { colors, fonts, fontSizes, radii, spacing } from '../theme/neumorphic';
import { NeuInset, NeuRaised } from './Neu';

const OUTER = 200;
const INNER = 150;
const STROKE = 7;

/**
 * The download progress dial.
 *
 * A raised 200dp disc with the progress ring drawn on its edge, and an inset
 * 150dp disc at the centre carrying the percentage - so the number sits in a
 * well and the ring rides the rim.
 */
export function ProgressDial({
  progress,
  caption,
  label,
}: {
  /** 0..1 */
  progress: number;
  /** Small line under the percentage, e.g. "12s left". */
  caption?: string;
  /** Replaces the percentage when the job is not measurably progressing. */
  label?: string;
}) {
  const clamped = Math.min(Math.max(progress, 0), 1);
  const radius = (OUTER - STROKE) / 2;
  const circumference = 2 * Math.PI * radius;

  return (
    <View style={styles.wrap}>
      <NeuRaised radius={radii.chip} distance={9} style={styles.outer}>
        <NeuInset radius={radii.chip} style={styles.inner}>
          <Text style={styles.value}>
            {label ?? `${Math.round(clamped * 100)}%`}
          </Text>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </NeuInset>
      </NeuRaised>

      {/* Drawn over the raised disc's edge, not inside it. */}
      <Svg
        width={OUTER}
        height={OUTER}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      >
        <Circle
          cx={OUTER / 2}
          cy={OUTER / 2}
          r={radius}
          stroke={colors.shadowDark}
          strokeWidth={STROKE}
          fill="none"
          opacity={0.5}
        />
        <Circle
          cx={OUTER / 2}
          cy={OUTER / 2}
          r={radius}
          stroke={colors.accent}
          strokeWidth={STROKE}
          strokeLinecap="round"
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={circumference * (1 - clamped)}
          // Start the sweep at 12 o'clock rather than 3.
          transform={`rotate(-90 ${OUTER / 2} ${OUTER / 2})`}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    width: OUTER,
    height: OUTER,
    alignSelf: 'center',
  },
  outer: {
    width: OUTER,
    height: OUTER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inner: {
    width: INNER,
    height: INNER,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xs,
  },
  value: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.statBig,
    color: colors.text,
    fontVariant: ['tabular-nums'],
  },
  caption: {
    fontSize: fontSizes.metaSmall,
    color: colors.textFaint,
  },
});
