import type { Action, Board } from '../shared/model';
export class ApiError extends Error { constructor(message:string,public code:string){super(message);} }
export async function request<T>(path:string,body?:unknown):Promise<T> {
  let response:Response;
  try {response=await fetch(`/api/${path}`,body===undefined?undefined:{method:'POST',headers:{'Content-Type':'application/json','X-Board-Request':'1'},body:JSON.stringify(body)});}
  catch {throw new ApiError('Нет связи с приложением. Проверьте, что npm start продолжает работать.','NETWORK');}
  const data=await response.json();if(!response.ok)throw new ApiError(data.error||'Не удалось выполнить действие',data.code||'UNKNOWN');return data;
}
export const fetchBoard=()=>request<Board>('board');
export const sendAction=(revision:number,action:Action)=>request<Board>('actions',{revision,action});
