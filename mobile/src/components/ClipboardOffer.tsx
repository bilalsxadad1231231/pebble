import React from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { colors, fonts, fontSizes, radii, spacing } from '../theme/neumorphic';
import { platformOf, prettyUrl } from '../utils/url';
import { Icon } from './Icon';
import { NeuInset, NeuPressable } from './Neu';
import { PlatformChip } from './MediaCard';

/**
 * "You copied a link - want it?"
 *
 * Shown when the app comes to the foreground holding a supported url on the
 * clipboard. It offers rather than acts: reading the clipboard fires a system
 * toast on Android 12+, and this card is what makes that toast make sense.
 *
 * Dismissible, and it never covers the paste field.
 */
export function ClipboardOffer({
  url,
  onAccept,
  onDismiss,
}: {
  url: string;
  onAccept: () => void;
  onDismiss: () => void;
}) {
  return (
    <NeuInset radius={radii.lg} style={styles.card}>
      <PlatformChip platform={platformOf(url)} />

      <View style={styles.meta}>
        <Text style={styles.label}>Copied link</Text>
        <Text style={styles.url} numberOfLines={1}>
          {prettyUrl(url)}
        </Text>
      </View>

      <NeuPressable
        radius={radii.pill}
        distance={5}
        onPress={onAccept}
        accessibilityLabel="Download the copied link"
        style={styles.action}
      >
        <Text style={styles.actionLabel}>Download</Text>
      </NeuPressable>

      <NeuPressable
        radius={radii.pill}
        distance={4}
        onPress={onDismiss}
        accessibilityLabel="Dismiss the copied link"
        style={styles.dismiss}
      >
        <Icon name="close" size={13} color={colors.textMuted} />
      </NeuPressable>
    </NeuInset>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  meta: {
    flex: 1,
    gap: 2,
  },
  label: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.metaSmall,
    color: colors.textMuted,
  },
  url: {
    fontSize: 12,
    color: colors.text,
  },
  action: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actionLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.metaSmall,
    color: colors.accentPressedText,
  },
  dismiss: {
    width: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
