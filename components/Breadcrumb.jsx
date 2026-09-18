'use client';

export default function Breadcrumb({ dir, onNavigate }) {
  const parts = dir ? dir.split('/').filter(Boolean) : [];
  let acc = '';

  return (
    <nav className="breadcrumb">
      <a onClick={() => onNavigate('')}>Home</a>
      {parts.map((part) => {
        acc = acc ? acc + '/' + part : part;
        const target = acc;
        return (
          <span key={target}>
            <span className="sep"> / </span>
            <a onClick={() => onNavigate(target)}>{part}</a>
          </span>
        );
      })}
    </nav>
  );
}
