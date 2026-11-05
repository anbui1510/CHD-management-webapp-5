import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { Navbar } from './components/Navbar';
import { TaskPalette } from './components/TaskPalette';
import { SheetView } from './components/SheetView';
import { CalendarView } from './components/CalendarView';
import { FairnessDashboard } from './components/FairnessDashboard';
import { StaffManager } from './components/StaffManager';
import { TaskManager } from './components/TaskManager';
import { MobileShell } from './components/mobile/MobileShell';
import { useViewportWidth } from './hooks/useViewportWidth';
import { toLichkhoaUser, isLichkhoaSessionReady } from './auth/chdAuth';
import { mergeChdStaffIntoStore } from './auth/mergeChdStaff';

import {
  getCloudMeta,
  getInitialStore,
  saveStore,
  setCloudMeta,
  setCloudPushHandler,
} from './store/dbStore';
import { getCategoriesForDept } from './store/constants';
import { generateWeeklySchedule, buildWeekDays, emptyWeekGrid } from './logic/schedulerEngine';
import { lockConflictMessages, pruneResolvedAlerts, resolveLockedCell, sameAlerts } from './logic/warningResolve';
import { roomTableOf } from './components/RoomSheet';
import { mondayOf, columnSpecs, currentMonthKey, customCellKey, normalizeDaySessions, shiftMonthKey, resolveMonthRoles, sessionCellKey } from './logic/monthSchedule';
import { cathCellKey, localCathRoles } from './logic/cathSchedule';
import { buBaseline, buCatchUp, buGrantDeltas } from './logic/buLedger';
import { matchTask } from './logic/taskMatch';
import { canEdit, findLinkedStaff, firstNav, resolveActor, visibleNav } from './logic/access';
import { resolveUiMode } from './logic/uiMode';
import { isSheetBackend } from './config/dataBackend';
import { ConnectSheetDialog } from './features/sheetSync/ConnectSheetDialog';
import { BootstrapKhoaDialog } from './features/sheetSync/BootstrapKhoaDialog';
import { useSheetSync } from './features/sheetSync/useSheetSync';
import {
  ensureSpreadsheetFromTenant,
  getSpreadsheetId,
  setSpreadsheetConnection
} from './features/sheetSync/sheetStorage';
import { resolveTenant, tenantDepartmentOptions } from './config/tenant';

const DEFAULT_START_DATE = '2026-09-14'; // Monday 14/09/2026

// ---------- Sheet helpers ----------
function blankSheetContent(dept, startDate) {
  return {
    startDate,
    grid: emptyWeekGrid(dept.staff, ['S', 'C']),
    roomAssignments: {},
    roomWarnings: [],
    warnings: [],
    buGrants: {},
    buPosted: {},
    leaveCuts: { bu: {}, phep: {} }
  };
}

function weekRecord(sh) {
  return {
    grid: sh.grid,
    warnings: sh.warnings || [],
    roomWarnings: sh.roomWarnings || [],
    buGrants: sh.buGrants || {},
    buPosted: sh.buPosted || {},
    leaveCuts: sh.leaveCuts || { bu: {}, phep: {} }
  };
}

function openWeek(sh, startDate, staff) {
  const weeks = { ...(sh.weeks || {}) };
  if (sh.startDate) weeks[sh.startDate] = weekRecord(sh);
  const saved = weeks[startDate];
  const fresh = !saved;
  return {
    ...sh,
    weeks,
    startDate,
    ...(saved || {
      grid: emptyWeekGrid(staff, sh.daySessions),
      warnings: [],
      roomWarnings: [],
      buGrants: {},
      buPosted: {},
      leaveCuts: { bu: {}, phep: {} }
    }),
    buGrants: fresh ? {} : (saved.buGrants || {}),
    buPosted: fresh || !Object.prototype.hasOwnProperty.call(saved, 'buPosted')
      ? (fresh ? {} : undefined)
      : (saved.buPosted || {}),
    leaveCuts: (saved && saved.leaveCuts) || { bu: {}, phep: {} }
  };
}

function applyBuDeltas(staff, deltas) {
  if (!deltas || !Object.keys(deltas).length) return staff;
  let changed = false;
  const next = (staff || []).map((person) => {
    const delta = Number(deltas[person.shortName]) || 0;
    if (!delta) return person;
    changed = true;
    return {
      ...person,
      buBalance: +((Number(person.buBalance) || 0) + delta).toFixed(1)
    };
  });
  return changed ? next : staff;
}

function settleSheetLedger(sh, payGap) {
  const weeks = { ...(sh.weeks || {}) };
  let weeksChanged = false;
  Object.keys(weeks).forEach((key) => {
    if (key === sh.startDate) return;
    const saved = weeks[key];
    if (!saved || Object.prototype.hasOwnProperty.call(saved, 'buPosted')) return;
    weeks[key] = { ...saved, buPosted: { ...(saved.buGrants || {}) } };
    weeksChanged = true;
  });
  if (sh.buPosted) {
    return weeksChanged ? { sheet: { ...sh, weeks }, deltas: {} } : { sheet: sh, deltas: {} };
  }
  const deltas = payGap ? buCatchUp(sh) : {};
  const buPosted = { ...(sh.buGrants || {}) };
  if (sh.startDate) {
    const current = weeks[sh.startDate];
    weeks[sh.startDate] = current
      ? { ...current, buPosted }
      : {
        grid: sh.grid,
        warnings: sh.warnings || [],
        roomWarnings: sh.roomWarnings || [],
        buGrants: sh.buGrants || {},
        buPosted,
        leaveCuts: sh.leaveCuts || { bu: {}, phep: {} }
      };
  }
  return { sheet: { ...sh, weeks, buPosted }, deltas };
}

function weekSources(sheets) {
  const sources = [];
  (sheets || []).forEach((sheet) => {
    sources.push({ startDate: sheet.startDate, grid: sheet.grid });
    Object.entries(sheet.weeks || {}).forEach(([startDate, saved]) => {
      sources.push({ startDate, grid: saved?.grid });
    });
  });
  return sources;
}

function nextSheetName(sheets, base = 'Sheet') {
  let n = sheets.length + 1;
  const names = new Set(sheets.map(s => s.name.toLowerCase()));
  while (names.has(`${base} ${n}`.toLowerCase())) n++;
  return `${base} ${n}`;
}

// Đảm bảo mỗi khoa có ít nhất 1 sheet
function ensureSheets(store) {
  const sheetsByDept = { ...(store.sheetsByDept || {}) };
  let departments = store.departments;
  store.departments.forEach(dept => {
    const st = sheetsByDept[dept.id];
    if (!st || !st.sheets || st.sheets.length === 0) {
      const id = `sheet_${dept.id}_1`;
      sheetsByDept[dept.id] = {
        activeSheetId: id,
        sheets: [{ id, name: 'Sheet 1', ...blankSheetContent(dept, DEFAULT_START_DATE) }]
      };
      return;
    }
    const activeId = st.sheets.some(s => s.id === st.activeSheetId) ? st.activeSheetId : st.sheets[0].id;
    let sheetChanged = false;
    const sheets = st.sheets.map((sh) => {
      const { sheet, deltas } = settleSheetLedger(sh, sh.id === activeId);
      if (sheet !== sh) sheetChanged = true;
      if (sh.id === activeId && Object.keys(deltas).length) {
        departments = departments.map(item => (
          item.id === dept.id ? { ...item, staff: applyBuDeltas(item.staff, deltas) } : item
        ));
      }
      return sheet;
    });
    if (sheetChanged || activeId !== st.activeSheetId) {
      sheetsByDept[dept.id] = { ...st, activeSheetId: activeId, sheets };
    }
  });
  return { ...store, departments, sheetsByDept };
}

function applyThemeClass(next) {
  const root = document.documentElement;
  const body = document.body;
  if (next === 'light') {
    body.classList.add('light-theme');
    body.classList.remove('dark-theme');
    root.classList.remove('dark');
    root.style.colorScheme = 'light';
  } else {
    body.classList.add('dark-theme');
    body.classList.remove('light-theme');
    root.classList.add('dark');
    root.style.colorScheme = 'dark';
  }
}

const VIEW_BY_MENU = {
  'lich-khoa-sheet': 'SHEET',
  'lich-khoa-dashboard': 'DASHBOARD',
  'lich-khoa-tasks': 'TASKS',
  'lich-khoa-staff': 'STAFF',
  'lich-khoa-calendar': 'CALENDAR',
};

export function DeptScheduleApp({
  currentStaff = null,
  chdStaffList = [],
  activeMenu = 'lich-khoa-sheet',
  onNavigateToSheets = null,
}) {
  const lichUser = useMemo(() => toLichkhoaUser(currentStaff), [currentStaff]);
  const [store, setStore] = useState(() => ensureSheets(getInitialStore()));
  const [activeView, setActiveView] = useState(() => VIEW_BY_MENU[activeMenu] || 'SHEET');
  const [theme, setTheme] = useState('light');
  const [sheetConnectOpen, setSheetConnectOpen] = useState(false);
  const [sheetConnectionRevision, setSheetConnectionRevision] = useState(0);

  useEffect(() => {
    applyThemeClass('light');
  }, []);

  useEffect(() => {
    const next = VIEW_BY_MENU[activeMenu] || 'SHEET';
    setActiveView(next);
  }, [activeMenu]);

  useEffect(() => {
    if (isSheetBackend()) ensureSpreadsheetFromTenant();
  }, []);

  // Merge CHD Staff into NhanSu whenever roster changes
  useEffect(() => {
    if (!chdStaffList?.length) return;
    setStore((prev) => mergeChdStaffIntoStore(ensureSheets(prev), chdStaffList));
  }, [chdStaffList]);

  const storeRef = useRef(store);
  storeRef.current = store;

  const syncAuthReady = isLichkhoaSessionReady(currentStaff);

  const sheetSync = useSheetSync({
    syncAuthReady,
    accountLoading: false,
    accountEmail: lichUser?.email,
    accountFullName: lichUser?.fullName,
    sheetConnectionRevision,
    setStore,
    storeRef,
    ensureSheets,
  });

  // Hydrate spreadsheet id from CHD lichkhoa sync-config (server)
  useEffect(() => {
    if (!syncAuthReady || getSpreadsheetId()) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/lichkhoa/sync-config', { credentials: 'include' });
        const data = await res.json();
        if (cancelled || !data?.spreadsheetId) return;
        setSpreadsheetConnection(data.spreadsheetId);
        setSheetConnectionRevision((rev) => rev + 1);
      } catch {
        /* offline / not configured */
      }
    })();
    return () => { cancelled = true; };
  }, [syncAuthReady]);

  const handleSheetConnectionSave = useCallback(async (url) => {
    if (!window.confirm(
      'Đổi sổ sẽ đồng bộ lịch từ Google Sheet mới. Dữ liệu hiển thị sẽ theo file đó. Tiếp tục?'
    )) {
      return;
    }
    setSpreadsheetConnection(url);
    setCloudMeta({});
    sheetSync.markForcePull();
    setSheetConnectionRevision((rev) => rev + 1);
  }, [sheetSync.markForcePull]);

  // F-303: push lên API khi không dùng Sheet backend
  useEffect(() => {
    if (isSheetBackend()) return undefined;
    setCloudPushHandler(async (nextStore) => {
      if (!syncAuthReady) return;
      const { pushScheduleStore } = await import('./features/scheduleSync/scheduleStoreClient');
      const res = await pushScheduleStore(nextStore);
      if (res?.updatedAt) setCloudMeta({ updatedAt: res.updatedAt });
    });
    return () => setCloudPushHandler(null);
  }, [syncAuthReady]);

  const sheetSyncBanner = isSheetBackend() && (sheetSync.sheetSyncError || sheetSync.sheetSyncNotice) ? (
    <div
      className="sheet-sync-banner"
      role="status"
      style={{
        padding: '8px 16px',
        fontSize: '0.85rem',
        background: sheetSync.sheetSyncError ? 'var(--destructive, #fee2e2)' : 'var(--muted, #f1f5f9)',
        color: sheetSync.sheetSyncError ? '#991b1b' : 'inherit',
        borderBottom: '1px solid var(--border, #e2e8f0)',
      }}
    >
      {sheetSync.sheetSyncError || sheetSync.sheetSyncNotice}
    </div>
  ) : null;

  const sheetSyncTitle = sheetSync.sheetSyncAt
    ? `Đồng bộ từ Sheet (lần cuối ${new Date(sheetSync.sheetSyncAt).toLocaleString('vi-VN')})`
    : 'Đồng bộ từ Google Sheet';

  // Active Department Data
  const activeDept = store.departments.find(d => d.id === store.activeDeptId) || store.departments[0];
  const staffList = activeDept?.staff || [];
  const taskList = activeDept?.tasks || [];
  const roster = useMemo(
    () => store.departments.flatMap(dept => (dept.staff || []).map(person => ({
      ...person,
      deptId: dept.id,
      deptName: dept.name
    }))),
    [store.departments]
  );
  const actor = useMemo(() => resolveActor(lichUser, roster), [lichUser, roster]);
  const linkedStaff = useMemo(
    () => findLinkedStaff(lichUser, roster),
    [lichUser, roster]
  );
  const hideDeptSelector = actor.kind === 'member' && Boolean(linkedStaff?.deptId);
  const tenantMeta = useMemo(() => resolveTenant(), []);

  useEffect(() => {
    const deptId = linkedStaff?.deptId;
    if (!deptId) return;
    setStore((prev) => {
      if (prev.activeDeptId === deptId) return prev;
      return ensureSheets({ ...prev, activeDeptId: deptId });
    });
  }, [linkedStaff?.deptId]);

  const allow = (tab) => canEdit(actor, tab);
  const allowBook = () => allow('week') || allow('month');

  useEffect(() => {
    const allowed = visibleNav(actor);
    if (allowed.length && !allowed.includes(activeView)) setActiveView(allowed[0] || 'SHEET');
  }, [activeView, actor]);
  const categories = useMemo(() => getCategoriesForDept(activeDept), [activeDept]);

  // Active Sheet Data
  const sheetState = store.sheetsByDept[activeDept.id];
  const sheets = sheetState.sheets;
  const activeSheet = sheets.find(s => s.id === sheetState.activeSheetId) || sheets[0];
  const scheduleData = useMemo(
    () => ({ ...activeSheet, days: buildWeekDays(activeSheet.startDate) }),
    [activeSheet]
  );
  useEffect(() => {
    const timer = window.setTimeout(() => saveStore(storeRef.current), 400);
    return () => window.clearTimeout(timer);
  }, [store]);
  useEffect(() => {
    const flush = () => saveStore(storeRef.current);
    const onHide = () => {
      if (document.visibilityState === 'hidden') flush();
    };
    window.addEventListener('pagehide', flush);
    document.addEventListener('visibilitychange', onHide);
    return () => {
      window.removeEventListener('pagehide', flush);
      document.removeEventListener('visibilitychange', onHide);
    };
  }, []);

  // ---------- Store update helpers ----------
  const updateActiveDept = (fn) => {
    setStore(prev => ({
      ...prev,
      departments: prev.departments.map(d => (d.id === activeDept.id ? fn(d) : d))
    }));
  };

  const updateSheetState = (fn) => {
    setStore(prev => ({
      ...prev,
      sheetsByDept: { ...prev.sheetsByDept, [activeDept.id]: fn(prev.sheetsByDept[activeDept.id]) }
    }));
  };

  const updateActiveSheet = (fn) => {
    updateSheetState(st => ({
      ...st,
      sheets: st.sheets.map(sh => (sh.id === activeSheet.id ? fn(sh) : sh))
    }));
  };

  // Theme Toggle
  const handleToggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    applyThemeClass(next);
  };

  // Department Selection
  const handleSelectDept = (deptId) => {
    setStore(prev => ensureSheets({ ...prev, activeDeptId: deptId }));
  };

  // Run Auto-Scheduler Engine on the active sheet
  const handleAutoSchedule = () => {
    if (!allow('week')) return;
    const sessions = normalizeDaySessions(activeSheet.daySessions);
    const previousCuts = activeSheet.leaveCuts || { bu: {}, phep: {} };
    const staffForRun = staffList.map(person => ({
      ...person,
      buBalance: +((Number(person.buBalance) || 0) + (Number(previousCuts.bu?.[person.shortName]) || 0)).toFixed(1),
      phepBalance: +((Number(person.phepBalance) || 0) + (Number(previousCuts.phep?.[person.shortName]) || 0)).toFixed(1)
    }));
    const existingNotes = {};
    staffList.forEach((person) => {
      existingNotes[person.shortName] = activeSheet.grid?.[person.shortName]?.note || '';
    });
    const result = generateWeeklySchedule({
      startDate: activeSheet.startDate,
      staffList: staffForRun,
      taskList,
      monthGrid: activeSheet.monthGrid || {},
      monthRoles: resolveMonthRoles(activeSheet.monthRoles),
      daySessions: sessions,
      leaveEntries: activeDept.leaveEntries || [],
      studyEntries: activeDept.studyEntries || [],
      roomTable: roomTableOf(activeSheet, staffList),
      sheets: weekSources(sheets),
      existingNotes,
      cathRoles: localCathRoles(activeSheet.cathRoles),
      cathGrid: activeSheet.cathGrid || {}
    });
    const after = result.buGrants || {};
    const afterCuts = result.leaveCuts || { bu: {}, phep: {} };
    const sheetId = activeSheet.id;
    const deptId = activeDept.id;
    setStore(prev => {
      const st = prev.sheetsByDept[deptId];
      const sh = st.sheets.find(item => item.id === sheetId) || st.sheets[0];
      const posted = sh.buPosted || buBaseline(sh);
      const grantDeltas = buGrantDeltas(after, posted);
      const cuts = sh.leaveCuts || { bu: {}, phep: {} };
      const nextSheet = {
        ...sh,
        grid: result.grid,
        warnings: result.warnings,
        roomWarnings: result.roomWarnings,
        cathGrid: result.cathGrid,
        buGrants: after,
        buPosted: after,
        leaveCuts: afterCuts,
        weeks: {
          ...(sh.weeks || {}),
          [sh.startDate]: {
            grid: result.grid,
            warnings: result.warnings,
            roomWarnings: result.roomWarnings,
            buGrants: after,
            buPosted: after,
            leaveCuts: afterCuts
          }
        }
      };
      return {
        ...prev,
        departments: prev.departments.map(dept => dept.id !== deptId ? dept : {
          ...dept,
          staff: dept.staff.map(person => {
            const name = person.shortName;
            const grantDelta = grantDeltas[name] || 0;
            const buCutDelta = (Number(afterCuts.bu?.[name]) || 0) - (Number(cuts.bu?.[name]) || 0);
            const phepCutDelta = (Number(afterCuts.phep?.[name]) || 0) - (Number(cuts.phep?.[name]) || 0);
            if (!grantDelta && !buCutDelta && !phepCutDelta) return person;
            return {
              ...person,
              buBalance: +((Number(person.buBalance) || 0) + grantDelta - buCutDelta).toFixed(1),
              phepBalance: +((Number(person.phepBalance) || 0) - phepCutDelta).toFixed(1)
            };
          })
        }),
        sheetsByDept: {
          ...prev.sheetsByDept,
          [deptId]: { ...st, sheets: st.sheets.map(item => item.id === sh.id ? nextSheet : item) }
        }
      };
    });
  };

  const sheetWithPrunedAlerts = (sh, people = staffList, tasks = taskList) => {
    const ctx = {
      grid: sh.grid,
      days: buildWeekDays(sh.startDate),
      sessions: normalizeDaySessions(sh.daySessions),
      staffList: people,
      taskList: tasks
    };
    const warnings = pruneResolvedAlerts(sh.warnings, ctx);
    const roomWarnings = pruneResolvedAlerts(sh.roomWarnings, ctx);
    if (sameAlerts(warnings, sh.warnings) && sameAlerts(roomWarnings, sh.roomWarnings)) return sh;
    const weeks = { ...(sh.weeks || {}) };
    if (sh.startDate && weeks[sh.startDate]) {
      weeks[sh.startDate] = { ...weeks[sh.startDate], grid: sh.grid, warnings, roomWarnings };
    }
    return { ...sh, warnings, roomWarnings, weeks };
  };

  // Manual Cell Edit from Sheet View
  const handleUpdateCell = (shortName, dayIdx, session, newVal) => {
    if (!allow('week')) return;
    let value = newVal == null ? '' : String(newVal);

    updateActiveSheet(sh => {
      const previous = sh.grid?.[shortName]?.[dayIdx]?.[session] || '';
      value = resolveLockedCell(previous, value, taskList);
      const grid = { ...sh.grid };
      const row = { ...(grid[shortName] || {}) };
      const cell = { ...(row[dayIdx] || { S: '', C: '' }) };
      cell[session] = value;
      row[dayIdx] = cell;
      grid[shortName] = row;
      return sheetWithPrunedAlerts({ ...sh, grid });
    });

    // Real-time BÙ / PHÉP balance calculation
    if (value.includes('BÙ') || value.includes('BU')) {
      updateActiveDept(d => ({
        ...d,
        staff: d.staff.map(s =>
          s.shortName === shortName && s.buBalance >= 0.5
            ? { ...s, buBalance: +(s.buBalance - 0.5).toFixed(1) }
            : s
        )
      }));
    }
  };

  const handleUpdateBalance = (shortName, field, raw) => {
    if (!allow('week')) return false;
    const text = String(raw ?? '').trim().replace(',', '.');
    if (text !== '' && !/^[+-]?\d+(\.\d+)?$/.test(text)) return false;
    const parsed = text === '' ? 0 : Math.round(Number(text) * 10) / 10;
    if (!Number.isFinite(parsed)) return false;
    const key = field === 'phep' ? 'phepBalance' : 'buBalance';
    const current = staffList.find(person => person.shortName === shortName);
    if (!current || Number(current[key]) === parsed) return true;
    updateActiveDept(dept => ({
      ...dept,
      staff: dept.staff.map(person => (
        person.shortName === shortName ? { ...person, [key]: parsed } : person
      ))
    }));
    return true;
  };

  const handleUpdateNote = (shortName, newVal) => {
    if (!allow('week')) return;
    const value = newVal == null ? '' : String(newVal);
    updateActiveSheet(sh => {
      const grid = { ...sh.grid };
      const row = { ...(grid[shortName] || {}) };
      row.note = value;
      grid[shortName] = row;
      return { ...sh, grid };
    });
  };

  useEffect(() => {
    const deptId = activeDept?.id;
    const sheetId = activeSheet?.id;
    if (!deptId || !sheetId) return;
    setStore(prev => {
      const dept = prev.departments.find(item => item.id === deptId);
      const st = prev.sheetsByDept[deptId];
      if (!dept || !st) return prev;
      let changed = false;
      const sheets = st.sheets.map((sh) => {
        if (sh.id !== sheetId) return sh;
        const next = sheetWithPrunedAlerts(sh, dept.staff || [], dept.tasks || []);
        if (next !== sh) changed = true;
        return next;
      });
      if (!changed) return prev;
      return {
        ...prev,
        sheetsByDept: { ...prev.sheetsByDept, [deptId]: { ...st, sheets } }
      };
    });
  }, [activeDept?.id, activeSheet?.id, activeSheet?.grid, activeSheet?.warnings, activeSheet?.roomWarnings, (taskList || []).map(task => `${task.id}:${task.warn === false ? 0 : 1}`).join('|')]);

  const handleDateChange = (daysDelta) => {
    const [y, m, d] = activeSheet.startDate.split('-').map(Number);
    const curr = new Date(y, m - 1, d);
    curr.setDate(curr.getDate() + daysDelta);
    const newStart = mondayOf(curr);
    updateActiveSheet(sh => openWeek(sh, newStart, staffList));
  };

  const handleGoCurrentWeek = () => {
    updateActiveSheet(sh => openWeek(sh, mondayOf(new Date()), staffList));
  };

  const handleMonthKeyChange = (baseKey, delta) => {
    const next = delta === 0 ? currentMonthKey() : shiftMonthKey(baseKey, delta);
    updateActiveSheet(sh => ({ ...sh, monthKey: next }));
  };

  const handleWeekMerges = (weekMerges) => {
    if (!allow('week')) return;
    updateActiveSheet(sh => ({ ...sh, weekMerges }));
  };

  const handleMonthMerges = (monthMerges) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => ({ ...sh, monthMerges }));
  };

  const handleDaySessions = (daySessions) => {
    if (!allowBook()) return;
    updateActiveSheet(sh => ({ ...sh, daySessions: normalizeDaySessions(daySessions) }));
  };

  const handleFreeze = (scope, patch) => {
    if (!allow(scope === 'month' ? 'month' : 'week')) return;
    updateActiveSheet(sh => {
      const freeze = { ...(sh.freeze || {}) };
      freeze[scope] = { ...(freeze[scope] || {}), ...patch };
      return { ...sh, freeze };
    });
  };

  const saveDeptList = (field, entry) => {
    const tab = field === 'studyEntries' ? 'study' : 'leave';
    if (!allow(tab)) return;
    updateActiveDept(dept => {
      const list = dept[field] || [];
      const exists = list.some(item => item.id === entry.id);
      return {
        ...dept,
        [field]: exists ? list.map(item => (item.id === entry.id ? entry : item)) : [...list, entry]
      };
    });
  };

  const deleteDeptItem = (field, id) => {
    const tab = field === 'studyEntries' ? 'study' : 'leave';
    if (!allow(tab)) return;
    updateActiveDept(dept => ({
      ...dept,
      [field]: (dept[field] || []).filter(item => item.id !== id)
    }));
  };

  const handleUpdateRooms = (roomTable) => {
    if (!allow('week')) return;
    updateActiveSheet(sh => ({ ...sh, roomTable }));
  };

  const handleUpdateCathCell = (iso, rowKey, session, value) => {
    if (!allow('week')) return;
    updateActiveSheet(sh => ({
      ...sh,
      cathGrid: { ...(sh.cathGrid || {}), [cathCellKey(iso, rowKey, session)]: value ?? '' }
    }));
  };

  const handleRenameCathRole = (rowKey, raw) => {
    if (!allow('week')) return;
    const label = String(raw || '').trim();
    if (!label) return;
    updateActiveSheet(sh => ({
      ...sh,
      cathRoles: localCathRoles(sh.cathRoles).map(role => (
        role.key === rowKey ? { ...role, label } : role
      ))
    }));
  };

  const handleAddCathRole = () => {
    if (!allow('week')) return;
    updateActiveSheet(sh => ({
      ...sh,
      cathRoles: [...localCathRoles(sh.cathRoles), { key: `cath_${Date.now()}`, label: 'Task mới', source: 'local' }]
    }));
  };

  const handleDeleteCathRole = (rowKey) => {
    if (!allow('week')) return;
    if (!rowKey || rowKey === 'rash_pm' || rowKey === 'tt_chinh' || rowKey === 'tt_phu' || rowKey === 'ttcc') return;
    updateActiveSheet(sh => {
      const cathGrid = { ...(sh.cathGrid || {}) };
      Object.keys(cathGrid).forEach((cellKey) => {
        if (cellKey.split('|')[1] === rowKey) delete cathGrid[cellKey];
      });
      return {
        ...sh,
        cathGrid,
        cathRoles: localCathRoles(sh.cathRoles).filter(role => role.key !== rowKey)
      };
    });
  };

  const handleUpdateMonthCell = (iso, roleKey, session, value) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => ({
      ...sh,
      monthGrid: { ...(sh.monthGrid || {}), [sessionCellKey(iso, roleKey, session)]: value ?? '' }
    }));
  };

  const handleUpdateMonthCustomCell = (id, weekStart, slot, value) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => ({
      ...sh,
      monthGrid: { ...(sh.monthGrid || {}), [customCellKey(id, weekStart, slot)]: value ?? '' }
    }));
  };

  const handleInsertMonthColumn = (index, side) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => {
      const keys = columnSpecs(sh.monthColumnOrder, sh.monthColumnTitles, sh.daySessions).map(column => column.key);
      const key = `x:c${Date.now()}`;
      const at = Math.max(0, Math.min((Number(index) || 0) + (side === 'right' ? 1 : 0), keys.length));
      keys.splice(at, 0, key);
      return {
        ...sh,
        monthColumnOrder: keys,
        monthColumnTitles: { ...(sh.monthColumnTitles || {}), [key]: 'Cột mới' }
      };
    });
  };

  const handleRenameMonthColumn = (key, title) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => ({
      ...sh,
      monthColumnTitles: { ...(sh.monthColumnTitles || {}), [key]: String(title || '').trim() || 'Cột mới' }
    }));
  };

  const handleRemoveMonthColumn = (key) => {
    if (!allow('month')) return;
    if (!String(key).startsWith('x:')) return;
    const id = String(key).slice(2);
    updateActiveSheet(sh => {
      const monthGrid = { ...(sh.monthGrid || {}) };
      const cellStyles = { ...(sh.cellStyles || {}) };
      const prefix = `x|${id}|`;
      Object.keys(monthGrid).forEach((cellKey) => {
        if (cellKey.startsWith(prefix)) delete monthGrid[cellKey];
      });
      const stylePrefix = `m|x|${id}|`;
      Object.keys(cellStyles).forEach((styleKey) => {
        if (styleKey.startsWith(stylePrefix)) delete cellStyles[styleKey];
      });
      const titles = { ...(sh.monthColumnTitles || {}) };
      delete titles[key];
      return {
        ...sh,
        monthGrid,
        cellStyles,
        monthColumnTitles: titles,
        monthColumnOrder: columnSpecs(sh.monthColumnOrder, sh.monthColumnTitles, sh.daySessions).map(column => column.key).filter(item => item !== key)
      };
    });
  };

  const handlePatchStyles = (updates) => {
    if (!allowBook()) return;
    updateActiveSheet(sh => {
      const cellStyles = { ...(sh.cellStyles || {}) };
      Object.entries(updates || {}).forEach(([key, value]) => {
        if (!value) delete cellStyles[key];
        else cellStyles[key] = value;
      });
      return { ...sh, cellStyles };
    });
  };

  const handleAddMonthRole = (taskOrLabel) => {
    if (!allow('month')) return;
    const task = taskOrLabel && typeof taskOrLabel === 'object' ? taskOrLabel : null;
    const label = task ? String(task.code || '').trim() : String(taskOrLabel || '').trim();
    if (!label) return;
    updateActiveSheet(sh => ({
      ...sh,
      monthRoles: [...resolveMonthRoles(sh.monthRoles), {
        key: `role_${Date.now()}`,
        label,
        taskId: task?.id || null
      }]
    }));
  };

  const handleInsertMonthRole = (index) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => {
      const roles = resolveMonthRoles(sh.monthRoles);
      const next = [...roles];
      const at = Math.max(0, Math.min(Number(index) || 0, next.length));
      next.splice(at, 0, { key: `role_${Date.now()}`, label: '', taskId: null });
      return { ...sh, monthRoles: next };
    });
  };

  const handleRenameMonthRole = (roleKey, raw) => {
    if (!allow('month')) return;
    const text = String(raw || '').trim();
    const matched = matchTask(text, taskList);
    updateActiveSheet(sh => ({
      ...sh,
      monthRoles: resolveMonthRoles(sh.monthRoles).map(role => (
        role.key === roleKey
          ? { ...role, label: matched ? String(matched.code || '').trim() : text, taskId: matched?.id || null }
          : role
      ))
    }));
  };

  const handleDeleteMonthRole = (roleKey) => {
    if (!allow('month')) return;
    updateActiveSheet(sh => {
      const monthGrid = { ...(sh.monthGrid || {}) };
      Object.keys(monthGrid).forEach((key) => {
        if (key.split('|')[1] === roleKey) delete monthGrid[key];
      });
      return {
        ...sh,
        monthGrid,
        monthRoles: resolveMonthRoles(sh.monthRoles).filter(role => role.key !== roleKey)
      };
    });
  };

  // ---------- Sheet Tab Actions ----------
  const handleSelectSheet = (sheetId) => {
    updateSheetState(st => ({ ...st, activeSheetId: sheetId }));
  };

  const handleAddSheet = () => {
    if (!allowBook()) return;
    const id = `sheet_${Date.now()}`;
    updateSheetState(st => ({
      activeSheetId: id,
      sheets: [...st.sheets, { id, name: nextSheetName(st.sheets), ...blankSheetContent(activeDept, activeSheet.startDate) }]
    }));
  };

  const handleRenameSheet = (sheetId, name) => {
    if (!allowBook()) return;
    updateSheetState(st => ({
      ...st,
      sheets: st.sheets.map(sh => (sh.id === sheetId ? { ...sh, name } : sh))
    }));
  };

  const handleDuplicateSheet = (sheetId) => {
    if (!allowBook()) return;
    const id = `sheet_${Date.now()}`;
    updateSheetState(st => {
      const idx = st.sheets.findIndex(sh => sh.id === sheetId);
      if (idx < 0) return st;
      const source = st.sheets[idx];
      const copy = JSON.parse(JSON.stringify(source));
      copy.id = id;
      copy.name = nextSheetName(st.sheets, `Bản sao của ${source.name}`.slice(0, 32));
      const nextSheets = [...st.sheets];
      nextSheets.splice(idx + 1, 0, copy);
      return { activeSheetId: id, sheets: nextSheets };
    });
  };

  const handleMoveSheet = (sheetId, direction) => {
    if (!allowBook()) return;
    updateSheetState(st => {
      const idx = st.sheets.findIndex(sh => sh.id === sheetId);
      const next = idx + direction;
      if (idx < 0 || next < 0 || next >= st.sheets.length) return st;
      const sheets = [...st.sheets];
      const [item] = sheets.splice(idx, 1);
      sheets.splice(next, 0, item);
      return { ...st, sheets };
    });
  };

  const handleColorSheet = (sheetId, color) => {
    if (!allowBook()) return;
    updateSheetState(st => ({
      ...st,
      sheets: st.sheets.map(sh => (sh.id === sheetId ? { ...sh, color: color || undefined } : sh))
    }));
  };

  const handleDeleteSheet = (sheetId) => {
    if (!allowBook()) return;
    updateSheetState(st => {
      if (st.sheets.length <= 1) return st;
      const idx = st.sheets.findIndex(sh => sh.id === sheetId);
      const nextSheets = st.sheets.filter(sh => sh.id !== sheetId);
      const activeSheetId = st.activeSheetId === sheetId
        ? nextSheets[Math.max(0, idx - 1)].id
        : st.activeSheetId;
      return { activeSheetId, sheets: nextSheets };
    });
  };

  // ---------- Staff Management Actions ----------
  const handleAddStaff = (newStaffObj) => {
    if (!allow('staff')) return;
    updateActiveDept(d => ({ ...d, staff: [...d.staff, newStaffObj] }));
  };

  const handleUpdateStaff = (updatedStaff, oldShortName) => {
    if (!allow('staff')) return;
    setStore(prev => {
      const deptId = activeDept.id;
      const departments = prev.departments.map(d =>
        d.id === deptId
          ? { ...d, staff: d.staff.map(s => (s.id === updatedStaff.id ? updatedStaff : s)) }
          : d
      );

      // Đổi tên viết tắt -> chuyển dữ liệu lịch của bác sĩ sang tên mới trong tất cả các sheet
      let sheetsByDept = prev.sheetsByDept;
      const newShortName = updatedStaff.shortName;
      if (oldShortName && oldShortName !== newShortName && sheetsByDept[deptId]) {
        const st = sheetsByDept[deptId];
        sheetsByDept = {
          ...sheetsByDept,
          [deptId]: {
            ...st,
            sheets: st.sheets.map(sh => {
              if (!sh.grid || !sh.grid[oldShortName]) return sh;
              const grid = { ...sh.grid, [newShortName]: sh.grid[oldShortName] };
              delete grid[oldShortName];
              return { ...sh, grid };
            })
          }
        };
      }

      return { ...prev, departments, sheetsByDept };
    });
  };

  const handleDeleteStaff = (staffId) => {
    if (!allow('staff')) return;
    updateActiveDept(d => ({ ...d, staff: d.staff.filter(s => s.id !== staffId) }));
  };

  const handleBulkImportStaff = (newStaffList) => {
    if (!allow('staff')) return;
    updateActiveDept(d => ({ ...d, staff: [...d.staff, ...newStaffList] }));
  };

  const handleReorderStaff = (staff) => {
    if (!allow('staff')) return;
    updateActiveDept(d => ({ ...d, staff }));
  };

  // ---------- Task Management Actions ----------
  const handleAddTask = (newTaskObj) => {
    if (!allow('tasks') && !allow('month')) return;
    updateActiveDept(d => ({ ...d, tasks: [...d.tasks, newTaskObj] }));
  };

  const handleUpdateTask = (updatedTask) => {
    if (!allow('tasks') && !allow('month')) return;
    updateActiveDept(d => ({ ...d, tasks: d.tasks.map(item => item.id === updatedTask.id ? updatedTask : item) }));
  };

  const handleDeleteTask = (taskId) => {
    if (!allow('tasks')) return;
    updateActiveDept(d => ({ ...d, tasks: d.tasks.filter(t => t.id !== taskId) }));
  };

  const handleReorderTasks = (tasks) => {
    if (!allow('tasks')) return;
    updateActiveDept(d => ({ ...d, tasks }));
  };

  const handleLoadTaskTemplate = (templateTasks) => {
    if (!allow('tasks')) return;
    updateActiveDept(d => ({ ...d, tasks: templateTasks }));
  };

  const handleAddCategory = (category) => {
    if (!allow('tasks') && !allow('month')) return;
    updateActiveDept(d => ({ ...d, customCategories: [...(d.customCategories || []), category] }));
  };

  const handleDeleteCategory = (categoryKey) => {
    if (!allow('tasks') && !allow('month')) return;
    updateActiveDept(d => ({
      ...d,
      customCategories: (d.customCategories || []).filter(c => c.key !== categoryKey)
    }));
  };

  const handleImportStore = (imported) => {
    if (!allow('tasks')) return;
    setStore(ensureSheets(imported));
  };

  const viewportWidth = useViewportWidth();
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const isMobileUi = resolveUiMode({
    width: viewportWidth,
    coarsePointer
  }) === 'mobile';
  const navViews = visibleNav(actor);

  const handleExit = () => {
    onNavigateToSheets?.();
  };

  const accountView = null;

  const calendarView = (
    <CalendarView
      dept={activeDept}
      staffList={staffList}
      taskList={taskList}
      scheduleData={scheduleData}
      linkedShortName={linkedStaff?.shortName || ''}
    />
  );

  const dashboardView = (
    <FairnessDashboard
      dept={activeDept}
      staffList={staffList}
      scheduleData={scheduleData}
    />
  );

  const staffView = (
    <StaffManager
      staffList={staffList}
      taskList={taskList}
      tenantDepartments={tenantDepartmentOptions()}
      defaultDeptId={activeDept?.id}
      onAddStaff={undefined}
      onUpdateStaff={handleUpdateStaff}
      onDeleteStaff={undefined}
      onReorderStaff={handleReorderStaff}
      onBulkImport={undefined}
      readOnly={!allow('staff')}
      chdSynced
    />
  );

  const tasksView = (
    <TaskManager
      taskList={taskList}
      categories={categories}
      onAddTask={handleAddTask}
      onUpdateTask={handleUpdateTask}
      onDeleteTask={handleDeleteTask}
      onReorderTasks={handleReorderTasks}
      staffList={staffList}
      onLoadTemplate={handleLoadTaskTemplate}
      onAddCategory={handleAddCategory}
      onDeleteCategory={handleDeleteCategory}
      readOnly={!allow('tasks')}
      store={store}
      onImportStore={handleImportStore}
    />
  );

  const sheetView = (
    <SheetView
      dept={activeDept}
      staffList={staffList}
      taskList={taskList}
      scheduleData={scheduleData}
      onUpdateCell={handleUpdateCell}
      onUpdateCathCell={handleUpdateCathCell}
      onRenameCathRole={handleRenameCathRole}
      onAddCathRole={handleAddCathRole}
      onDeleteCathRole={handleDeleteCathRole}
      onUpdateNote={handleUpdateNote}
      onUpdateBalance={handleUpdateBalance}
      onDateChange={handleDateChange}
      onGoCurrentWeek={handleGoCurrentWeek}
      currentStartDate={activeSheet.startDate}
      sheets={sheets}
      activeSheetId={activeSheet.id}
      onSelectSheet={handleSelectSheet}
      onAddSheet={handleAddSheet}
      onRenameSheet={handleRenameSheet}
      onDuplicateSheet={handleDuplicateSheet}
      onDeleteSheet={handleDeleteSheet}
      onMoveSheet={handleMoveSheet}
      onColorSheet={handleColorSheet}
      monthKey={activeSheet.monthKey}
      onMonthKeyChange={handleMonthKeyChange}
      onUpdateMonthCell={handleUpdateMonthCell}
      onUpdateMonthCustomCell={handleUpdateMonthCustomCell}
      onInsertMonthColumn={handleInsertMonthColumn}
      onRemoveMonthColumn={handleRemoveMonthColumn}
      onRenameMonthColumn={handleRenameMonthColumn}
      onPatchStyles={handlePatchStyles}
      onAddMonthRole={handleAddMonthRole}
      onInsertMonthRole={handleInsertMonthRole}
      onRenameMonthRole={handleRenameMonthRole}
      categories={categories}
      onAddTask={handleAddTask}
      onAddCategory={handleAddCategory}
      onDeleteCategory={handleDeleteCategory}
      onUpdateRooms={handleUpdateRooms}
      onWeekMerges={handleWeekMerges}
      onDaySessions={handleDaySessions}
      onFreeze={handleFreeze}
      leaveEntries={activeDept.leaveEntries || []}
      studyEntries={activeDept.studyEntries || []}
      onSaveLeave={(entry) => saveDeptList('leaveEntries', entry)}
      onDeleteLeave={(id) => deleteDeptItem('leaveEntries', id)}
      onSaveStudy={(entry) => saveDeptList('studyEntries', entry)}
      onDeleteStudy={(id) => deleteDeptItem('studyEntries', id)}
      onMonthMerges={handleMonthMerges}
      onDeleteMonthRole={handleDeleteMonthRole}
      onAutoSchedule={handleAutoSchedule}
      actor={actor}
    />
  );

  if (!syncAuthReady) {
    return (
      <div className="lichkhoa-root flex items-center justify-center p-8 text-sm text-slate-600">
        Cần đăng nhập CHD để mở Lịch khoa.
      </div>
    );
  }

  if (!getSpreadsheetId() && typeof onNavigateToSheets === 'function') {
    return (
      <div className="lichkhoa-root flex flex-col items-center justify-center gap-3 p-8 text-center">
        <p className="text-sm text-slate-600">Chưa liên kết Google Sheet lịch khoa.</p>
        <button
          type="button"
          className="rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white"
          onClick={() => onNavigateToSheets()}
        >
          Mở Virtual Sheets lịch khoa
        </button>
      </div>
    );
  }

  const sheetDialogs = isSheetBackend() ? (
    <>
      <ConnectSheetDialog
        open={sheetConnectOpen}
        onOpenChange={setSheetConnectOpen}
        onConnected={() => {
          setSheetConnectOpen(false);
          sheetSync.markForcePull();
          setSheetConnectionRevision((rev) => rev + 1);
        }}
      />
      <BootstrapKhoaDialog
        open={sheetSync.bootstrapOpen}
        onOpenChange={sheetSync.setBootstrapOpen}
        staffCount={staffList.length}
        taskCount={taskList.length}
        tenantLabel={tenantMeta.label}
        busy={sheetSync.bootstrapBusy}
        onConfirm={sheetSync.runBootstrap}
      />
    </>
  ) : null;

  if (isMobileUi) {
    return (
      <div className="lichkhoa-root app-container mobile-app">
        {sheetSyncBanner}
        {sheetDialogs}
        <MobileShell
          activeDept={activeDept}
          departments={store.departments}
          onSelectDept={handleSelectDept}
          hideDeptSelector={hideDeptSelector}
          tenantLabel={tenantMeta.label}
          activeView={activeView}
          onSelectView={setActiveView}
          views={navViews}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onNotifications={() => {}}
          onProfile={() => onNavigateToSheets?.()}
          onSettings={() => onNavigateToSheets?.()}
          onExit={handleExit}
          childrenByView={{
            SHEET: sheetView,
            STAFF: staffView,
            TASKS: tasksView,
            DASHBOARD: dashboardView,
            CALENDAR: calendarView,
          }}
        />
      </div>
    );
  }

  return (
    <div className="lichkhoa-root app-container">
      <Navbar
        activeDept={activeDept}
        departments={store.departments}
        onSelectDept={handleSelectDept}
        hideDeptSelector={hideDeptSelector}
        tenantLabel={tenantMeta.label}
        activeView={activeView}
        onSelectView={setActiveView}
        views={navViews}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNotifications={() => {}}
        onProfile={() => onNavigateToSheets?.()}
        onSettings={() => onNavigateToSheets?.()}
        onExit={handleExit}
        onSheetSync={isSheetBackend() && syncAuthReady ? () => sheetSync.manualPull() : undefined}
        sheetSyncTitle={sheetSyncTitle}
      />
      {sheetSyncBanner}
      {sheetDialogs}

      <main className="main-content">
        {(allow('week') || allow('month')) && activeView === 'SHEET' && (
          <TaskPalette tasks={taskList} categories={categories} staff={staffList} />
        )}
        {activeView === 'SHEET' && sheetView}
        {activeView === 'CALENDAR' && calendarView}
        {activeView === 'DASHBOARD' && dashboardView}
        {activeView === 'STAFF' && staffView}
        {activeView === 'TASKS' && tasksView}
      </main>
    </div>
  );
}
