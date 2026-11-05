import { useState, useRef } from 'react';
import { z } from 'zod';
import { DirectorySettings } from './DirectorySettings';
import type { Board } from '../shared/model';
import { backupSchema, validateBoard } from '../shared/model';
import type { Act } from './BoardView';
import { Modal, Icon } from './ui';
export function Settings({board,act,onClose,busy}:{board:Board;act:Act;onClose:()=>void;busy:boolean}) {
  const [error,setError]=useState('');
  const [limit,setLimit]=useState(board.settings.wipLimit),[backup,setBackup]=useState<ReturnType<typeof backupSchema.parse>|null>(null);
  const fileRef=useRef<HTMLInputElement>(null);
  async function readBackup(file:File) {
    try {if(file.size>12*1024*1024)throw new Error('Файл слишком большой (до 12 МБ).');const parsed=backupSchema.parse(JSON.parse(await file.text()));validateBoard(parsed.board);setBackup(parsed);setError('');}
    catch(e){setError(`Копия не загружена: ${e instanceof z.ZodError?'неверный формат или версия. Выберите JSON, скачанный из настроек доски.':e instanceof SyntaxError?'файл не содержит корректный JSON.':e instanceof Error?e.message:'проверьте формат файла'}`);}finally{if(fileRef.current)fileRef.current.value='';}
  }
  return <Modal title="Настройки доски" onClose={onClose}><fieldset disabled={busy}>
    <section className="form-section"><h3>Свет и отражение</h3><div className="two-fields"><button className={board.settings.theme==='day'?'marker-button':''} onClick={()=>act({type:'settings',settings:{...board.settings,theme:'day'}})}><Icon name="sun"/> День</button><button className={board.settings.theme==='night'?'marker-button':''} onClick={()=>act({type:'settings',settings:{...board.settings,theme:'night'}})}><Icon name="moon"/> Вечер</button></div><label className="checkline"><input type="checkbox" checked={!board.settings.motion} onChange={e=>act({type:'settings',settings:{...board.settings,motion:!e.target.checked}})}/> Отключить отражение</label><p className="hint">Полностью убирает отражение окна и зелени за стеклом. Системная настройка уменьшения движения оставляет листву неподвижной.</p></section>
    <section className="form-section"><h3>Лимит задач в работе</h3><form className="inline-form" onSubmit={async e=>{e.preventDefault();await act({type:'settings',settings:{...board.settings,wipLimit:limit}});}}><input aria-label="Лимит задач в работе" type="number" min="1" max="50" value={limit} onChange={e=>setLimit(Number(e.target.value))}/><button className="text-button">Применить</button></form><p className="hint">Предупреждение помогает сохранить фокус и не запрещает новые задачи.</p></section>
    <DirectorySettings board={board} act={act}/>
    <section className="form-section"><h3><Icon name="download"/> Резервная копия</h3><p>Все задачи и настройки — в одном файле. Храните копию отдельно от папки приложения.</p><a className="marker-button" href="/api/export" download>Скачать копию</a><button className="text-button" onClick={()=>fileRef.current?.click()}>Восстановить из файла</button><input className="sr-only" tabIndex={-1} type="file" accept=".json,application/json" ref={fileRef} onChange={e=>{if(e.target.files?.[0])void readBackup(e.target.files[0]);}}/>
      {backup&&<div className="restore-preview"><h4>Готово к восстановлению</h4><p>{backup.board.tasks.length} задач · копия от {new Date(backup.exportedAt).toLocaleString('ru-RU')}</p><p>Текущая доска будет заменена. Сначала скачайте её копию.</p><a href="/api/export" download>Скачать текущую доску</a><div><button className="marker-button" onClick={async()=>{if(window.confirm('Заменить все задачи и настройки данными из файла?'))if(await act({type:'import',backup})){setBackup(null);onClose();}}}>Заменить доску</button><button onClick={()=>setBackup(null)}>Отмена</button></div></div>}
    </section>
    {error&&<p role="alert" className="error-text">{error}</p>}
    <p className="hint">Личная локальная доска · SQLite<br/>Данные хранятся на этом компьютере в папке .local.</p>
  </fieldset></Modal>;
}
