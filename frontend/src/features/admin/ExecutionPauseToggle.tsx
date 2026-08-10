import { useEffect, useState } from 'react';
import { Pause, Play } from 'lucide-react';

// Reads and toggles the server-wide execution pause (GET/POST /admin/execution).
// Pausing holds automated runs (schedule, webhook, file-watch, email, catch-up);
// manual runs from the Run panel are unaffected — the label says so explicitly.
export const ExecutionPauseToggle = () => {
  const [paused, setPaused] = useState<boolean | null>(null);
  const [busy, setBusy]     = useState(false);
  const [error, setError]   = useState(false);

  useEffect(() => {
    let cancelled = false;
    void fetch('/admin/execution')
      .then((r) => (r.ok ? r.json() as Promise<{ paused: boolean }> : null))
      .then((d) => {
        if (cancelled) return;
        if (d) setPaused(d.paused); else setError(true);
      })
      .catch(() => { if (!cancelled) setError(true); });
    return () => { cancelled = true; };
  }, []);

  const toggle = async () => {
    if (paused === null || busy) return;
    setBusy(true);
    setError(false);
    try {
      const res = await fetch('/admin/execution', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ paused: !paused }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const d = await res.json() as { paused: boolean };
      setPaused(d.paused);
    } catch {
      setError(true);
    } finally {
      setBusy(false);
    }
  };

  const isPaused = paused === true;

  return (
    <div className={`exec-pause${isPaused ? ' exec-pause--paused' : ''}`}>
      <div className="exec-pause-info">
        <span className={`exec-pause-dot${paused === null ? '' : isPaused ? ' exec-pause-dot--paused' : ' exec-pause-dot--running'}`} />
        <div className="exec-pause-text">
          <span className="exec-pause-state">
            {paused === null
              ? 'Automated execution…'
              : isPaused
                ? 'Automated execution paused'
                : 'Automated execution running'}
          </span>
          <span className="exec-pause-hint">
            {isPaused
              ? 'Scheduled, webhook, file-watch and email runs are held. Manual runs still work.'
              : 'Schedules, webhooks, file-watch and email triggers fire normally.'}
          </span>
        </div>
      </div>
      <button
        className={isPaused ? 'btn-primary btn-sm' : 'btn-secondary btn-sm'}
        onClick={() => void toggle()}
        disabled={paused === null || busy}
        title={isPaused ? 'Resume automated execution' : 'Pause automated execution'}
      >
        {isPaused
          ? <><Play size={13} strokeWidth={2} /> Resume</>
          : <><Pause size={13} strokeWidth={2} /> Pause</>}
      </button>

      {error && (
        <div className="exec-pause-error">
          Couldn’t reach the server — the state shown may be out of date.
        </div>
      )}
    </div>
  );
};
