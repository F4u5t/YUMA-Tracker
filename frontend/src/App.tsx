import { useState, useEffect, useCallback, useRef } from 'react';
import { useMowerState } from './hooks/useMowerState';
import { useBatteryTracker } from './hooks/useBatteryTracker';
import { useTrailTracker } from './hooks/useTrailTracker';
import { MapView } from './components/Map/MapView';
import { BatteryGauge } from './components/Dashboard/BatteryGauge';
import { SatelliteInfo } from './components/Dashboard/SatelliteInfo';
import { MowerStatus } from './components/Dashboard/MowerStatus';
import { TaskList } from './components/Tasks/TaskList';
import { CameraPanel } from './components/Camera/CameraPanel';
import { SessionHistory } from './components/Dashboard/SessionHistory';
import { getBoundaries, getMowPath, refreshTelemetry, getOverlaySettings, saveOverlaySettings } from './services/api';
import type { GeoJSONFeatureCollection } from './types/mower';
import './App.css';

type SidebarTab = 'dashboard' | 'tasks' | 'camera' | 'trail';

interface OverlayAlign {
  mirrorEW: boolean;
  mirrorNS: boolean;
  rot: number;
  eastM: number;
  northM: number;
}

const OVERLAY_DEFAULTS: OverlayAlign = { mirrorEW: false, mirrorNS: false, rot: 0, eastM: 0, northM: 0 };

interface TrailAlign { rot: number; eastM: number; northM: number; }
const TRAIL_ALIGN_DEFAULTS: TrailAlign = { rot: 0, eastM: 0, northM: 0 };

// Legacy localStorage keys — used for one-time migration to server-side storage
const OVERLAY_ALIGN_STORAGE = 'yuma_overlay_align';
const LEGACY_MOW_PATH_ROT = 'yuma_mow_path_rotation_deg';

function readLegacyOverlay(): OverlayAlign | null {
  try {
    const raw = localStorage.getItem(OVERLAY_ALIGN_STORAGE);
    if (raw) {
      const j = JSON.parse(raw) as Partial<OverlayAlign>;
      const r: OverlayAlign = {
        mirrorEW: Boolean(j.mirrorEW),
        mirrorNS: Boolean(j.mirrorNS),
        rot: Number.isFinite(Number(j.rot)) ? Number(j.rot) : 0,
        eastM: Number.isFinite(Number(j.eastM)) ? Number(j.eastM) : 0,
        northM: Number.isFinite(Number(j.northM)) ? Number(j.northM) : 0,
      };
      if (r.mirrorEW || r.mirrorNS || r.rot !== 0 || r.eastM !== 0 || r.northM !== 0) return r;
    }
    const legacy = localStorage.getItem(LEGACY_MOW_PATH_ROT);
    if (legacy) {
      const n = parseFloat(legacy);
      if (Number.isFinite(n) && n !== 0) return { ...OVERLAY_DEFAULTS, rot: n };
    }
  } catch {}
  return null;
}

function App() {
  const { telemetry, satSamples, connected, loading } = useMowerState();
  const [boundaries, setBoundaries] = useState<GeoJSONFeatureCollection | null>(null);
  const [mowPath, setMowPath] = useState<GeoJSONFeatureCollection | null>(null);
  const [overlayAlign, setOverlayAlign] = useState<OverlayAlign>(OVERLAY_DEFAULTS);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedTaskZones, setSelectedTaskZones] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTaskName, setActiveTaskName] = useState('');
  const [showAlignControls, setShowAlignControls] = useState(false);
  const [trailAlign, setTrailAlign] = useState<TrailAlign>(TRAIL_ALIGN_DEFAULTS);
  const [showTrailAlignControls, setShowTrailAlignControls] = useState(false);
  const overlayReady = useRef(false);

  const { activeSession, sessions, clearSessions } = useBatteryTracker(telemetry, activeTaskName);
  const { liveTrail, sessions: trailSessions, replaySession, setReplaySession, clearSessions: clearTrail } = useTrailTracker(telemetry);

  // Trail points to show: replay session if selected, otherwise live
  const displayTrail = replaySession ? replaySession.points : liveTrail;

  // Load overlay settings from server; migrate from localStorage if server has all-defaults
  useEffect(() => {
    let cancelled = false;
    const tryLoad = () => {
      getOverlaySettings()
        .then((s) => {
          if (cancelled) return;
          const isDefault = !s.mirrorEW && !s.mirrorNS && s.rot === 0 && s.eastM === 0 && s.northM === 0;
          if (isDefault) {
            const legacy = readLegacyOverlay();
            if (legacy) {
              setOverlayAlign(legacy);
              saveOverlaySettings({ ...legacy, trailRot: 0, trailEastM: 0, trailNorthM: 0 }).catch(() => {});
              overlayReady.current = true;
              return;
            }
          }
          setOverlayAlign(s as OverlayAlign);
          setTrailAlign({ rot: s.trailRot ?? 0, eastM: s.trailEastM ?? 0, northM: s.trailNorthM ?? 0 });
          overlayReady.current = true;
        })
        .catch(() => { if (!cancelled) setTimeout(tryLoad, 3000); });
    };
    tryLoad();
    return () => { cancelled = true; };
  }, []);

  // Load map data on mount — retry until successful
  useEffect(() => {
    let cancelled = false;

    const fetchWithRetry = <T,>(
      fn: () => Promise<T>,
      setter: (v: T) => void,
      interval = 3000,
    ) => {
      const attempt = () => {
        if (cancelled) return;
        fn()
          .then((data) => { if (!cancelled) setter(data); })
          .catch(() => { if (!cancelled) setTimeout(attempt, interval); });
      };
      attempt();
    };

    fetchWithRetry(getBoundaries, setBoundaries);
    fetchWithRetry(getMowPath, setMowPath);

    // Refresh mow path periodically after initial load
    const interval = setInterval(() => {
      getMowPath().then(setMowPath).catch(() => {});
    }, 15000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, []);

  // Debounced save — only after initial server load to avoid overwriting with defaults
  useEffect(() => {
    if (!overlayReady.current) return;
    const t = setTimeout(() => {
      saveOverlaySettings({
        ...overlayAlign,
        trailRot: trailAlign.rot,
        trailEastM: trailAlign.eastM,
        trailNorthM: trailAlign.northM,
      }).catch(() => {});
    }, 600);
    return () => clearTimeout(t);
  }, [overlayAlign, trailAlign]);

  const handleSelectTask = useCallback((zoneHashs: number[]) => {
    setSelectedTaskZones(zoneHashs);
  }, []);

  const handleStartTask = useCallback((taskName: string, zoneHashs: number[]) => {
    setActiveTaskName(taskName);
    setSelectedTaskZones(zoneHashs);
  }, []);

  return (
    <div className="app">
      {(loading || !boundaries) && (
        <div className="loading-screen">
          <div className="loading-spinner" />
          <p className="loading-text">
            {loading ? 'Connecting to mower…' : 'Loading map zones…'}
          </p>
        </div>
      )}
      {/* Top bar */}
      <header className="topbar">
        <div className="topbar-left">
          <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)}>
            ☰
          </button>
          <h1 className="topbar-title">Faust Lawn Maintenance</h1>
        </div>
        <div className="topbar-right">
          <label className="heatmap-toggle">
            <input
              type="checkbox"
              checked={showHeatmap}
              onChange={(e) => setShowHeatmap(e.target.checked)}
            />
            <span>Satellite Heatmap</span>
          </label>
          <button
            type="button"
            className={`btn-align-toggle ${showAlignControls ? 'active' : ''}`}
            onClick={() => setShowAlignControls((v) => !v)}
            title="Adjust map overlay alignment"
          >
            ⊹ Align
          </button>
          {showAlignControls && (
            <div
              className="overlay-align"
              title="Mirror = flip overlay across RTK pivot. Then rotate, then shift. Saved server-side."
            >
              <label className="overlay-align-check">
                <input
                  type="checkbox"
                  checked={overlayAlign.mirrorEW}
                  onChange={(e) =>
                    setOverlayAlign((o) => ({ ...o, mirrorEW: e.target.checked }))
                  }
                />
                flip E↔W
              </label>
              <label className="overlay-align-check">
                <input
                  type="checkbox"
                  checked={overlayAlign.mirrorNS}
                  onChange={(e) =>
                    setOverlayAlign((o) => ({ ...o, mirrorNS: e.target.checked }))
                  }
                />
                flip N↔S
              </label>
              <label htmlFor="overlay-rot">°</label>
              <input
                id="overlay-rot"
                type="range"
                min="-90"
                max="90"
                step="0.5"
                value={overlayAlign.rot}
                onChange={(e) =>
                  setOverlayAlign((o) => ({ ...o, rot: parseFloat(e.target.value) }))
                }
              />
              <span className="overlay-align-value">{overlayAlign.rot.toFixed(1)}°</span>
              <label htmlFor="overlay-e">E</label>
              <input
                id="overlay-e"
                type="range"
                min="-40"
                max="40"
                step="1"
                value={overlayAlign.eastM}
                onChange={(e) =>
                  setOverlayAlign((o) => ({ ...o, eastM: parseFloat(e.target.value) }))
                }
              />
              <span className="overlay-align-value">{overlayAlign.eastM}m</span>
              <label htmlFor="overlay-n">N</label>
              <input
                id="overlay-n"
                type="range"
                min="-40"
                max="40"
                step="1"
                value={overlayAlign.northM}
                onChange={(e) =>
                  setOverlayAlign((o) => ({ ...o, northM: parseFloat(e.target.value) }))
                }
              />
              <span className="overlay-align-value">{overlayAlign.northM}m</span>
              <button
                type="button"
                className="overlay-align-reset"
                onClick={() =>
                  setOverlayAlign({
                    mirrorEW: false,
                    mirrorNS: false,
                    rot: 0,
                    eastM: 0,
                    northM: 0,
                  })
                }
              >
                Reset
              </button>
            </div>
          )}
          <button
            type="button"
            className={`btn-align-toggle ${showTrailAlignControls ? 'active' : ''}`}
            onClick={() => setShowTrailAlignControls((v) => !v)}
            title="Adjust trail alignment independently from zones"
          >
            ⊹ Trail
          </button>
          {showTrailAlignControls && (
            <div className="overlay-align" title="Shift/rotate trail points independently from zone overlay">
              <label htmlFor="trail-rot">°</label>
              <input
                id="trail-rot"
                type="range"
                min="-90"
                max="90"
                step="0.5"
                value={trailAlign.rot}
                onChange={(e) => setTrailAlign((o) => ({ ...o, rot: parseFloat(e.target.value) }))}
              />
              <span className="overlay-align-value">{trailAlign.rot.toFixed(1)}°</span>
              <label htmlFor="trail-e">E</label>
              <input
                id="trail-e"
                type="range"
                min="-40"
                max="40"
                step="1"
                value={trailAlign.eastM}
                onChange={(e) => setTrailAlign((o) => ({ ...o, eastM: parseFloat(e.target.value) }))}
              />
              <span className="overlay-align-value">{trailAlign.eastM}m</span>
              <label htmlFor="trail-n">N</label>
              <input
                id="trail-n"
                type="range"
                min="-40"
                max="40"
                step="1"
                value={trailAlign.northM}
                onChange={(e) => setTrailAlign((o) => ({ ...o, northM: parseFloat(e.target.value) }))}
              />
              <span className="overlay-align-value">{trailAlign.northM}m</span>
              <button
                type="button"
                className="overlay-align-reset"
                onClick={() => setTrailAlign(TRAIL_ALIGN_DEFAULTS)}
              >
                Reset
              </button>
            </div>
          )}
          <span className={`connection-dot ${connected ? 'connected' : 'disconnected'}`} />
        </div>
      </header>

      <div className="main-content">
        {/* Map */}
        <div className="map-area">
          <MapView
            telemetry={telemetry}
            satSamples={satSamples}
            boundaries={boundaries}
            mowPath={mowPath}
            showHeatmap={showHeatmap}
            selectedTaskZones={selectedTaskZones}
            trailPoints={displayTrail}
            overlayMirrorEW={overlayAlign.mirrorEW}
            overlayMirrorNS={overlayAlign.mirrorNS}
            overlayRotationDeg={overlayAlign.rot}
            overlayEastM={overlayAlign.eastM}
            overlayNorthM={overlayAlign.northM}
            trailRotationDeg={trailAlign.rot}
            trailEastM={trailAlign.eastM}
            trailNorthM={trailAlign.northM}
          />
        </div>

        {/* Sidebar */}
        {sidebarOpen && (
          <aside className="sidebar">
            <div className="sidebar-tabs">
              <button
                className={`sidebar-tab ${activeTab === 'dashboard' ? 'active' : ''}`}
                onClick={() => setActiveTab('dashboard')}
              >
                📊 Status
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'tasks' ? 'active' : ''}`}
                onClick={() => setActiveTab('tasks')}
              >
                📋 Tasks
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'camera' ? 'active' : ''}`}
                onClick={() => setActiveTab('camera')}
              >
                📷 Camera
              </button>
              <button
                className={`sidebar-tab ${activeTab === 'trail' ? 'active' : ''}`}
                onClick={() => setActiveTab('trail')}
              >
                🗺️ Trail
              </button>
            </div>

            <div className="sidebar-content">
              {activeTab === 'dashboard' && (
                <>
                  <MowerStatus telemetry={telemetry} connected={connected} />
                  <BatteryGauge
                    telemetry={telemetry}
                    activeSession={activeSession}
                    sessions={sessions}
                    onClearSessions={clearSessions}
                  />
                  <SatelliteInfo telemetry={telemetry} />
                  <button
                    className="btn-refresh"
                    onClick={() => refreshTelemetry().catch(console.error)}
                  >
                    🔄 Refresh Data
                  </button>
                </>
              )}
              {activeTab === 'tasks' && (
                <TaskList onSelectTask={handleSelectTask} onStartTask={handleStartTask} />
              )}
              {activeTab === 'camera' && (
                <CameraPanel />
              )}
              {activeTab === 'trail' && (
                <SessionHistory
                  sessions={trailSessions}
                  liveTrail={liveTrail}
                  replaySession={replaySession}
                  onSelectSession={setReplaySession}
                  onClear={clearTrail}
                />
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
