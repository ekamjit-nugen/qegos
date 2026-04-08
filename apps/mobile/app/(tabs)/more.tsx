import React from 'react';
import { ScrollView, StyleSheet } from 'react-native';
import { List, Divider, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';

export default function MoreScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { logout } = useAuth();

  async function handleLogout(): Promise<void> {
    await logout();
    router.replace('/login');
  }

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
    >
      <List.Section>
        <List.Subheader>Account</List.Subheader>
        <List.Item
          title="Appointments"
          description="View upcoming appointments"
          left={(props) => <List.Icon {...props} icon="calendar" />}
          onPress={() => router.push('/appointments')}
        />
        <Divider />
        <List.Item
          title="Tax Summary"
          description="Financial year summaries and ATO status"
          left={(props) => <List.Icon {...props} icon="calculator" />}
          onPress={() => router.push('/tax-summary')}
        />
        <Divider />
        <List.Item
          title="Notifications"
          description="View all notifications"
          left={(props) => <List.Icon {...props} icon="bell-outline" />}
          onPress={() => router.push('/notifications')}
        />
        <Divider />
        <List.Item
          title="Profile"
          description="Manage your account settings"
          left={(props) => <List.Icon {...props} icon="account-outline" />}
          onPress={() => router.push('/profile')}
        />
      </List.Section>

      <List.Section>
        <List.Subheader>Session</List.Subheader>
        <List.Item
          title="Logout"
          description="Sign out of your account"
          left={(props) => (
            <List.Icon {...props} icon="logout" color={theme.colors.error} />
          )}
          titleStyle={{ color: theme.colors.error }}
          onPress={handleLogout}
        />
      </List.Section>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});
