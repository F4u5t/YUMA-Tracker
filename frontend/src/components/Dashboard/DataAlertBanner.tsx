import type { MapDataStatus } from '../../hooks/useMapData';

interface DataAlertBannerProps {
  wsConnected: boolean;
  stale: boolean;
  dataAgeSeconds: number;
  boundariesStatus: MapDataStatus;
  boundariesMessage: string | null;
  onRetryBoundaries: () => void;
}

interface Alert {
  level: 'error' | 'warn' | 'info';
  msg: string;
  action?: { label: string; fn: () => void };
}

function fmtAge(s: number): string {
  if (s < 60) return `${s}s`;
  return `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function DataAlertBanner({
  wsConnected,
  stale,
  dataAgeSeconds,
  boundariesStatus,
  boundariesMessage,
  onRetryBoundaries,
}: DataAlertBannerProps) {
  const alerts: Alert[] = [];

  if (!wsConnected) {
    alerts.push({ level: 'error', msg: 'Lost connection to server — attempting to reconnect…' });
  } else if (stale && dataAgeSeconds >= 60) {
    alerts.push({
      level: 'error',
      msg: `⚠ No mower data for ${fmtAge(dataAgeSeconds)} — displayed values are outdated`,
    });
  } else if (stale) {
    alerts.push({
      level: 'warn',
      msg: `Mower data is ${fmtAge(dataAgeSeconds)} old — polling for update…`,
    });
  }

  if (boundariesStatus === 'syncing' && boundariesMessage) {
    alerts.push({ level: 'info', msg: boundariesMessage });
  } else if (boundariesStatus === 'error' && boundariesMessage) {
    alerts.push({
      level: 'warn',
      msg: boundariesMessage,
      action: { label: 'Retry', fn: onRetryBoundaries },
    });
  }

  if (alerts.length === 0) return null;

  return (
    <div className="data-alert-banner">
      {alerts.map((a, i) => (
        <div key={i} className={`data-alert data-alert-${a.level}`}>
          <span>{a.msg}</span>
          {a.action && (
            <button className="data-alert-btn" onClick={a.action.fn}>
              {a.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
