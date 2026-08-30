import React, { useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';

import { Icon } from '../../src/components/Icon';
import { NeuPressable } from '../../src/components/Neu';
import { ProgressDial } from '../../src/components/ProgressDial';
import { Thumbnail } from '../../src/components/Thumbnail';
import { Screen, ScreenHeader } from '../../src/components/Screen';
import { downloads } from '../../src/download/manager';
import type { DownloadRecord } from '../../src/download/types';
import { colors, fonts, fontSizes, radii, spacing } from '../../src/theme/neumorphic';
import { formatBytes, formatDuration } from '../../src/utils/format';

/**
 * Live download screen.
 *
 * Two entry shapes: a local download id, or `job-<jobId>` when `/prepare`
 * returned before the server had finished muxing. The second polls to
 * completion and then hands off to the download manager.
 */
export default function DownloadScreen() {
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();

  const [record, setRecord] = useState<DownloadRecord | null>(null);
  const [error] = useState<string | null>(null);

  // Rate-of-change sampling for the speed and time-left readouts.
  const sample = useRef<{ bytes: number; at: number } | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);

  useEffect(() => {
    if (!id) return;
    return downloads.subscribe((all) => {
      setRecord(all.find((r) => r.id === id) ?? null);
    });
  }, [id]);

  useEffect(() => {
    if (!record || record.status !== 'downloading') {
      sample.current = null;
      setSpeed(null);
      return;
    }
    const now = Date.now();
    const previous = sample.current;
    if (previous && now > previous.at) {
      const delta = (record.bytesWritten - previous.bytes) / ((now - previous.at) / 1000);
      if (delta >= 0) setSpeed(delta);
    }
    sample.current = { bytes: record.bytesWritten, at: now };
  }, [record?.bytesWritten, record?.status]);

  const preparing = record?.status === 'preparing';

  const progress = useMemo(() => {
    if (!record) return 0;
    if (record.status === 'preparing') return record.prepareProgress;
    if (record.status === 'completed') return 1;
    if (!record.totalBytes) return 0;
    return record.bytesWritten / record.totalBytes;
  }, [record]);

  const secondsLeft =
    record && speed && speed > 0 && record.totalBytes
      ? (record.totalBytes - record.bytesWritten) / speed
      : null;

  const active = record?.status === 'downloading';
  const paused = record?.status === 'paused' || record?.status === 'queued';
  const done = record?.status === 'completed';

  const caption = preparing
    ? 'preparing'
    : done
      ? 'saved'
      : secondsLeft
        ? `${formatDuration(secondsLeft)} left`
        : undefined;

  const toggle = async () => {
    if (!record) return;
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    if (active) await downloads.pause(record.id);
    else await downloads.resume(record.id);
  };

  return (
    <Screen>
      <ScreenHeader
        title={preparing ? 'Preparing' : done ? 'Saved' : 'Downloading'}
        leftIcon="back"
        onLeftPress={() => router.back()}
        rightIcon="close"
        rightLabel="Cancel download"
        onRightPress={async () => {
          if (record) await downloads.cancel(record.id);
          router.back();
        }}
      />

      <View style={styles.body}>
        <View style={styles.info}>
          {record ? (
            <Thumbnail
              uri={record.thumbnailUri ?? record.thumbnailUrl}
              kind={record.kind}
              width={96}
              height={72}
              radius={radii.lg}
            />
          ) : null}
          <Text style={styles.title} numberOfLines={2}>
            {record?.title ?? 'Working…'}
          </Text>
          <Text style={styles.meta}>
            {record
              ? [
                  record.qualityLabel,
                  record.clip
                    ? `${formatDuration(record.clip.start)}–${formatDuration(record.clip.end)}`
                    : null,
                  record.targetSizeMb ? `under ${record.targetSizeMb} MB` : null,
                ]
                  .filter(Boolean)
                  .join(' · ')
              : 'Building your file on the server'}
          </Text>
        </View>

        <ProgressDial
          progress={progress}
          caption={caption}
          label={preparing && !record?.prepareProgress ? '···' : undefined}
        />

        <View style={styles.readout}>
          {record ? (
            <Text style={styles.bytes}>
              {formatBytes(record.bytesWritten)} of {formatBytes(record.totalBytes)}
              {speed && active ? ` · ${formatBytes(speed)}/s` : ''}
            </Text>
          ) : (
            <Text style={styles.bytes}>Server is building the file…</Text>
          )}
          {error ? <Text style={styles.error}>{error}</Text> : null}
          {record?.error ? <Text style={styles.error}>{record.error}</Text> : null}
        </View>

        <View style={styles.actions}>
          <NeuPressable
            radius={radii.xl}
            onPress={() => router.back()}
            accessibilityLabel="Back to home"
            style={styles.action}
          >
            <Text style={styles.actionLabel}>Done</Text>
          </NeuPressable>

          {!done && !preparing ? (
            <NeuPressable
              radius={radii.xl}
              onPress={toggle}
              accessibilityLabel={active ? 'Pause download' : 'Resume download'}
              style={styles.action}
            >
              <Icon
                name={active ? 'pause' : 'play'}
                size={16}
                color={colors.accentPressedText}
              />
              <Text style={[styles.actionLabel, styles.actionLabelAccent]}>
                {active ? 'Pause' : paused ? 'Resume' : 'Retry'}
              </Text>
            </NeuPressable>
          ) : null}
        </View>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, gap: spacing.xxl },
  info: { gap: spacing.xs },
  title: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.h2,
    color: colors.text,
    lineHeight: 21,
  },
  meta: { fontSize: fontSizes.meta, color: colors.textFaint },
  readout: { alignItems: 'center', gap: spacing.sm },
  bytes: {
    fontSize: fontSizes.meta,
    color: colors.textMuted,
    fontVariant: ['tabular-nums'],
  },
  error: { fontSize: fontSizes.metaSmall, color: colors.text, textAlign: 'center' },
  actions: {
    flexDirection: 'row',
    gap: spacing.lg,
    marginTop: 'auto',
    marginBottom: spacing.screenBottom,
  },
  action: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    paddingVertical: spacing.xl,
  },
  actionLabel: {
    fontFamily: fonts.heading,
    fontSize: 14,
    color: colors.textMuted,
  },
  actionLabelAccent: { color: colors.accentPressedText },
});
