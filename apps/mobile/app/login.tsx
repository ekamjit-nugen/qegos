import React, { useState } from 'react';
import {
  ScrollView,
  StyleSheet,
  View,
  KeyboardAvoidingView,
  Platform,
} from 'react-native';
import {
  Text,
  TextInput,
  Button,
  SegmentedButtons,
  useTheme,
} from 'react-native-paper';
import { useRouter } from 'expo-router';
import { useAuth } from '@/lib/auth/useAuth';

type LoginMode = 'mobile' | 'email';

export default function LoginScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { login, sendOtp, loginWithOtp } = useAuth();

  const [mode, setMode] = useState<LoginMode>('mobile');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
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

  async function handleMobileLogin(): Promise<void> {
    if (!otp.trim()) {
      setError('Please enter the OTP');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await loginWithOtp(mobile.trim(), otp.trim());
      router.replace('/(tabs)');
    } catch {
      setError('Invalid OTP or user not found. Please register first.');
    } finally {
      setLoading(false);
    }
  }

  async function handleEmailLogin(): Promise<void> {
    if (!email.trim() || !password) {
      setError('Please fill in all fields');
      return;
    }
    setLoading(true);
    setError('');
    try {
      await login(email.trim(), password);
      router.replace('/(tabs)');
    } catch {
      setError('Invalid email or password');
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
          QEGOS
        </Text>
        <Text variant="bodyLarge" style={styles.subtitle}>
          Sign in to your account
        </Text>

        <SegmentedButtons
          value={mode}
          onValueChange={(value: string) => {
            setMode(value as LoginMode);
            setError('');
            setOtpSent(false);
          }}
          buttons={[
            { value: 'mobile', label: 'Mobile' },
            { value: 'email', label: 'Email' },
          ]}
          style={styles.segment}
        />

        {error ? (
          <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        {mode === 'mobile' ? (
          <View>
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
              <>
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
                  onPress={handleMobileLogin}
                  loading={loading}
                  disabled={loading}
                  style={styles.button}
                >
                  Verify & Sign In
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
              </>
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
          </View>
        ) : (
          <View>
            <TextInput
              label="Email"
              value={email}
              onChangeText={setEmail}
              keyboardType="email-address"
              autoCapitalize="none"
              mode="outlined"
              style={styles.input}
            />
            <TextInput
              label="Password"
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              mode="outlined"
              style={styles.input}
            />
            <Button
              mode="contained"
              onPress={handleEmailLogin}
              loading={loading}
              disabled={loading}
              style={styles.button}
            >
              Sign In
            </Button>
            <Button
              mode="text"
              onPress={() => router.push('/forgot-password' as never)}
              style={styles.linkButton}
            >
              Forgot password?
            </Button>
          </View>
        )}

        <Button
          mode="text"
          onPress={() => router.push('/register')}
          style={styles.linkButton}
        >
          Don't have an account? Register
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
  segment: {
    marginBottom: 20,
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
