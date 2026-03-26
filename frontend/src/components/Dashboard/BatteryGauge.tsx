import type { Telemetry, BatterySession } from '../../types/mower';

interface BatteryGaugeProps {
  telemetry: Telemetry | null;
  activeSession: BatterySession | null;
  sessions: BatterySession[];
  onClearSessions: () => void;
}

function fmt(ms: number): string {
  const m = Math.floor(ms / 60000);
  const h = Math.floor(m / 60);
  return h > 0 ? `${h}h ${m % 60}m` : `${m}m`;
}

/** Tiny inline SVG sparkline for the battery readings array. */
function Sparkline({ readings }: { readings: { ts: number; pct: number }[] }) {
  if (readings.length < 2) return null;
  const W = 200, H = 36, PAD = 2;
  const minT = readings[0].ts, maxT = readings[readings.length - 1].ts;
  const spanT = maxT - minT || 1;
  const pts = readings.map(r => {
    const x = PAD + ((r.ts - minT) / spanT) * (W - PAD * 2);
    const y = PAD + (1 - r.pct / 100) * (H - PAD * 2);
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(' ');
  return (
    <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: H, display: 'block' }}>
      <polyline points={pts} fill="none" stroke="#22c55e" strokeWidth="1.5" />
    </svg>
  );
}

export function BatteryGauge({ telemetry, activeSession, sessions, onClearSessions }: BatteryGaugeProps) {
  const level = telemetry?.battery ?? 0;
  const charging = telemetry?.charge_state === 1;
  const color = level > 50 ? '#22c55e' : level > 20 ? '#f59e0b' : '#ef4444';

  const used = activeSession ? activeSession.startPct - level : null;

  return (
    <div className="panel-card">
      <div className="panel-card-header">
        <span>🔋 Battery</span>
        {charging && <span className="badge badge-blue">Charging</span>}
        {activeSession && <span className="badge badge-green">Tracking</span>}
      </div>

      {/* Current level bar */}
      <div className="battery-bar-track">
        <div className="battery-bar-fill" style={{ width: `${level}%`, backgroundColor: color }} />
      </div>
      <div className="battery-label">{level}%</div>

      {/* Live session info */}
      {activeSession && (
        <div style={{ marginTop: 8, fontSize: '0.78rem', color: '#94a3b8' }}>
          <div style={{ fontWeight: 600, color: '#e2e8f0', marginBottom: 4 }}>
            Active: {activeSession.taskName}
          </div>
          <div>Started: {activeSession.startPct}% → Now: {level}%
            {used !== null && used > 0 && <span style={{ color: '#f59e0b' }}> (−{used}%)</span>}
          </div>
          <Sparkline readings={activeSession.readings} />
        </div>
      )}

      {/* Past sessions */}
      {sessions.length > 0 && (
        <div style={{ marginTop: 10 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
            <span style={{ fontSize: '0.75rem', fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              Session History
            </span>
            <button
              onClick={onClearSessions}
              style={{ fontSize: '0.7rem', background: 'none', border: 'none', color: '#64748b', cursor: 'pointer', padding: 0 }}
            >
              Clear
            </button>
          </div>
          {[...sessions].reverse().slice(0, 5).map(s => {
            const drop = s.startPct - (s.endPct ?? s.startPct);
            return (
              <div key={s.id} style={{ marginBottom: 8 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.78rem', color: '#cbd5e1' }}>
                  <span>{s.taskName}</span>
                  <span style={{ color: '#64748b' }}>{new Date(s.id).toLocaleDateString()}</span>
                </div>
                <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                  {s.startPct}% → {s.endPct ?? '?'}%
                  {drop > 0 && <span style={{ color: '#f59e0b' }}> (−{drop}%)</span>}
                  {s.durationMs && <span> · {fmt(s.durationMs)}</span>}
                </div>
                <Sparkline readings={s.readings} />
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
