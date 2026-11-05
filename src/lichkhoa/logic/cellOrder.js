function fold(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .trim();
}

function escapeReg(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const EMPTY_LIST = [];
const compiledCodes = new WeakMap();
const orderedText = new WeakMap();
const roomSets = new Map();

function matchersFor(taskList) {
  const list = taskList && taskList.length ? taskList : EMPTY_LIST;
  let hit = compiledCodes.get(list);
  if (hit) return hit;
  hit = [...(taskList || [])]
    .map(task => String(task?.code || '').trim())
    .filter(Boolean)
    .sort((a, b) => b.length - a.length)
    .map(code => ({ code, re: new RegExp(escapeReg(code), 'gi') }));
  compiledCodes.set(list, hit);
  return hit;
}

// A task code is one key, even when it contains a comma ("T1*, sapk").
export function splitTaskCodes(value, taskList) {
  let working = String(value || '');
  const slots = [];
  matchersFor(taskList).forEach(({ code, re }) => {
    re.lastIndex = 0;
    working = working.replace(re, () => {
      const token = `\u0000${slots.length}\u0000`;
      slots.push(code);
      return token;
    });
  });
  const parts = [];
  working.split(/[,;\n]+/).forEach((piece) => {
    const text = piece.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)]).trim();
    if (text) parts.push(text);
  });
  const unique = [];
  parts.forEach((code) => {
    if (!unique.some(item => fold(item) === fold(code))) unique.push(code);
  });
  return unique;
}

function taskOf(code, taskList) {
  const needle = fold(code);
  return (taskList || []).find(task => fold(task.code) === needle) || null;
}

function isDuty(task) {
  if (!task) return false;
  const blob = fold(`${task.code} ${task.name}`);
  return task.category === 'THUONG_TRUC' || blob.includes('truc');
}

function roomSet(roomNames) {
  const key = (roomNames || []).join('\n');
  const cached = roomSets.get(key);
  if (cached) return cached;
  const rooms = new Set();
  (roomNames || []).forEach((item) => {
    String(item || '').split(/[,;\n|/]+/).forEach((part) => {
      const name = fold(part);
      if (name) rooms.add(name);
    });
  });
  if (roomSets.size > 40) roomSets.clear();
  roomSets.set(key, rooms);
  return rooms;
}

// 0 bệnh phòng, 1 chuyên môn, 2 trực khoa / trực hội chẩn
export function taskRank(code, taskList, roomNames) {
  const task = taskOf(code, taskList);
  if (isDuty(task)) return 2;
  const needle = fold(code);
  const rooms = roomSet(roomNames);
  if (rooms.has(needle) || (!task && /^b\d/.test(needle))) return 0;
  return 1;
}

export function orderCellText(value, taskList, roomNames) {
  const list = taskList && taskList.length ? taskList : EMPTY_LIST;
  let bucket = orderedText.get(list);
  if (!bucket) {
    bucket = new Map();
    orderedText.set(list, bucket);
  }
  const key = `${value}\n${(roomNames || []).join('\n')}`;
  const cached = bucket.get(key);
  if (cached != null) return cached;
  const parts = splitTaskCodes(value, taskList);
  const unique = [];
  parts.forEach((code) => {
    if (!unique.some(item => fold(item) === fold(code))) unique.push(code);
  });
  unique.sort((a, b) => taskRank(a, taskList, roomNames) - taskRank(b, taskList, roomNames));
  const text = unique.join(', ');
  if (bucket.size > 800) bucket.clear();
  bucket.set(key, text);
  return text;
}

export function leadingTask(value, taskList, roomNames) {
  const text = orderCellText(value, taskList, roomNames);
  const parts = splitTaskCodes(text, taskList);
  const tasks = parts.map(code => taskOf(code, taskList)).filter(Boolean);
  return tasks.find(task => !isDuty(task)) || tasks[0] || null;
}
