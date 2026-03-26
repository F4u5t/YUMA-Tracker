import { useState } from 'react';
import type { Telemetry } from '../../types/mower';
import { SYS_STATUS_LABELS } from '../../types/mower';
import { reconnect } from '../../services/api';

interface MowerStatusProps {
  telemetry: Telemetry | null;
  connected: boolean;
}

export function MowerStatus({ telemetry, connected: wsConnected }: MowerStatusProps) {
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
    // Wait a few seconds then clear the spinner (backend reconnects async)
    setTimeout(() => setReconnecting(false), 8000);
  };

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
          <span className="status-label">WiFi</span>
          <span className="status-value">{telemetry?.wifi_rssi ?? 0} dBm</span>
        </div>
        <div className="status-row">
          <span className="status-label">Heading</span>
          <span className="status-value">{telemetry?.orientation ?? 0}°</span>
        </div>
        <div className="status-row">
          <span className="status-label">UI link</span>
          <span className="status-value">{wsConnected ? 'Live' : '—'}</span>
        </div>
      </div>
      <button
        className="btn btn-blue"
        style={{ marginTop: '8px', width: '100%' }}
        onClick={handleReconnect}
        disabled={reconnecting}
      >
        {reconnecting ? '⟳ Reconnecting…' : '⟳ Reconnect'}
      </button>
    </div>
  );
}
