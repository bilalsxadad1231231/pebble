/**
 * Raised and inset neumorphic surfaces.
 *
 * Android's native `elevation` cannot produce this look - it renders one flat,
 * single-colour shadow with no light-side highlight, so the two-tone
 * raised/pressed effect is physically impossible with it. Everything here goes
 * through `react-native-shadow-2` (SVG, Fabric-safe) instead.
 */
import React, { ReactNode } from 'react';
import {
  Pressable,
  PressableProps,
  StyleProp,
  StyleSheet,
  View,
  ViewStyle,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Shadow } from 'react-native-shadow-2';

import { colors, MIN_TOUCH, radii } from '../theme/neumorphic';

type SurfaceProps = {
  radius?: number;
  distance?: number;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * A surface that sits proud of the background.
 *
 * `react-native-shadow-2` renders outer shadows only, so the two-tone effect is
 * two stacked instances: dark toward the bottom-right, light toward the
 * top-left.
 */
export function NeuRaised({
  radius = radii.xl,
  distance = 7,
  style,
  children,
}: SurfaceProps) {
  return (
    <Shadow
      distance={distance}
      startColor={colors.shadowDark + '55'}
      offset={[distance, distance]}
      style={{ borderRadius: radius }}
      stretch
    >
      <Shadow
        distance={distance}
        startColor={colors.shadowLight + '55'}
        offset={[-distance, -distance]}
        style={{ borderRadius: radius }}
        stretch
      >
        <View
          style={[
            { backgroundColor: colors.background, borderRadius: radius },
            style,
          ]}
        >
          {children}
        </View>
      </Shadow>
    </Shadow>
  );
}

/**
 * A surface pressed into the background.
 *
 * There is no true inset shadow in the library, so this approximates one with
 * two clipped gradients - dark corner top-left, light corner bottom-right,
 * the inverse of the raised recipe. Good enough at 44-200dp; check against the
 * mockups and nudge the stops if it reads flat rather than pressed-in.
 */
export function NeuInset({ radius = radii.xl, style, children }: SurfaceProps) {
  return (
    <View
      style={[
        {
          backgroundColor: colors.background,
          borderRadius: radius,
          overflow: 'hidden',
        },
        style,
      ]}
    >
      <LinearGradient
        colors={[colors.shadowDark + '66', 'transparent']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0.6, y: 0.6 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      <LinearGradient
        colors={['transparent', colors.shadowLight + '99']}
        start={{ x: 0.4, y: 0.4 }}
        end={{ x: 1, y: 1 }}
        style={StyleSheet.absoluteFill}
        pointerEvents="none"
      />
      {children}
    </View>
  );
}

type NeuPressableProps = Omit<PressableProps, 'style'> & {
  radius?: number;
  distance?: number;
  /** Render inset permanently - for a selected chip or the active nav tab. */
  selected?: boolean;
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
};

/**
 * The tactile part of neumorphism: a surface that physically depresses.
 *
 * A raised surface that never changes on press reads as flat, not soft, so the
 * rendering swaps raised -> inset for the duration of the press. Selected states
 * stay inset permanently rather than only while held.
 */
export function NeuPressable({
  radius = radii.xl,
  distance = 7,
  selected = false,
  style,
  children,
  hitSlop,
  ...rest
}: NeuPressableProps) {
  return (
    <Pressable
      hitSlop={hitSlop ?? 8}
      accessibilityRole="button"
      accessibilityState={{ selected }}
      {...rest}
    >
      {({ pressed }) =>
        pressed || selected ? (
          <NeuInset radius={radius} style={style}>
            {children}
          </NeuInset>
        ) : (
          <NeuRaised radius={radius} distance={distance} style={style}>
            {children}
          </NeuRaised>
        )
      }
    </Pressable>
  );
}

/**
 * A circular icon button. The visible circle is often smaller than the 48dp
 * Android minimum, so the gap is made up with hitSlop rather than by inflating
 * the artwork.
 */
export function NeuIconButton({
  size = 34,
  onPress,
  children,
  accessibilityLabel,
  selected,
}: {
  size?: number;
  onPress?: () => void;
  children?: ReactNode;
  accessibilityLabel: string;
  selected?: boolean;
}) {
  const slop = Math.max(0, (MIN_TOUCH - size) / 2);
  return (
    <NeuPressable
      radius={radii.chip}
      distance={5}
      selected={selected}
      onPress={onPress}
      accessibilityLabel={accessibilityLabel}
      hitSlop={slop}
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      {children}
    </NeuPressable>
  );
}
