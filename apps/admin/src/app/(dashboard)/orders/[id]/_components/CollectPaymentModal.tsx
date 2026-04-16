'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  Button,
  Checkbox,
  Descriptions,
  Divider,
  Form,
  Input,
  Modal,
  Space,
  Spin,
  Tag,
  Typography,
  message,
} from 'antd';
import { loadStripe, type Stripe } from '@stripe/stripe-js';
import { Elements, PaymentElement, useElements, useStripe } from '@stripe/react-stripe-js';
import {
  useCollectPricing,
  useCollectPayment,
  type CollectPaymentResult,
  type PricingBreakdown,
} from '@/hooks/useCollectPayment';
import { formatCurrency } from '@/lib/utils/format';

const { Text } = Typography;

interface CollectPaymentModalProps {
  open: boolean;
  onClose: () => void;
  orderId: string;
  orderNumber: string;
  baseAmount: number;
  onSuccess: () => void;
}

interface FormValues {
  promoCode?: string;
  useCredits?: boolean;
}

function generateIdempotencyKey(): string {
  return `collect-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

interface CardFormProps {
  intent: CollectPaymentResult;
  onSuccess: () => void;
}

function CardForm({ intent, onSuccess }: CardFormProps): React.ReactNode {
  const stripe = useStripe();
  const elements = useElements();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handlePay(): Promise<void> {
    if (!stripe || !elements || !intent.clientSecret) return;
    setSubmitting(true);
    setError(null);
    try {
      const { error: submitError } = await elements.submit();
      if (submitError) {
        setError(submitError.message ?? 'Payment failed');
        setSubmitting(false);
        return;
      }
      const { error: confirmError } = await stripe.confirmPayment({
        elements,
        clientSecret: intent.clientSecret,
        confirmParams: {
          return_url: `${window.location.origin}/orders`,
        },
        redirect: 'if_required',
      });
      if (confirmError) {
        setError(confirmError.message ?? 'Payment failed');
        setSubmitting(false);
        return;
      }
      void message.success('Payment collected successfully');
      onSuccess();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Payment failed');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div>
      <Alert
        type="info"
        showIcon
        message="Enter the client's card details below"
        style={{ marginBottom: 12 }}
      />
      <PaymentElement options={{ layout: 'tabs' }} />
      {error ? <Alert type="error" message={error} style={{ marginTop: 12 }} showIcon /> : null}
      <Button
        type="primary"
        block
        size="large"
        loading={submitting}
        disabled={!stripe || !elements}
        onClick={handlePay}
        style={{ marginTop: 16 }}
      >
        Charge {formatCurrency(intent.amount ?? 0)}
      </Button>
    </div>
  );
}

export function CollectPaymentModal({
  open,
  onClose,
  orderId,
  orderNumber,
  baseAmount,
  onSuccess,
}: CollectPaymentModalProps): React.ReactNode {
  const [form] = Form.useForm<FormValues>();
  const previewMutation = useCollectPricing();
  const collectMutation = useCollectPayment();
  const [breakdown, setBreakdown] = useState<PricingBreakdown | null>(null);
  const [intent, setIntent] = useState<CollectPaymentResult | null>(null);
  const [stripeInstance, setStripeInstance] = useState<Stripe | null>(null);

  useEffect(() => {
    if (!open) return;
    setBreakdown(null);
    setIntent(null);
    form.resetFields();
    previewMutation.mutate(
      { orderId, useCredits: false },
      {
        onSuccess: (data) => setBreakdown(data),
        onError: (err) => {
          void message.error(err.message);
        },
      },
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, orderId]);

  useEffect(() => {
    if (!intent?.publishableKey) {
      setStripeInstance(null);
      return;
    }
    let cancelled = false;
    void loadStripe(intent.publishableKey).then((s) => {
      if (!cancelled) setStripeInstance(s);
    });
    return () => {
      cancelled = true;
    };
  }, [intent?.publishableKey]);

  function handleApply(): void {
    const values = form.getFieldsValue();
    previewMutation.mutate(
      {
        orderId,
        promoCode: values.promoCode?.trim() || undefined,
        useCredits: values.useCredits,
      },
      {
        onSuccess: (data) => setBreakdown(data),
        onError: (err) => {
          void message.error(err.message);
        },
      },
    );
  }

  function handleProceed(): void {
    const values = form.getFieldsValue();
    collectMutation.mutate(
      {
        orderId,
        promoCode: values.promoCode?.trim() || undefined,
        useCredits: values.useCredits,
        idempotencyKey: generateIdempotencyKey(),
      },
      {
        onSuccess: (data) => {
          if (data.fullyCoveredByCredits) {
            void message.success('Order paid using client credits');
            onSuccess();
            return;
          }
          setIntent(data);
        },
        onError: (err) => {
          void message.error(err.message);
        },
      },
    );
  }

  const stripeOptions = useMemo(
    () =>
      intent?.clientSecret
        ? { clientSecret: intent.clientSecret, appearance: { theme: 'stripe' as const } }
        : undefined,
    [intent?.clientSecret],
  );

  const showPaymentStep = intent && stripeInstance && stripeOptions;

  return (
    <Modal
      title={`Collect Payment — ${orderNumber}`}
      open={open}
      onCancel={onClose}
      footer={null}
      width={560}
      destroyOnClose
    >
      {previewMutation.isPending && !breakdown ? (
        <div style={{ textAlign: 'center', padding: 40 }}>
          <Spin />
        </div>
      ) : (
        <Space direction="vertical" size="middle" style={{ width: '100%' }}>
          <Descriptions column={1} size="small" bordered>
            <Descriptions.Item label="Subtotal">
              {formatCurrency(breakdown?.totalAmount ?? baseAmount)}
            </Descriptions.Item>
            {breakdown && breakdown.discountAmount > 0 && (
              <Descriptions.Item
                label={
                  <span>
                    Promo{' '}
                    {breakdown.promoCode ? <Tag color="purple">{breakdown.promoCode}</Tag> : null}
                  </span>
                }
              >
                <Text type="success">-{formatCurrency(breakdown.discountAmount)}</Text>
              </Descriptions.Item>
            )}
            {breakdown && breakdown.creditApplied > 0 && (
              <Descriptions.Item label="Client credits applied">
                <Text type="success">-{formatCurrency(breakdown.creditApplied)}</Text>
              </Descriptions.Item>
            )}
            <Descriptions.Item label="Amount to charge">
              <Text strong style={{ fontSize: 18 }}>
                {formatCurrency(breakdown?.finalAmount ?? baseAmount)}
              </Text>
            </Descriptions.Item>
          </Descriptions>

          {breakdown?.promoMessage && (
            <Alert type="warning" message={breakdown.promoMessage} showIcon />
          )}

          {!showPaymentStep && (
            <Form form={form} layout="vertical">
              <Form.Item label="Promo code" name="promoCode">
                <Input placeholder="Optional" allowClear />
              </Form.Item>
              {breakdown && breakdown.creditBalance > 0 && (
                <Form.Item name="useCredits" valuePropName="checked">
                  <Checkbox>
                    Use client credit balance ({formatCurrency(breakdown.creditBalance)} available)
                  </Checkbox>
                </Form.Item>
              )}
              <Space>
                <Button onClick={handleApply} loading={previewMutation.isPending}>
                  Recalculate
                </Button>
                <Button
                  type="primary"
                  onClick={handleProceed}
                  loading={collectMutation.isPending}
                  disabled={!breakdown}
                >
                  Continue to payment
                </Button>
              </Space>
            </Form>
          )}

          {showPaymentStep && (
            <>
              <Divider style={{ margin: '8px 0' }} />
              <Elements stripe={stripeInstance} options={stripeOptions}>
                <CardForm intent={intent} onSuccess={onSuccess} />
              </Elements>
            </>
          )}
        </Space>
      )}
    </Modal>
  );
}
