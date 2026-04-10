'use client';

import dynamic from 'next/dynamic';
import { Spin } from 'antd';

// Monaco is heavy and hits `window` — load only on the client.
const MonacoEditor = dynamic(() => import('@monaco-editor/react'), {
  ssr: false,
  loading: () => (
    <div style={{ padding: 40, textAlign: 'center' }}>
      <Spin />
    </div>
  ),
});

interface JsonEditorProps {
  value: string;
  onChange: (next: string) => void;
  readOnly?: boolean;
  height?: number | string;
}

export function JsonEditor({
  value,
  onChange,
  readOnly,
  height = 600,
}: JsonEditorProps): React.ReactNode {
  return (
    <div style={{ border: '1px solid #d9d9d9', borderRadius: 6, overflow: 'hidden' }}>
      <MonacoEditor
        height={height}
        language="json"
        value={value}
        onChange={(v) => onChange(v ?? '')}
        options={{
          readOnly,
          minimap: { enabled: false },
          fontSize: 13,
          scrollBeyondLastLine: false,
          wordWrap: 'on',
          tabSize: 2,
          formatOnPaste: true,
        }}
      />
    </div>
  );
}
