import React, { useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import { Appbar, Button, Text, TextInput, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { api } from '@/lib/api/client';

export default function ForgotPasswordScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(): Promise<void> {
    if (!email.trim()) {
      setError('Please enter your email');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await api.post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title="Reset password" />
      </Appbar.Header>
      <KeyboardAvoidingView
        style={styles.flex}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <ScrollView contentContainerStyle={styles.content}>
          {sent ? (
            <>
              <Text variant="headlineSmall" style={styles.title}>
                Check your email
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                If an account exists for that email, we&apos;ve sent a password reset link. The link
                expires in 1 hour.
              </Text>
              <Button
                mode="contained"
                onPress={() => router.replace('/login')}
                style={styles.button}
              >
                Back to sign in
              </Button>
            </>
          ) : (
            <>
              <Text variant="headlineSmall" style={styles.title}>
                Forgot your password?
              </Text>
              <Text variant="bodyMedium" style={styles.body}>
                Enter your email and we&apos;ll send you a reset link.
              </Text>
              <TextInput
                label="Email"
                value={email}
                onChangeText={setEmail}
                keyboardType="email-address"
                autoCapitalize="none"
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
                Send reset link
              </Button>
              <Button mode="text" onPress={() => router.back()} style={styles.linkBtn}>
                Back to sign in
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
  linkBtn: { marginTop: 12 },
});
