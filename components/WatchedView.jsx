'use client';

import MarqueeText from './MarqueeText';
import { formatTime } from '../lib/mediaUrl';

export default function WatchedView({ rows, onOpen }) {
  if (!rows.length) {
    return <div className="empty">No watch history yet - videos you play will show up here.</div>;
  }

  return (
    <div className="watched-grid">
      {rows.map((row) => {
        const pct = row.duration ? Math.min(100, (row.position / row.duration) * 100) : 0;
        return (
          <div key={row.id} className="recent-card" onClick={() => onOpen(row)}>
            <div className="icon">&#127916;</div>
            <MarqueeText text={row.name} className="name" />
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
  );
}
