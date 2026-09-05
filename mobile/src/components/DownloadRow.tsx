import React from 'react';
import { StyleSheet, Text, View } from 'react-native';
import * as Haptics from 'expo-haptics';

import { downloads } from '../download/manager';
import type { DownloadRecord } from '../download/types';
import {
  colors,
  fonts,
  fontSizes,
  platformDot,
  radii,
  spacing,
} from '../theme/neumorphic';
import { confirmDestructive } from '../utils/confirm';
import { formatBytes, formatDuration } from '../utils/format';
import { Icon, IconName } from './Icon';
import { NeuIconButton, NeuInset, NeuPressable } from './Neu';
import { Thumbnail } from './Thumbnail';

/**
 * A download as it appears in the Library.
 *
 * Everything happens in this row - preparing, progress, pause, resume, cancel -
 * the way a normal download manager works. Tapping the row opens a larger view
 * of the same record, but nothing requires going there.
 */
export function DownloadRow({
  record,
  onOpen,
}: {
  record: DownloadRecord;
  onOpen: () => void;
}) {
  const { status } = record;
  const done = status === 'completed';
  const failed = status === 'failed';
  const preparing = status === 'preparing';
  const active = status === 'downloading';
  const showBar = !done && !failed;

  const fraction = preparing
    ? record.prepareProgress
    : record.totalBytes
      ? record.bytesWritten / record.totalBytes
      : 0;

  return (
    <NeuPressable
      radius={radii.xl}
      onPress={onOpen}
      accessibilityLabel={`${record.title}, ${statusLine(record)}`}
      style={styles.row}
    >
      <View style={styles.top}>
        <Thumbnail uri={record.thumbnailUri ?? record.thumbnailUrl} kind={record.kind} />

        <View style={styles.main}>
          <Text style={styles.title} numberOfLines={1}>
            {record.title}
          </Text>
          <View style={styles.metaLine}>
            <View style={[styles.dot, { backgroundColor: platformDot(record.platform) }]} />
            <Text style={styles.meta} numberOfLines={1}>
              {detailLine(record)}
            </Text>
          </View>
        </View>

        <View style={styles.actions}>
          {done && record.galleryError ? (
            <Action
              icon="download"
              label={`Add ${record.title} to gallery`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void downloads.publishToGallery(record.id);
              }}
            />
          ) : done ? (
            <Action
              icon="play"
              label={`Play ${record.title}`}
              onPress={onOpen}
            />
          ) : failed ? (
            <Action
              icon="download"
              label={`Retry ${record.title}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                void downloads.retry(record.id);
              }}
            />
          ) : preparing ? null : (
            <Action
              icon={active ? 'pause' : 'play'}
              label={`${active ? 'Pause' : 'Resume'} ${record.title}`}
              onPress={() => {
                void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                if (active) void downloads.pause(record.id);
                else void downloads.resume(record.id);
              }}
            />
          )}

          <Action
            icon="trash"
            label={done ? `Delete ${record.title}` : `Cancel ${record.title}`}
            muted
            onPress={() => {
              void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              // A 34dp icon with no undo behind it is a mis-tap away from
              // losing a finished file, so both branches ask first.
              if (done) {
                confirmDestructive({
                  title: 'Delete this download?',
                  message: record.galleryAssetId
                    ? 'It stays in your gallery; only Pebble’s copy is removed.'
                    : 'The file will be permanently deleted from this device.',
                  confirmLabel: 'Delete',
                  onConfirm: () => void downloads.remove(record.id),
                });
              } else {
                confirmDestructive({
                  title: 'Cancel this download?',
                  message: record.bytesWritten
                    ? `${formatBytes(record.bytesWritten)} already transferred will be discarded.`
                    : 'This download will be removed.',
                  confirmLabel: 'Cancel download',
                  onConfirm: () => void downloads.cancel(record.id),
                });
              }
            }}
          />
        </View>
      </View>

      {showBar ? (
        <NeuInset radius={radii.pill} style={styles.track}>
          <View
            style={[
              styles.fill,
              {
                width: `${Math.min(Math.max(fraction, 0), 1) * 100}%`,
                // Preparing is server-side work, so it reads as a quieter bar.
                backgroundColor: preparing ? colors.textFaint : colors.accent,
              },
            ]}
          />
        </NeuInset>
      ) : null}
    </NeuPressable>
  );
}

function Action({
  icon,
  label,
  onPress,
  muted,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <NeuIconButton size={34} onPress={onPress} accessibilityLabel={label}>
      <Icon name={icon} size={14} color={muted ? colors.textMuted : colors.accent} />
    </NeuIconButton>
  );
}

/** Short status for accessibility labels. */
function statusLine(record: DownloadRecord): string {
  switch (record.status) {
    case 'preparing': return 'preparing on the server';
    case 'queued': return 'queued';
    case 'downloading': return `${Math.round((record.bytesWritten / (record.totalBytes || 1)) * 100)} percent`;
    case 'paused': return 'paused';
    case 'completed': return 'saved';
    case 'failed': return record.error ?? 'failed';
  }
}

/** The line under the title: what it is, then where it has got to. */
function detailLine(record: DownloadRecord): string {
  const parts: (string | null)[] = [
    record.qualityLabel || null,
    record.clip
      ? `${formatDuration(record.clip.start)}–${formatDuration(record.clip.end)}`
      : null,
    record.targetSizeMb ? `≤${record.targetSizeMb} MB` : null,
  ];

  switch (record.status) {
    case 'preparing':
      parts.push(
        record.prepareProgress > 0
          ? `Preparing ${Math.round(record.prepareProgress * 100)}%`
          : 'Preparing on server…',
      );
      break;
    case 'queued':
      parts.push('Queued');
      break;
    case 'downloading':
      parts.push(`${formatBytes(record.bytesWritten)} of ${formatBytes(record.totalBytes)}`);
      break;
    case 'paused':
      parts.push(`Paused · ${formatBytes(record.bytesWritten)} kept`);
      break;
    case 'completed':
      parts.push(formatBytes(record.totalBytes));
      // Say plainly where the file actually is - "saved" is meaningless if it
      // cannot be found outside the app.
      parts.push(record.galleryAssetId ? 'In gallery' : record.galleryError ? 'App only' : 'Saving…');
      break;
    case 'failed':
      parts.push(record.error ?? 'Failed');
      break;
  }

  return parts.filter(Boolean).join(' · ');
}

const styles = StyleSheet.create({
  row: { padding: 11, gap: spacing.md },
  top: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  main: { flex: 1, gap: 3 },
  title: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  metaLine: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  dot: { width: 5, height: 5, borderRadius: 2.5 },
  meta: {
    fontSize: fontSizes.metaSmall,
    color: colors.textFaint,
    flex: 1,
    fontVariant: ['tabular-nums'],
  },
  actions: { flexDirection: 'row', gap: spacing.sm },
  track: { height: 6, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: radii.pill },
});
