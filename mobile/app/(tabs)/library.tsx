import React, { useEffect, useMemo, useState } from 'react';
import { SectionList, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';

import { DownloadRow } from '../../src/components/DownloadRow';
import { Icon } from '../../src/components/Icon';
import { NeuInset, NeuPressable } from '../../src/components/Neu';
import { Screen, ScreenHeader } from '../../src/components/Screen';
import { downloads } from '../../src/download/manager';
import type { DownloadRecord } from '../../src/download/types';
import {
  colors,
  fonts,
  fontSizes,
  radii,
  spacing,
} from '../../src/theme/neumorphic';
import { dayBucket } from '../../src/utils/format';

type Filter = 'all' | 'video' | 'audio';
const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'video', label: 'Video' },
  { key: 'audio', label: 'Audio' },
];

export default function LibraryScreen() {
  const router = useRouter();
  const [records, setRecords] = useState<DownloadRecord[]>([]);
  const [filter, setFilter] = useState<Filter>('all');

  useEffect(() => downloads.subscribe(setRecords), []);

  const sections = useMemo(() => {
    const visible = records.filter((r) => filter === 'all' || r.kind === filter);

    // Anything still working sits in its own section at the top; finished items
    // fall back to day buckets.
    const inFlight = visible.filter((r) => r.status !== 'completed');
    const finished = visible.filter((r) => r.status === 'completed');

    const buckets = new Map<string, DownloadRecord[]>();
    for (const record of finished) {
      const key = dayBucket(record.completedAt ?? record.createdAt);
      buckets.set(key, [...(buckets.get(key) ?? []), record]);
    }

    return [
      ...(inFlight.length ? [{ title: 'IN PROGRESS', data: inFlight }] : []),
      ...[...buckets.entries()].map(([title, data]) => ({ title, data })),
    ];
  }, [records, filter]);

  return (
    <Screen>
      <ScreenHeader title="Library" />

      <View style={styles.tabs}>
        {FILTERS.map(({ key, label }) => (
          <NeuPressable
            key={key}
            radius={radii.pill}
            distance={5}
            selected={filter === key}
            onPress={() => setFilter(key)}
            accessibilityLabel={`Show ${label.toLowerCase()}`}
            style={styles.filterChip}
          >
            <Text style={[styles.filterLabel, filter === key && styles.filterLabelActive]}>
              {label}
            </Text>
          </NeuPressable>
        ))}
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.list}
        stickySectionHeadersEnabled={false}
        renderSectionHeader={({ section }) => (
          <Text style={styles.sectionHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => (
          <DownloadRow record={item} onOpen={() => router.push(`/download/${item.id}`)} />
        )}
        ListEmptyComponent={<EmptyState />}
      />
    </Screen>
  );
}

function EmptyState() {
  return (
    <View style={styles.empty}>
      <NeuInset radius={radii.chip} style={styles.emptyIcon}>
        <Icon name="library" size={26} color={colors.textFaint} />
      </NeuInset>
      <Text style={styles.emptyTitle}>Nothing saved yet</Text>
      <Text style={styles.emptyBody}>
        Paste a link on the Home tab, or share one to Pebble from another app.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: spacing.md, marginBottom: spacing.xl },
  filterChip: {
    paddingHorizontal: spacing.xl,
    paddingVertical: 9,
    minHeight: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  filterLabel: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.meta,
    color: colors.textMuted,
  },
  filterLabelActive: { color: colors.accentPressedText },
  list: { paddingBottom: spacing.screenBottom, gap: spacing.md },
  sectionHeader: {
    fontSize: fontSizes.metaSmall,
    letterSpacing: 0.9,
    color: colors.textFaint,
    fontFamily: fonts.headingSemi,
    marginTop: spacing.lg,
    marginBottom: spacing.sm,
  },
  empty: { alignItems: 'center', gap: spacing.lg, paddingTop: 64 },
  emptyIcon: { width: 72, height: 72, alignItems: 'center', justifyContent: 'center' },
  emptyTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.h2,
    color: colors.text,
  },
  emptyBody: {
    fontSize: fontSizes.meta,
    color: colors.textFaint,
    textAlign: 'center',
    paddingHorizontal: spacing.xxl,
    lineHeight: 18,
  },
});
