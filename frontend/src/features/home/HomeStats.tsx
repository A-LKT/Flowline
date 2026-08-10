import { useEffect, useState } from 'react';

type Bucket = { hour: number; success: number; error: number };
type Stats = {
  totalRuns: number;
  successCount: number;
  errorCount: number;
  avgDuration: number | null;
  liveCount: number;
  buckets: Bucket[];
};

function fmtDuration(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)}ms` : `${(ms / 1000).toFixed(1)}s`;
}

export const HomeStats = () => {
  const [stats, setStats] = useState<Stats | null>(null);
  const [loading, setLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/stats');
        if (res.ok) {
          setStats(await res.json() as Stats);
          setFailed(false);
        } else {
          setFailed(true);
        }
      } catch {
        setFailed(true);
      } finally {
        setLoading(false);
      }
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) return (
    <div className="home-stats-loading">
      <span className="home-stats-spinner" />
      Loading stats…
    </div>
  );

  if (failed && !stats) return (
    <div className="home-stats-error">
      Could not load stats — backend may not be running
    </div>
  );

  if (!stats) return null;

  const successRate = stats.totalRuns > 0
    ? Math.round((stats.successCount / stats.totalRuns) * 100)
    : null;

  const rateTone =
    successRate == null ? undefined :
    successRate >= 90   ? 'green' :
    successRate >= 70   ? 'amber' : 'red';

  const maxBucketTotal = Math.max(1, ...stats.buckets.map(b => b.success + b.error));

  return (
    <>
      <div className="home-kpis">
        <div className="home-kpi">
          <span className="home-kpi-value">{stats.totalRuns}</span>
          <span className="home-kpi-label">runs</span>
        </div>
        <div className="home-kpi">
          <span className="home-kpi-value" data-tone={rateTone}>
            {successRate != null ? `${successRate}%` : '—'}
          </span>
          <span className="home-kpi-label">success</span>
        </div>
        <div className="home-kpi">
          <span className="home-kpi-value">
            {stats.avgDuration != null ? fmtDuration(stats.avgDuration) : '—'}
          </span>
          <span className="home-kpi-label">avg duration</span>
        </div>
        <div className="home-kpi">
          <span className="home-kpi-value" data-tone={stats.liveCount > 0 ? 'amber' : undefined}>
            {stats.liveCount}
          </span>
          <span className="home-kpi-label">running</span>
        </div>
      </div>

      <div className="home-chart-wrap">
        <div className="home-chart">
          {stats.buckets.map((b) => {
            const total = b.success + b.error;
            const heightPct = (total / maxBucketTotal) * 100;
            const successFlex = total > 0 ? b.success / total : 0;
            const errorFlex   = total > 0 ? b.error   / total : 0;
            return (
              <div
                key={b.hour}
                className="home-chart-col"
                title={total > 0 ? `${b.success} success, ${b.error} error` : 'no runs'}
              >
                {total > 0 && (
                  <div className="home-chart-bar" style={{ height: `${Math.max(heightPct, 4)}%` }}>
                    {b.error   > 0 && <div className="home-chart-seg home-chart-seg--error"   style={{ flex: errorFlex }} />}
                    {b.success > 0 && <div className="home-chart-seg home-chart-seg--success" style={{ flex: successFlex }} />}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        <div className="home-chart-axis">
          <span>24h ago</span>
          <span>now</span>
        </div>
      </div>
    </>
  );
};
