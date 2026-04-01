import { useState } from 'react';
import type { Telemetry } from '../../types/mower';
import { SYS_STATUS_LABELS } from '../../types/mower';
import { reconnect } from '../../services/api';

interface MowerStatusProps {
  telemetry: Telemetry | null;
  connected: boolean;
  dataAgeSeconds: number;
  stale: boolean;
}

function fmtAge(s: number): string {
  if (s < 60) return `${s}s ago`;
  return `${Math.floor(s / 60)}m ${s % 60}s ago`;
}

export function MowerStatus({ telemetry, connected: wsConnected, dataAgeSeconds, stale }: MowerStatusProps) {
  const statusLabel = SYS_STATUS_LABELS[telemetry?.sys_status ?? 0] ?? `Status ${telemetry?.sys_status}`;
  const online = telemetry?.online ?? false;
  const [reconnecting, setReconnecting] = useState(false);

  const handleReconnect = async () => {
    setReconnecting(true);
    try {
      await reconnect();
    } catch {
      // backend may briefly be unreachable while reconnecting — that's expected
    }
    setTimeout(() => setReconnecting(false), 8000);
  };

  const ageColor = stale && dataAgeSeconds >= 60 ? '#ef4444'
    : stale ? '#f59e0b'
    : '#22c55e';

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>🏎️ {telemetry?.device_name ?? 'Mower'}</span>
        <span className={`badge ${online ? 'badge-green' : 'badge-red'}`}>
          {online ? 'Online' : 'Offline'}
        </span>
      </div>
      <div className="status-grid">
        <div className="status-row">
          <span className="status-label">Status</span>
          <span className="status-value">{statusLabel}</span>
        </div>
        <div className="status-row">
          <span className="status-label">Data age</span>
          <span className="status-value" style={{ color: ageColor }}>
            {dataAgeSeconds === 0 ? 'Live' : fmtAge(dataAgeSeconds)}
          </span>
        </div>
        <div className="status-row">
          <span className="status-label">WiFi</span>
          <span className="status-value">{telemetry?.wifi_rssi ?? 0} dBm</span>
        </div>
        <div className="status-row">
          <span className="status-label">Heading</span>
          <span className="status-value">{telemetry?.orientation ?? 0}°</span>
        </div>
        <div className="status-row">
          <span className="status-label">Link</span>
          <span className="status-value">{wsConnected ? '🟢 Live WS' : '🔴 Disconnected'}</span>
        </div>
      </div>
      {!(wsConnected && telemetry !== null && online) && (
        <button
          className="btn btn-blue"
          style={{ marginTop: '8px', width: '100%' }}
          onClick={handleReconnect}
          disabled={reconnecting}
        >
          {reconnecting ? '⟳ Reconnecting…' : '⟳ Reconnect'}
        </button>
      )}
    </div>
  );
}
