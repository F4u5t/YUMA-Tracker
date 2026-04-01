import { useState, useEffect, useCallback } from 'react';
import { API_BASE } from '../../services/api';

interface DiagnosticsData {
  ws_clients_connected: number;
  mower_connected: boolean;
  device_name: string;
  telemetry_task_alive: boolean;
  telemetry_loop_crashes: number;
  connect_attempts: number;
  connected_at: string | null;
  disconnected_at: string | null;
  ws_messages_sent: number;
  ws_broadcast_errors: number;
  last_errors: string[];
  last_telemetry_age_s: number | null;
}

interface Props {
  /** WS reconnect count from useWebSocket */
  wsReconnectCount: number;
  lastDisconnectAt: Date | null;
}

function fmtAge(isoString: string | null): string {
  if (!isoString) return '—';
  const dt = new Date(isoString);
  const diffS = Math.round((Date.now() - dt.getTime()) / 1000);
  if (diffS < 60) return `${diffS}s ago`;
  if (diffS < 3600) return `${Math.floor(diffS / 60)}m ${diffS % 60}s ago`;
  return `${Math.floor(diffS / 3600)}h ago`;
}

function Row({ label, value, warn }: { label: string; value: string | number | boolean | null; warn?: boolean }) {
  const display =
    value === null ? '—'
    : typeof value === 'boolean' ? (value ? '✅ yes' : '❌ no')
    : String(value);
  return (
    <tr style={{ color: warn ? '#f87171' : undefined }}>
      <td style={{ paddingRight: 12, opacity: 0.7, whiteSpace: 'nowrap', fontSize: 12 }}>{label}</td>
      <td style={{ fontFamily: 'monospace', fontSize: 12 }}>{display}</td>
    </tr>
  );
}

export function DiagnosticsPanel({ wsReconnectCount, lastDisconnectAt }: Props) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<DiagnosticsData | null>(null);
  const [error, setError] = useState<string | null>(null);

  const poll = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/diagnostics`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setData(await res.json() as DiagnosticsData);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'fetch failed');
    }
  }, []);

  useEffect(() => {
    if (!open) return;
    poll();
    const id = setInterval(poll, 5000);
    return () => clearInterval(id);
  }, [open, poll]);

  return (
    <div style={{ marginTop: 12, borderTop: '1px solid #334155', paddingTop: 8 }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          background: 'none', border: 'none', color: '#94a3b8',
          cursor: 'pointer', fontSize: 12, padding: '2px 0', display: 'flex', alignItems: 'center', gap: 4,
        }}
      >
        <span style={{ fontSize: 10 }}>{open ? '▼' : '▶'}</span> Debug / Diagnostics
      </button>

      {open && (
        <div style={{ marginTop: 8 }}>
          {error && (
            <div style={{ color: '#f87171', fontSize: 12, marginBottom: 6 }}>
              Diagnostics unavailable: {error}
            </div>
          )}

          <table style={{ borderCollapse: 'collapse', width: '100%' }}>
            <tbody>
              {/* Frontend WS stats — always available */}
              <Row label="WS reconnects (client)" value={wsReconnectCount} warn={wsReconnectCount > 3} />
              <Row
                label="Last disconnect (client)"
                value={lastDisconnectAt ? fmtAge(lastDisconnectAt.toISOString()) : '—'}
              />

              {data && (
                <>
                  <tr><td colSpan={2} style={{ paddingTop: 6, opacity: 0.4, fontSize: 11 }}>── backend ──</td></tr>
                  <Row label="WS clients (server)" value={data.ws_clients_connected} />
                  <Row label="Mower connected" value={data.mower_connected} warn={!data.mower_connected} />
                  <Row label="Telemetry task alive" value={data.telemetry_task_alive} warn={!data.telemetry_task_alive} />
                  <Row label="Loop crashes" value={data.telemetry_loop_crashes} warn={data.telemetry_loop_crashes > 0} />
                  <Row label="Connect attempts" value={data.connect_attempts} />
                  <Row label="Connected at" value={fmtAge(data.connected_at)} />
                  <Row label="Disconnected at" value={fmtAge(data.disconnected_at)} />
                  <Row label="Messages sent" value={data.ws_messages_sent} />
                  <Row label="Broadcast errors" value={data.ws_broadcast_errors} warn={data.ws_broadcast_errors > 0} />
                  <Row
                    label="Last telemetry age"
                    value={data.last_telemetry_age_s !== null ? `${data.last_telemetry_age_s}s` : null}
                    warn={(data.last_telemetry_age_s ?? 0) > 30}
                  />
                  {data.last_errors.length > 0 && (
                    <tr>
                      <td colSpan={2} style={{ paddingTop: 6 }}>
                        <div style={{ fontSize: 11, opacity: 0.7, marginBottom: 2 }}>Recent errors:</div>
                        {data.last_errors.map((e, i) => (
                          <div key={i} style={{ fontSize: 11, color: '#f87171', fontFamily: 'monospace', wordBreak: 'break-all' }}>
                            {e}
                          </div>
                        ))}
                      </td>
                    </tr>
                  )}
                </>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
