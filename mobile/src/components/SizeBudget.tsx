import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, fontSizes, radii, spacing } from '../theme/neumorphic';
import { formatBytes } from '../utils/format';
import { NeuPressable } from './Neu';

/**
 * Size-budget presets.
 *
 * MB is 10^6 to match the backend's bitrate maths and what a file manager
 * shows - not 2^20.
 */
export const BUDGETS = [25, 50, 100, 250] as const;

/**
 * "Fit to size" control.
 *
 * The point of this feature: on a phone with 400 MB free, choosing between
 * "1080p" and "720p" is guessing at an outcome you cannot see. Stating a budget
 * is the honest control.
 */
export function SizeBudget({
  value,
  onChange,
  minimumMb,
  sourceBytes,
}: {
  value: number | null;
  onChange: (next: number | null) => void;
  /** Smallest budget the backend will accept for this duration. */
  minimumMb: number | null;
  sourceBytes: number | null;
}) {
  return (
    <View style={styles.wrap}>
      <View style={styles.row}>
        <NeuPressable
          radius={radii.pill}
          distance={5}
          selected={value === null}
          onPress={() => onChange(null)}
          accessibilityLabel="Original size, no size limit"
          style={styles.chip}
        >
          <Text style={[styles.label, value === null && styles.labelActive]}>
            Original
          </Text>
        </NeuPressable>

        {BUDGETS.map((mb) => {
          // Below the backend's floor this would be a guaranteed 422, so it is
          // shown disabled rather than allowed to fail after the fact.
          const tooSmall = minimumMb !== null && mb < minimumMb;
          const pointless = sourceBytes !== null && mb * 1_000_000 >= sourceBytes;
          const disabled = tooSmall || pointless;

          return (
            <NeuPressable
              key={mb}
              radius={radii.pill}
              distance={5}
              selected={value === mb}
              disabled={disabled}
              onPress={() => onChange(mb)}
              accessibilityLabel={`Fit to ${mb} megabytes`}
              accessibilityState={{ disabled, selected: value === mb }}
              style={styles.chip}
            >
              <Text
                style={[
                  styles.label,
                  value === mb && styles.labelActive,
                  disabled && styles.labelDisabled,
                ]}
              >
                {mb} MB
              </Text>
            </NeuPressable>
          );
        })}
      </View>

      <Text style={styles.hint}>
        {value === null
          ? sourceBytes
            ? `Downloads at source quality · about ${formatBytes(sourceBytes)}`
            : 'Downloads at source quality'
          : `Re-encoded to land under ${value} MB`}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
  chip: {
    paddingVertical: 9,
    paddingHorizontal: spacing.xl,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 38,
  },
  label: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
  },
  labelActive: { color: colors.accentPressedText },
  labelDisabled: { color: colors.textFaint, opacity: 0.45 },
  hint: { fontSize: fontSizes.metaSmall, color: colors.textFaint },
});
