'use client';

import { mediaUrl } from '../lib/mediaUrl';

export default function MediaGrid({ sourceId, folders, files, recentByKey, onOpenFolder, onOpenVideo, onOpenImage }) {
  if (!folders.length && !files.length) {
    return <div className="empty">No folders, videos, or images here.</div>;
  }

  const imageFiles = files.filter((f) => f.type === 'image');

  return (
    <div className="entries">
      {folders.map((folder) => (
        <div key={folder.path} className="entry" onClick={() => onOpenFolder(folder.path)}>
          <div className="icon">&#128193;</div>
          <div className="name">{folder.name}</div>
        </div>
      ))}

      {files.map((file) => {
        if (file.type === 'video') {
          const progress = recentByKey.get(`${sourceId}::${file.path}`);
          const pct = progress && progress.duration ? Math.min(100, (progress.position / progress.duration) * 100) : null;
          return (
            <div key={file.path} className="entry" onClick={() => onOpenVideo(file)}>
              <div className="icon">&#127916;</div>
              {pct != null && (
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%` }} />
                </div>
              )}
              <div className="name">{file.name}</div>
            </div>
          );
        }

        const index = imageFiles.findIndex((f) => f.path === file.path);
        return (
          <div key={file.path} className="entry" onClick={() => onOpenImage(imageFiles, index)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img className="thumb" loading="lazy" src={mediaUrl(sourceId, file.path)} alt={file.name} />
            <div className="name">{file.name}</div>
          </div>
        );
      })}
    </div>
  );
}
