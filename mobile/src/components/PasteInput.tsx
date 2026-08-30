import React from 'react';
import { StyleSheet, Text, TextInput, View } from 'react-native';

import {
  colors,
  fonts,
  fontSizes,
  MIN_TOUCH,
  radii,
  spacing,
} from '../theme/neumorphic';
import { Icon } from './Icon';
import { NeuInset, NeuPressable } from './Neu';

/**
 * The paste-link field: an inset well with a raised Paste button sitting in it.
 *
 * Height is 52dp per the spec, which also clears the 48dp Android touch minimum
 * for the field itself.
 */
export function PasteInput({
  value,
  onChangeText,
  onPaste,
  onSubmit,
  editable = true,
}: {
  value: string;
  onChangeText: (text: string) => void;
  onPaste: () => void;
  onSubmit: () => void;
  editable?: boolean;
}) {
  return (
    <NeuInset radius={radii.xxl} style={styles.well}>
      <Icon name="link" size={17} color={colors.textFaint} />

      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChangeText}
        onSubmitEditing={onSubmit}
        placeholder="Paste a video link"
        placeholderTextColor={colors.textFaint}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="url"
        returnKeyType="go"
        editable={editable}
        accessibilityLabel="Video link"
      />

      <NeuPressable
        radius={radii.pill}
        distance={5}
        onPress={onPaste}
        accessibilityLabel="Paste link from clipboard"
        style={styles.pasteButton}
      >
        <Text style={styles.pasteLabel}>Paste</Text>
      </NeuPressable>
    </NeuInset>
  );
}

const styles = StyleSheet.create({
  well: {
    height: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
  },
  input: {
    flex: 1,
    fontSize: 14,
    color: colors.text,
    padding: 0,
    minHeight: MIN_TOUCH - 8,
  },
  pasteButton: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pasteLabel: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.metaSmall,
    color: colors.accentPressedText,
  },
});
