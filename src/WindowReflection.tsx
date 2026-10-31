import { useEffect, useState, type CSSProperties } from 'react';

// Each photograph is a whole twig: its leaves retain their shapes as the stem sways.
// Near and distant branches overlap behind the stationary window's alpha openings.
const branches = [
  ...Array.from({ length: 16 }, (_, i) => ({
    x: -35 + (i % 2) * 103, y: -75 + Math.floor(i / 2) * 145,
    size: 190 + (i % 3) * 18, depth: 'far', variant: i % 3 === 0 ? 'b' : 'a',
    angle: (i % 5 - 2) * 17, phase: -4 - (i % 4) * .35,
  })),
  ...Array.from({ length: 18 }, (_, i) => ({
    x: -75 + (i % 3) * 76, y: 65 + Math.floor(i / 3) * 160,
    size: 155 + (i % 4) * 12, depth: 'near', variant: i % 2 ? 'a' : 'b',
    angle: (i % 5 - 2) * 13, phase: -4.5 - (i % 6) * .19,
  })),
];

export function WindowReflection() {
  const [hidden, setHidden] = useState(document.hidden);
  useEffect(() => {
    const update = () => setHidden(document.hidden);
    document.addEventListener('visibilitychange', update);
    return () => document.removeEventListener('visibilitychange', update);
  }, []);
  return <div className="window-photograph" aria-hidden="true" data-paused={hidden}>
    <div className="window-garden">
      {branches.map((branch, i) => <div key={i} className={`garden-branch ${branch.depth}`} style={{
        left: `${branch.x / 1586 * 100}%`, top: `${branch.y / 992 * 100}%`,
        width: `${branch.size / 1586 * 100}%`,
        '--rest-angle': `${branch.angle}deg`, '--wind-delay': `${branch.phase}s`,
        '--tip-delay': `${-i * .53}s`, '--tip-duration': `${5.1 + i % 4 * .7}s`,
        '--stem-origin': branch.variant === 'a' ? '96% 96%' : '4% 96%',
      } as CSSProperties}>
        <div className="branch-wind"><img className="branch-tip" src={`/materials/foliage-branch-${branch.variant}.png`} alt="" draggable={false}/></div>
      </div>)}
    </div>
    <img className="window-foreground" src="/materials/window-foreground.png" alt="" draggable={false}/>
  </div>;
}
