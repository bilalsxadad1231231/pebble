import React, { ReactNode } from 'react';
import { StyleSheet, Text, View, ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, fonts, fontSizes, spacing } from '../theme/neumorphic';
import { Icon, IconName } from './Icon';
import { NeuIconButton } from './Neu';

/**
 * Screen shell.
 *
 * Safe-area insets are added to the spec's own padding rather than replacing it,
 * so the status bar and gesture nav are respected without a fake status bar
 * being painted - the OS owns that space.
 */
export function Screen({
  children,
  style,
}: {
  children: ReactNode;
  style?: ViewStyle;
}) {
  const insets = useSafeAreaInsets();
  return (
    <View
      style={[
        styles.screen,
        { paddingTop: insets.top + spacing.screenTop },
        style,
      ]}
    >
      {children}
    </View>
  );
}

export function ScreenHeader({
  title,
  subtitle,
  leftIcon,
  onLeftPress,
  rightIcon,
  onRightPress,
  rightLabel,
}: {
  title: string;
  subtitle?: string;
  leftIcon?: IconName;
  onLeftPress?: () => void;
  rightIcon?: IconName;
  onRightPress?: () => void;
  rightLabel?: string;
}) {
  return (
    <View style={styles.header}>
      <View style={styles.headerLeft}>
        {leftIcon ? (
          <NeuIconButton
            size={38}
            onPress={onLeftPress}
            accessibilityLabel={leftIcon === 'back' ? 'Go back' : leftIcon}
          >
            <Icon name={leftIcon} size={19} color={colors.textMuted} />
          </NeuIconButton>
        ) : null}
        <View style={styles.titleBlock}>
          <Text style={styles.title} numberOfLines={1}>
            {title}
          </Text>
          {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
        </View>
      </View>

      {rightIcon ? (
        <NeuIconButton
          size={38}
          onPress={onRightPress}
          accessibilityLabel={rightLabel ?? rightIcon}
        >
          <Icon name={rightIcon} size={19} color={colors.textMuted} />
        </NeuIconButton>
      ) : null}
    </View>
  );
}

export function SectionLabel({ children }: { children: ReactNode }) {
  return <Text style={styles.sectionLabel}>{children}</Text>;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingHorizontal: spacing.screenX,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.xl,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    flex: 1,
  },
  titleBlock: { flex: 1 },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.h1,
    color: colors.text,
  },
  subtitle: {
    fontSize: fontSizes.metaSmall,
    color: colors.textFaint,
    marginTop: 1,
  },
  sectionLabel: {
    fontSize: fontSizes.metaSmall,
    letterSpacing: 0.9,
    color: colors.textFaint,
    fontFamily: fonts.headingSemi,
    marginBottom: spacing.md,
  },
});
