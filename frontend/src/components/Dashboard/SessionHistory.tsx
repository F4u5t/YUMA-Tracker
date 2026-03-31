import type { TrailSession } from '../../types/mower';
import { STATUS_TRAIL_COLOR, DEFAULT_TRAIL_COLOR, SYS_STATUS_LABELS } from '../../types/mower';

interface SessionHistoryProps {
  sessions: TrailSession[];
  liveTrail: { sys_status: number }[];
  replaySession: TrailSession | null;
  onSelectSession: (s: TrailSession | null) => void;
  onClear: () => void;
}

function formatDuration(ms: number): string {
  const totalSec = Math.round(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

function statusColor(status: number): string {
  return STATUS_TRAIL_COLOR[status] ?? DEFAULT_TRAIL_COLOR;
}

export function SessionHistory({
  sessions,
  liveTrail,
  replaySession,
  onSelectSession,
  onClear,
}: SessionHistoryProps) {
  const sorted = [...sessions].reverse(); // most recent first

  const liveStatus = liveTrail.length > 0 ? liveTrail[liveTrail.length - 1].sys_status : null;

  return (
    <div className="panel-card trail-panel">
      <div className="panel-card-header">
        <span>🗺️ Trail Sessions</span>
        {sessions.length > 0 && (
          <button className="btn-small btn-red" onClick={onClear}>
            Clear
          </button>
        )}
      </div>

      <div className="session-list">
        {/* Live trail indicator */}
        {liveTrail.length > 0 && (
          <button
            className={`session-row ${replaySession === null ? 'session-row-active' : ''}`}
            onClick={() => onSelectSession(null)}
          >
            <span
              className="session-dot"
              style={{ background: liveStatus !== null ? statusColor(liveStatus) : '#94a3b8' }}
            />
            <span className="session-info">
              <span className="session-label">● Live</span>
              <span className="session-meta">
                {liveStatus !== null ? (SYS_STATUS_LABELS[liveStatus] ?? `Status ${liveStatus}`) : ''}
                {' · '}{liveTrail.length} pts
              </span>
            </span>
          </button>
        )}

        {sorted.length === 0 && liveTrail.length === 0 && (
          <p className="session-empty">No sessions recorded yet. Start mowing!</p>
        )}

        {sorted.map((s) => {
          const duration = s.endTs > s.startTs ? formatDuration(s.endTs - s.startTs) : '—';
          // dominant status = most common in session
          const statusCount: Record<number, number> = {};
          for (const p of s.points) statusCount[p.sys_status] = (statusCount[p.sys_status] ?? 0) + 1;
          const dominantStatus = Number(
            Object.entries(statusCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? 13,
          );
          const isSelected = replaySession?.id === s.id;

          return (
            <button
              key={s.id}
              className={`session-row ${isSelected ? 'session-row-active' : ''}`}
              onClick={() => onSelectSession(isSelected ? null : s)}
            >
              <span
                className="session-dot"
                style={{ background: statusColor(dominantStatus) }}
              />
              <span className="session-info">
                <span className="session-label">{s.label}</span>
                <span className="session-meta">
                  {duration} · {s.points.length} pts
                </span>
              </span>
            </button>
          );
        })}
      </div>

      {/* Legend */}
      <div className="trail-legend">
        {Object.entries(STATUS_TRAIL_COLOR).map(([status, color]) => (
          <span key={status} className="legend-item">
            <span className="legend-swatch" style={{ background: color }} />
            {SYS_STATUS_LABELS[Number(status)] ?? status}
          </span>
        ))}
      </div>
    </div>
  );
}
