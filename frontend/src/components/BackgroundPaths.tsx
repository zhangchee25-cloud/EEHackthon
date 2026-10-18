import { memo } from 'react';

/** Original SVG implementation inspired by Kokonut UI's Background Paths. */
export default memo(function BackgroundPaths() {
  return <div className="background-paths" aria-hidden="true"><svg viewBox="0 0 1440 820" fill="none" preserveAspectRatio="xMidYMid slice" focusable="false">
    {[false, true].map(mirror => <g key={String(mirror)} transform={mirror ? 'translate(1440 0) scale(-1 1)' : undefined}>
      {Array.from({ length: 30 }, (_, i) => {
        const d = `M ${-230 + i * 9} ${-150 + i * 13} C ${400 + i * 4} ${-80 + i * 6}, ${-280 + i * 8} ${360 + i * 6}, ${300 + i * 11} ${580 + i * 7} S ${700 + i * 8} ${820 + i * 5}, ${830 + i * 10} 1000`;
        return <g key={i}><path d={d} className="background-path" strokeWidth=".8" />{i % 4 === 0 && <path d={d} className="background-path-flow" pathLength="100" strokeWidth="1.2" style={{ animationDuration: `${18 + i * .5}s`, animationDelay: `${-i * 1.7}s` }} />}</g>;
      })}
    </g>)}
  </svg></div>;
});
