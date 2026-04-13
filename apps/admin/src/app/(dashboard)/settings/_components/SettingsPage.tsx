'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Card,
  Descriptions,
  InputNumber,
  Space,
  Spin,
  Typography,
  message,
} from 'antd';
import { SaveOutlined, CalendarOutlined } from '@ant-design/icons';
import { useSettings, useUpdateSetting } from '@/hooks/useSettings';

const { Title, Text } = Typography;

export function SettingsPage(): React.ReactNode {
  const { data: settings, isLoading } = useSettings();
  const updateMutation = useUpdateSetting();

  // Local state for editable values
  const [slotDuration, setSlotDuration] = useState<number>(30);
  const [bufferMinutes, setBufferMinutes] = useState<number>(0);

  // Sync from server data
  useEffect(() => {
    if (!settings) return;
    for (const s of settings) {
      if (s.key === 'appointment.slotDurationMinutes') {
        setSlotDuration(s.value as number);
      }
      if (s.key === 'appointment.bufferMinutes') {
        setBufferMinutes(s.value as number);
      }
    }
  }, [settings]);

  const handleSaveAppointment = useCallback(() => {
    // Save both settings
    Promise.all([
      updateMutation.mutateAsync({
        key: 'appointment.slotDurationMinutes',
        value: slotDuration,
      }),
      updateMutation.mutateAsync({
        key: 'appointment.bufferMinutes',
        value: bufferMinutes,
      }),
    ])
      .then(() => {
        void message.success('Appointment settings saved');
      })
      .catch(() => {
        void message.error('Failed to save settings');
      });
  }, [slotDuration, bufferMinutes, updateMutation]);

  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: 80 }}>
        <Spin size="large" />
      </div>
    );
  }

  return (
    <div style={{ maxWidth: 800 }}>
      <Title level={3}>Platform Settings</Title>

      {/* Appointment Settings */}
      <Card
        title={
          <Space>
            <CalendarOutlined />
            <span>Appointment Settings</span>
          </Space>
        }
        style={{ marginBottom: 16 }}
        extra={
          <Button
            type="primary"
            icon={<SaveOutlined />}
            onClick={handleSaveAppointment}
            loading={updateMutation.isPending}
            size="small"
          >
            Save
          </Button>
        }
      >
        <Descriptions column={1} size="small" bordered>
          <Descriptions.Item label="Slot Duration (minutes)">
            <Space>
              <InputNumber
                min={10}
                max={180}
                step={5}
                value={slotDuration}
                onChange={(v) => { if (v !== null) setSlotDuration(v); }}
                style={{ width: 100 }}
              />
              <Text type="secondary">
                Each appointment slot will be {slotDuration} minutes long
              </Text>
            </Space>
          </Descriptions.Item>
          <Descriptions.Item label="Buffer Between Slots (minutes)">
            <Space>
              <InputNumber
                min={0}
                max={60}
                step={5}
                value={bufferMinutes}
                onChange={(v) => { if (v !== null) setBufferMinutes(v); }}
                style={{ width: 100 }}
              />
              <Text type="secondary">
                Break time between consecutive appointments
              </Text>
            </Space>
          </Descriptions.Item>
        </Descriptions>
      </Card>

      {/* All Settings (read-only reference) */}
      {settings && settings.length > 0 && (
        <Card title="All Settings" size="small">
          <Descriptions column={1} size="small" bordered>
            {settings.map((s) => (
              <Descriptions.Item key={s.key} label={s.key}>
                <Space>
                  <Text code>{JSON.stringify(s.value)}</Text>
                  <Text type="secondary" style={{ fontSize: 12 }}>
                    {s.description}
                  </Text>
                </Space>
              </Descriptions.Item>
            ))}
          </Descriptions>
        </Card>
      )}
    </div>
  );
}
