import { useEffect, useState } from 'react';

type Service = {
  name: string;
  url: string;
  healthPath?: string;
  online: boolean;
};

export const ServiceStatus = () => {
  const [services, setServices] = useState<Service[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const res = await fetch('/services/status');
        if (res.ok) setServices(await res.json() as Service[]);
      } catch { /* backend unreachable */ }
      setLoading(false);
    };
    void load();
    const id = setInterval(() => void load(), 30_000);
    return () => clearInterval(id);
  }, []);

  if (loading) {
    return (
      <div className="home-chips">
        <div className="home-chip">
          <span className="home-chip-spinner" />
          <span className="home-chip-name home-chip-name--muted">checking services…</span>
        </div>
      </div>
    );
  }

  if (services.length === 0) return null;

  return (
    <div className="home-chips">
      {services.map((svc) => (
        <div key={svc.name} className={`home-chip${svc.online ? '' : ' home-chip--offline'}`}>
          <span className={`home-chip-dot${svc.online ? ' home-chip-dot--online' : ' home-chip-dot--offline'}`} />
          <span className="home-chip-name">{svc.name}</span>
          <span className={`home-chip-status${svc.online ? ' home-chip-status--online' : ''}`}>
            {svc.online ? 'online' : 'offline'}
          </span>
        </div>
      ))}
    </div>
  );
};
