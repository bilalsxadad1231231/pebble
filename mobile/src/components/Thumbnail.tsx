import React, { useState } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';

import { colors, fonts, radii } from '../theme/neumorphic';
import { formatDuration } from '../utils/format';
import { Icon } from './Icon';
import { NeuInset } from './Neu';

/**
 * The platform's poster image, sitting in an inset well.
 *
 * Falls back to a media-type icon whenever there is no poster, the url has
 * expired, or the image fails to decode - a broken image box would read as a
 * bug, an icon reads as "no artwork".
 */
export function Thumbnail({
  uri,
  kind,
  duration,
  width = 58,
  height = 44,
  radius = radii.md,
}: {
  uri?: string | null;
  kind: 'video' | 'audio';
  /** Overlaid bottom-right when known. */
  duration?: number | null;
  width?: number;
  height?: number;
  radius?: number;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = Boolean(uri) && !failed;

  return (
    <NeuInset radius={radius} style={[styles.well, { width, height }]}>
      {showImage ? (
        <Image
          source={{ uri: uri! }}
          style={StyleSheet.absoluteFill}
          // Posters are 16:9 while these wells are squarer, so crop rather than
          // letterbox - a letterboxed thumbnail in a list reads as broken.
          resizeMode="cover"
          onError={() => setFailed(true)}
          accessibilityIgnoresInvertColors
        />
      ) : (
        <Icon name={kind === 'audio' ? 'music' : 'video'} size={16} color={colors.textFaint} />
      )}

      {duration ? (
        <View style={styles.durationPill}>
          <Text style={styles.duration}>{formatDuration(duration)}</Text>
        </View>
      ) : null}
    </NeuInset>
  );
}

const styles = StyleSheet.create({
  well: {
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  durationPill: {
    position: 'absolute',
    right: 3,
    bottom: 3,
    // Readable over both a bright poster and the empty well.
    backgroundColor: 'rgba(20,22,28,0.72)',
    paddingHorizontal: 4,
    paddingVertical: 1,
    borderRadius: 4,
  },
  duration: {
    fontSize: 8.5,
    color: '#FFFFFF',
    fontFamily: fonts.headingSemi,
  },
});
