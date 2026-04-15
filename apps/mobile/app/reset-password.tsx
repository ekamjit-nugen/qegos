import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import {
  Appbar,
  Button,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { api } from '@/lib/api/client';

export default function ResetPasswordScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const params = useLocalSearchParams<{ token?: string }>();
  const token = params.token ?? '';
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(): Promise<void> {
    if (!token) {
      setError('Invalid or missing reset token');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirm) {
      setError('Passwords do not match');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/reset-password', { token, password });
      setDone(true);
      setTimeout(() => router.replace('/login'), 2000);
    } catch (err) {
      const msg =
        (err as { response?: { data?: { message?: string } } }).response?.data
          ?.message ?? 'Reset link is invalid or expired';
      setError(msg);
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="New password" />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {done ? (
            <>
              <Text variant="headlineSmall" style={styles.title}>
                Password reset
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                You can now sign in with your new password. Redirecting...
              </Text>
            </>
          ) : !token ? (
            <>
              <Text variant="headlineSmall" style={styles.title}>
                Invalid link
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                Please request a new password reset link.
              </Text>
              <Button
                mode="contained"
                onPress={() => router.replace('/forgot-password' as never)}
                style={styles.button}
              >
                Request new link
              </Button>
            </>
          ) : (
            <>
              <Text variant="headlineSmall" style={styles.title}>
                Set a new password
              </Text>
              <TextInput
                label="New password"
                value={password}
                onChangeText={setPassword}
                secureTextEntry
                mode="outlined"
                style={styles.input}
              />
              <TextInput
                label="Confirm password"
                value={confirm}
                onChangeText={setConfirm}
                secureTextEntry
                mode="outlined"
                style={styles.input}
              />
              {error ? (
                <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 8 }}>
                  {error}
                </Text>
              ) : null}
              <Button
                mode="contained"
                onPress={handleSubmit}
                loading={loading}
                disabled={loading}
                style={styles.button}
              >
                Reset password
              </Button>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 20, flexGrow: 1, justifyContent: 'center' },
  title: { fontWeight: '700', marginBottom: 8 },
  body: { opacity: 0.7, marginBottom: 20 },
  input: { marginBottom: 12 },
  button: { marginTop: 8, paddingVertical: 4 },
});
