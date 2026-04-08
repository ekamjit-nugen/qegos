import React from 'react';
import { Stack } from 'expo-router';
import { PaperProvider } from 'react-native-paper';
import { QueryProvider } from '@/lib/query/QueryProvider';
import { AuthProvider } from '@/lib/auth/AuthContext';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout(): React.ReactNode {
  return (
    <QueryProvider>
      <AuthProvider>
        <PaperProvider>
          <ErrorBoundary screenName="the app">
            <Stack screenOptions={{ headerShown: false }} />
          </ErrorBoundary>
        </PaperProvider>
      </AuthProvider>
    </QueryProvider>
  );
}
