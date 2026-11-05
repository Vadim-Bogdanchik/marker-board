import { useRef, type PointerEvent } from 'react';
import { minColumnWidth, maxColumnWidth, type Board } from '../shared/model';

type Column = Board['columns'][number];
export type WidthChange = Pick<Column, 'id' | 'width'>;
type Props = {
  left: Column; right: Column; disabled: boolean; index: number;
  preview: (changes: WidthChange[]) => void; save: (changes: WidthChange[]) => void;
};
const ink = [
  'M4.4 .2 Q5.4 -.2 6.1 .6 C4.8 18 9.4 37 7 55 S5.1 84 6.4 99.3 Q6.4 100 4.7 99.7 C3.2 84 3.9 68 4.8 55 S3.2 19 4.4 .2Z',
  'M6 .2 Q7 -.2 7 1 C7.3 16 3.2 42 4.9 61 S7.2 87 6.3 99.5 Q5.6 100 4.9 99.4 C5.4 85 3 71 3.1 60 S5.8 20 6 .2Z',
  'M4.6 .4 Q5.7 -.2 6 .8 C5.6 17 7.8 30 6 46 S5.4 78 7.1 99.2 Q6.9 100 5.6 99.6 C3.9 83 2.9 60 4.6 45 S4.2 17 4.6 .4Z',
];

export function ColumnDivider({left,right,disabled,index,preview,save}: Props) {
  const drag = useRef<{pointer: number; x: number; unit: number} | null>(null);
  const total = left.width + right.width;
  const min = Math.max(minColumnWidth, total - maxColumnWidth);
  const max = Math.min(maxColumnWidth, total - minColumnWidth);
  const changes = (width: number) => {
    const value = Math.max(min, Math.min(max, Math.round(width)));
    return [{id:left.id, width:value}, {id:right.id, width:total-value}];
  };
  const delta = (e: PointerEvent) => {
    const start = drag.current;
    if (!start || start.pointer !== e.pointerId) return null;
    return changes(left.width + (e.clientX - start.x) / start.unit);
  };
  return <div className="column-divider" role="separator" tabIndex={disabled ? -1 : 0}
    aria-label={`Ширина колонок «${left.title}» и «${right.title}»`} aria-orientation="vertical"
    aria-valuemin={min} aria-valuemax={max} aria-valuenow={left.width} aria-disabled={disabled}
    title="Потяните разделитель или нажмите ← / →" onPointerDown={e => {
      if (disabled || !e.isPrimary || e.button !== 0) return;
      const section = e.currentTarget.closest('section')!;
      const previous = section.previousElementSibling!;
      const pixels = section.getBoundingClientRect().width + previous.getBoundingClientRect().width;
      drag.current = {pointer:e.pointerId, x:e.clientX, unit:pixels/total};
      e.currentTarget.setPointerCapture(e.pointerId);
    }} onPointerMove={e => {const next = delta(e); if (next) preview(next);}}
    onPointerUp={e => {
      const next = delta(e); if (!next) return;
      drag.current = null;
      if (next[0].width !== left.width) save(next); else preview([]);
    }} onLostPointerCapture={() => {if (drag.current) {drag.current=null; preview([]);}}}
    onKeyDown={e => {
      if (disabled || !['ArrowLeft','ArrowRight'].includes(e.key)) return;
      e.preventDefault();
      const next = changes(left.width + (e.key === 'ArrowLeft' ? -5 : 5));
      if (next[0].width !== left.width) save(next);
    }}>
    <svg aria-hidden="true" viewBox="0 0 12 100" preserveAspectRatio="none">
      <path d={ink[index % ink.length]} fill="currentColor"/>
      <path d={ink[index % ink.length]} transform="translate(.7 .1) scale(1 .996)" fill="currentColor" opacity=".23"/>
    </svg>
  </div>;
}
