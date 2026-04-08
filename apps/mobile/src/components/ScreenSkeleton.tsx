import React, { useEffect, useRef } from 'react';
import { Animated, StyleSheet, View, type ViewStyle } from 'react-native';
import { useTheme } from 'react-native-paper';

// ─── Shimmer Block ──────────────────────────────────────────────────────────

interface ShimmerProps {
  width: number | `${number}%`;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

/**
 * Animated shimmer placeholder block.
 * Pulses opacity to indicate loading content.
 */
function Shimmer({ width, height = 16, borderRadius = 6, style }: ShimmerProps): React.ReactNode {
  const opacity = useRef(new Animated.Value(0.3)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, {
          toValue: 0.7,
          duration: 800,
          useNativeDriver: true,
        }),
        Animated.timing(opacity, {
          toValue: 0.3,
          duration: 800,
          useNativeDriver: true,
        }),
      ]),
    );
    animation.start();
    return () => animation.stop();
  }, [opacity]);

  return (
    <Animated.View
      style={[
        {
          width: width as number,
          height,
          borderRadius,
          backgroundColor: '#E0E0E0',
          opacity,
        },
        style,
      ]}
    />
  );
}

// ─── Dashboard Skeleton ─────────────────────────────────────────────────────

export function DashboardSkeleton(): React.ReactNode {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Welcome text */}
      <Shimmer width="70%" height={28} style={styles.mb8} />
      <Shimmer width="50%" height={16} style={styles.mb24} />

      {/* Stat cards grid */}
      <View style={styles.grid}>
        {[1, 2, 3, 4].map((i) => (
          <View key={i} style={styles.statCard}>
            <Shimmer width="40%" height={36} borderRadius={4} style={styles.mb8} />
            <Shimmer width="80%" height={14} />
          </View>
        ))}
      </View>

      {/* Section title */}
      <Shimmer width="35%" height={20} style={styles.mt28} />

      {/* Action buttons */}
      <View style={styles.actionsRow}>
        {[1, 2, 3, 4].map((i) => (
          <Shimmer key={i} width="47%" height={40} borderRadius={20} style={styles.actionBtn} />
        ))}
      </View>
    </View>
  );
}

// ─── List Skeleton ──────────────────────────────────────────────────────────

export function ListSkeleton({ rows = 6 }: { rows?: number }): React.ReactNode {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Title */}
      <Shimmer width="40%" height={24} style={styles.mb24} />

      {/* List items */}
      {Array.from({ length: rows }, (_, i) => (
        <View key={i} style={styles.listCard}>
          <View style={styles.listCardHeader}>
            <Shimmer width="35%" height={18} />
            <Shimmer width={72} height={24} borderRadius={12} />
          </View>
          <Shimmer width="60%" height={14} style={styles.mt8} />
          <View style={styles.listCardFooter}>
            <Shimmer width="30%" height={12} />
            <Shimmer width="20%" height={12} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Detail Skeleton ────────────────────────────────────────────────────────

export function DetailSkeleton(): React.ReactNode {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      {/* Back + Title */}
      <Shimmer width={80} height={16} style={styles.mb8} />
      <Shimmer width="70%" height={26} style={styles.mb24} />

      {/* Main card */}
      <View style={styles.detailCard}>
        <Shimmer width="50%" height={18} style={styles.mb12} />
        <Shimmer width="100%" height={14} style={styles.mb8} />
        <Shimmer width="80%" height={14} style={styles.mb8} />
        <Shimmer width="60%" height={14} style={styles.mb16} />

        {/* Divider */}
        <View style={styles.divider} />

        {/* Line items */}
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.lineItem}>
            <Shimmer width="55%" height={14} />
            <Shimmer width="18%" height={14} />
          </View>
        ))}

        <View style={styles.divider} />
        <View style={styles.totalRow}>
          <Shimmer width="25%" height={18} />
          <Shimmer width="20%" height={18} />
        </View>
      </View>

      {/* Timeline card */}
      <View style={[styles.detailCard, styles.mt16]}>
        <Shimmer width="30%" height={18} style={styles.mb16} />
        {[1, 2, 3].map((i) => (
          <View key={i} style={styles.timelineItem}>
            <Shimmer width={20} height={20} borderRadius={10} />
            <View style={{ flex: 1 }}>
              <Shimmer width="70%" height={14} style={styles.mb4} />
              <Shimmer width="40%" height={12} />
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

// ─── Chat Skeleton ──────────────────────────────────────────────────────────

export function ChatSkeleton(): React.ReactNode {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <Shimmer width="30%" height={24} style={styles.mb24} />

      {/* Conversation list */}
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.chatItem}>
          <Shimmer width={44} height={44} borderRadius={22} />
          <View style={{ flex: 1 }}>
            <View style={styles.chatItemHeader}>
              <Shimmer width="45%" height={16} />
              <Shimmer width={48} height={12} />
            </View>
            <Shimmer width="75%" height={14} style={styles.mt4} />
          </View>
        </View>
      ))}
    </View>
  );
}

// ─── Vault Skeleton ─────────────────────────────────────────────────────────

export function VaultSkeleton(): React.ReactNode {
  const theme = useTheme();

  return (
    <View style={[styles.container, { backgroundColor: theme.colors.background }]}>
      <View style={styles.headerRow}>
        <Shimmer width="40%" height={24} />
        <Shimmer width={120} height={36} borderRadius={18} />
      </View>

      {/* Storage bar */}
      <View style={styles.storageBar}>
        <Shimmer width="50%" height={14} style={styles.mb8} />
        <Shimmer width="100%" height={8} borderRadius={4} />
      </View>

      {/* Document cards */}
      {[1, 2, 3, 4, 5].map((i) => (
        <View key={i} style={styles.docCard}>
          <Shimmer width={40} height={40} borderRadius={8} />
          <View style={{ flex: 1 }}>
            <Shimmer width="65%" height={16} style={styles.mb4} />
            <Shimmer width="40%" height={12} />
          </View>
          <Shimmer width={24} height={24} borderRadius={12} />
        </View>
      ))}
    </View>
  );
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: { flex: 1, padding: 16 },
  mb4: { marginBottom: 4 },
  mb8: { marginBottom: 8 },
  mb12: { marginBottom: 12 },
  mb16: { marginBottom: 16 },
  mb24: { marginBottom: 24 },
  mt4: { marginTop: 4 },
  mt8: { marginTop: 8 },
  mt16: { marginTop: 16 },
  mt28: { marginTop: 28, marginBottom: 12 },

  // Dashboard
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 12 },
  statCard: {
    width: '47%', flexGrow: 1, backgroundColor: '#fff',
    borderRadius: 12, padding: 16, elevation: 1,
  },
  actionsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 10, marginTop: 12 },
  actionBtn: { flexGrow: 1 },

  // List
  listCard: {
    backgroundColor: '#fff', borderRadius: 12, padding: 16,
    marginBottom: 12, elevation: 1,
  },
  listCardHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  listCardFooter: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 12 },

  // Detail
  detailCard: { backgroundColor: '#fff', borderRadius: 12, padding: 16, elevation: 1 },
  divider: { height: 1, backgroundColor: '#E0E0E0', marginVertical: 12 },
  lineItem: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 10 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between' },
  timelineItem: { flexDirection: 'row', gap: 12, marginBottom: 16 },

  // Chat
  chatItem: {
    flexDirection: 'row', gap: 12, padding: 12,
    backgroundColor: '#fff', borderRadius: 12, marginBottom: 8, elevation: 1,
  },
  chatItemHeader: { flexDirection: 'row', justifyContent: 'space-between' },

  // Vault
  headerRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 },
  storageBar: { backgroundColor: '#fff', borderRadius: 12, padding: 16, marginBottom: 16, elevation: 1 },
  docCard: {
    flexDirection: 'row', gap: 12, alignItems: 'center',
    backgroundColor: '#fff', borderRadius: 12, padding: 12, marginBottom: 8, elevation: 1,
  },
});
