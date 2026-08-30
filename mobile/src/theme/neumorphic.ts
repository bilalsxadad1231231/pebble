/**
 * Soft Neumorphic design tokens.
 *
 * These values are owned by the `pebble-neumorphic-rn-android` skill and are
 * reproduced here exactly - do not approximate or round. Any change belongs in
 * the skill first.
 */

export const colors = {
  background: '#E7E9EE',   // app background, and the base every surface sits on
  text: '#33363F',         // primary text / headings
  textMuted: '#7A7E8C',    // secondary icons, inactive nav
  textFaint: '#9CA1AE',    // meta text (platform / size / quality), placeholders
  accent: '#4FB0A5',       // teal accent - active states, progress fill
  accentPressedText: '#3D8F86', // accent text sitting on a raised/inset surface
  shadowDark: '#C7CAD1',   // the "dark" side of every soft shadow
  shadowLight: '#FFFFFF',  // the "light" side of every soft shadow
  platformDotYouTube: '#E24C4C',
  platformDotInstagram: '#DD2A7B',
  platformDotTikTok: '#33363F',
  platformDotFacebook: '#3D7DD8',
  platformDotX: '#33363F',
} as const;

export const radii = {
  chip: 999, pill: 999, sm: 12, md: 14, lg: 16, xl: 18, xxl: 20,
} as const;

export const spacing = {
  xs: 4, sm: 8, md: 10, lg: 12, xl: 16, xxl: 18,
  screenX: 22, screenTop: 28, screenBottom: 26,
} as const;

export const fontSizes = {
  h1: 20, h2: 15, body: 13.5, meta: 12, metaSmall: 11.5, label: 10.5, statBig: 30,
} as const;

/** Quicksand carries headings; body text uses the Android system font. */
export const fonts = {
  heading: 'Quicksand_700Bold',
  headingSemi: 'Quicksand_600SemiBold',
} as const;

/** Android Material minimum touch target. */
export const MIN_TOUCH = 48;

/** Raised -> inset crossfade on press. */
export const PRESS_DURATION_MS = 110;

/** Maps an extractor/platform name onto its badge dot. */
export function platformDot(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'youtube': return colors.platformDotYouTube;
    case 'instagram': return colors.platformDotInstagram;
    case 'tiktok': return colors.platformDotTikTok;
    case 'facebook': return colors.platformDotFacebook;
    case 'twitter':
    case 'x': return colors.platformDotX;
    default: return colors.textMuted;
  }
}

/** Two-letter badge label - abbreviations only, never platform logos. */
export function platformAbbr(platform: string): string {
  switch (platform.toLowerCase()) {
    case 'youtube': return 'YT';
    case 'instagram': return 'IG';
    case 'tiktok': return 'TT';
    case 'facebook': return 'FB';
    case 'twitter':
    case 'x': return 'X';
    default: return platform.slice(0, 2).toUpperCase();
  }
}
