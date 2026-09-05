import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';

import { api, ApiError } from '../../src/api/client';
import type { ClipRange, FormatOption, MediaInfo } from '../../src/api/types';
import { ClipScrubber } from '../../src/components/ClipScrubber';
import { FormatRow } from '../../src/components/FormatRow';
import { Icon } from '../../src/components/Icon';
import { MediaCard, MediaCardSkeleton, PlatformChip } from '../../src/components/MediaCard';
import { NeuPressable, NeuRaised } from '../../src/components/Neu';
import { PasteInput } from '../../src/components/PasteInput';
import { Screen, ScreenHeader, SectionLabel } from '../../src/components/Screen';
import { SizeBudget } from '../../src/components/SizeBudget';
import { downloads } from '../../src/download/manager';
import * as inbound from '../../src/links/inbound';
import { colors, fonts, fontSizes, radii, spacing } from '../../src/theme/neumorphic';
import { bestAudio, qualityLadder } from '../../src/utils/formats';
import { extractUrl, isSupported } from '../../src/utils/url';

const PLATFORMS = ['youtube', 'instagram', 'tiktok', 'facebook', 'x'];

/** Mirrors the backend guard rails so an impossible budget is never offered. */
const MIN_VIDEO_BITRATE = 200_000;
const AUDIO_BITRATE = 128_000;
const OVERHEAD = 0.95;

function minimumBudgetMb(durationSeconds: number): number {
  const floorBits = (MIN_VIDEO_BITRATE + AUDIO_BITRATE) * durationSeconds;
  return Math.ceil(floorBits / (8 * 1_000_000 * OVERHEAD));
}

export default function HomeScreen() {
  const router = useRouter();

  const [url, setUrl] = useState('');
  const [resolving, setResolving] = useState(false);
  const [media, setMedia] = useState<MediaInfo | null>(null);
  const [formats, setFormats] = useState<FormatOption[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // --- Tier 1 options ---
  const [clip, setClip] = useState<ClipRange | null>(null);
  const [budgetMb, setBudgetMb] = useState<number | null>(null);
  const [embedMetadata, setEmbedMetadata] = useState(true);
  const [audioFormat, setAudioFormat] = useState<'mp3' | 'm4a'>('mp3');

  const selected = formats.find((f) => f.id === selectedId) ?? null;

  const duration = media?.duration ?? null;

  // One row per resolution. YouTube ships the same 1080p as avc1, vp9 and av01,
  // so a raw list reads as five identical "1080p · MP4" rows.
  const videoFormats = useMemo(
    () => qualityLadder(formats, duration),
    [formats, duration],
  );
  const audioFormat_ = useMemo(() => bestAudio(formats, duration), [formats, duration]);

  const effectiveDuration = clip ? clip.end - clip.start : duration;
  const minimumMb = effectiveDuration ? minimumBudgetMb(effectiveDuration) : null;

  // A budget that was valid for the full source can become impossible once the
  // clip shortens, and vice versa - keep the two controls consistent.
  useEffect(() => {
    if (budgetMb !== null && minimumMb !== null && budgetMb < minimumMb) {
      setBudgetMb(null);
    }
  }, [minimumMb, budgetMb]);

  const resolve = useCallback(async (target: string) => {
    const cleaned = extractUrl(target) ?? target.trim();
    if (!cleaned) return;

    setResolving(true);
    setError(null);
    setMedia(null);
    setFormats([]);
    setSelectedId(null);
    setClip(null);
    setBudgetMb(null);

    try {
      const result = await api.resolve(cleaned);
      setMedia(result.media);
      setFormats(result.formats);
      // Default to the top of the ladder, or the audio stream if there is no video.
      const ladder = qualityLadder(result.formats, result.media.duration);
      setSelectedId(
        ladder[0]?.id ?? bestAudio(result.formats, result.media.duration)?.id ?? null,
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (cause) {
      setError(cause instanceof ApiError ? cause.userMessage : String(cause));
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    } finally {
      setResolving(false);
    }
  }, []);

  // Every entry point - share sheet, quick-settings tile, launcher shortcut,
  // clipboard - lands here. A link that arrived before this screen mounted is
  // claimed on the first render, since a share intent can launch the app.
  useEffect(() => {
    const open = (link: inbound.InboundLink) => {
      inbound.markHandled(link.url);
      setUrl(link.url);
      void resolve(link.url);
    };

    const waiting = inbound.claimPending();
    if (waiting) open(waiting);
    return inbound.subscribe(open);
  }, [resolve]);

  const onPaste = useCallback(async () => {
    // Reading the clipboard fires a system toast on Android 12+, so it only
    // happens on an explicit tap - never silently in the background.
    const text = await Clipboard.getStringAsync();

    // Pasting is forgiving where the other entry points are strict: an
    // unrecognised host still fills the field, because the backend supports
    // more sites than the client-side list names.
    const found = extractUrl(text);
    if (!found) {
      setError('No link found on the clipboard.');
      return;
    }
    setUrl(found);
    if (isSupported(found)) {
      inbound.markHandled(found);
      void resolve(found);
    }
  }, [resolve]);

  const onDownload = useCallback(() => {
    if (!media || !selected) return;

    // The row appears in the Library right away and does its preparing,
    // downloading and finishing there - the way a normal downloader behaves.
    void downloads.enqueue(
      {
        url: media.source_url,
        format_id: selected.id,
        kind: selected.kind,
        audio_format: selected.kind === 'audio' ? audioFormat : undefined,
        clip,
        target_size_mb: budgetMb,
        embed_metadata: selected.kind === 'audio' ? embedMetadata : false,
      },
      {
        title: media.title,
        platform: media.platform,
        qualityLabel: selected.label,
        kind: selected.kind,
        clip,
        targetSizeMb: budgetMb,
        thumbnailUrl: media.thumbnail,
      },
    );

    inbound.markHandled(media.source_url);
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    router.push('/library');
  }, [media, selected, clip, budgetMb, embedMetadata, audioFormat, router]);

  const canTrim = duration !== null && duration > 2 && !media?.is_live;

  return (
    <Screen>
      <ScreenHeader title="Pebble" rightIcon="settings" rightLabel="Settings" />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.helper}>
          Paste a link, or share one straight to Pebble.
        </Text>

        <PasteInput
          value={url}
          onChangeText={setUrl}
          onPaste={onPaste}
          onSubmit={() => resolve(url)}
          editable={!resolving}
        />

        {!media && !resolving ? (
          <View style={styles.chipRow}>
            {PLATFORMS.map((platform) => (
              <PlatformChip key={platform} platform={platform} />
            ))}
          </View>
        ) : null}

        {error ? (
          <NeuRaised radius={radii.lg} style={styles.errorCard}>
            <Icon name="close" size={16} color={colors.text} />
            <Text style={styles.errorText}>{error}</Text>
          </NeuRaised>
        ) : null}

        {resolving ? <MediaCardSkeleton /> : null}

        {media ? (
          <>
            <MediaCard media={media} />

            <View style={styles.section}>
              <SectionLabel>CHOOSE FORMAT</SectionLabel>
              <View style={styles.formatList}>
                {videoFormats.map((format) => (
                  <FormatRow
                    key={format.id}
                    format={format}
                    selected={format.id === selectedId}
                    onPress={() => {
                      setSelectedId(format.id);
                      void Haptics.selectionAsync();
                    }}
                  />
                ))}
              </View>
            </View>

            <View style={styles.section}>
              <SectionLabel>AUDIO ONLY</SectionLabel>
              <View style={styles.formatList}>
                {audioFormat_ ? (
                  <FormatRow
                    format={{
                      ...audioFormat_,
                      label: 'Extract audio',
                      // The source container is irrelevant here - what lands on
                      // the phone is whatever the AUDIO section selects.
                      ext: audioFormat,
                    }}
                    selected={audioFormat_.id === selectedId}
                    onPress={() => {
                      setSelectedId(audioFormat_.id);
                      void Haptics.selectionAsync();
                    }}
                  />
                ) : null}
              </View>
            </View>

            {canTrim ? (
              <View style={styles.section}>
                <View style={styles.sectionHead}>
                  <SectionLabel>TRIM</SectionLabel>
                  <NeuPressable
                    radius={radii.pill}
                    distance={5}
                    selected={clip !== null}
                    onPress={() => {
                      setClip(
                        clip
                          ? null
                          : { start: 0, end: Math.min(30, duration ?? 30) },
                      );
                      void Haptics.selectionAsync();
                    }}
                    accessibilityLabel={clip ? 'Remove trim' : 'Trim this video'}
                    style={styles.toggle}
                  >
                    <Icon
                      name="scissors"
                      size={15}
                      color={clip ? colors.accentPressedText : colors.textMuted}
                    />
                    <Text style={[styles.toggleLabel, clip && styles.toggleLabelActive]}>
                      {clip ? 'On' : 'Off'}
                    </Text>
                  </NeuPressable>
                </View>

                {clip ? (
                  <ClipScrubber duration={duration!} value={clip} onChange={setClip} />
                ) : (
                  <Text style={styles.hint}>
                    Download only the part you want, cut on exact frames.
                  </Text>
                )}
              </View>
            ) : null}

            {selected?.kind === 'video' ? (
              <View style={styles.section}>
                <SectionLabel>SIZE</SectionLabel>
                <SizeBudget
                  value={budgetMb}
                  onChange={(next) => {
                    setBudgetMb(next);
                    void Haptics.selectionAsync();
                  }}
                  minimumMb={minimumMb}
                  sourceBytes={selected?.filesize ?? null}
                />
              </View>
            ) : null}

            {selected?.kind === 'audio' ? (
              <View style={styles.section}>
                <SectionLabel>AUDIO</SectionLabel>

                <View style={styles.audioFormatRow}>
                  {(['mp3', 'm4a'] as const).map((fmt) => (
                    <NeuPressable
                      key={fmt}
                      radius={radii.pill}
                      distance={5}
                      selected={audioFormat === fmt}
                      onPress={() => {
                        setAudioFormat(fmt);
                        void Haptics.selectionAsync();
                      }}
                      accessibilityLabel={`Save as ${fmt.toUpperCase()}`}
                      style={styles.audioChip}
                    >
                      <Text
                        style={[
                          styles.toggleLabel,
                          audioFormat === fmt && styles.toggleLabelActive,
                        ]}
                      >
                        {fmt.toUpperCase()}
                        {fmt === 'm4a' ? ' · faster' : ''}
                      </Text>
                    </NeuPressable>
                  ))}
                </View>

                <NeuPressable
                  radius={radii.lg}
                  distance={6}
                  selected={embedMetadata}
                  onPress={() => {
                    setEmbedMetadata((on) => !on);
                    void Haptics.selectionAsync();
                  }}
                  accessibilityLabel="Add title, artist and cover art"
                  style={styles.metaToggle}
                >
                  <Icon
                    name="tag"
                    size={17}
                    color={embedMetadata ? colors.accentPressedText : colors.textFaint}
                  />
                  <View style={styles.metaToggleMain}>
                    <Text
                      style={[styles.toggleTitle, embedMetadata && styles.toggleLabelActive]}
                    >
                      Add tags and cover art
                    </Text>
                    <Text style={styles.hint}>
                      {embedMetadata
                        ? 'Shows up properly in your music player'
                        : 'Faster, but lands as an untitled file'}
                    </Text>
                  </View>
                </NeuPressable>
              </View>
            ) : null}

            <NeuPressable
              radius={radii.xl}
              onPress={onDownload}
              disabled={!selected}
              accessibilityLabel="Start download"
              style={styles.cta}
            >
              <Icon name="download" size={18} color={colors.accentPressedText} />
              <Text style={styles.ctaLabel}>Download</Text>
            </NeuPressable>
          </>
        ) : null}
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.screenBottom, gap: spacing.xl },
  helper: { fontSize: fontSizes.meta, color: colors.textFaint, marginTop: -spacing.sm },
  chipRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: spacing.xs,
  },
  section: { gap: spacing.md },
  sectionHead: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  formatList: { gap: spacing.md },
  audioFormatRow: { flexDirection: 'row', gap: spacing.md },
  audioChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.lg,
    paddingVertical: 7,
    marginBottom: spacing.md,
  },
  toggleLabel: {
    fontSize: fontSizes.metaSmall,
    color: colors.textMuted,
    fontFamily: fonts.headingSemi,
  },
  toggleLabelActive: { color: colors.accentPressedText },
  toggleTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  metaToggle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    padding: spacing.lg,
  },
  metaToggleMain: { flex: 1, gap: 2 },
  hint: { fontSize: fontSizes.metaSmall, color: colors.textFaint },
  cta: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.xl,
    marginTop: spacing.xs,
  },
  ctaLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.accentPressedText,
  },
  errorCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.lg,
  },
  errorText: { flex: 1, fontSize: fontSizes.meta, color: colors.text },
});
