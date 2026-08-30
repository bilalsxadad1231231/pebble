import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, IconName } from '../../src/components/Icon';
import { NeuInset } from '../../src/components/Neu';
import { colors, fonts, fontSizes, MIN_TOUCH, radii, spacing } from '../../src/theme/neumorphic';

const TABS: { name: string; label: string; icon: IconName }[] = [
  { name: 'index', label: 'Home', icon: 'home' },
  { name: 'library', label: 'Library', icon: 'library' },
  { name: 'settings', label: 'Settings', icon: 'settings' },
];

/**
 * Bottom navigation.
 *
 * Per the spec the bar itself carries no shadow or container - it is a plain
 * row. Only the active tab is a surface: an inset rounded rect with the accent
 * icon. Inactive tabs are flat and muted.
 */
function NeuTabBar({ state, navigation }: BottomTabBarProps) {
  const insets = useSafeAreaInsets();

  return (
    <View
      style={[
        styles.bar,
        { paddingBottom: Math.max(insets.bottom, spacing.lg), backgroundColor: colors.background },
      ]}
    >
      {state.routes.map((route: { key: string; name: string }, index: number) => {
        const meta = TABS.find((t) => t.name === route.name);
        if (!meta) return null;

        const focused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        };

        return (
          <Pressable
            key={route.key}
            onPress={onPress}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={meta.label}
            style={styles.tab}
          >
            {focused ? (
              <NeuInset radius={radii.xl} style={styles.activePill}>
                <Icon name={meta.icon} size={20} color={colors.accent} />
              </NeuInset>
            ) : (
              <View style={styles.activePill}>
                <Icon name={meta.icon} size={20} color={colors.textMuted} />
              </View>
            )}
            <Text style={[styles.label, focused && styles.labelActive]}>
              {meta.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{ headerShown: false, sceneStyle: { backgroundColor: colors.background } }}
      tabBar={(props) => <NeuTabBar {...props} />}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="library" />
      <Tabs.Screen name="settings" />
    </Tabs>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingTop: spacing.lg,
    paddingHorizontal: spacing.xl,
  },
  tab: {
    alignItems: 'center',
    gap: 5,
    minWidth: MIN_TOUCH,
    minHeight: MIN_TOUCH,
  },
  activePill: {
    width: 52,
    height: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontSize: fontSizes.label,
    color: colors.textMuted,
    fontFamily: fonts.headingSemi,
  },
  labelActive: { color: colors.accentPressedText },
});
