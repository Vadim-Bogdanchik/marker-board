import { initialBoard, localDate, newTask, ownerId, validateBoard, type Board, type Directory, type Task } from './model.js';

// Stable IDs make adding this scenario repeatable without duplicating existing data.
const id=(n:number)=>`dddddddd-0000-4000-8000-${String(n).padStart(12,'0')}`;
export const mockTeams=[
  {name:'Платежи',project:'Возвраты 2.0',people:['Анна Смирнова · аналитик','Максим Волков · разработчик','Ольга Соколова · тестировщик'],titles:['Описать частичный возврат','Реализовать идемпотентность API','Проверить повторный возврат','Согласовать контракт возврата','Собрать вопросы поддержки','Закрыть регрессию оплаты']},
  {name:'Личный кабинет',project:'Кабинет клиента',people:['Илья Орлов · аналитик','Мария Кузнецова · разработчик','Денис Морозов · тестировщик'],titles:['Уточнить права доступа','Добавить историю операций','Проверить доступность кабинета','Согласовать уведомления','Разобрать пожелания клиентов','Проверить смену пароля']},
  {name:'Платформа',project:'Интеграции',people:['Елена Павлова · аналитик','Артём Белов · разработчик','Софья Лебедева · тестировщик'],titles:['Описать события возвратов','Обновить тестовый стенд','Проверить доставку событий','Согласовать схему ошибок','Разобрать ограничения шлюза','Завершить проверку мониторинга']},
];
export function withTeamMocks(base:Board=initialBoard(),now=new Date()):Board {
  const b=structuredClone(base);
  const date=(offset:number)=>{const d=new Date(now);d.setDate(d.getDate()+offset);return localDate(d);};
  const stamp=(days:number)=>{const d=new Date(now);d.setDate(d.getDate()+days);return d.toISOString();};
  const addDirectory=(item:Directory)=>{if(!b.directories.some(d=>d.id===item.id))b.directories.push(item);};
  mockTeams.forEach((team,t)=>{
    const teamId=id(100+t),projectId=id(200+t);
    addDirectory({id:teamId,kind:'team',name:team.name});addDirectory({id:projectId,kind:'project',name:team.project});
    team.people.forEach((name,p)=>addDirectory({id:id(300+t*10+p),kind:'person',name}));
    team.titles.forEach((title,i)=>{
      const taskId=id(1000+t*10+i);if(b.tasks.some(task=>task.id===taskId))return;
      const stage=[2,1,1,3,0,4][i];
      const task:Task={...newTask(b,title,b.columns.find(c=>c.stage===['inbox','todo','doing','review','done'][stage])!.id),id:taskId,
        category:i===3?'mine':i===4?'team':'colleague',assigneeId:i===3?ownerId:i===4?null:id(300+t*10+i%3),teamId,projectId,
        description:`Учебный пример. Команда «${team.name}». Аналитик: ${team.people[0]}; разработчик: ${team.people[1]}; тестировщик: ${team.people[2]}.\nКонтекст: ${title}. Согласовать критерии приёмки и проверить негативные сценарии.`,
        priority:i===0?'high':i===4?'low':'normal',dueDate:i===4?null:date([-1,2,7,0,0,-2][i]),
        nextStep:i===0?'Уточнить граничные случаи у разработчика':'Проверить критерии приёмки',focused:i===0||i===3,
        createdAt:stamp(-6),updatedAt:stamp(-1),startedAt:stage>=2?stamp(-4):null,completedAt:stage===4?stamp(-2):null,
        archived:t===2&&i===5,
      };
      if(i===1)task.dependencies=[id(1000+t*10)];
      if(i===2)task.dependencies=[id(1001+t*10)];
      if(i===3){task.waitingFor=mockTeams[(t+1)%3].name;task.waitingWhat='Пример ответа и финальную схему API';task.remindOn=t===1?null:date(0);task.dependencies=[id(1000+((t+1)%3)*10)];}
      if(t===2&&i===1)task.blockedReason='Нет доступа к тестовому контуру';
      task.checklist=[{id:id(2000+t*100+i*2),text:'Согласовать критерии приёмки',done:i===5},{id:id(2001+t*100+i*2),text:'Проверить негативный сценарий',done:i===5}];
      if(i===0)task.links=[{id:id(3000+t),title:'Пример спецификации (учебная ссылка)',url:`https://example.com/specifications/${t+1}`}];
      b.tasks.push(task);
    });
  });
  return validateBoard(b);
}
