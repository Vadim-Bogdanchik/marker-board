import { useState } from 'react';
import { maxColumns, stages, type Board, type Stage } from '../shared/model';
import type { Act } from './BoardView';
import { Icon, Modal } from './ui';

const stageNames: Record<Stage, string> = {
  inbox: 'Сбор задач', todo: 'Запланировано', doing: 'В работе', review: 'Согласование', done: 'Завершено',
};
const widths = [[55, 'Узкая'], [100, 'Обычная'], [150, 'Широкая']] as const;
export type ColumnPanel = {kind: 'list' | 'add'} | {kind: 'edit' | 'remove'; id: string};

type Props = {
  board: Board; act: Act; busy: boolean; panel: ColumnPanel;
  open: (panel: ColumnPanel) => void; onClose: () => void;
};

export function ColumnManager({board, act, busy, panel, open, onClose}: Props) {
  const column = 'id' in panel ? board.columns.find(c => c.id === panel.id) : undefined;
  const [title, setTitle] = useState(column?.title ?? '');
  const [stage, setStage] = useState<Stage>('todo');
  const [destination, setDestination] = useState('');
  const tasks = column ? board.tasks.filter(t => t.columnId === column.id) : [];
  const hasArchive = tasks.some(t => t.archived);
  const targets = board.columns.filter(c => c.id !== column?.id && (!hasArchive || c.stage === 'done'));
  const heading = panel.kind === 'add' ? 'Новая колонка' : panel.kind === 'remove' ? 'Удалить колонку?' : panel.kind === 'edit' ? 'Настройки колонки' : 'Колонки доски';

  return <Modal title={heading} className="mobile-sheet" onClose={onClose}><fieldset disabled={busy}>
    {panel.kind === 'list' && <>
      <button className="marker-button" disabled={board.columns.length >= maxColumns} onClick={() => open({kind:'add'})}>+ Добавить колонку</button>
      <div className="column-settings-list">{board.columns.map(c => <div className="column-settings-row" key={c.id}>
        <button className="column-list-name" onClick={() => open({kind:'edit',id:c.id})}>{c.title}<small>{stageNames[c.stage]}</small></button>
        <select aria-label={`Ширина колонки «${c.title}»`} value={c.width}
          onChange={e => void act({type:'resizeColumns',changes:[{id:c.id,width:Number(e.target.value)}]})}>
          {!widths.some(([value]) => value === c.width) && <option value={c.width}>{c.width}%</option>}
          {widths.map(([value,label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <button className="column-remove" aria-label={`Удалить колонку «${c.title}»`} title="Удалить колонку"
          disabled={board.columns.length === 1} onClick={() => open({kind:'remove',id:c.id})}><Icon name="trash" size={20}/></button>
      </div>)}</div>
    </>}
    {(panel.kind === 'add' || (panel.kind === 'edit' && column)) && <>
      <form onSubmit={async e => {
        e.preventDefault();
        const action = column ? {type:'renameColumn' as const,id:column.id,title} : {type:'addColumn' as const,title,stage};
        if (await act(action)) onClose();
      }}>
        <label className="field"><span>Название</span><input data-initial-focus required maxLength={60} placeholder="Например, Backlog" value={title} onChange={e => setTitle(e.target.value)}/></label>
        {!column && <label className="field"><span>Этап работы</span><select value={stage} onChange={e => setStage(e.target.value as Stage)}>
          {stages.map(s => <option key={s} value={s}>{stageNames[s]}</option>)}</select></label>}
        <button className="marker-button" disabled={!title.trim() || (!column && board.columns.length >= maxColumns)}>{column ? 'Сохранить' : 'Добавить колонку'}</button>
      </form>
      {column && <div className="column-danger"><button className="column-delete-action" disabled={board.columns.length === 1}
        onClick={() => open({kind:'remove',id:column.id})}><Icon name="trash" size={19}/> Удалить колонку</button>
        {board.columns.length === 1 && <small>На доске нужна хотя бы одна колонка.</small>}</div>}
    </>}
    {panel.kind === 'remove' && column && <>
      <p><strong>{column.title}</strong>{tasks.length ? '' : ' — пустая колонка.'}</p>
      {tasks.length > 0 && <label className="field"><span>Куда перенести задачи ({tasks.length})?</span>
        <select value={destination} onChange={e => setDestination(e.target.value)}><option value="">Выберите колонку</option>
          {targets.map(c => <option key={c.id} value={c.id}>{c.title}</option>)}</select></label>}
      {hasArchive && <p className="hint">{targets.length ? 'Архивные задачи останутся в архиве.' : 'Сначала добавьте ещё одну колонку типа «Завершено» для задач из архива.'}</p>}
      <div className="column-confirm"><button data-initial-focus onClick={onClose}>Отмена</button>
        <button className="column-delete-action" disabled={board.columns.length === 1 || (!!tasks.length && !targets.some(c => c.id === destination))}
          onClick={async () => {if (await act({type:'deleteColumn',id:column.id,destination:destination || undefined})) onClose();}}>
          {tasks.length ? 'Перенести задачи и удалить колонку' : 'Удалить колонку'}
        </button></div>
    </>}
    {'id' in panel && !column && <p>Эта колонка уже удалена.</p>}
  </fieldset></Modal>;
}
