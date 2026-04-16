import React from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { StripeProvider } from '@stripe/stripe-react-native';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

// Publishable key is safe to embed client-side. The backend additionally
// returns a per-PaymentIntent publishable key on /pay so StripeProvider's
// key here is really only needed to bootstrap the SDK; we override per
// payment when initializing the PaymentSheet.
const STRIPE_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_STRIPE_PUBLISHABLE_KEY ?? '';

export default function RootLayout(): React.ReactNode {
  return (
    <QueryProvider>
      <AuthProvider>
        <StripeProvider
          publishableKey={STRIPE_PUBLISHABLE_KEY}
          merchantIdentifier="merchant.com.nugen.qegos"
          urlScheme="qegos"
        >
          <PaperProvider>
            <ErrorBoundary screenName="the app">
              <Stack screenOptions={{ headerShown: false }} />
            </ErrorBoundary>
          </PaperProvider>
        </StripeProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
