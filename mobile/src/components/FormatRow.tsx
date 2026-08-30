import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { FormatOption } from '../api/types';
import { colors, fonts, fontSizes, radii, spacing } from '../theme/neumorphic';
import { formatBytes } from '../utils/format';
import { Icon } from './Icon';
import { NeuPressable } from './Neu';

/**
 * One row in the format picker.
 *
 * The delivery tag is shown because it is a real difference to the user, not an
 * implementation detail: `Direct` streams from the platform and starts
 * instantly; `Server merge` has to be built first and takes time.
 */
export function FormatRow({
  format,
  selected,
  onPress,
}: {
  format: FormatOption;
  selected: boolean;
  onPress: () => void;
}) {
  const isAudio = format.kind === 'audio';
  const direct = format.delivery === 'direct';

  return (
    <NeuPressable
      radius={radii.lg}
      distance={6}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={`${format.label}, ${format.ext}, ${
        format.filesize ? formatBytes(format.filesize) : 'size unknown'
      }`}
      style={styles.row}
    >
      <Icon
        name={isAudio ? 'music' : 'video'}
        size={17}
        color={selected ? colors.accentPressedText : colors.textFaint}
      />

      <View style={styles.main}>
        <Text style={[styles.label, selected && styles.labelActive]}>
          {format.label} · {format.ext.toUpperCase()}
        </Text>
        <Text style={styles.meta}>
          {direct ? 'Direct' : 'Server merge'}
          {format.abr ? ` · ${Math.round(format.abr)} kbps` : ''}
        </Text>
      </View>

      <Text style={styles.size}>{formatBytes(format.filesize)}</Text>
    </NeuPressable>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 11,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
    minHeight: 52,
  },
  main: { flex: 1 },
  label: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  labelActive: { color: colors.accentPressedText },
  meta: { fontSize: fontSizes.metaSmall, color: colors.textFaint, marginTop: 1 },
  size: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    fontFamily: fonts.headingSemi,
    fontVariant: ['tabular-nums'],
  },
});
