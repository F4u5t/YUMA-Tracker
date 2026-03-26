import { useState, useEffect, useCallback } from 'react';
import { useMowerState } from './hooks/useMowerState';
import { useBatteryTracker } from './hooks/useBatteryTracker';
import { MapView } from './components/Map/MapView';
import { BatteryGauge } from './components/Dashboard/BatteryGauge';
import { SatelliteInfo } from './components/Dashboard/SatelliteInfo';
import { MowerStatus } from './components/Dashboard/MowerStatus';
import { TaskList } from './components/Tasks/TaskList';
import { CameraPanel } from './components/Camera/CameraPanel';
import { getBoundaries, getMowPath, refreshTelemetry } from './services/api';
import type { GeoJSONFeatureCollection } from './types/mower';
import './App.css';

type SidebarTab = 'dashboard' | 'tasks' | 'camera';

function App() {
  const { telemetry, satSamples, connected } = useMowerState();
  const [boundaries, setBoundaries] = useState<GeoJSONFeatureCollection | null>(null);
  const [mowPath, setMowPath] = useState<GeoJSONFeatureCollection | null>(null);
  const [showHeatmap, setShowHeatmap] = useState(false);
  const [selectedTaskZones, setSelectedTaskZones] = useState<number[]>([]);
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [activeTaskName, setActiveTaskName] = useState('');

  const { activeSession, sessions, clearSessions } = useBatteryTracker(telemetry, activeTaskName);

  // Load map data on mount
  useEffect(() => {
    getBoundaries().then(setBoundaries).catch(console.error);
    getMowPath().then(setMowPath).catch(console.error);

    // Refresh mow path periodically
    const interval = setInterval(() => {
      getMowPath().then(setMowPath).catch(() => {});
    }, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleSelectTask = useCallback((zoneHashs: number[]) => {
    setSelectedTaskZones(zoneHashs);
  }, []);

  const handleStartTask = useCallback((taskName: string, zoneHashs: number[]) => {
    setActiveTaskName(taskName);
    setSelectedTaskZones(zoneHashs);
  }, []);

  return (
    <div className="app">
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
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default App;
