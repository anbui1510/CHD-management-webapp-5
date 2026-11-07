import { SCHEMA_VERSION, SHEET_TABS } from './constants.js';
import { exportLeaveRows, exportStudyRows, importLeaveRows, importStudyRows } from './entries.js';
import { applyMonthToSheet, exportMonthRows, importMonthRows } from './month.js';
import { exportNhanSuRows, importNhanSuRows } from './nhanSu.js';
import { exportTaskRows, importTaskRows } from './task.js';
import { metaObjectToRows, metaRowsToObject } from './tableUtils.js';
import { exportWeekRows, importWeekRows } from './week.js';
import { purgeBackupImportedStaff } from '../staffSource.js';

/**
 * Trường lịch tuần/tháng — round-trip qua sheet_meta.value hoặc merge từ local.
 * Thanh công cụ (cellStyles), merge ô, freeze, phân công phòng… thuộc nhóm này.
 */
const SHEET_MERGE_PRESERVE_KEYS = [
  'roomTable', 'roomColumns', 'roomAssignments',
  'cellStyles', 'weekMerges', 'monthMerges', 'freeze',
  'warnings', 'roomWarnings', 'buGrants', 'buPosted', 'leaveCuts',
  'cathGrid', 'cathRoles',
  'monthGrid', 'monthRoles', 'monthColumnOrder', 'monthColumnTitles', 'monthKey',
];

function isEmptyPreserveValue(value) {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value).length === 0;
  return false;
}

function mergeSheetsPreserveLocalFields(remoteSheets, localSheets) {
  const localList = (localSheets || []).filter(Boolean);
  if (!Array.isArray(remoteSheets) || !remoteSheets.length) return localList;
  const byId = new Map(localList.map((sh) => [sh.id, sh]));
  const byName = new Map(localList.map((sh) => [sh.name, sh]));
  const mergedRemote = remoteSheets.map((sh, idx) => {
    const prev = byId.get(sh.id)
      || byName.get(sh.name)
      || localList[idx]
      || (localList.length === 1 && remoteSheets.length === 1 ? localList[0] : undefined);
    if (!prev) return sh;
    const patch = {};
    for (const key of SHEET_MERGE_PRESERVE_KEYS) {
      if (!(key in prev) || isEmptyPreserveValue(prev[key])) continue;
      const remoteVal = sh[key];
      if (isEmptyPreserveValue(remoteVal)) {
        // Sheet chưa có / trống → giữ bản máy.
        patch[key] = prev[key];
        continue;
      }
      // cellStyles: luôn gộp, local thắng key trùng (tránh pull ~2s xóa format vừa tô).
      if (key === 'cellStyles' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        patch[key] = { ...remoteVal, ...prev[key] };
        continue;
      }
      // monthGrid: luôn gộp ô, giữ các ô local đã điền
      if (key === 'monthGrid' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        const merged = { ...remoteVal };
        Object.entries(prev[key]).forEach(([cellKey, cellVal]) => {
          if (cellVal !== undefined && cellVal !== null && String(cellVal).trim() !== '') {
            merged[cellKey] = cellVal;
          }
        });
        patch[key] = merged;
        continue;
      }
      // monthColumnTitles: luôn gộp tiêu đề cột
      if (key === 'monthColumnTitles' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        patch[key] = { ...remoteVal, ...prev[key] };
        continue;
      }
      // monthRoles: nếu remote rỗng hoặc có role tùy biến local chưa push
      if (key === 'monthRoles' && Array.isArray(prev[key]) && prev[key].length) {
        if (!Array.isArray(remoteVal) || !remoteVal.length) {
          patch[key] = prev[key];
          continue;
        }
        const existingKeys = new Set(remoteVal.map((r) => r.key));
        const extraRoles = prev[key].filter((r) => !existingKeys.has(r.key));
        if (extraRoles.length) {
          patch[key] = [...remoteVal, ...extraRoles];
          continue;
        }
      }
      // roomAssignments: gộp phân công phòng
      if (key === 'roomAssignments' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        patch[key] = { ...remoteVal, ...prev[key] };
        continue;
      }
      // cathGrid: gộp phân công cathlab
      if (key === 'cathGrid' && typeof remoteVal === 'object' && typeof prev[key] === 'object') {
        patch[key] = { ...remoteVal, ...prev[key] };
        continue;
      }
    }

    // Gộp grid lịch tuần (sh.grid): giữ lại các ca local đã gán / xếp lịch
    if (prev.grid && typeof prev.grid === 'object') {
      const mergedGrid = { ...(sh.grid || {}) };
      for (const [staffKey, prevDays] of Object.entries(prev.grid)) {
        if (!prevDays) continue;
        if (!mergedGrid[staffKey]) {
          mergedGrid[staffKey] = Array.isArray(prevDays) ? [...prevDays] : { ...prevDays };
        } else if (Array.isArray(prevDays) && Array.isArray(mergedGrid[staffKey])) {
          const curArr = [...mergedGrid[staffKey]];
          prevDays.forEach((prevDay, dayIdx) => {
            if (!prevDay || typeof prevDay !== 'object') return;
            while (curArr.length <= dayIdx) curArr.push({ S: '', R: '', C: '', T: '' });
            const curDay = curArr[dayIdx] ? { ...curArr[dayIdx] } : { S: '', R: '', C: '', T: '' };
            ['S', 'R', 'C', 'T'].forEach((slot) => {
              const val = prevDay[slot];
              if (val !== undefined && val !== null && String(val).trim() !== '' && (!curDay[slot] || !String(curDay[slot]).trim())) {
                curDay[slot] = val;
              }
            });
            curArr[dayIdx] = curDay;
          });
          mergedGrid[staffKey] = curArr;
        }
      }
      patch.grid = mergedGrid;
    }

    return Object.keys(patch).length ? { ...sh, ...patch } : sh;
  });

  // Giữ lại các sheet local chưa có trên remote (ví dụ user thêm Tuần 2, Tuần 3)
  const remoteIds = new Set(mergedRemote.map((s) => s.id));
  const remoteNames = new Set(mergedRemote.map((s) => s.name));
  const extraSheets = localList.filter((s) => !remoteIds.has(s.id) && !remoteNames.has(s.name));

  return [...mergedRemote, ...extraSheets];
}

/** Giữ studyFrom/studyTo/position/shortName lịch và bảo toàn nhân sự local (local_*). */
function mergeStaffPreserveLocalFields(remoteStaff, localStaff) {
  const localList = (localStaff || []).filter(Boolean);
  if (!Array.isArray(remoteStaff) || !remoteStaff.length) return localList;
  const byId = new Map(localList.map((s) => [String(s.id), s]));
  const byName = new Map(localList.map((s) => [String(s.name || '').trim().toLowerCase(), s]));

  const mergedRemote = remoteStaff.map((s) => {
    const prev = byId.get(String(s.id)) || byName.get(String(s.name || '').trim().toLowerCase());
    if (!prev) return s;
    const next = { ...s };

    // shortName: User sửa ngắn (VD: THẢO2 -> THẢO), ưu tiên giữ bản máy nếu hợp lệ
    if (prev.shortName && String(prev.shortName).trim()) {
      next.shortName = String(prev.shortName).trim().toUpperCase();
    }
    if (!next.studyFrom && prev.studyFrom) next.studyFrom = prev.studyFrom;
    if (!next.studyTo && prev.studyTo) next.studyTo = prev.studyTo;
    if (prev.position && (!next.position || !String(next.position).trim())) {
      next.position = prev.position;
    }
    if (prev.dutyQuota != null && (next.dutyQuota == null || next.dutyQuota === 0)) {
      next.dutyQuota = prev.dutyQuota;
    }
    if (prev.buBalance != null && (next.buBalance == null || next.buBalance === 0)) {
      next.buBalance = prev.buBalance;
    }
    if (prev.phepBalance != null && (next.phepBalance == null || next.phepBalance === 0)) {
      next.phepBalance = prev.phepBalance;
    }
    if (Array.isArray(prev.taskDuties) && prev.taskDuties.length && (!next.taskDuties || !next.taskDuties.length)) {
      next.taskDuties = prev.taskDuties;
    }
    if (prev.access && !next.access) next.access = prev.access;
    if (prev.accessRole && !next.accessRole) next.accessRole = prev.accessRole;
    if (prev.source) next.source = prev.source;
    if (prev.showInLichKhoa) next.showInLichKhoa = prev.showInLichKhoa;
    if (prev.deptId && !next.deptId) next.deptId = prev.deptId;
    if (prev.deptLabel && !next.deptLabel) next.deptLabel = prev.deptLabel;

    return next;
  });

  // BẢO TOÀN NHÂN SỰ LOCAL: Thêm nhân sự local chưa có trên remoteStaff (VD: "Nguyễn Thái Hưng" local_*)
  const remoteIds = new Set(mergedRemote.map((s) => String(s.id)));
  const remoteNames = new Set(mergedRemote.map((s) => String(s.name || '').trim().toLowerCase()));

  const extraLocal = localList.filter((s) => {
    if (!s || !s.id) return false;
    if (remoteIds.has(String(s.id))) return false;
    if (s.name && remoteNames.has(String(s.name).trim().toLowerCase())) return false;
    return true;
  });

  return [...mergedRemote, ...extraLocal];
}

function mergeTasksPreserveLocalFields(remoteTasks, localTasks) {
  const localList = (localTasks || []).filter(Boolean);
  if (!Array.isArray(remoteTasks) || !remoteTasks.length) return localList;

  const localById = new Map(localList.map((t) => [String(t.id), t]));
  const localByCode = new Map(localList.filter((t) => t.code).map((t) => [String(t.code).trim(), t]));

  const mergedRemote = remoteTasks.map((t) => {
    const prev = localById.get(String(t.id)) || (t.code ? localByCode.get(String(t.code).trim()) : null);
    if (!prev) return t;
    return {
      ...t,
      owners: (Array.isArray(prev.owners) && prev.owners.length) ? prev.owners : (t.owners || []),
      ownerOrder: (Array.isArray(prev.ownerOrder) && prev.ownerOrder.length) ? prev.ownerOrder : (t.ownerOrder || []),
      fixedDays: (Array.isArray(prev.fixedDays) && prev.fixedDays.length) ? prev.fixedDays : (t.fixedDays || []),
      fixedSlots: (Array.isArray(prev.fixedSlots) && prev.fixedSlots.length) ? prev.fixedSlots : (t.fixedSlots || []),
      locks: (Array.isArray(prev.locks) && prev.locks.length) ? prev.locks : (t.locks || []),
      bgColor: prev.bgColor || t.bgColor,
      textColor: prev.textColor || t.textColor,
      category: prev.category || t.category,
    };
  });

  const remoteIds = new Set(mergedRemote.map((t) => String(t.id)));
  const remoteCodes = new Set(mergedRemote.map((t) => String(t.code || '').trim()).filter(Boolean));

  const extraLocal = localList.filter((t) => {
    if (!t || !t.id) return false;
    if (remoteIds.has(String(t.id))) return false;
    if (t.code && remoteCodes.has(String(t.code).trim())) return false;
    return true;
  });

  return [...mergedRemote, ...extraLocal];
}

function mergeEntriesPreserveLocal(remoteEntries, localEntries) {
  const localList = (localEntries || []).filter(Boolean);
  if (!Array.isArray(remoteEntries) || !remoteEntries.length) return localList;

  const localById = new Map(localList.filter((e) => e.id).map((e) => [String(e.id), e]));
  // Trùng id: local thắng từng field (có giá trị), remote chỉ bù field còn thiếu
  const mergedRemote = remoteEntries.map((r) => {
    const l = localById.get(String(r.id));
    if (!l) return r;
    const out = { ...r };
    Object.entries(l).forEach(([k, v]) => {
      const empty = v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length);
      if (!empty) out[k] = v;
    });
    return out;
  });

  const entryKey = (e) => `${e.shortName || e.staffId}_${e.from || e.fromDate}_${e.to || e.toDate}_${e.type || ''}`;
  const remoteIds = new Set(remoteEntries.map((e) => String(e.id)));
  const remoteKeys = new Set(remoteEntries.map(entryKey));

  const extraLocal = localList.filter((e) => {
    if (!e || !e.id) return false;
    if (remoteIds.has(String(e.id))) return false;
    return !remoteKeys.has(entryKey(e));
  });

  return [...mergedRemote, ...extraLocal];
}

/**
 * @param {Record<string, string[][]>} tabs — tên tab → values (含 header)
 * @param {object} baseStore — store hiện tại (giữ dept id / sheets phụ nếu thiếu tab)
 */
export function importTabsToStore(tabs, baseStore = null) {
  const meta = metaRowsToObject(tabs[SHEET_TABS.META] || []);
  const staff = importNhanSuRows(tabs[SHEET_TABS.NHAN_SU] || []);
  const tasks = importTaskRows(tabs[SHEET_TABS.TASK] || []);
  const leaveEntries = importLeaveRows(tabs[SHEET_TABS.LICH_NGHI] || []);
  const studyEntries = importStudyRows(tabs[SHEET_TABS.LICH_HOC] || []);
  const weekBlock = importWeekRows(tabs[SHEET_TABS.LICH_TUAN] || []);
  const monthBySheet = importMonthRows(tabs[SHEET_TABS.LICH_THANG] || []);

  const deptId = meta.activeDeptId || baseStore?.activeDeptId || 'dept_tim_mach';
  const prevDept = baseStore?.departments?.find((d) => d.id === deptId)
    || baseStore?.departments?.[0]
    || { id: deptId, name: meta.deptName || 'Khoa', code: meta.deptCode || 'DEPT', staff: [], tasks: [] };

  let sheets = weekBlock.sheets?.length ? weekBlock.sheets : (baseStore?.sheetsByDept?.[deptId]?.sheets || []);
  const prevSheets = baseStore?.sheetsByDept?.[deptId]?.sheets;
  sheets = mergeSheetsPreserveLocalFields(sheets, prevSheets);

  // Thu thập TOÀN BỘ dữ liệu lịch tháng local trên mọi sheet của khoa để bảo vệ vĩnh viễn
  const allLocalMonthGrid = {};
  let localMonthRoles = null;
  let localMonthKey = null;
  let localMonthColumnOrder = null;
  let localMonthColumnTitles = null;
  let localMonthMerges = null;
  (prevSheets || []).forEach((ps) => {
    if (ps?.monthGrid && typeof ps.monthGrid === 'object') {
      Object.entries(ps.monthGrid).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          allLocalMonthGrid[k] = v;
        }
      });
    }
    if (Array.isArray(ps?.monthRoles) && ps.monthRoles.length && !localMonthRoles) {
      localMonthRoles = ps.monthRoles;
    }
    if (ps?.monthKey && !localMonthKey) localMonthKey = ps.monthKey;
    if (ps?.monthColumnOrder && !localMonthColumnOrder) localMonthColumnOrder = ps.monthColumnOrder;
    if (ps?.monthColumnTitles && Object.keys(ps.monthColumnTitles).length && !localMonthColumnTitles) {
      localMonthColumnTitles = ps.monthColumnTitles;
    }
    if (Array.isArray(ps?.monthMerges) && ps.monthMerges.length && !localMonthMerges) {
      localMonthMerges = ps.monthMerges;
    }
  });

  // Thu thập dữ liệu lịch tháng từ remote (tab LichThang trên Google Sheet)
  const allRemoteMonthGrid = {};
  let remoteMonthRoles = null;
  let remoteMonthKey = null;
  let remoteMonthColumnOrder = null;
  let remoteMonthColumnTitles = null;
  monthBySheet.forEach((mb) => {
    if (mb?.monthGrid && typeof mb.monthGrid === 'object') {
      Object.entries(mb.monthGrid).forEach(([k, v]) => {
        if (v !== undefined && v !== null && String(v).trim() !== '') {
          allRemoteMonthGrid[k] = v;
        }
      });
    }
    if (Array.isArray(mb?.monthRoles) && mb.monthRoles.length && !remoteMonthRoles) {
      remoteMonthRoles = mb.monthRoles;
    }
    if (mb?.monthKey && !remoteMonthKey) remoteMonthKey = mb.monthKey;
    if (mb?.monthColumnOrder && !remoteMonthColumnOrder) remoteMonthColumnOrder = mb.monthColumnOrder;
    if (mb?.monthColumnTitles && Object.keys(mb.monthColumnTitles).length && !remoteMonthColumnTitles) {
      remoteMonthColumnTitles = mb.monthColumnTitles;
    }
  });

  // Hợp nhất Month Grid: Local thắng ô trùng (bảo vệ ô vừa gõ khỏi bị pull đè)
  const unifiedMonthGrid = { ...allRemoteMonthGrid, ...allLocalMonthGrid };

  // Month Roles: Giữ role tùy biến của local (ví dụ TC, TK1, C1...) nếu local có
  const unifiedMonthRoles = (localMonthRoles && localMonthRoles.length)
    ? localMonthRoles
    : (remoteMonthRoles && remoteMonthRoles.length ? remoteMonthRoles : null);

  const unifiedMonthKey = localMonthKey || remoteMonthKey || null;
  const unifiedMonthColumnOrder = localMonthColumnOrder || remoteMonthColumnOrder || null;
  const unifiedMonthColumnTitles = { ...(remoteMonthColumnTitles || {}), ...(localMonthColumnTitles || {}) };

  // Áp dụng bộ lịch tháng đồng nhất cho TẤT CẢ các sheet trong khoa
  sheets = sheets.map((sh) => {
    const nextSh = { ...sh };
    nextSh.monthGrid = { ...(nextSh.monthGrid || {}), ...unifiedMonthGrid };
    if (unifiedMonthRoles) nextSh.monthRoles = unifiedMonthRoles;
    if (unifiedMonthKey) nextSh.monthKey = unifiedMonthKey;
    if (unifiedMonthColumnOrder) nextSh.monthColumnOrder = unifiedMonthColumnOrder;
    if (Object.keys(unifiedMonthColumnTitles).length) {
      nextSh.monthColumnTitles = { ...(nextSh.monthColumnTitles || {}), ...unifiedMonthColumnTitles };
    }
    if (localMonthMerges) nextSh.monthMerges = localMonthMerges;
    return nextSh;
  });

  // Khi staff.length === 0 (Sheet NhanSu chưa có dữ liệu): giữ prevDept.staff
  const mergedStaff = staff.length
    ? mergeStaffPreserveLocalFields(staff, purgeBackupImportedStaff(prevDept.staff))
    : purgeBackupImportedStaff(prevDept.staff);

  const department = {
    ...prevDept,
    id: deptId,
    name: meta.deptName || prevDept.name,
    code: meta.deptCode || prevDept.code,
    staff: purgeBackupImportedStaff(mergedStaff),
    tasks: mergeTasksPreserveLocalFields(tasks, prevDept.tasks),
    leaveEntries: mergeEntriesPreserveLocal(leaveEntries, prevDept.leaveEntries || []),
    studyEntries: mergeEntriesPreserveLocal(studyEntries, prevDept.studyEntries || []),
  };

  const localActiveId = baseStore?.sheetsByDept?.[deptId]?.activeSheetId;
  const hasLocalActive = sheets.some((s) => s.id === localActiveId);
  const activeSheetId = hasLocalActive
    ? localActiveId
    : (weekBlock.activeSheetId && sheets.some((s) => s.id === weekBlock.activeSheetId))
      ? weekBlock.activeSheetId
      : sheets[0]?.id;

  const sheetsByDept = {
    ...(baseStore?.sheetsByDept || {}),
    [deptId]: {
      activeSheetId,
      sheets,
    },
  };

  return {
    ...(baseStore || {}),
    activeDeptId: deptId,
    departments: [
      department,
      ...(baseStore?.departments || []).filter((d) => d.id !== deptId),
    ],
    sheetsByDept,
    _sheetMeta: { schemaVersion: SCHEMA_VERSION, updatedAt: meta.updatedAt || null },
  };
}

export function exportStoreToTabs(store) {
  const deptId = store.activeDeptId || store.departments?.[0]?.id;
  const dept = store.departments?.find((d) => d.id === deptId) || store.departments?.[0];
  const deptSheets = store.sheetsByDept?.[deptId];

  const meta = {
    schemaVersion: SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    activeDeptId: deptId,
    deptName: dept?.name || '',
    deptCode: dept?.code || '',
  };

  return {
    [SHEET_TABS.META]: metaObjectToRows(meta),
    [SHEET_TABS.NHAN_SU]: exportNhanSuRows(dept?.staff),
    [SHEET_TABS.TASK]: exportTaskRows(dept?.tasks),
    [SHEET_TABS.LICH_NGHI]: exportLeaveRows(dept?.leaveEntries),
    [SHEET_TABS.LICH_HOC]: exportStudyRows(dept?.studyEntries),
    [SHEET_TABS.LICH_TUAN]: exportWeekRows(deptSheets),
    [SHEET_TABS.LICH_THANG]: exportMonthRows(deptSheets),
    [SHEET_TABS.DASHBOARD]: [['metric', 'staffId', 'label', 'value', 'updatedAt']],
  };
}
