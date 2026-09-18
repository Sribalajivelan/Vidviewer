'use client';

export default function SourceTabs({ sources, currentSourceId, onSelect, onRemove, onAddClick }) {
  return (
    <>
      <div className="source-tabs">
        {sources.map((source) => (
          <div key={source.id} className={'source-tab' + (source.id === currentSourceId ? ' active' : '')}>
            <span onClick={() => onSelect(source.id)}>
              {source.type === 'ftp' ? '\u{1F4F1}' : source.type === 'url' ? '\u{1F517}' : '\u{1F4C1}'}{' '}
              {source.name}
            </span>
            <span
              className="remove"
              title="Remove source"
              onClick={(e) => {
                e.stopPropagation();
                onRemove(source);
              }}
            >
              &times;
            </span>
          </div>
        ))}
      </div>
      <button className="add-source-btn" onClick={onAddClick} title="Add a source">
        + Source
      </button>
    </>
  );
}
