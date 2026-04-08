import React from 'react';
import { FlatList, StyleSheet, View, Linking } from 'react-native';
import {
  Text,
  Card,
  Chip,
  Button,
  ActivityIndicator,
  Appbar,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useUpcomingAppointments } from '@/hooks/useAppointments';
import type { Appointment } from '@/types/appointment';

const TYPE_COLORS: Record<string, string> = {
  phone: '#2196F3',
  video: '#4CAF50',
  in_person: '#FF9800',
};

const STATUS_COLORS: Record<string, string> = {
  scheduled: '#2196F3',
  confirmed: '#4CAF50',
  completed: '#9E9E9E',
  cancelled: '#F44336',
  no_show: '#FF9800',
};

export default function AppointmentsScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { data, isLoading, isError } = useUpcomingAppointments();

  const appointments = data?.data ?? [];

  function renderAppointment({
    item,
  }: {
    item: Appointment;
  }): React.ReactElement {
    const dateStr = new Date(item.scheduledAt).toLocaleDateString('en-AU', {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });
    const timeStr = new Date(item.scheduledAt).toLocaleTimeString('en-AU', {
      hour: '2-digit',
      minute: '2-digit',
    });

    return (
      <Card style={styles.card}>
        <Card.Content>
          <Text variant="titleSmall">{dateStr}</Text>
          <Text variant="bodyLarge" style={styles.time}>
            {timeStr} ({item.durationMinutes} min)
          </Text>

          <View style={styles.chipRow}>
            <Chip
              compact
              textStyle={styles.chipText}
              style={{ backgroundColor: TYPE_COLORS[item.type] ?? '#9E9E9E' }}
            >
              {item.type.replace('_', ' ')}
            </Chip>
            <Chip
              compact
              textStyle={styles.chipText}
              style={{
                backgroundColor:
                  STATUS_COLORS[item.status] ?? '#9E9E9E',
              }}
            >
              {item.status}
            </Chip>
          </View>

          <Text variant="bodySmall" style={styles.staffName}>
            With {item.staffName}
          </Text>
          {item.orderNumber && (
            <Text variant="bodySmall" style={styles.dimText}>
              Order: {item.orderNumber}
            </Text>
          )}

          {item.meetingLink && item.type === 'video' && (
            <Button
              mode="contained"
              icon="video"
              style={styles.joinButton}
              onPress={() => {
                if (item.meetingLink) {
                  void Linking.openURL(item.meetingLink);
                }
              }}
            >
              Join Meeting
            </Button>
          )}
        </Card.Content>
      </Card>
    );
  }

  if (isLoading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Appointments" />
      </Appbar.Header>

      <FlatList
        data={appointments}
        keyExtractor={(item: Appointment) => item._id}
        renderItem={renderAppointment}
        contentContainerStyle={styles.list}
        ListEmptyComponent={
          <View style={styles.center}>
            <Text variant="bodyLarge">No upcoming appointments</Text>
          </View>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  list: {
    padding: 16,
  },
  card: {
    marginBottom: 12,
  },
  time: {
    marginTop: 2,
    fontWeight: '600',
  },
  chipRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 10,
    marginBottom: 8,
  },
  chipText: {
    color: '#fff',
    fontSize: 12,
  },
  staffName: {
    marginTop: 4,
  },
  dimText: {
    opacity: 0.6,
    marginTop: 2,
  },
  joinButton: {
    marginTop: 12,
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
});
