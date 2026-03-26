import type { Telemetry } from '../../types/mower';

interface SatelliteInfoProps {
  telemetry: Telemetry | null;
}

const RTK_BADGE: Record<string, { label: string; className: string }> = {
  FINE: { label: 'FIX', className: 'badge badge-green' },
  BAD: { label: 'FLOAT', className: 'badge badge-yellow' },
  NONE: { label: 'NONE', className: 'badge badge-red' },
};

export function SatelliteInfo({ telemetry }: SatelliteInfoProps) {
  // satellites_total/l2 come from rapid mowing state (only non-zero while actively mowing)
  // gps_stars comes from RTK report — available even when docked
  const satsRapid = telemetry?.satellites_total ?? 0;
  const gpsStars = telemetry?.gps_stars ?? 0;
  const coViewStars = telemetry?.co_view_stars ?? 0;
  // Show whichever source has data
  const displaySats = satsRapid > 0 ? satsRapid : gpsStars;
  const l2 = telemetry?.satellites_l2 ?? 0;
  const rtkStatus = telemetry?.rtk_status ?? 'NONE';
  const badge = RTK_BADGE[rtkStatus] ?? RTK_BADGE.NONE;

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>📡 Satellites</span>
        <span className={badge.className}>{badge.label}</span>
      </div>
      <div className="sat-grid">
        <div className="sat-stat">
          <div className="sat-stat-value">{displaySats}</div>
          <div className="sat-stat-label">{satsRapid > 0 ? 'Total' : 'GPS'}</div>
        </div>
        <div className="sat-stat">
          <div className="sat-stat-value">{l2 > 0 ? l2 : coViewStars}</div>
          <div className="sat-stat-label">{l2 > 0 ? 'L2' : 'Co-View'}</div>
        </div>
        <div className="sat-stat">
          <div className="sat-stat-value">{telemetry?.rtk_age?.toFixed(1) ?? '-'}</div>
          <div className="sat-stat-label">RTK Age</div>
        </div>
      </div>
    </div>
  );
}
