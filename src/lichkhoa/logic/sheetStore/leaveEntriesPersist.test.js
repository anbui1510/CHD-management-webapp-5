import assert from 'node:assert/strict';
import { exportLeaveRows, importLeaveRows, exportStudyRows, importStudyRows } from './entries.js';

const leave = {
  id: 'leave_1', iso: '2026-11-12', from: '2026-11-12', to: '2026-11-14', shortName: 'THẢO',
  type: 'P', note: 'phép', session: 'morning', sessions: ['morning', 'afternoon'],
  plannedLong: true, repeat: { freq: 'weekly', preset: 'weekly' }, exdates: ['2026-11-13'], createdAt: 1700000000000,
};
const back = importLeaveRows(exportLeaveRows([leave]))[0];
for (const k of ['id', 'from', 'to', 'shortName', 'type', 'note', 'session', 'iso', 'plannedLong', 'createdAt']) {
  assert.deepEqual(back[k], leave[k], `leave.${k}`);
}
assert.deepEqual(back.sessions, leave.sessions);
assert.deepEqual(back.repeat, leave.repeat);
assert.deepEqual(back.exdates, leave.exdates);

const study = { id: 'study_1', from: '2026-11-03', to: '2026-11-03', shortName: 'HƯNG', type: 't1', taskId: 't1', topic: 'GD', sessions: ['morning'], session: 'morning', note: '' };
const sb = importStudyRows(exportStudyRows([study]))[0];
assert.equal(sb.taskId, 't1'); assert.equal(sb.topic, 'GD'); assert.equal(sb.shortName, 'HƯNG'); assert.deepEqual(sb.sessions, ['morning']);

// Sheet cũ (6 cột) vẫn đọc được
const old = importLeaveRows([['id', 'staffId', 'fromDate', 'toDate', 'note', 'type'], ['x', 's', '2026-11-01', '2026-11-02', '', 'P']])[0];
assert.equal(old.from, '2026-11-01'); assert.equal(old.to, '2026-11-02');
console.log('leaveEntriesPersist OK');
