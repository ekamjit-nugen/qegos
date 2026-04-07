import * as net from 'net';
import type { VirusScanStatus, FileStorageConfig } from '../types';

// ─── Module State ───────────────────────────────────────────────────────────

let clamavHost: string;
let clamavPort: number;
let enabled: boolean;

export function initVirusScanService(config: FileStorageConfig): void {
  clamavHost = config.clamavHost ?? 'localhost';
  clamavPort = config.clamavPort ?? 3310;
  enabled = !!config.clamavHost;
}

// ─── ClamAV Scan (CPV-INV-01) ──────────────────────────────────────────────

/**
 * Scan a file buffer using ClamAV via TCP (INSTREAM command).
 * Returns 'clean' if no virus detected, 'infected' if virus found,
 * 'error' if ClamAV unreachable (fail-safe: reject upload).
 *
 * If ClamAV is not configured, returns 'clean' (dev/test environments).
 */
export async function scanBuffer(buffer: Buffer): Promise<VirusScanStatus> {
  if (!enabled) {
    return 'clean';
  }

  return new Promise<VirusScanStatus>((resolve) => {
    const socket = new net.Socket();
    let response = '';

    const timeout = setTimeout(() => {
      socket.destroy();
      resolve('error');
    }, 30_000);

    socket.connect(clamavPort, clamavHost, () => {
      // ClamAV INSTREAM protocol:
      // 1. Send "zINSTREAM\0"
      // 2. Send chunks: [4-byte big-endian length][data]
      // 3. Send terminator: [0x00 0x00 0x00 0x00]
      socket.write('zINSTREAM\0');

      const chunkSize = 2048;
      for (let i = 0; i < buffer.length; i += chunkSize) {
        const chunk = buffer.subarray(i, Math.min(i + chunkSize, buffer.length));
        const header = Buffer.alloc(4);
        header.writeUInt32BE(chunk.length, 0);
        socket.write(header);
        socket.write(chunk);
      }

      // Terminator
      const terminator = Buffer.alloc(4);
      terminator.writeUInt32BE(0, 0);
      socket.write(terminator);
    });

    socket.on('data', (data) => {
      response += data.toString();
    });

    socket.on('end', () => {
      clearTimeout(timeout);
      // ClamAV response: "stream: OK" or "stream: <virus_name> FOUND"
      if (response.includes('OK')) {
        resolve('clean');
      } else if (response.includes('FOUND')) {
        resolve('infected');
      } else {
        resolve('error');
      }
    });

    socket.on('error', () => {
      clearTimeout(timeout);
      resolve('error');
    });
  });
}
