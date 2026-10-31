import test from 'node:test';
import assert from 'node:assert/strict';
import {withTeamMocks} from '../shared/teamMocks.js';
import {initialBoard,newTask,validateBoard,dailyOverview,ownerId} from '../shared/model.js';
test('team examples preserve existing data, are idempotent, and exercise all daily groups',()=>{
  const original=initialBoard();original.tasks.push(newTask(original,'Личная задача'));original.settings.theme='night';original.revision=40;
  const before=structuredClone(original),now=new Date(2026,9,31,12),b=withTeamMocks(original,now);
  assert.deepEqual(original,before);assert.deepEqual(b.tasks[0],before.tasks[0]);assert.deepEqual(b.settings,before.settings);assert.equal(b.revision,40);
  assert.equal(b.tasks.length,19);assert.equal(b.directories.filter(d=>d.kind==='team').length,3);assert.equal(b.directories.filter(d=>d.kind==='person'&&d.id!==ownerId).length,9);
  assert.deepEqual(withTeamMocks(b,now),b);assert.doesNotThrow(()=>validateBoard(b));
  const overview=dailyOverview(b,now);assert.deepEqual(Object.fromEntries(Object.entries(overview).map(([k,v])=>[k,v.length])),{focus:6,overdue:3,today:3,upcoming:6,reminders:2,blocked:9,unscheduled:1});
});
