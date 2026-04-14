import React, { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import {
  Text,
  Card,
  Button,
  Divider,
  List,
  Switch,
  Appbar,
  Avatar,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';

export default function ProfileScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { user, logout } = useAuth();

  const [pushEnabled, setPushEnabled] = useState(true);
  const [emailEnabled, setEmailEnabled] = useState(true);
  const [smsEnabled, setSmsEnabled] = useState(false);

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace('/login');
  }

  const initials = user
    ? `${user.firstName.charAt(0)}${user.lastName.charAt(0)}`.toUpperCase()
    : '?';

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Profile" />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.avatarSection}>
          <Avatar.Text size={80} label={initials} />
          <Text variant="titleLarge" style={styles.name}>
            {user?.firstName} {user?.lastName}
          </Text>
        </View>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Account Details
            </Text>
            <List.Item
              title="Email"
              description={user?.email ?? 'Not set'}
              left={(props) => <List.Icon {...props} icon="email-outline" />}
            />
            <Divider />
            <List.Item
              title="Mobile"
              description={user?.mobile ?? 'Not set'}
              left={(props) => <List.Icon {...props} icon="phone-outline" />}
            />
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Change Password
            </Text>
            <Text variant="bodySmall" style={styles.dimText}>
              Update your account password securely. After changing, all other
              sessions will be signed out.
            </Text>
            <Button
              mode="contained"
              onPress={() => router.push('/change-password' as never)}
              style={{ marginTop: 12 }}
            >
              Change Password
            </Button>
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Notification Preferences
            </Text>
            <View style={styles.prefRow}>
              <Text variant="bodyMedium">Push Notifications</Text>
              <Switch value={pushEnabled} onValueChange={setPushEnabled} />
            </View>
            <Divider style={styles.divider} />
            <View style={styles.prefRow}>
              <Text variant="bodyMedium">Email Notifications</Text>
              <Switch value={emailEnabled} onValueChange={setEmailEnabled} />
            </View>
            <Divider style={styles.divider} />
            <View style={styles.prefRow}>
              <Text variant="bodyMedium">SMS Notifications</Text>
              <Switch value={smsEnabled} onValueChange={setSmsEnabled} />
            </View>
          </Card.Content>
        </Card>

        <Button
          mode="outlined"
          textColor={theme.colors.error}
          style={styles.logoutButton}
          onPress={handleLogout}
          icon="logout"
        >
          Logout
        </Button>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 32,
  },
  avatarSection: {
    alignItems: 'center',
    marginBottom: 20,
  },
  name: {
    marginTop: 12,
    fontWeight: '600',
  },
  card: {
    marginBottom: 14,
  },
  sectionTitle: {
    fontWeight: '600',
    marginBottom: 8,
  },
  dimText: {
    opacity: 0.6,
  },
  prefRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  divider: {
    marginVertical: 2,
  },
  logoutButton: {
    marginTop: 8,
    borderColor: '#F44336',
  },
});
