import { useState, useEffect, useRef } from 'react';
import { getCameraToken } from '../../services/api';
import type { CameraToken } from '../../types/mower';

export function CameraPanel() {
  const [token, setToken] = useState<CameraToken | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const videoRef = useRef<HTMLDivElement>(null);
  const clientRef = useRef<any>(null);

  const startCamera = async () => {
    setLoading(true);
    setError(null);
    try {
      const t = await getCameraToken();
      setToken(t);
      await connectAgora(t);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to get camera token');
    }
    setLoading(false);
  };

  const connectAgora = async (t: CameraToken) => {
    try {
      const AgoraRTC = (await import('agora-rtc-sdk-ng')).default;
      const client = AgoraRTC.createClient({ mode: 'live', codec: 'vp8', role: 'audience' });
      clientRef.current = client;

      client.on('user-published', async (user, mediaType) => {
        await client.subscribe(user, mediaType);
        if (mediaType === 'video') {
          const track = user.videoTrack;
          if (track && videoRef.current) {
            track.play(videoRef.current);
          }
        }
      });

      await client.join(t.appId, t.channelName, t.token, t.uid);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Agora connection failed');
    }
  };

  const stopCamera = async () => {
    if (clientRef.current) {
      await clientRef.current.leave();
      clientRef.current = null;
    }
    setToken(null);
    if (videoRef.current) {
      videoRef.current.innerHTML = '';
    }
  };

  useEffect(() => {
    return () => {
      if (clientRef.current) {
        clientRef.current.leave().catch(() => {});
      }
    };
  }, []);

  return (
    <div className="panel-card camera-panel">
      <div className="panel-card-header">
        <span>📷 Camera</span>
        {token ? (
          <button className="btn btn-red btn-sm" onClick={stopCamera}>Stop</button>
        ) : (
          <button className="btn btn-green btn-sm" onClick={startCamera} disabled={loading}>
            {loading ? 'Connecting...' : 'Start'}
          </button>
        )}
      </div>
      {error && <div className="error-toast">{error}</div>}
      <div ref={videoRef} className="camera-video">
        {!token && !loading && <div className="camera-placeholder">Click Start to view camera</div>}
      </div>
    </div>
  );
}
