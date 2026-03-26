import { useState, useEffect, useCallback } from 'react';
import type { TaskPlan, Zone } from '../../types/mower';
import { JOB_MODE_LABELS } from '../../types/mower';
import { getPlans, getZones, startPlan, sendCommand } from '../../services/api';

interface TaskListProps {
  onSelectTask: (zoneHashs: number[]) => void;
  onStartTask?: (taskName: string, zoneHashs: number[]) => void;
}

export function TaskList({ onSelectTask, onStartTask }: TaskListProps) {
  const [plans, setPlans] = useState<TaskPlan[]>([]);
  const [_zones, setZones] = useState<Zone[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeAction, setActiveAction] = useState<string | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadPlans = useCallback(() => {
    setLoading(true);
    Promise.all([getPlans(), getZones()])
      .then(([p, z]) => {
        setPlans(p);
        setZones(z);
        setError(null);
      })
      .catch((err) => setError(err.message))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { loadPlans(); }, [loadPlans]);

  const handleSelectPlan = useCallback((plan: TaskPlan) => {
    if (selectedPlanId === plan.plan_id) {
      setSelectedPlanId(null);
      onSelectTask([]);
    } else {
      setSelectedPlanId(plan.plan_id);
      onSelectTask(plan.zone_hashs);
    }
  }, [selectedPlanId, onSelectTask]);

  const handleStart = useCallback(async (plan: TaskPlan) => {
    if (!confirm('Start this mowing task?')) return;
    setActiveAction('starting');
    try {
      await startPlan(plan.plan_id);
      onStartTask?.(plan.task_name, plan.zone_hashs);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
    setActiveAction(null);
  }, [onStartTask]);

  const handleCommand = useCallback(async (cmd: 'pause' | 'resume' | 'dock' | 'cancel') => {
    if (cmd === 'cancel' && !confirm('Cancel the current job?')) return;
    setActiveAction(cmd);
    try {
      await sendCommand(cmd);
      setError(null);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed');
    }
    setActiveAction(null);
  }, []);

  if (loading) return <div className="panel-card">Loading plans...</div>;

  return (
    <div className="task-panel">
      {/* Control buttons */}
      <div className="control-buttons">
        <button className="btn btn-yellow" onClick={() => handleCommand('pause')} disabled={!!activeAction}>
          ⏸ Pause
        </button>
        <button className="btn btn-green" onClick={() => handleCommand('resume')} disabled={!!activeAction}>
          ▶ Resume
        </button>
        <button className="btn btn-blue" onClick={() => handleCommand('dock')} disabled={!!activeAction}>
          🏠 Dock
        </button>
        <button className="btn btn-red" onClick={() => handleCommand('cancel')} disabled={!!activeAction}>
          ✕ Cancel
        </button>
      </div>

      {error && <div className="error-toast">{error}</div>}

      {/* Sync button */}
      <button
        className="btn-refresh"
        onClick={() => { loadPlans(); }}
        disabled={loading}
        style={{ marginBottom: '8px' }}
      >
        {loading ? '⏳ Syncing...' : '🔄 Sync Tasks'}
      </button>

      {/* Task plans */}
      <div className="task-list">
        {plans.length === 0 && !loading && <div className="no-tasks">No tasks found. Try Sync Tasks, or create them in the Mammotion app.</div>}
        {plans.map((plan) => {
          const isSelected = selectedPlanId === plan.plan_id;
          return (
            <div
              key={plan.plan_id}
              className={`task-card ${isSelected ? 'task-card-selected' : ''}`}
              onClick={() => handleSelectPlan(plan)}
            >
              <div className="task-card-header">
                <span className="task-card-title">
                  {plan.task_name
                    || (plan.zone_names.length > 0
                      ? plan.zone_names.join(', ')
                      : `Task ${plans.indexOf(plan) + 1}`)
                  }
                </span>
                <span className="badge badge-gray">{JOB_MODE_LABELS[plan.job_mode] ?? 'Unknown'}</span>
              </div>
              <div className="task-card-details">
                <span>Speed: {(plan.speed * 100).toFixed(0)}%</span>
                <span>Height: {plan.knife_height}mm</span>
                <span>Passes: {plan.edge_mode}</span>
              </div>
              <button
                className="btn btn-green btn-sm"
                onClick={(e) => {
                  e.stopPropagation();
                  handleStart(plan);
                }}
                disabled={!!activeAction}
              >
                ▶ Start
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
