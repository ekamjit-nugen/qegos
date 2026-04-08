import React, { Component, type ErrorInfo, type ReactNode } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';
import { Text, Button, useTheme } from 'react-native-paper';

// ─── Types ──────────────────────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Optional fallback UI. If not provided, uses the default error screen. */
  fallback?: ReactNode;
  /** Screen name for contextual error messages */
  screenName?: string;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Called when the user taps "Try Again" */
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

// ─── Default Fallback ───────────────────────────────────────────────────────

function DefaultErrorFallback({
  error,
  screenName,
  onRetry,
}: {
  error: Error | null;
  screenName?: string;
  onRetry: () => void;
}): React.ReactNode {
  const theme = useTheme();

  return (
    <ScrollView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      contentContainerStyle={styles.content}
    >
      <View style={styles.iconContainer}>
        <Text style={[styles.icon, { color: theme.colors.error }]}>!</Text>
      </View>

      <Text variant="headlineSmall" style={styles.title}>
        Something went wrong
      </Text>
      <Text variant="bodyMedium" style={styles.subtitle}>
        {screenName
          ? `We couldn't load ${screenName}. Please try again.`
          : 'An unexpected error occurred. Please try again.'}
      </Text>

      {__DEV__ && error && (
        <View style={[styles.errorBox, { backgroundColor: theme.colors.errorContainer }]}>
          <Text variant="labelSmall" style={{ color: theme.colors.onErrorContainer }}>
            {error.name}: {error.message}
          </Text>
        </View>
      )}

      <Button mode="contained" onPress={onRetry} style={styles.retryButton}>
        Try Again
      </Button>
    </ScrollView>
  );
}

// ─── Error Boundary (Class Component — required for React error boundaries) ─

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Log to error reporting service (Sentry, etc.)
    console.error('[ErrorBoundary]', error, errorInfo); // eslint-disable-line no-console

    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    if (this.props.onReset) {
      this.props.onReset();
    }
  };

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }

      return (
        <DefaultErrorFallback
          error={this.state.error}
          screenName={this.props.screenName}
          onRetry={this.handleReset}
        />
      );
    }

    return this.props.children;
  }
}

// ─── Styles ─────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  iconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#FEE2E2',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 20,
  },
  icon: {
    fontSize: 32,
    fontWeight: '700',
  },
  title: {
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  subtitle: {
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 20,
  },
  errorBox: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 20,
    width: '100%',
  },
  retryButton: {
    minWidth: 160,
  },
});
