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
import { isBackupImportedStaff, isLocalScheduleStaff, purgeBackupImportedStaff } from './logic/staffSource.js';

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
import { fold, splitTaskCodes } from './logic/cellOrder';
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
import { ensureLichKhoaSheetLibs, isLichKhoaSheetEngineReady } from './loadSheetLibs';

const DEFAULT_START_DATE = '2026-09-14'; // chỉ dùng khi không đọc được ngày hiện tại
const CARDIOLOGY_DEPT_ID = 'dept_tim_mach';

// ---------- Sheet helpers ----------
function blankSheetContent(dept, startDate, templateSheet = null) {
  return {
    startDate,
    grid: emptyWeekGrid(dept.staff, ['S', 'C']),
    roomAssignments: {},
    roomWarnings: [],
    warnings: [],
    buGrants: {},
    buPosted: {},
    leaveCuts: { bu: {}, phep: {} },
    monthKey: templateSheet?.monthKey || currentMonthKey(),
    monthGrid: templateSheet?.monthGrid ? { ...templateSheet.monthGrid } : {},
    monthRoles: templateSheet?.monthRoles ? [...templateSheet.monthRoles] : [],
    monthColumnOrder: templateSheet?.monthColumnOrder ? [...templateSheet.monthColumnOrder] : null,
    monthColumnTitles: templateSheet?.monthColumnTitles ? { ...templateSheet.monthColumnTitles } : {},
    monthMerges: templateSheet?.monthMerges ? [...templateSheet.monthMerges] : [],
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

function emptySheetState(dept) {
  const id = `sheet_${dept?.id || 'dept'}_1`;
  return {
    activeSheetId: id,
    sheets: [{ id, name: 'Sheet 1', ...blankSheetContent(dept || { staff: [] }, mondayOf(new Date()) || DEFAULT_START_DATE) }]
  };
}

// Đảm bảo mỗi khoa có ít nhất 1 sheet
function ensureSheets(store) {
  const base = store && typeof store === 'object' ? store : {};
  let departments = Array.isArray(base.departments) ? base.departments.filter((dept) => dept && dept.id) : [];
  if (!departments.length) {
    departments = [{
      id: CARDIOLOGY_DEPT_ID,
      name: 'Khoa Tim Mạch',
      code: 'TIM_MACH',
      staff: [],
      tasks: [],
      customCategories: [],
      leaveEntries: [],
      studyEntries: [],
    }];
  }
  const sheetsByDept = { ...(base.sheetsByDept || {}) };
  departments.forEach((dept) => {
    const st = sheetsByDept[dept.id];
    const sheetList = Array.isArray(st?.sheets) ? st.sheets.filter(Boolean) : [];
    if (!sheetList.length) {
      sheetsByDept[dept.id] = emptySheetState(dept);
      return;
    }
    const activeId = sheetList.some((s) => s.id === st.activeSheetId) ? st.activeSheetId : sheetList[0].id;
    let sheetChanged = false;
    const sheets = sheetList.map((sh) => {
      const { sheet, deltas } = settleSheetLedger(sh, sh.id === activeId);
      if (sheet !== sh) sheetChanged = true;
      if (sh.id === activeId && Object.keys(deltas).length) {
        departments = departments.map((item) => (
          item.id === dept.id ? { ...item, staff: applyBuDeltas(item.staff, deltas) } : item
        ));
      }
      return sheet;
    });
    if (sheetChanged || activeId !== st.activeSheetId || sheets !== st.sheets) {
      sheetsByDept[dept.id] = { ...st, activeSheetId: activeId, sheets };
    }
  });
  const activeDeptId = departments.some((d) => d.id === base.activeDeptId)
    ? base.activeDeptId
    : departments[0].id;
  return { ...base, departments, activeDeptId, sheetsByDept };
}

/**
 * Mở app luôn ở tuần/tháng của HÔM NAY (không giữ tuần/tháng cũ từ lần dùng trước).
 * Tuần cũ được cất vào sheet.weeks nên không mất dữ liệu.
 */
function openCurrentPeriod(store) {
  const base = ensureSheets(store);
  const weekStart = mondayOf(new Date());
  const monthKey = currentMonthKey();
  const sheetsByDept = { ...base.sheetsByDept };
  base.departments.forEach((dept) => {
    const st = sheetsByDept[dept.id];
    if (!st?.sheets) return;
    sheetsByDept[dept.id] = {
      ...st,
      sheets: st.sheets.map((sh) => {
        const opened = sh.startDate === weekStart ? sh : openWeek(sh, weekStart, dept.staff || []);
        return opened.monthKey === monthKey ? opened : { ...opened, monthKey };
      }),
    };
  });
  return { ...base, sheetsByDept };
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

const MENU_BY_VIEW = {
  SHEET: 'lich-khoa-sheet',
  DASHBOARD: 'lich-khoa-dashboard',
  TASKS: 'lich-khoa-tasks',
  STAFF: 'lich-khoa-staff',
  CALENDAR: 'lich-khoa-calendar',
};

export function DeptScheduleApp({
  currentStaff = null,
  chdStaffList = [],
  activeMenu = 'lich-khoa-sheet',
  onNavigateToSheets = null,
  onNavigateModule = null,
  embedInChd = true,
}) {
  const lichUser = useMemo(() => toLichkhoaUser(currentStaff), [currentStaff]);
  const [store, setStore] = useState(() => openCurrentPeriod(getInitialStore()));
  const [activeView, setActiveView] = useState(() => VIEW_BY_MENU[activeMenu] || 'SHEET');
  const [theme, setTheme] = useState('light');
  const [sheetConnectOpen, setSheetConnectOpen] = useState(false);
  const [sheetConnectionRevision, setSheetConnectionRevision] = useState(0);
  const [sheetEngineReady, setSheetEngineReady] = useState(() => isLichKhoaSheetEngineReady());
  const [sheetEngineError, setSheetEngineError] = useState(null);
  const [staffAutoOpenAddSeq, setStaffAutoOpenAddSeq] = useState(0);
  const staffAddSeqRef = useRef(0);

  useEffect(() => {
    applyThemeClass('light');
  }, []);

  useEffect(() => {
    const next = VIEW_BY_MENU[activeMenu] || 'SHEET';
    setActiveView(next);
  }, [activeMenu]);

  useEffect(() => {
    if (!embedInChd) return;
    setStore((prev) => {
      const cardio = prev.departments.find((d) => d.id === CARDIOLOGY_DEPT_ID)
        || prev.departments.find((d) => /tim\s*mạch/i.test(String(d.name || '')))
        || prev.departments[0];
      if (!cardio) return prev;
      if (
        prev.departments.length === 1
        && prev.departments[0].id === cardio.id
        && prev.activeDeptId === cardio.id
      ) {
        return prev;
      }
      return ensureSheets({
        ...prev,
        departments: [cardio],
        activeDeptId: cardio.id,
      });
    });
  }, [embedInChd]);

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
  const purgedBackupDocsRef = useRef(false);

  const syncAuthReady = isLichkhoaSessionReady(currentStaff);

  useEffect(() => {
    if (!syncAuthReady) return undefined;
    let cancelled = false;
    ensureLichKhoaSheetLibs()
      .then(() => {
        if (!cancelled) setSheetEngineReady(true);
      })
      .catch((err) => {
        if (!cancelled) {
          setSheetEngineError(err?.message || 'Không tải được Handsontable.');
        }
      });
    return () => {
      cancelled = true;
    };
  }, [syncAuthReady]);

  const sheetSync = useSheetSync({
    syncAuthReady,
    accountLoading: false,
    accountEmail: lichUser?.email,
    accountFullName: lichUser?.fullName,
    accountStaffKey: lichUser?.id || currentStaff?.StaffKey || '',
    accountRole: lichUser?.role || currentStaff?.Role || '',
    sheetConnectionRevision,
    setStore,
    storeRef,
    ensureSheets,
  });

  // Một lần: gỡ doc_* «Lịch cục bộ» (seed/sao lưu) khỏi store + ghi NhanSu — roster = CHD Staff.
  useEffect(() => {
    if (!syncAuthReady || !chdStaffList?.length || purgedBackupDocsRef.current) return undefined;
    const prev = storeRef.current;
    const hasBackup = (prev?.departments || []).some((d) => (d.staff || []).some(isBackupImportedStaff));
    if (!hasBackup) {
      purgedBackupDocsRef.current = true;
      return undefined;
    }
    purgedBackupDocsRef.current = true;
    let cancelled = false;
    (async () => {
      const cleaned = ensureSheets({
        ...prev,
        departments: (prev.departments || []).map((d) => ({
          ...d,
          staff: purgeBackupImportedStaff(d.staff),
        })),
      });
      const merged = mergeChdStaffIntoStore(cleaned, chdStaffList);
      if (cancelled) return;
      setStore(merged);
      saveStore(merged, { skipCloud: true });
      storeRef.current = merged;
      if (typeof sheetSync.persistStoreToSheet === 'function') {
        try {
          await sheetSync.persistStoreToSheet(merged, {
            notice: 'Đã gỡ bác sĩ lịch cục bộ (doc_*) — danh sách lấy từ Sheet Staff CHD.',
          });
        } catch {
          /* user có thể bấm Đồng bộ / Gỡ trùng */
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [syncAuthReady, chdStaffList, sheetSync.persistStoreToSheet]);

  // Hydrate / sửa Spreadsheet ID từ cấu hình server (CHD lichkhoa sync-config)
  useEffect(() => {
    if (!syncAuthReady) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/lichkhoa/sync-config', { credentials: 'include' });
        const data = await res.json();
        if (cancelled || !data?.spreadsheetId) return;
        const serverId = String(data.spreadsheetId).trim();
        const localId = getSpreadsheetId();
        if (localId !== serverId) {
          setSpreadsheetConnection(serverId);
          setSheetConnectionRevision((rev) => rev + 1);
        }
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
        background: sheetSync.sheetSyncError ? '#fee2e2' : '#fef3c7',
        color: sheetSync.sheetSyncError ? '#991b1b' : '#92400e',
        borderBottom: '1px solid var(--border, #e2e8f0)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '8px',
      }}
    >
      <div>
        <strong>{sheetSync.sheetSyncError ? '⚠️ ' : 'ℹ️ '}</strong>
        {sheetSync.sheetSyncError || sheetSync.sheetSyncNotice}
      </div>
      {sheetSync.sheetSyncNotice && !sheetSync.sheetSyncError && (
        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
          <button
            type="button"
            className="sheet-sync-btn btn-primary"
            onClick={sheetSync.forcePushLocalToSheet}
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              borderRadius: '4px',
              background: '#0284c7',
              color: '#ffffff',
              border: 'none',
              cursor: 'pointer',
              fontWeight: 600,
            }}
          >
            Ghi đè lên Sheet
          </button>
          <button
            type="button"
            className="sheet-sync-btn btn-secondary"
            onClick={sheetSync.manualPull}
            style={{
              padding: '4px 10px',
              fontSize: '0.8rem',
              borderRadius: '4px',
              background: '#e2e8f0',
              color: '#1e293b',
              border: '1px solid #cbd5e1',
              cursor: 'pointer',
            }}
          >
            Đồng bộ từ Sheet
          </button>
          <button
            type="button"
            onClick={sheetSync.dismissNotice}
            title="Đóng thông báo"
            style={{
              background: 'transparent',
              border: 'none',
              cursor: 'pointer',
              fontSize: '1rem',
              color: '#78350f',
              padding: '0 4px',
            }}
          >
            ✕
          </button>
        </div>
      )}
    </div>
  ) : null;

  const sheetEngineBanner = sheetEngineError ? (
    <div className="sheet-engine-error" role="alert">
      {sheetEngineError} Kiểm tra mạng hoặc thử tải lại trang.
    </div>
  ) : null;

  const sheetSyncTitle = sheetSync.sheetSyncAt
    ? `Ghi & kéo Sheet lịch khoa (lần cuối ${new Date(sheetSync.sheetSyncAt).toLocaleString('vi-VN')})`
    : 'Ghi store hiện tại lên Google Sheet lịch khoa rồi kéo lại';

  // Active Department Data — never throw if store/import is incomplete
  const departments = Array.isArray(store?.departments) ? store.departments : [];
  const activeDept = departments.find((d) => d.id === store?.activeDeptId) || departments[0] || {
    id: CARDIOLOGY_DEPT_ID,
    name: 'Khoa Tim Mạch',
    staff: [],
    tasks: [],
    customCategories: [],
    leaveEntries: [],
    studyEntries: [],
  };
  const staffList = activeDept?.staff || [];
  const taskList = activeDept?.tasks || [];
  const roster = useMemo(
    () => departments.flatMap((dept) => (dept.staff || []).map((person) => ({
      ...person,
      deptId: dept.id,
      deptName: dept.name
    }))),
    [departments]
  );
  const actor = useMemo(() => resolveActor(lichUser, roster), [lichUser, roster]);
  const linkedStaff = useMemo(
    () => findLinkedStaff(lichUser, roster),
    [lichUser, roster]
  );
  const hideDeptSelector = embedInChd || (actor.kind === 'member' && Boolean(linkedStaff?.deptId));
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
  const sheetState = store?.sheetsByDept?.[activeDept.id] || emptySheetState(activeDept);
  const sheets = Array.isArray(sheetState.sheets) && sheetState.sheets.length
    ? sheetState.sheets
    : emptySheetState(activeDept).sheets;
  const activeSheet = sheets.find((s) => s.id === sheetState.activeSheetId) || sheets[0];
  const scheduleData = useMemo(
    () => ({ ...activeSheet, days: buildWeekDays(activeSheet.startDate) }),
    [activeSheet]
  );
  useEffect(() => {
    saveStore(storeRef.current);
    return () => {
      saveStore(storeRef.current);
    };
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

  const updateDeptMonth = (fn) => {
    updateSheetState(st => ({
      ...st,
      sheets: st.sheets.map(sh => fn(sh))
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
    try {
      if (typeof window !== 'undefined' && typeof window.confirm === 'function') {
        const ok = window.confirm(
          `Tự động xếp lịch tuần (từ ngày ${activeSheet.startDate || 'hiện tại'})?\n` +
          'Hệ thống sẽ tổng hợp lịch tháng, phòng khám, lịch nghỉ/dạy và phân công nhiệm vụ vào bảng tuần.'
        );
        if (!ok) return;
      }
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
      // Thu thập toàn bộ ô lịch tháng trên các sheet của khoa để chắc chắn không bị thiếu
      const allDeptMonthCells = {};
      sheets.forEach(s => {
        if (s.monthGrid && typeof s.monthGrid === 'object') {
          Object.assign(allDeptMonthCells, s.monthGrid);
        }
      });
      const monthGridForRun = Object.keys(activeSheet.monthGrid || {}).length > 0
        ? { ...allDeptMonthCells, ...(activeSheet.monthGrid || {}) }
        : allDeptMonthCells;

      const result = generateWeeklySchedule({
        startDate: activeSheet.startDate,
        staffList: staffForRun,
        taskList,
        monthGrid: monthGridForRun,
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
        const sheetsByDept = prev?.sheetsByDept || {};
        const st = sheetsByDept[deptId] || emptySheetState(activeDept);
        const sheetList = Array.isArray(st.sheets) && st.sheets.length ? st.sheets : [activeSheet];
        const sh = sheetList.find(item => item.id === sheetId) || sheetList[0];
        const posted = sh.buPosted || buBaseline(sh);
        const grantDeltas = buGrantDeltas(after, posted);
        const cuts = sh.leaveCuts || { bu: {}, phep: {} };
        const weekKey = sh.startDate || activeSheet.startDate;
        const nextSheet = {
          ...sh,
          grid: result.grid,
          warnings: result.warnings,
          roomWarnings: result.roomWarnings,
          cathGrid: result.cathGrid,
          buGrants: after,
          buPosted: after,
          leaveCuts: afterCuts,
          monthGrid: sh.monthGrid || monthGridForRun,
          monthRoles: sh.monthRoles || activeSheet.monthRoles,
          monthKey: sh.monthKey || activeSheet.monthKey,
          monthColumnOrder: sh.monthColumnOrder || activeSheet.monthColumnOrder,
          monthColumnTitles: sh.monthColumnTitles || activeSheet.monthColumnTitles,
          weeks: {
            ...(sh.weeks || {}),
            [weekKey]: {
              grid: result.grid,
              warnings: result.warnings,
              roomWarnings: result.roomWarnings,
              buGrants: after,
              buPosted: after,
              leaveCuts: afterCuts
            }
          }
        };
        const prevDepts = Array.isArray(prev?.departments) ? prev.departments : [];
        return {
          ...prev,
          departments: prevDepts.map(dept => dept.id !== deptId ? dept : {
            ...dept,
            staff: (dept.staff || []).map(person => {
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
            ...sheetsByDept,
            [deptId]: {
              ...st,
              sheets: sheetList.map(item => item.id === sh.id
                ? nextSheet
                : { ...item, monthGrid: { ...(item.monthGrid || {}), ...monthGridForRun } })
            }
          }
        };
      });

      let totalAssigned = 0;
      Object.values(result.grid || {}).forEach((doctorDays) => {
        Object.values(doctorDays || {}).forEach((slot) => {
          if (slot && typeof slot === 'object') {
            if (slot.S) totalAssigned += 1;
            if (slot.C) totalAssigned += 1;
            if (slot.R) totalAssigned += 1;
            if (slot.T) totalAssigned += 1;
          }
        });
      });
      const warnCount = (result.warnings?.length || 0) + (result.roomWarnings?.length || 0);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(
          `Đã tự động xếp lịch tuần xong!\n` +
          `• Phân công: ${totalAssigned} lượt nhiệm vụ/ca trực.\n` +
          (warnCount > 0 ? `• Cảnh báo: ${warnCount} lưu ý (xem dòng cảnh báo phía dưới bảng).` : '• Không có cảnh báo.')
        );
      }
    } catch (err) {
      console.error('Auto schedule failed:', err);
      if (typeof window !== 'undefined' && typeof window.alert === 'function') {
        window.alert(`Không thể tự động xếp lịch: ${err?.message || err}`);
      }
    }
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
    let previous = '';

    updateActiveSheet(sh => {
      previous = sh.grid?.[shortName]?.[dayIdx]?.[session] || '';
      value = resolveLockedCell(previous, value, taskList);
      const grid = { ...sh.grid };
      const row = { ...(grid[shortName] || {}) };
      const cell = { ...(row[dayIdx] || { S: '', C: '' }) };
      cell[session] = value;
      row[dayIdx] = cell;
      grid[shortName] = row;
      return sheetWithPrunedAlerts({ ...sh, grid });
    });

    // Real-time BÙ / PHÉP balance differential calculation
    const prevTokens = splitTaskCodes(previous, taskList);
    const nextTokens = splitTaskCodes(value, taskList);

    const prevHasBu = prevTokens.some(c => fold(c) === 'bu');
    const nextHasBu = nextTokens.some(c => fold(c) === 'bu');

    const prevHasPhep = prevTokens.some(c => fold(c) === 'p' || fold(c) === 'phep');
    const nextHasPhep = nextTokens.some(c => fold(c) === 'p' || fold(c) === 'phep');

    let buDelta = 0;
    if (!prevHasBu && nextHasBu) buDelta = -0.5;
    else if (prevHasBu && !nextHasBu) buDelta = 0.5;

    let phepDelta = 0;
    if (!prevHasPhep && nextHasPhep) phepDelta = -0.5;
    else if (prevHasPhep && !nextHasPhep) phepDelta = 0.5;

    if (buDelta !== 0 || phepDelta !== 0) {
      updateActiveDept(d => ({
        ...d,
        staff: d.staff.map(s => {
          if (s.shortName !== shortName) return s;
          const currentBu = Number(s.buBalance) || 0;
          const currentPhep = Number(s.phepBalance) || 0;
          return {
            ...s,
            buBalance: buDelta !== 0 ? Math.round((currentBu + buDelta) * 10) / 10 : s.buBalance,
            phepBalance: phepDelta !== 0 ? Math.round((currentPhep + phepDelta) * 10) / 10 : s.phepBalance
          };
        })
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
    updateDeptMonth(sh => ({ ...sh, monthKey: next }));
  };

  const handleWeekMerges = (weekMerges) => {
    if (!allow('week')) return;
    updateActiveSheet(sh => ({ ...sh, weekMerges }));
  };

  const handleMonthMerges = (monthMerges) => {
    if (!allow('month')) return;
    updateDeptMonth(sh => ({ ...sh, monthMerges }));
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

  const saveDeptList = async (field, entry) => {
    const tab = field === 'studyEntries' ? 'study' : 'leave';
    if (!allow(tab)) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const departments = (prev.departments || []).map(dept => {
      if (dept.id !== deptId) return dept;
      const list = dept[field] || [];
      const exists = list.some(item => item.id === entry.id);
      return {
        ...dept,
        [field]: exists ? list.map(item => (item.id === entry.id ? entry : item)) : [...list, entry]
      };
    });
    const nextStore = ensureSheets({ ...prev, departments });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: tab === 'leave' ? 'Đã lưu lịch nghỉ và ghi lên Google Sheet.' : 'Đã lưu lịch học và ghi lên Google Sheet.',
        });
      } catch (err) {
        console.warn('persistStoreToSheet saveDeptList failed:', err);
      }
    }
  };

  const deleteDeptItem = async (field, id) => {
    const tab = field === 'studyEntries' ? 'study' : 'leave';
    if (!allow(tab)) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const departments = (prev.departments || []).map(dept => {
      if (dept.id !== deptId) return dept;
      return {
        ...dept,
        [field]: (dept[field] || []).filter(item => item.id !== id)
      };
    });
    const nextStore = ensureSheets({ ...prev, departments });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: tab === 'leave' ? 'Đã xóa lịch nghỉ và ghi lên Google Sheet.' : 'Đã xóa lịch học và ghi lên Google Sheet.',
        });
      } catch (err) {
        console.warn('persistStoreToSheet deleteDeptItem failed:', err);
      }
    }
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
    updateDeptMonth(sh => ({
      ...sh,
      monthGrid: { ...(sh.monthGrid || {}), [sessionCellKey(iso, roleKey, session)]: value ?? '' }
    }));
  };

  const handleUpdateMonthCustomCell = (id, weekStart, slot, value) => {
    if (!allow('month')) return;
    updateDeptMonth(sh => ({
      ...sh,
      monthGrid: { ...(sh.monthGrid || {}), [customCellKey(id, weekStart, slot)]: value ?? '' }
    }));
  };

  const handleInsertMonthColumn = (index, side) => {
    if (!allow('month')) return;
    updateDeptMonth(sh => {
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
    updateDeptMonth(sh => ({
      ...sh,
      monthColumnTitles: { ...(sh.monthColumnTitles || {}), [key]: String(title || '').trim() || 'Cột mới' }
    }));
  };

  const handleRemoveMonthColumn = (key) => {
    if (!allow('month')) return;
    if (!String(key).startsWith('x:')) return;
    const id = String(key).slice(2);
    updateDeptMonth(sh => {
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
    updateDeptMonth(sh => ({
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
    updateDeptMonth(sh => {
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
    updateDeptMonth(sh => ({
      ...sh,
      monthRoles: resolveMonthRoles(sh.monthRoles).map(role => (
        role.key === roleKey
          ? {
            ...role,
            // Giữ đúng chữ người dùng gõ; vẫn gắn taskId nếu khớp mã/tên task.
            label: text,
            taskId: matched?.id || null
          }
          : role
      ))
    }));
  };

  const handleDeleteMonthRole = (roleKey) => {
    if (!allow('month')) return;
    updateDeptMonth(sh => {
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
      sheets: [...st.sheets, { id, name: nextSheetName(st.sheets), ...blankSheetContent(activeDept, activeSheet.startDate, activeSheet) }]
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
    updateActiveDept((d) => ({
      ...d,
      staff: [...(d.staff || []), {
        ...newStaffObj,
        source: newStaffObj.source || 'local',
        showInLichKhoa: newStaffObj.showInLichKhoa || 'On',
        deptId: newStaffObj.deptId || d.id,
        deptLabel: newStaffObj.deptLabel || d.name,
      }],
    }));
  };

  const handleUpdateStaff = async (updatedStaff, oldShortName) => {
    if (!allow('staff')) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const departments = (prev.departments || []).map(d =>
      d.id === deptId
        ? { ...d, staff: (d.staff || []).map(s => (s.id === updatedStaff.id ? updatedStaff : s)) }
        : d
    );

    // Đổi tên viết tắt -> chuyển dữ liệu lịch của bác sĩ sang tên mới trong tất cả các sheet
    let sheetsByDept = prev.sheetsByDept || {};
    const newShortName = updatedStaff.shortName;
    if (oldShortName && oldShortName !== newShortName && sheetsByDept[deptId]) {
      const st = sheetsByDept[deptId];
      sheetsByDept = {
        ...sheetsByDept,
        [deptId]: {
          ...st,
          sheets: (st.sheets || []).map(sh => {
            let grid = sh.grid;
            if (grid && grid[oldShortName]) {
              grid = { ...grid, [newShortName]: grid[oldShortName] };
              delete grid[oldShortName];
            }
            let monthGrid = sh.monthGrid;
            if (monthGrid && typeof monthGrid === 'object') {
              monthGrid = { ...monthGrid };
              let monthChanged = false;
              Object.entries(monthGrid).forEach(([mk, mv]) => {
                if (mv === oldShortName) {
                  monthGrid[mk] = newShortName;
                  monthChanged = true;
                }
              });
              if (!monthChanged) monthGrid = sh.monthGrid;
            }
            return { ...sh, grid, monthGrid };
          })
        }
      };
    }

    const nextStore = ensureSheets({ ...prev, departments, sheetsByDept });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: `Đã cập nhật nhân sự ${updatedStaff.name || updatedStaff.shortName} và ghi lên Google Sheet.`,
        });
      } catch (err) {
        console.warn('persistStoreToSheet staff failed:', err);
      }
    }
  };

  const handleDeleteStaff = async (staffId) => {
    if (!allow('staff')) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id;
    const target = (prev.departments || [])
      .find((d) => d.id === deptId)?.staff
      ?.find((s) => s.id === staffId);
    if (!target || !isLocalScheduleStaff(target)) return;

    const nextStore = ensureSheets({
      ...prev,
      departments: (prev.departments || []).map((d) => (
        d.id === deptId
          ? { ...d, staff: (d.staff || []).filter((s) => s.id !== staffId) }
          : d
      )),
    });
    setStore(nextStore);
    saveStore(nextStore, { skipCloud: true });
    storeRef.current = nextStore;
    // Force push — tránh pull định kỳ kéo lại hàng local còn trên Sheet.
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: 'Đã xóa nhân sự lịch cục bộ và ghi lên Google Sheet.',
        });
      } catch (error) {
        window.alert(String(error?.message || error || 'Xóa local nhưng chưa ghi được Sheet. Thử nút làm mới lịch khoa.'));
      }
    }
  };

  const handlePurgeBackupStaff = async () => {
    if (!allow('staff')) return;
    const before = (activeDept?.staff || []).filter(isBackupImportedStaff).length;
    if (!before) {
      window.alert('Không còn nhân sự «Lịch cục bộ» từ file sao lưu (doc_*).');
      return;
    }
    const prev = storeRef.current;
    const deptId = activeDept?.id;
    const nextStore = ensureSheets({
      ...prev,
      departments: (prev.departments || []).map((d) => (
        d.id === deptId
          ? { ...d, staff: purgeBackupImportedStaff(d.staff) }
          : d
      )),
    });
    setStore(nextStore);
    saveStore(nextStore, { skipCloud: true });
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: `Đã gỡ ${before} nhân sự trùng từ file sao lưu và ghi lên Sheet.`,
        });
      } catch (error) {
        window.alert(String(error?.message || error || 'Gỡ local nhưng chưa ghi được Sheet.'));
      }
    }
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
  const handleAddTask = async (newTaskObj) => {
    if (!allow('tasks') && !allow('month')) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const nextStore = ensureSheets({
      ...prev,
      departments: (prev.departments || []).map(d =>
        d.id === deptId ? { ...d, tasks: [...(d.tasks || []), newTaskObj] } : d
      )
    });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: `Đã thêm task ${newTaskObj.code || ''} và ghi lên Google Sheet.`,
        });
      } catch (err) {
        console.warn('persistStoreToSheet add task failed:', err);
      }
    }
  };

  const handleUpdateTask = async (updatedTask) => {
    if (!allow('tasks') && !allow('month')) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const nextStore = ensureSheets({
      ...prev,
      departments: (prev.departments || []).map(d =>
        d.id === deptId
          ? { ...d, tasks: (d.tasks || []).map(item => item.id === updatedTask.id ? updatedTask : item) }
          : d
      )
    });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: `Đã cập nhật task ${updatedTask.code || ''} và ghi lên Google Sheet.`,
        });
      } catch (err) {
        console.warn('persistStoreToSheet update task failed:', err);
      }
    }
  };

  const handleDeleteTask = async (taskId) => {
    if (!allow('tasks')) return;
    const prev = storeRef.current;
    const deptId = activeDept?.id || prev?.activeDeptId || 'dept_tim_mach';
    const nextStore = ensureSheets({
      ...prev,
      departments: (prev.departments || []).map(d =>
        d.id === deptId
          ? { ...d, tasks: (d.tasks || []).filter(t => t.id !== taskId) }
          : d
      )
    });
    setStore(nextStore);
    saveStore(nextStore);
    storeRef.current = nextStore;
    if (typeof sheetSync.persistStoreToSheet === 'function') {
      try {
        await sheetSync.persistStoreToSheet(nextStore, {
          notice: 'Đã xóa task và ghi lên Google Sheet.',
        });
      } catch (err) {
        console.warn('persistStoreToSheet delete task failed:', err);
      }
    }
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

  const handleImportStore = async (imported) => {
    if (!allow('tasks')) return;
    try {
      const next = ensureSheets(imported);
      if (!next.departments?.length) {
        throw new Error('File sao lưu không có khoa hợp lệ.');
      }
      // CHD: giữ đúng 1 khoa Tim mạch nếu backup có nhiều khoa; bỏ doc_* seed.
      let toSave = next;
      if (embedInChd) {
        const cardio = next.departments.find((d) => d.id === CARDIOLOGY_DEPT_ID)
          || next.departments.find((d) => /tim\s*mạch/i.test(String(d.name || '')))
          || next.departments[0];
        const cardioClean = {
          ...cardio,
          staff: purgeBackupImportedStaff(cardio.staff),
        };
        toSave = ensureSheets({
          ...next,
          departments: [cardioClean],
          activeDeptId: cardioClean.id,
        });
        if (chdStaffList?.length) {
          toSave = mergeChdStaffIntoStore(toSave, chdStaffList);
        }
      }
      setStore(toSave);
      saveStore(toSave, { skipCloud: true });
      storeRef.current = toSave;
      // Ghi ngay lên Google Sheet — không phụ thuộc localStorage qua các lần deploy.
      if (typeof sheetSync.persistStoreToSheet === 'function') {
        await sheetSync.persistStoreToSheet(toSave, {
          notice: 'Đã lưu Task/nhân sự lịch lên Google Sheet Tim mạch.',
        });
      }
    } catch (error) {
      console.error('Import store failed:', error);
      window.alert(String(error?.message || error || 'Không nhập được file sao lưu.'));
    }
  };

  const viewportWidth = useViewportWidth();
  const coarsePointer = typeof window !== 'undefined'
    && typeof window.matchMedia === 'function'
    && window.matchMedia('(pointer: coarse)').matches;
  const isMobileUi = !embedInChd && resolveUiMode({
    width: viewportWidth,
    coarsePointer
  }) === 'mobile';
  const navViews = visibleNav(actor);

  const handleSelectView = useCallback((view) => {
    setActiveView(view);
    if (embedInChd && onNavigateModule && MENU_BY_VIEW[view]) {
      onNavigateModule(MENU_BY_VIEW[view]);
    }
  }, [embedInChd, onNavigateModule]);

  const requestStaffAddForm = useCallback(() => {
    staffAddSeqRef.current += 1;
    setStaffAutoOpenAddSeq(staffAddSeqRef.current);
  }, []);

  const handleStaffTabAddShortcut = useCallback(() => {
    setActiveView('STAFF');
    if (embedInChd && onNavigateModule) {
      onNavigateModule('lich-khoa-staff');
    }
    requestStaffAddForm();
  }, [embedInChd, onNavigateModule, requestStaffAddForm]);

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
      onAddStaff={handleAddStaff}
      onUpdateStaff={handleUpdateStaff}
      onDeleteStaff={handleDeleteStaff}
      onPurgeBackupStaff={handlePurgeBackupStaff}
      onReorderStaff={handleReorderStaff}
      onBulkImport={undefined}
      readOnly={!allow('staff')}
      chdSynced
      headerLayout={embedInChd ? 'embedded' : 'full'}
      autoOpenAdd={staffAutoOpenAddSeq || undefined}
    />
  );

  const staffNavAddEnabled = embedInChd && allow('staff');

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
      sheetEngineReady={sheetEngineReady}
    />
  );

  if (!syncAuthReady) {
    return (
      <div className="lichkhoa-root chd-embed flex items-center justify-center p-8 text-sm text-slate-600">
        Cần đăng nhập CHD để mở Lịch khoa.
      </div>
    );
  }

  if (!getSpreadsheetId() && typeof onNavigateToSheets === 'function') {
    return (
      <div className="lichkhoa-root chd-embed flex flex-col items-center justify-center gap-3 p-8 text-center">
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

  const rootClass = embedInChd ? 'lichkhoa-root chd-embed app-container' : 'lichkhoa-root app-container';

  if (isMobileUi) {
    return (
      <div className={`${rootClass} mobile-app`}>
        {sheetSyncBanner}
        {sheetEngineBanner}
        {sheetDialogs}
        <MobileShell
          activeDept={activeDept}
          departments={store.departments}
          onSelectDept={handleSelectDept}
          hideDeptSelector={hideDeptSelector}
          tenantLabel={tenantMeta.label}
          activeView={activeView}
          onSelectView={handleSelectView}
          views={navViews}
          theme={theme}
          onToggleTheme={handleToggleTheme}
          onNotifications={() => {}}
          onProfile={() => onNavigateToSheets?.()}
          onSettings={() => onNavigateToSheets?.()}
          onExit={handleExit}
          showStaffTabAddShortcut={staffNavAddEnabled}
          onStaffTabAdd={handleStaffTabAddShortcut}
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
    <div className={rootClass}>
      <Navbar
        activeDept={activeDept}
        departments={store.departments}
        onSelectDept={handleSelectDept}
        hideDeptSelector={hideDeptSelector}
        tenantLabel={tenantMeta.label}
        activeView={activeView}
        onSelectView={handleSelectView}
        views={navViews}
        theme={theme}
        onToggleTheme={handleToggleTheme}
        onNotifications={() => {}}
        onProfile={() => onNavigateToSheets?.()}
        onSettings={() => onNavigateToSheets?.()}
        onExit={handleExit}
        onSheetSync={isSheetBackend() && syncAuthReady ? () => sheetSync.manualSync() : undefined}
        sheetSyncTitle={sheetSyncTitle}
        embedInChd={embedInChd}
        showStaffTabAddShortcut={staffNavAddEnabled}
        onStaffTabAdd={handleStaffTabAddShortcut}
      />
      {sheetSyncBanner}
      {sheetEngineBanner}
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
