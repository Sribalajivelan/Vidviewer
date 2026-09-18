'use client';

import { useEffect, useState } from 'react';
import MarqueeText from './MarqueeText';

const POLL_MS = 1500;

// Self-polling: only mounted while the Converting tab is active, so it
// naturally stops polling the instant the user switches away.
export default function ConvertingView({ onPlay }) {
  const [jobs, setJobs] = useState(null); // null = still loading the first page

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const res = await fetch('/api/convert');
        const list = await res.json();
        if (!cancelled && Array.isArray(list)) setJobs(list);
      } catch {
        // Transient fetch hiccup; keep showing the last known list.
      }
    }

    load();
    const timer = setInterval(load, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, []);

  if (jobs === null) return null;
  if (!jobs.length) {
    return (
      <div className="empty">
        No conversions yet - when a video won&apos;t play on a device, open it and use &quot;Convert to MP4&quot;.
      </div>
    );
  }

  return (
    <div className="converting-list">
      {jobs.map((job) => (
        <div key={job.id} className={`converting-item converting-${job.status}`}>
          <div className="icon">&#127916;</div>
          <div className="converting-info">
            <MarqueeText text={job.name} className="name" />
            <div className="source-name">{job.sourceName}</div>
            {job.status === 'running' && (
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${job.percent || 0}%` }} />
              </div>
            )}
            {job.status === 'error' && <div className="form-error">{job.error}</div>}
          </div>
          <div className="converting-status">
            {job.status === 'running' && <span>{job.percent}%</span>}
            {job.status === 'done' && (
              <button className="add-source-btn" onClick={() => onPlay(job)}>Play</button>
            )}
            {job.status === 'error' && <span className="converting-badge">Failed</span>}
          </div>
        </div>
      ))}
    </div>
  );
}
