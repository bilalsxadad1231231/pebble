/**
 * One shared stroke-based icon set.
 *
 * 24x24 viewBox, stroke width 1.8, round caps and joins, no fill - except the
 * play triangle and the platform dots, which are solid. Never emoji, never an
 * icon font, and never a per-screen redraw of the same glyph.
 */
import React from 'react';
import Svg, { Circle, Path, Polygon, Rect } from 'react-native-svg';

import { colors } from '../theme/neumorphic';

export type IconName =
  | 'link'
  | 'settings'
  | 'home'
  | 'library'
  | 'search'
  | 'download'
  | 'play'
  | 'pause'
  | 'close'
  | 'back'
  | 'check'
  | 'clock'
  | 'scissors'
  | 'gauge'
  | 'tag'
  | 'music'
  | 'video'
  | 'trash';

type Props = {
  name: IconName;
  size?: number;
  color?: string;
  strokeWidth?: number;
};

export function Icon({
  name,
  size = 22,
  color = colors.textMuted,
  strokeWidth = 1.8,
}: Props) {
  const stroke = { stroke: color, strokeWidth, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, fill: 'none' };

  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      {name === 'link' && (
        <>
          <Path d="M10 13a4.5 4.5 0 0 0 6.8.5l2.7-2.7a4.5 4.5 0 0 0-6.4-6.4L11.6 5.9" {...stroke} />
          <Path d="M14 11a4.5 4.5 0 0 0-6.8-.5l-2.7 2.7a4.5 4.5 0 0 0 6.4 6.4l1.5-1.5" {...stroke} />
        </>
      )}

      {name === 'settings' && (
        <>
          <Circle cx="12" cy="12" r="3.1" {...stroke} />
          <Path
            d="M19.4 14a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5v.2a2 2 0 1 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1h.2a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"
            {...stroke}
          />
        </>
      )}

      {name === 'home' && (
        <>
          <Path d="M3.5 10.5 12 3.5l8.5 7" {...stroke} />
          <Path d="M5.8 9.4V20h12.4V9.4" {...stroke} />
        </>
      )}

      {name === 'library' && (
        <>
          <Rect x="3.5" y="4.5" width="17" height="15" rx="2.5" {...stroke} />
          <Path d="M3.5 9.5h17M9 4.5v15" {...stroke} />
        </>
      )}

      {name === 'search' && (
        <>
          <Circle cx="11" cy="11" r="6.5" {...stroke} />
          <Path d="m16 16 4 4" {...stroke} />
        </>
      )}

      {name === 'download' && (
        <>
          <Path d="M12 3.5v11" {...stroke} />
          <Path d="m7.5 10.5 4.5 4.5 4.5-4.5" {...stroke} />
          <Path d="M4.5 20.5h15" {...stroke} />
        </>
      )}

      {/* Solid by design - a stroked triangle reads as an outline, not a play cue. */}
      {name === 'play' && <Polygon points="8,5 19,12 8,19" fill={color} />}

      {name === 'pause' && (
        <>
          <Rect x="7" y="5" width="3.4" height="14" rx="1.2" fill={color} />
          <Rect x="13.6" y="5" width="3.4" height="14" rx="1.2" fill={color} />
        </>
      )}

      {name === 'close' && <Path d="m6 6 12 12M18 6 6 18" {...stroke} />}

      {name === 'back' && <Path d="M15 4.5 7.5 12l7.5 7.5" {...stroke} />}

      {name === 'check' && <Path d="m4.5 12.5 5 5 10-11" {...stroke} />}

      {name === 'clock' && (
        <>
          <Circle cx="12" cy="12" r="8.5" {...stroke} />
          <Path d="M12 7v5.4l3.4 2" {...stroke} />
        </>
      )}

      {name === 'scissors' && (
        <>
          <Circle cx="6.5" cy="6.5" r="2.6" {...stroke} />
          <Circle cx="6.5" cy="17.5" r="2.6" {...stroke} />
          <Path d="M8.8 8.2 20 17M20 7 8.8 15.8" {...stroke} />
        </>
      )}

      {name === 'gauge' && (
        <>
          <Path d="M4 16a8 8 0 1 1 16 0" {...stroke} />
          <Path d="m12 16 4-4.5" {...stroke} />
          <Circle cx="12" cy="16" r="1.2" fill={color} />
        </>
      )}

      {name === 'tag' && (
        <>
          <Path d="M4.5 11V5.5a1 1 0 0 1 1-1H11l8 8-6.5 6.5z" {...stroke} />
          <Circle cx="8.2" cy="8.2" r="1.3" fill={color} />
        </>
      )}

      {name === 'music' && (
        <>
          <Path d="M9 18V6.5l10-2v11" {...stroke} />
          <Circle cx="6.6" cy="18" r="2.4" {...stroke} />
          <Circle cx="16.6" cy="15.5" r="2.4" {...stroke} />
        </>
      )}

      {name === 'video' && (
        <>
          <Rect x="3" y="6" width="13" height="12" rx="2.5" {...stroke} />
          <Path d="m16 11 5-3v8l-5-3z" {...stroke} />
        </>
      )}

      {name === 'trash' && (
        <>
          <Path d="M4.5 7h15M9.5 7V5.2a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1V7" {...stroke} />
          <Path d="M6.5 7 7.4 19a1.6 1.6 0 0 0 1.6 1.5h6a1.6 1.6 0 0 0 1.6-1.5L17.5 7" {...stroke} />
        </>
      )}
    </Svg>
  );
}
