'use client';

import { formatTime } from '../lib/mediaUrl';

export default function RecentStrip({ rows, onOpen }) {
  if (!rows.length) return null;

  return (
    <section className="recent-section">
      <h2>Continue Watching</h2>
      <div className="recent-strip">
        {rows.map((row) => {
          const pct = row.duration ? Math.min(100, (row.position / row.duration) * 100) : 0;
          return (
            <div key={row.id} className="recent-card" onClick={() => onOpen(row)}>
              <div className="icon">&#127916;</div>
              <div className="name">{row.name}</div>
              <div className="source-name">
                {row.sourceName} &middot; {formatTime(row.position)}
                {row.duration ? ' / ' + formatTime(row.duration) : ''}
              </div>
              <div className="progress-track">
                <div className="progress-fill" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
