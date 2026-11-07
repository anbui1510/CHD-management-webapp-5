/** F-304 — tên tab trên Google Spreadsheet (1 file / khoa). */
export const SHEET_TABS = {
  META: '_meta',
  NHAN_SU: 'NhanSu',
  TASK: 'Task',
  LICH_TUAN: 'LichTuan',
  LICH_THANG: 'LichThang',
  LICH_NGHI: 'LichNghi',
  LICH_HOC: 'LichHoc',
  DASHBOARD: 'Dashboard',
};

export const REQUIRED_TABS = [
  SHEET_TABS.META,
  SHEET_TABS.NHAN_SU,
  SHEET_TABS.TASK,
  SHEET_TABS.LICH_TUAN,
  SHEET_TABS.LICH_THANG,
];

export const TAB_ACCESS_ID = {
  [SHEET_TABS.NHAN_SU]: 'staff',
  [SHEET_TABS.TASK]: 'tasks',
  [SHEET_TABS.LICH_TUAN]: 'week',
  [SHEET_TABS.LICH_THANG]: 'month',
  [SHEET_TABS.LICH_NGHI]: 'leave',
  [SHEET_TABS.LICH_HOC]: 'study',
  [SHEET_TABS.DASHBOARD]: 'dashboard',
};

export const SCHEMA_VERSION = 1;

export const NHAN_SU_HEADERS = [
  'id', 'name', 'shortName', 'title', 'dutyQuota', 'buBalance', 'phepBalance',
  'email', 'loginEmail', 'position', 'deptId', 'deptLabel', 'showInLichKhoa', 'source', 'accessRole',
  'access_week', 'access_month', 'access_leave', 'access_study',
  'access_calendar', 'access_dashboard', 'access_staff', 'access_tasks',
  'studyFrom', 'studyTo',
];

export const TASK_HEADERS = [
  'id', 'code', 'name', 'category', 'session', 'scope', 'description',
  'bgColor', 'textColor', 'blocker', 'delta', 'dutyRole', 'encodeDuty',
  'buRt', 'buVg', 'deltaRt', 'deltaVg', 'triggerRT',
  'ownersJson', 'ownerOrderJson', 'fixedDaysJson', 'fixedSlotsJson', 'locksJson',
];

// Các cột đầu giữ nguyên để tương thích sheet cũ; các cột sau lưu đủ field UI/scheduler dùng
// (shortName, from/to, sessions, repeat...) để không mất dữ liệu khi export → import.
const ENTRY_EXTRA_HEADERS = [
  'shortName', 'from', 'to', 'iso', 'session', 'sessions',
  'plannedLong', 'repeat', 'exdates', 'createdAt',
];
export const LEAVE_HEADERS = ['id', 'staffId', 'fromDate', 'toDate', 'note', 'type', ...ENTRY_EXTRA_HEADERS];
export const STUDY_HEADERS = ['id', 'staffId', 'fromDate', 'toDate', 'note', 'type', 'taskId', 'topic', ...ENTRY_EXTRA_HEADERS];

export const WEEK_HEADERS = [
  'recordType', 'sheetId', 'sheetName', 'startDate', 'weekStart', 'staffId', 'dayIndex', 'slot', 'value',
];

export const MONTH_HEADERS = ['recordType', 'sheetId', 'monthKey', 'field', 'key', 'value'];
