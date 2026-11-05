import { useState } from 'react';
import { linkedDirectoryIds, type Board, type Directory } from '../shared/model';
import type { Act } from './BoardView';

type Kind = Directory['kind'];
const labels: Record<Kind,string> = {person:'Люди',team:'Команды',project:'Проекты'};
const relatedKinds: Record<Kind,Kind[]> = {person:['team'],team:['person','project'],project:['team']};

export function DirectorySettings({board,act}: {board:Board; act:Act}) {
  const [kind,setKind] = useState<Kind>('person');
  const [editId,setEditId] = useState('');
  const [name,setName] = useState('');
  const [chosen,setChosen] = useState(new Set<string>());

  function edit(item?:Directory) {
    setEditId(item?.id ?? '');
    setName(item?.name ?? '');
    setChosen(item ? linkedDirectoryIds(board.directoryLinks,item.id) : new Set());
  }

  const names = new Map(board.directories.map(d => [d.id,d.name]));
  const summaries = new Map<string,string[]>();
  for (const {memberId,groupId} of board.directoryLinks) {
    for (const [id,other] of [[memberId,groupId],[groupId,memberId]]) {
      if (!summaries.has(id)) summaries.set(id,[]);
      summaries.get(id)!.push(names.get(other)!);
    }
  }

  return <section className="form-section"><h3>Люди, команды и проекты</h3>
    <div className="small-tabs">{(['person','team','project'] as const).map(k =>
      <button key={k} className={k === kind ? 'active' : ''} aria-pressed={k === kind} onClick={() => {setKind(k); edit();}}>{labels[k]}</button>
    )}</div>
    <div className="directory-list">{board.directories.filter(d => d.kind === kind).map(d =>
      <div key={d.id}><span>{d.name}<small className="directory-links-summary">{summaries.get(d.id)?.join(' · ')}</small></span>
        <button aria-label={`Изменить ${d.name}`} onClick={() => edit(d)}>✎</button>
        <button aria-label={`Удалить ${d.name}`} onClick={async () => {
          if (window.confirm(`Удалить «${d.name}» из справочника вместе со связями?`) && await act({type:'deleteDirectory',id:d.id}) && editId === d.id) edit();
        }}>×</button>
      </div>)}</div>
    <form onSubmit={async e => {
      e.preventDefault();
      if (await act({type:'saveDirectory',item:{id:editId || crypto.randomUUID(),kind,name},linkedIds:[...chosen]})) edit();
    }}>
      <label className="field"><span>{kind === 'person' ? 'Имя сотрудника' : kind === 'team' ? 'Название команды' : 'Название проекта'}</span>
        <input value={name} required maxLength={100} onChange={e => setName(e.target.value)}/>
      </label>
      {relatedKinds[kind].map(k => {
        const options = board.directories.filter(d => d.kind === k);
        return <fieldset className="directory-members" key={k}><legend>{k === 'person' ? 'Участники команды' : labels[k]}</legend>
          {options.length ? <div>{options.map(d => <label key={d.id} className="checkline">
            <input type="checkbox" checked={chosen.has(d.id)} onChange={e => {
              const next = new Set(chosen);
              if (e.target.checked) next.add(d.id); else next.delete(d.id);
              setChosen(next);
            }}/>{d.name}</label>)}</div> : <small>Добавьте записи на вкладке «{labels[k]}».</small>}
        </fieldset>;
      })}
      <button className="text-button" disabled={!name.trim()}>{editId ? 'Сохранить' : '+ Добавить'}</button>
      {editId && <button type="button" onClick={() => edit()}>Отмена</button>}
    </form>
  </section>;
}
