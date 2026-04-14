import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, View, Linking } from 'react-native';
import {
  Appbar,
  Button,
  Card,
  Checkbox,
  Divider,
  HelperText,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import * as WebBrowser from 'expo-web-browser';
import { useRouter, useLocalSearchParams } from 'expo-router';
import {
  usePricingPreview,
  usePayOrder,
  type PricingBreakdown,
} from '@/hooks/useOrderPayment';

function generateIdempotencyKey(): string {
  return `pay-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

function fmt(cents: number): string {
  return `$${(cents / 100).toFixed(2)}`;
}

export default function PayOrderScreen(): React.ReactNode {
  const theme = useTheme();
  const router = useRouter();
  const { id, orderNumber } = useLocalSearchParams<{ id: string; orderNumber?: string }>();
  const previewMutation = usePricingPreview();
  const payMutation = usePayOrder();
  const [breakdown, setBreakdown] = useState<PricingBreakdown | null>(null);
  const [promoCode, setPromoCode] = useState('');
  const [useCredits, setUseCredits] = useState(false);
  const [error, setError] = useState('');

  // Initial preview
  useEffect(() => {
    if (!id) return;
    previewMutation.mutate(
      { orderId: id, useCredits: false },
      {
        onSuccess: (data) => setBreakdown(data),
        onError: (err) => setError(err.message),
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  function handleApply(): void {
    setError('');
    previewMutation.mutate(
      { orderId: id!, promoCode: promoCode.trim() || undefined, useCredits },
      {
        onSuccess: (data) => setBreakdown(data),
        onError: (err) => setError(err.message),
      },
    );
  }

  async function handlePay(): Promise<void> {
    if (!id) return;
    setError('');
    payMutation.mutate(
      {
        orderId: id,
        promoCode: promoCode.trim() || undefined,
        useCredits,
        idempotencyKey: generateIdempotencyKey(),
      },
      {
        onSuccess: async (data) => {
          if (data.fullyCoveredByCredits) {
            router.replace(`/orders/${id}` as never);
            return;
          }
          // Open web portal to complete card entry. The /pay endpoint already
          // applied promo + credits on the server, so the web Pay Now modal
          // will show $0 deductions and just collect the card.
          const apiUrl = process.env.EXPO_PUBLIC_API_URL ?? '';
          const webBase =
            process.env.EXPO_PUBLIC_WEB_URL ??
            apiUrl.replace(/\/api\/v\d+$/, '').replace(':5001', ':3001');
          const url = `${webBase}/orders/${id}?pay=1`;
          try {
            await WebBrowser.openBrowserAsync(url);
          } catch {
            await Linking.openURL(url);
          }
          router.replace(`/orders/${id}` as never);
        },
        onError: (err) => setError(err.message),
      },
    );
  }

  const loading = previewMutation.isPending && !breakdown;

  return (
    <View style={[styles.flex, { backgroundColor: theme.colors.background }]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => router.back()} />
        <Appbar.Content title={orderNumber ? `Pay ${orderNumber}` : 'Pay Order'} />
      </Appbar.Header>

      <ScrollView contentContainerStyle={styles.content}>
        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Payment summary
            </Text>
            {loading ? (
              <Text style={styles.dim}>Loading…</Text>
            ) : breakdown ? (
              <>
                <Row label="Subtotal" value={fmt(breakdown.totalAmount)} />
                {breakdown.discountAmount > 0 && (
                  <Row
                    label={`Promo${breakdown.promoCode ? ` (${breakdown.promoCode})` : ''}`}
                    value={`-${fmt(breakdown.discountAmount)}`}
                    color="#52c41a"
                  />
                )}
                {breakdown.creditApplied > 0 && (
                  <Row
                    label="Credits applied"
                    value={`-${fmt(breakdown.creditApplied)}`}
                    color="#52c41a"
                  />
                )}
                <Divider style={styles.divider} />
                <Row label="You pay" value={fmt(breakdown.finalAmount)} bold />
              </>
            ) : (
              <Text style={styles.dim}>No pricing data</Text>
            )}
          </Card.Content>
        </Card>

        <Card style={styles.card}>
          <Card.Content>
            <Text variant="titleMedium" style={styles.sectionTitle}>
              Apply discounts
            </Text>
            <TextInput
              label="Promo code"
              mode="outlined"
              value={promoCode}
              onChangeText={setPromoCode}
              autoCapitalize="characters"
              style={styles.input}
            />
            {breakdown?.promoMessage ? (
              <HelperText type="error" visible>
                {breakdown.promoMessage}
              </HelperText>
            ) : null}
            {breakdown && breakdown.creditBalance > 0 && (
              <Checkbox.Item
                label={`Use credit balance (${fmt(breakdown.creditBalance)} available)`}
                status={useCredits ? 'checked' : 'unchecked'}
                onPress={() => setUseCredits((v) => !v)}
                position="leading"
                style={styles.checkbox}
              />
            )}
            <Button
              mode="outlined"
              onPress={handleApply}
              loading={previewMutation.isPending}
              style={{ marginTop: 8 }}
            >
              Apply
            </Button>
          </Card.Content>
        </Card>

        {error ? (
          <Text style={{ color: theme.colors.error, marginBottom: 12 }}>
            {error}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={handlePay}
          loading={payMutation.isPending}
          disabled={!breakdown || payMutation.isPending}
          icon="credit-card-outline"
          style={styles.payBtn}
          contentStyle={{ paddingVertical: 6 }}
        >
          {breakdown && breakdown.finalAmount === 0
            ? 'Pay with credits'
            : `Pay ${breakdown ? fmt(breakdown.finalAmount) : ''}`}
        </Button>

        <HelperText type="info" visible style={{ textAlign: 'center' }}>
          Card payment opens in a secure browser window.
        </HelperText>
      </ScrollView>
    </View>
  );
}

interface RowProps {
  label: string;
  value: string;
  color?: string;
  bold?: boolean;
}

function Row({ label, value, color, bold }: RowProps): React.ReactNode {
  return (
    <View style={styles.row}>
      <Text variant={bold ? 'titleSmall' : 'bodyMedium'} style={bold && styles.bold}>
        {label}
      </Text>
      <Text
        variant={bold ? 'titleSmall' : 'bodyMedium'}
        style={[bold && styles.bold, color ? { color } : null]}
      >
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  content: { padding: 16, paddingBottom: 32 },
  card: { marginBottom: 14 },
  sectionTitle: { fontWeight: '600', marginBottom: 10 },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 6,
  },
  bold: { fontWeight: '700' },
  divider: { marginVertical: 4 },
  input: { marginBottom: 4 },
  checkbox: { paddingHorizontal: 0 },
  payBtn: { marginTop: 8 },
  dim: { opacity: 0.6 },
});
