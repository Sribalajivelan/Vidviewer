'use client';

import { useEffect, useRef, useState } from 'react';

// Truncates with an ellipsis by default; on hover, if the text actually
// overflows its container, slides it back and forth so the full name is
// readable without needing more space (like a "now playing" ticker).
export default function MarqueeText({ text, className }) {
  const containerRef = useRef(null);
  const textRef = useRef(null);
  const [overflowPx, setOverflowPx] = useState(0);

  useEffect(() => {
    function measure() {
      const container = containerRef.current;
      const el = textRef.current;
      if (!container || !el) return;
      setOverflowPx(Math.max(0, el.scrollWidth - container.clientWidth));
    }
    measure();
    window.addEventListener('resize', measure);
    return () => window.removeEventListener('resize', measure);
  }, [text]);

  const overflowing = overflowPx > 0;
  const wrapClass = ['marquee', className, overflowing && 'marquee-overflowing'].filter(Boolean).join(' ');

  return (
    <div className={wrapClass} ref={containerRef} title={text}>
      <span className="marquee-static">{text}</span>
      <span
        ref={textRef}
        className="marquee-scroll"
        style={overflowing ? { '--marquee-distance': `-${overflowPx}px` } : undefined}
      >
        {text}
      </span>
    </div>
  );
}
