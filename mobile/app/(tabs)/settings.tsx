import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { API_BASE } from '../../src/api/client';
import { Icon, IconName } from '../../src/components/Icon';
import { NeuInset, NeuRaised } from '../../src/components/Neu';
import { Screen, ScreenHeader, SectionLabel } from '../../src/components/Screen';
import { downloads } from '../../src/download/manager';
import { colors, fonts, fontSizes, radii, spacing } from '../../src/theme/neumorphic';
import { formatBytes } from '../../src/utils/format';

export default function SettingsScreen() {
  const [health, setHealth] = useState<'checking' | 'ok' | 'degraded' | 'down'>('checking');
  const [stored, setStored] = useState(0);
  const [count, setCount] = useState(0);

  useEffect(() => {
    return downloads.subscribe((records) => {
      const completed = records.filter((r) => r.status === 'completed');
      setCount(completed.length);
      setStored(completed.reduce((sum, r) => sum + (r.totalBytes ?? 0), 0));
    });
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const response = await fetch(`${API_BASE}/health`);
        const body = await response.json();
        if (!cancelled) setHealth(body.status === 'ok' ? 'ok' : 'degraded');
      } catch {
        if (!cancelled) setHealth('down');
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const serverStatus = {
    checking: 'Checking…',
    ok: 'Connected',
    // ffmpeg missing server-side: merging, trimming and size budgets all fail.
    degraded: 'Connected, but ffmpeg is missing',
    down: 'Cannot reach the server',
  }[health];

  return (
    <Screen>
      <ScreenHeader title="Settings" />

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
        <View style={styles.section}>
          <SectionLabel>SERVER</SectionLabel>
          <NeuRaised radius={radii.xl} style={styles.card}>
            <Row icon="link" title={serverStatus} value={API_BASE.replace(/^https?:\/\//, '')} />
          </NeuRaised>
          <Text style={styles.hint}>
            On a real device this must be the LAN address of the machine running
            the API — not localhost, which is the phone itself.
          </Text>
        </View>

        <View style={styles.section}>
          <SectionLabel>STORAGE</SectionLabel>
          <NeuRaised radius={radii.xl} style={styles.card}>
            <Row
              icon="library"
              title={`${count} ${count === 1 ? 'file' : 'files'} saved`}
              value={formatBytes(stored)}
            />
          </NeuRaised>
        </View>

        <View style={styles.section}>
          <SectionLabel>ABOUT</SectionLabel>
          <NeuInset radius={radii.xl} style={styles.aboutCard}>
            <Text style={styles.aboutTitle}>Pebble</Text>
            <Text style={styles.aboutBody}>
              Save video and audio from the platforms you already use. Trim before
              you download, fit a file to the space you have, and keep tags and
              cover art on your music.
            </Text>
            <Text style={styles.aboutBody}>
              Downloads pause and resume properly — including after the app is
              closed, and after a link expires.
            </Text>
          </NeuInset>
        </View>
      </ScrollView>
    </Screen>
  );
}

function Row({
  icon,
  title,
  value,
}: {
  icon: IconName;
  title: string;
  value: string;
}) {
  return (
    <View style={styles.row}>
      <Icon name={icon} size={18} color={colors.textMuted} />
      <View style={styles.rowMain}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowValue} numberOfLines={1}>
          {value}
        </Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  content: { paddingBottom: spacing.screenBottom, gap: spacing.xxl },
  section: { gap: spacing.md },
  card: { padding: spacing.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  rowMain: { flex: 1, gap: 2 },
  rowTitle: {
    fontFamily: fonts.headingSemi,
    fontSize: fontSizes.body,
    color: colors.text,
  },
  rowValue: { fontSize: fontSizes.metaSmall, color: colors.textFaint },
  hint: { fontSize: fontSizes.metaSmall, color: colors.textFaint, lineHeight: 16 },
  aboutCard: { padding: spacing.xl, gap: spacing.md },
  aboutTitle: {
    fontFamily: fonts.heading,
    fontSize: fontSizes.h2,
    color: colors.text,
  },
  aboutBody: { fontSize: fontSizes.meta, color: colors.textMuted, lineHeight: 19 },
});
