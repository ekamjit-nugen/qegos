import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import { Text, TextInput, Button, useTheme } from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';

export default function RegisterScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { sendOtp, register } = useAuth();

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [mobile, setMobile] = useState('');
  const [otp, setOtp] = useState('');
  const [otpSent, setOtpSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSendOtp(): Promise<void> {
    if (!mobile.trim()) {
      setError('Please enter your mobile number');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await sendOtp(mobile.trim());
      setOtpSent(true);
    } catch {
      setError('Failed to send OTP. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  async function handleRegister(): Promise<void> {
    if (!firstName.trim() || !lastName.trim() || !otp.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await register({
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        mobile: mobile.trim(),
        otp: otp.trim(),
      });
      router.replace('/(tabs)');
    } catch {
      setError('Registration failed. Please check your details and try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
    >
      <ScrollView
        style={[styles.flex, { backgroundColor: theme.colors.background }]}
        contentContainerStyle={styles.content}
        keyboardShouldPersistTaps="handled"
      >
        <Text variant="headlineLarge" style={styles.title}>
          Create Account
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Register to get started with QEGOS
        </Text>

        {error ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        <TextInput
          label="First Name"
          value={firstName}
          onChangeText={setFirstName}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Last Name"
          value={lastName}
          onChangeText={setLastName}
          mode="outlined"
          style={styles.input}
        />
        <TextInput
          label="Mobile Number"
          value={mobile}
          onChangeText={setMobile}
          keyboardType="phone-pad"
          placeholder="+61412345678"
          mode="outlined"
          style={styles.input}
          disabled={otpSent}
        />

        {otpSent ? (
          <View>
            <TextInput
              label="OTP Code"
              value={otp}
              onChangeText={setOtp}
              keyboardType="number-pad"
              maxLength={6}
              mode="outlined"
              style={styles.input}
            />
            <Button
              mode="contained"
              onPress={handleRegister}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Register
            </Button>
            <Button
              mode="text"
              onPress={() => {
                setOtpSent(false);
                setOtp('');
              }}
              style={styles.linkButton}
            >
              Resend OTP
            </Button>
          </View>
        ) : (
          <Button
            mode="contained"
            onPress={handleSendOtp}
            loading={loading}
            disabled={loading}
            style={styles.button}
          >
            Send OTP
          </Button>
        )}

        <Button
          mode="text"
          onPress={() => router.push('/login')}
          style={styles.linkButton}
        >
          Already have an account? Sign In
        </Button>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  content: {
    padding: 16,
    justifyContent: 'center',
    flexGrow: 1,
  },
  title: {
    textAlign: 'center',
    fontWeight: '700',
    marginBottom: 4,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  input: {
    marginBottom: 14,
  },
  button: {
    marginTop: 8,
    paddingVertical: 4,
  },
  linkButton: {
    marginTop: 16,
  },
});
