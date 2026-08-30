import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import type { MediaInfo } from '../api/types';
import {
  colors,
  fonts,
  fontSizes,
  platformAbbr,
  platformDot,
  radii,
  spacing,
} from '../theme/neumorphic';
import { formatDuration } from '../utils/format';
import { Icon } from './Icon';
import { NeuInset, NeuRaised } from './Neu';

/** Platform badge: abbreviation plus a coloured dot, never the platform's logo. */
export function PlatformChip({
  platform,
  selected,
}: {
  platform: string;
  selected?: boolean;
}) {
  const Surface = selected ? NeuInset : NeuRaised;
  return (
    <Surface radius={radii.chip} style={styles.chip}>
      <View style={[styles.dot, { backgroundColor: platformDot(platform) }]} />
      <Text style={styles.chipLabel}>{platformAbbr(platform)}</Text>
    </Surface>
  );
}

/** The resolved post: thumbnail well, title, creator and platform. */
export function MediaCard({ media }: { media: MediaInfo }) {
  return (
    <NeuRaised radius={radii.xl} style={styles.card}>
      <NeuInset radius={radii.md} style={styles.thumb}>
        <Icon name="play" size={16} color={colors.textFaint} />
        {media.duration ? (
          <Text style={styles.duration}>{formatDuration(media.duration)}</Text>
        ) : null}
      </NeuInset>

      <View style={styles.meta}>
        <Text style={styles.title} numberOfLines={2}>
          {media.title}
        </Text>
        <View style={styles.subRow}>
          <View style={[styles.dotSmall, { backgroundColor: platformDot(media.platform) }]} />
          <Text style={styles.sub} numberOfLines={1}>
            {media.uploader ? `${media.uploader} · ` : ''}
            {platformAbbr(media.platform)}
          </Text>
        </View>
      </View>
    </NeuRaised>
  );
}

/** Shimmerless placeholder shown while `/resolve` is in flight. */
export function MediaCardSkeleton() {
  return (
    <NeuRaised radius={radii.xl} style={styles.card}>
      <NeuInset radius={radii.md} style={styles.thumb} />
      <View style={styles.meta}>
        <NeuInset radius={radii.sm} style={styles.barWide} />
        <NeuInset radius={radii.sm} style={styles.barNarrow} />
      </View>
    </NeuRaised>
  );
}

const styles = StyleSheet.create({
  chip: {
    width: 54,
    height: 54,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
  },
  dot: { width: 6, height: 6, borderRadius: 3 },
  dotSmall: { width: 5, height: 5, borderRadius: 2.5 },
  chipLabel: {
    fontSize: fontSizes.label,
    color: colors.textMuted,
    fontFamily: fonts.headingSemi,
  },
  card: {
    flexDirection: 'row',
    padding: 11,
    gap: spacing.lg,
    alignItems: 'center',
  },
  thumb: {
    width: 58,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  duration: {
    position: 'absolute',
    bottom: 2,
    right: 4,
    fontSize: 8.5,
    color: colors.textFaint,
    fontFamily: fonts.headingSemi,
  },
  meta: { flex: 1, gap: spacing.xs },
  title: {
    fontSize: fontSizes.body,
    color: colors.text,
    fontFamily: fonts.headingSemi,
    lineHeight: 18,
  },
  subRow: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  sub: { fontSize: fontSizes.meta, color: colors.textFaint, flex: 1 },
  barWide: { height: 11, width: '82%' },
  barNarrow: { height: 9, width: '48%' },
});
