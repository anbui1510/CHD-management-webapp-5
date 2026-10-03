import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  Filter,
  Plus,
  Save,
  Search,
  X
} from 'lucide-react';
import { CMR, Consult, Patient, Source, Staff, formatVNTime, removeDiacritics, findPatientByKey, normalizePatientKey } from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import {
  DEFAULT_CMR_DEVICE,
  DEFAULT_CMR_METHOD,
  resolveCMRDevice,
  resolveCMRMethod
} from '../data/cmrDefaults';
import { formatPatientDobWithAge, getPatientAgeDescription } from '../utils/patientDisplay';
import { VNDateInput } from './VNDateInput';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import {
  findBlockingPendingCmr,
  findDuplicatePatientById1,
  getFormattedDateKey,
  PATIENT_VALIDATION_MSG,
} from '../utils/patientFormValidation';
import { useModuleSubheader } from '../hooks/useModuleSubheader';

interface MRISchedulerViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  sources: Source[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
  onPatchCmr?: (cmrKey: string, patch: Partial<CMR>) => void;
  onAddCmr?: (cmr: CMR) => void;
  onAddPatient?: (patient: Patient) => void;
}

const ADDRESS_OPTIONS = [
  "TP Hà Nội", "Tuyên Quang", "Cao Bằng", "Lai Châu", "Lào Cai", "Thái Nguyên", "Điện Biên", "Lạng Sơn", "Sơn La", "Phú Thọ", "Bắc Ninh", "Quảng Ninh", "TP Hải Phòng", "Hưng Yên", "Ninh Bình", "Thanh Hoá", "Nghệ An", "Hà Tĩnh", "Quảng Trị", "TP Huế", "TP Đà Nẵng", "Quảng Ngãi", "Gia Lai", "Đắk Lắk", "Khánh Hoà", "Lâm Đồng", "Đồng Nai", "Tây Ninh", "TP Hồ Chí Minh", "Đồng Tháp", "An Giang", "Vĩnh Long", "TP Cần Thơ", "Cà Mau"
];

const getShortStaffName = (fullName: string, staffList: { StaffName: string }[] = []): string => {
  if (!fullName) return '';
  let cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  cleaned = cleaned.replace(/^(BS\.|BS)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return '';
  const firstName = parts[parts.length - 1];
  if (parts.length === 1) return `BS. ${firstName}`;
  const middleName = parts[parts.length - 2];
  const hasFirstNameDuplicate = staffList.length > 0 && staffList.some(s => {
    let sClean = s.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
    sClean = sClean.replace(/^(BS\.|BS)\s+/i, '').trim();
    const sParts = sClean.split(/\s+/);
    if (sParts.length <= 1) return false;
    return sParts[sParts.length - 1] === firstName && s.StaffName !== fullName;
  });
  if (hasFirstNameDuplicate && middleName) return `BS. ${middleName} ${firstName}`;
  return `BS. ${firstName}`;
};

type MriTab = 'unscheduled' | 'scheduled';

type MRISchedulerItem = CMR & {
  __patient?: Patient;
  __consult?: Consult;
  __isSynthetic?: boolean;
};

const CALL_STATUS_OPTIONS = ['', 'Đồng ý', 'Không đồng ý'];

const ANESTHESIA_OPTIONS = ['', 'Khám gây mê trước', 'Không'];

const getPatientDisplayName = (patientName?: string): string => {
  if (!patientName) return 'MRI';
  const parts = patientName.trim().split(/\s+/);
  return parts.slice(-2).join(' ');
};

const EXCEL_LINE_HEIGHT_PT = 18;
const EXCEL_ROW_PADDING_PT = 10;

export default function MRISchedulerView({
  patients,
  consults,
  cmrs,
  sources,
  staffList = [],
  currentStaff,
  onRefreshData,
  onPatchCmr,
  onAddCmr,
  onAddPatient
}: MRISchedulerViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const [activeTab, setActiveTab] = useState<MriTab>('unscheduled');
  const [mobileActiveTab, setMobileActiveTab] = useState<'unscheduled' | 'scheduled' | 'calendar'>('unscheduled');

  // Ad-hoc "Xếp bổ sung" modal states
  const [showAdHoc, setShowAdHoc] = useState(false);
  const [adHocLoading, setAdHocLoading] = useState(false);
  const [adHocSuccess, setAdHocSuccess] = useState('');
  const [adHocError, setAdHocError] = useState('');
  const [adHocPatientMode, setAdHocPatientMode] = useState<'select' | 'create'>('select');
  const [adHocSearchPat, setAdHocSearchPat] = useState('');
  const [adHocSelectedPatKey, setAdHocSelectedPatKey] = useState('');
  const [adHocNewPatID1, setAdHocNewPatID1] = useState('');
  const [adHocNewPatID2, setAdHocNewPatID2] = useState('');
  const [adHocNewPatName, setAdHocNewPatName] = useState('');
  const [adHocNewPatDOB, setAdHocNewPatDOB] = useState('');
  const [adHocNewPatSex, setAdHocNewPatSex] = useState<'Nam' | 'Nữ'>('Nam');
  const [adHocNewPatAddress, setAdHocNewPatAddress] = useState('TP Hà Nội');
  const [adHocNewPatPhone, setAdHocNewPatPhone] = useState('');
  const [adHocForm, setAdHocForm] = useState<Partial<CMR>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedItem, setSelectedItem] = useState<MRISchedulerItem | null>(null);
  const [isFilterExpanded, setIsFilterExpanded] = useState(false);
  const [exportDateType, setExportDateType] = useState<'all' | 'custom' | 'group'>('custom');
  const [exportStartDate, setExportStartDate] = useState('');
  const [exportEndDate, setExportEndDate] = useState('');
  const [exportGroupType, setExportGroupType] = useState<'month' | 'quarter'>('month');
  const [exportGroupValue, setExportGroupValue] = useState('1');
  const [currentMonth, setCurrentMonth] = useState(5);
  const [currentYear, setCurrentYear] = useState(2026);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');
  const [exportMsg, setExportMsg] = useState('');

  const [formData, setFormData] = useState<Partial<CMR>>({});
  // Snapshot of the form right after selecting/saving an item, used to detect
  // unsaved changes when leaving the scheduling form.
  const [formSnapshot, setFormSnapshot] = useState('');
  // Save/exit confirmation dialog: 'save' = confirm before saving,
  // 'exit' = unsaved changes when leaving the form.
  const [confirmMode, setConfirmMode] = useState<null | 'save' | 'exit'>(null);
  const [confirmError, setConfirmError] = useState('');

  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.PatientKey) map.set(String(patient.PatientKey).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = normalizeDiagnosisID(DiagnosisID);
    if (!trimmed) return;

    await persistWithSheetsSync(
      reportMutationResponse,
      '/api/sources',
      { method: 'POST', body: JSON.stringify({ DiagnosisID: trimmed }) },
      buildSyncContext('mri-scheduler', { viewLabel: 'Xếp lịch MRI' }),
      { baseMessage: 'Đã thêm mã chẩn đoán vào danh mục' }
    );

    onRefreshData();
  };

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(
      [
        ...sources.map(source => String(source.Department || '').trim()),
        ...consults.map(consult => String(consult.Department || '').trim()),
        ...cmrs.flatMap(cmr => [
          String(cmr.DepartRequest || '').trim(),
          String(cmr.PostDepart || '').trim()
        ])
      ]
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [sources, consults, cmrs]);

  const allMriItems = useMemo<MRISchedulerItem[]>(() => {
    const normalizedCmrs = cmrs.map((cmr, index) => {
      const key = cmr.CMRKey || cmr.CMRkey || `cmr_no_key_${index}`;
      const patient =
        patientsByKey.get(String(cmr.PatientKey || '').trim().toLowerCase()) ||
        patientsByKey.get(String(cmr.MBN || '').trim().toLowerCase());
      const consult = consults.find(c => c.ConsultKey && c.ConsultKey === cmr.ConsultKey);

      return {
        ...cmr,
        CMRKey: key,
        PatientKey: cmr.PatientKey || patient?.PatientKey || '',
        __patient: patient,
        __consult: consult
      };
    });

    const existingConsultKeys = new Set(normalizedCmrs.map(cmr => String(cmr.ConsultKey || '').trim()).filter(Boolean));
    const existingPatientKeys = new Set(normalizedCmrs.map(cmr => String(cmr.PatientKey || '').trim()).filter(Boolean));

    const syntheticFromConsults = consults
      .filter(consult => String(consult.ConsultResultID || '').trim().toLowerCase() === 'chụp mri')
      .filter(consult => {
        if (consult.ConsultKey && existingConsultKeys.has(String(consult.ConsultKey).trim())) return false;
        if (consult.PatientKey && existingPatientKeys.has(String(consult.PatientKey).trim())) return false;
        const patient = patientsByKey.get(String(consult.PatientKey || '').trim().toLowerCase());
        const outcome = String(patient?.Outcome || '').trim().toLowerCase();
        return outcome !== 'tử vong' && outcome !== 'nặng xin về';
      })
      .map((consult): MRISchedulerItem => {
        const patient = patientsByKey.get(String(consult.PatientKey || '').trim().toLowerCase());
        return {
          CMRKey: `pending_${consult.ConsultKey}`,
          ConsultKey: consult.ConsultKey,
          PatientKey: consult.PatientKey,
          MBN: patient?.PatientID1 || '',
          'Họ và tên': patient?.PatientName || '',
          PatientWeight: consult.PatientWeight || '',
          CMRDiagnosisID: consult.DiagnosisID || '',
          CMRDiagnosis: consult.DetailDiagnosis || '',
          CMRRequest: consult.DetailConsultResult || consult.ConsultNote || '',
          DepartRequest: consult.Department || '',
          CMRCallStatus: '',
          __patient: patient,
          __consult: consult,
          __isSynthetic: true
        };
      });

    return [...normalizedCmrs, ...syntheticFromConsults];
  }, [cmrs, consults, patientsByKey]);

  const segmentedItems = useMemo(() => {
    const unscheduled = allMriItems
      .filter(item => !getFormattedDateKey(item.CMRScheduledDate))
      .sort((a, b) => String(b.UpdateTime || b.__consult?.ConsultDate || '').localeCompare(String(a.UpdateTime || a.__consult?.ConsultDate || '')));
    const scheduled = allMriItems
      .filter(item => !!getFormattedDateKey(item.CMRScheduledDate))
      .sort((a, b) => getFormattedDateKey(b.CMRScheduledDate).localeCompare(getFormattedDateKey(a.CMRScheduledDate)));
    return { unscheduled, scheduled };
  }, [allMriItems]);

  const displayItems = useMemo(() => {
    const source = activeTab === 'unscheduled' ? segmentedItems.unscheduled : segmentedItems.scheduled;
    const q = removeDiacritics(searchQuery).toLowerCase().trim();
    if (!q) return source;
    return source.filter(item => {
      const patient = item.__patient;
      return [
        patient?.PatientName,
        patient?.PatientID1,
        item['Họ và tên'],
        item.MBN,
        item.CMRDiagnosisID,
        item.CMRDiagnosis,
        item.CMRRequest,
        item.CMRCallStatus
      ].some(value => removeDiacritics(String(value || '')).toLowerCase().includes(q));
    });
  }, [activeTab, segmentedItems, searchQuery]);

  const calendarCells = useMemo(() => {
    const firstDayOfMonth = new Date(currentYear, currentMonth, 1);
    let startDay = firstDayOfMonth.getDay();
    if (startDay === 0) startDay = 7;
    const startOffset = startDay - 1;
    const totalDays = new Date(currentYear, currentMonth + 1, 0).getDate();
    const prevTotalDays = new Date(currentYear, currentMonth, 0).getDate();
    const prevMonth = currentMonth === 0 ? 11 : currentMonth - 1;
    const prevYear = currentMonth === 0 ? currentYear - 1 : currentYear;
    const nextMonth = currentMonth === 11 ? 0 : currentMonth + 1;
    const nextYear = currentMonth === 11 ? currentYear + 1 : currentYear;
    const cells: { day: number; dateStr: string; isCurrentMonth: boolean; isToday: boolean }[] = [];

    for (let i = startOffset - 1; i >= 0; i--) {
      const day = prevTotalDays - i;
      cells.push({
        day,
        dateStr: `${prevYear}-${String(prevMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isCurrentMonth: false,
        isToday: false
      });
    }

    for (let day = 1; day <= totalDays; day++) {
      cells.push({
        day,
        dateStr: `${currentYear}-${String(currentMonth + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        isCurrentMonth: true,
        isToday: currentYear === 2026 && currentMonth === 5 && day === 6
      });
    }

    let nextDay = 1;
    while (cells.length < 42) {
      cells.push({
        day: nextDay,
        dateStr: `${nextYear}-${String(nextMonth + 1).padStart(2, '0')}-${String(nextDay).padStart(2, '0')}`,
        isCurrentMonth: false,
        isToday: false
      });
      nextDay += 1;
    }

    return cells;
  }, [currentMonth, currentYear]);

  const exportDateRange = useMemo(() => {
    let start = '';
    let end = '';
    if (exportDateType === 'all') {
      // no date filtering
    } else if (exportDateType === 'custom') {
      start = exportStartDate;
      end = exportEndDate;
    } else if (exportGroupType === 'month') {
      const m = parseInt(exportGroupValue, 10);
      start = `${currentYear}-${String(m).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, m, 0).getDate();
      end = `${currentYear}-${String(m).padStart(2, '0')}-${lastDay}`;
    } else {
      const q = parseInt(exportGroupValue, 10);
      const startMonth = (q - 1) * 3 + 1;
      const endMonth = startMonth + 2;
      start = `${currentYear}-${String(startMonth).padStart(2, '0')}-01`;
      const lastDay = new Date(currentYear, endMonth, 0).getDate();
      end = `${currentYear}-${String(endMonth).padStart(2, '0')}-${lastDay}`;
    }
    return { start, end };
  }, [exportDateType, exportStartDate, exportEndDate, exportGroupType, exportGroupValue, currentYear]);

  const filteredScheduleItems = useMemo(() => {
    const { start, end } = exportDateRange;
    return segmentedItems.scheduled.filter(item => {
      if (start && end) {
        const date = getFormattedDateKey(item.CMRScheduledDate);
        if (!date || date < start || date > end) return false;
      }
      return true;
    }).sort((a, b) =>
      getFormattedDateKey(a.CMRScheduledDate).localeCompare(getFormattedDateKey(b.CMRScheduledDate))
    );
  }, [exportDateRange, segmentedItems.scheduled]);

  const handleExportExcel = async () => {
    try {
      if (filteredScheduleItems.length === 0) {
        setExportMsg('Không có ca bệnh nào trong khoảng thời gian này!');
        return;
      }

      const vnDays = ['Chủ Nhật', 'Thứ Hai', 'Thứ Ba', 'Thứ Tư', 'Thứ Năm', 'Thứ Sáu', 'Thứ Bảy'];
      const exportItems = [...filteredScheduleItems];
      const { start: rangeStart, end: rangeEnd } = exportDateRange;
      const firstDate = rangeStart || getFormattedDateKey(exportItems[0]?.CMRScheduledDate);
      const lastDate = rangeEnd || getFormattedDateKey(exportItems[exportItems.length - 1]?.CMRScheduledDate);
      const startFormatted = firstDate ? firstDate.split('-').reverse().join('/') : '';
      const endFormatted = lastDate ? lastDate.split('-').reverse().join('/') : '';

      let titleStr = 'LỊCH CHỤP MRI TIM';
      if (exportDateType === 'group' && exportGroupType === 'month') {
        titleStr = `LỊCH CHỤP MRI TIM THÁNG ${exportGroupValue} NĂM ${currentYear}`;
      } else if (exportDateType === 'group' && exportGroupType === 'quarter') {
        titleStr = `LỊCH CHỤP MRI TIM QUÝ ${exportGroupValue} NĂM ${currentYear}`;
      } else if (firstDate && lastDate) {
        const startMonth = Number(firstDate.split('-')[1]);
        const endMonth = Number(lastDate.split('-')[1]);
        const startYear = firstDate.split('-')[0];
        const endYear = lastDate.split('-')[0];
        titleStr = startMonth === endMonth && startYear === endYear
          ? `LỊCH CHỤP MRI TIM THÁNG ${startMonth} NĂM ${startYear}`
          : `LỊCH CHỤP MRI TIM TỪ THÁNG ${startMonth} ĐẾN THÁNG ${endMonth} NĂM ${endYear}`;
      }

      const ExcelJS = await import('exceljs');
      const workbook = new ExcelJS.Workbook();
      const worksheet = workbook.addWorksheet('CMRFilter_Scheduled');

      worksheet.pageSetup = {
        paperSize: 9,
        orientation: 'landscape',
        fitToPage: true,
        fitToWidth: 1,
        fitToHeight: 0
      };

      const fontTimesNormal = { name: 'Times New Roman', size: 11 };
      const fontTimesBold = { name: 'Times New Roman', size: 11, bold: true };
      const fontTimesTitle = { name: 'Times New Roman', size: 14, bold: true };
      const centerAlignment = { horizontal: 'center' as const, vertical: 'middle' as const, wrapText: true };
      const thinBorder = {
        top: { style: 'thin' as const, color: { argb: 'FF000000' } },
        left: { style: 'thin' as const, color: { argb: 'FF000000' } },
        bottom: { style: 'thin' as const, color: { argb: 'FF000000' } },
        right: { style: 'thin' as const, color: { argb: 'FF000000' } }
      };

      worksheet.addRow(['BỆNH VIỆN NHI ĐỒNG THÀNH PHỐ']);
      worksheet.addRow(['KHOA TIM MẠCH']);
      worksheet.addRow([]);
      worksheet.getCell('A1').font = fontTimesBold;
      worksheet.getCell('A2').font = fontTimesBold;

      const titleRow = worksheet.addRow(['', titleStr]);
      worksheet.mergeCells(`B${titleRow.number}:K${titleRow.number}`);
      const titleCell = worksheet.getCell(`B${titleRow.number}`);
      titleCell.font = fontTimesTitle;
      titleCell.alignment = { horizontal: 'center', vertical: 'middle' };

      worksheet.addRow([]);

      const headers = [
        'STT',
        'Ngày chụp',
        'Mã NB',
        'Họ và tên',
        'Thông tin',
        'Chẩn đoán',
        'Khoa chỉ định',
        'Phương pháp chụp',
        'Dự trù dụng cụ',
        'Khoa nằm sau chụp MRI',
        'Ghi chú'
      ];
      const headerRow = worksheet.addRow(headers);
      headerRow.height = 22;
      headerRow.eachCell((cell) => {
        cell.font = fontTimesBold;
        cell.alignment = centerAlignment;
        cell.border = thinBorder;
      });

      exportItems.forEach((item, index) => {
        const patient = item.__patient;
        const scheduledKey = getFormattedDateKey(item.CMRScheduledDate);
        let dayOfWeekStr = '';
        if (scheduledKey) {
          const [yyyy, mm, dd] = scheduledKey.split('-');
          if (yyyy && mm && dd) {
            const dateObj = new Date(parseInt(yyyy, 10), parseInt(mm, 10) - 1, parseInt(dd, 10));
            dayOfWeekStr = vnDays[dateObj.getDay()];
          }
        }
        const scheduledDisplay = scheduledKey
          ? `${dayOfWeekStr} ${scheduledKey.split('-').reverse().join('/')}`
          : '';

        const dobFormatted = patient?.PatientDOB ? formatVNTime(patient.PatientDOB) : '';
        const ageDesc = patient?.PatientDOB ? getPatientAgeDescription(patient.PatientDOB, scheduledKey) : '';
        const weightRaw = String(item.PatientWeight || item.__consult?.PatientWeight || '').trim();
        const weightStr = weightRaw
          ? (weightRaw.toLowerCase().includes('kg') ? weightRaw : `${weightRaw}kg`)
          : '';
        const address = patient?.PatientAddress || '';
        const thongTinLines = [
          patient?.PatientSex || '',
          dobFormatted && ageDesc ? `${dobFormatted} (${ageDesc})` : dobFormatted || ageDesc,
          weightStr,
          address
        ].filter(Boolean);
        const thongTin = thongTinLines.join('\n');

        const chanDoan = String(item.CMRDiagnosis || item.__consult?.DetailDiagnosis || '').trim();
        const khoaChiDinh = String(item.DepartRequest || item.__consult?.Department || 'Tim mạch').trim();
        const phuongPhap = resolveCMRMethod(item.CMRMethod);
        const duTru = resolveCMRDevice(item.CMRDevice);
        const khoaSau = String(item.PostDepart || 'Tim mạch').trim();
        const anesthesia = String(item.Anesthesia || '').trim();
        const callNote = String(item.CMRCallStatusNote || '').trim();
        const ghiChuParts = [
          anesthesia ? anesthesia.replace(/gây mê/gi, 'GMHS') : '',
          callNote
        ].filter(Boolean);
        const ghiChu = ghiChuParts.join('\n');

        const rowData = [
          index + 1,
          scheduledDisplay,
          patient?.PatientID1 || item.MBN || '',
          (patient?.PatientName || item['Họ và tên'] || '').toUpperCase(),
          thongTin,
          chanDoan,
          khoaChiDinh,
          phuongPhap,
          duTru,
          khoaSau,
          ghiChu
        ];

        const row = worksheet.addRow(rowData);
        const thongTinLineCount = thongTin.split('\n').length;
        const maxChars = Math.max(String(chanDoan).length, String(phuongPhap).length, String(duTru).length);
        row.height = Math.max(
          36,
          thongTinLineCount * EXCEL_LINE_HEIGHT_PT + EXCEL_ROW_PADDING_PT,
          Math.ceil(maxChars / 32) * 15 + EXCEL_ROW_PADDING_PT
        );

        row.eachCell((cell) => {
          cell.font = fontTimesNormal;
          cell.alignment = centerAlignment;
          cell.border = thinBorder;
        });
      });

      worksheet.columns = [
        { width: 5 },
        { width: 18 },
        { width: 12 },
        { width: 22 },
        { width: 20 },
        { width: 30 },
        { width: 14 },
        { width: 28 },
        { width: 28 },
        { width: 16 },
        { width: 16 }
      ];

      worksheet.addRow([]);
      worksheet.addRow([]);

      const now = new Date();
      const dateFooterRow = worksheet.addRow([]);
      dateFooterRow.getCell(8).value = `TP Hồ Chí Minh, ngày ${String(now.getDate()).padStart(2, '0')} tháng ${String(now.getMonth() + 1).padStart(2, '0')} năm ${now.getFullYear()}`;
      dateFooterRow.getCell(8).font = fontTimesNormal;
      dateFooterRow.getCell(8).alignment = centerAlignment;
      worksheet.mergeCells(`H${dateFooterRow.number}:K${dateFooterRow.number}`);

      const signatureTitleRow = worksheet.addRow([
        'TRƯỞNG KHOA TIM MẠCH',
        '', '', '', '', '', '', 'NGƯỜI LẬP BẢNG'
      ]);
      worksheet.mergeCells(`A${signatureTitleRow.number}:D${signatureTitleRow.number}`);
      worksheet.mergeCells(`H${signatureTitleRow.number}:K${signatureTitleRow.number}`);
      signatureTitleRow.eachCell((cell) => {
        if (cell.value) {
          cell.font = fontTimesBold;
          cell.alignment = centerAlignment;
        }
      });

      worksheet.addRow([]);
      worksheet.addRow([]);
      worksheet.addRow([]);

      const preparerName = currentStaff?.StaffName
        ? (currentStaff.StaffName.match(/^BS/i) ? currentStaff.StaffName : `BS. ${currentStaff.StaffName}`)
        : '';
      const signatureNameRow = worksheet.addRow(['', '', '', '', '', '', '', preparerName]);
      worksheet.mergeCells(`H${signatureNameRow.number}:K${signatureNameRow.number}`);
      signatureNameRow.getCell(8).font = fontTimesBold;
      signatureNameRow.getCell(8).alignment = centerAlignment;

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      document.body.appendChild(a);
      a.style.display = 'none';
      a.href = url;
      a.download = startFormatted && endFormatted
        ? `Lịch chụp MRI tim_${startFormatted.replace(/\//g, '-')}_${endFormatted.replace(/\//g, '-')}.xlsx`
        : `Lịch chụp MRI tim_Tat_ca.xlsx`;
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(url);

      setExportMsg('Tải file thành công!');
      window.setTimeout(() => setExportMsg(''), 3000);
    } catch (err: any) {
      console.error('Lỗi xuất excel MRI:', err);
      setExportMsg(`Lỗi xuất excel: ${err?.message || 'Không rõ nguyên nhân'}`);
    }
  };

  const handleSelectItem = (item: MRISchedulerItem) => {
    setSelectedItem(item);
    const nextForm: Partial<CMR> = {
      CMRKey: item.CMRKey,
      CMRkey: item.CMRkey,
      ConsultKey: item.ConsultKey,
      PatientKey: item.PatientKey,
      MBN: item.MBN || item.__patient?.PatientID1 || '',
      'Họ và tên': item['Họ và tên'] || item.__patient?.PatientName || '',
      PatientWeight: item.PatientWeight || item.__consult?.PatientWeight || '',
      CMRDiagnosisID: item.CMRDiagnosisID || item.__consult?.DiagnosisID || '',
      CMRDiagnosis: item.CMRDiagnosis || item.__consult?.DetailDiagnosis || '',
      CMRRequest: item.CMRRequest || item.__consult?.DetailConsultResult || item.__consult?.ConsultNote || '',
      DepartRequest: item.DepartRequest || item.__consult?.Department || '',
      CMRMethod: resolveCMRMethod(item.CMRMethod),
      CMRDevice: resolveCMRDevice(item.CMRDevice),
      PostDepart: item.PostDepart || '',
      Anesthesia: item.Anesthesia || '',
      CMRScheduledDate: getFormattedDateKey(item.CMRScheduledDate),
      CMRCallStatus: item.CMRCallStatus || '',
      CMRCallStatusNote: item.CMRCallStatusNote || ''
    };
    setFormData(nextForm);
    setFormSnapshot(JSON.stringify(nextForm));
    setMessage('');
  };

  useEffect(() => {
    if (!selectedItem) return;
    const fresh = allMriItems.find(item => item.CMRKey === selectedItem.CMRKey);
    if (fresh) handleSelectItem(fresh);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cmrs]);

  const updateField = (key: keyof CMR, value: string) => {
    setFormData(prev => ({ ...prev, [key]: value }));
  };

  const REQUIRED_SCHEDULE_FIELDS: { key: keyof CMR; label: string }[] = [
    { key: 'PatientWeight', label: 'Cân nặng (kg)' },
    { key: 'CMRDiagnosisID', label: 'Mã chẩn đoán MRI' },
    { key: 'CMRDiagnosis', label: 'Chẩn đoán MRI' },
    { key: 'CMRRequest', label: 'Yêu cầu MRI' },
    { key: 'Anesthesia', label: 'Gây mê' },
    { key: 'CMRScheduledDate', label: 'Ngày chụp MRI dự kiến' },
    { key: 'CMRCallStatus', label: 'Trạng thái gọi MRI' }
  ];

  const getMissingScheduleFields = (): string[] =>
    REQUIRED_SCHEDULE_FIELDS
      .filter(field => !String(formData[field.key] || '').trim())
      .map(field => field.label);

  const hasUnsavedChanges = (): boolean => JSON.stringify(formData) !== formSnapshot;

  // Performs the actual save. Returns true on success. Does NOT close the form.
  const persistSchedule = async (): Promise<boolean> => {
    if (!selectedItem) return false;
    const patient = selectedItem.__patient;

    const payload: CMR = {
      ...selectedItem,
      ...formData,
      CMRKey: selectedItem.__isSynthetic ? `cmr_${Date.now()}` : (selectedItem.CMRKey || selectedItem.CMRkey || `cmr_${Date.now()}`),
      PatientKey: String(formData.PatientKey || selectedItem.PatientKey || patient?.PatientKey || ''),
      MBN: String(formData.MBN || patient?.PatientID1 || ''),
      'Họ và tên': String(formData['Họ và tên'] || patient?.PatientName || ''),
      CMRMethod: resolveCMRMethod(formData.CMRMethod),
      CMRDevice: resolveCMRDevice(formData.CMRDevice),
      UpdateTime: new Date().toISOString()
    };

    setSaving(true);
    setMessage('');

    const savedItem = { ...payload, __patient: patient, __consult: selectedItem.__consult };
    if (selectedItem.__isSynthetic) {
      onAddCmr?.(payload);
    } else {
      onPatchCmr?.(payload.CMRKey || payload.CMRkey || '', payload);
    }
    setSelectedItem(savedItem);
    setFormSnapshot(JSON.stringify(formData));
    setMessage(`Đã lưu lịch MRI${currentStaff?.StaffName ? ` bởi ${currentStaff.StaffName}` : ''}.`);
    setTimeout(() => setMessage(''), 3500);

    try {
      const method = selectedItem.__isSynthetic ? 'POST' : 'PUT';
      const url = selectedItem.__isSynthetic
        ? '/api/cmrs'
        : `/api/cmrs/${encodeURIComponent(selectedItem.CMRKey || selectedItem.CMRkey || '')}`;
      await persistWithSheetsSync(
        reportMutationResponse,
        url,
        { method, body: JSON.stringify(payload) },
        buildSyncContext('mri-scheduler', {
          patientName: patient?.PatientName,
          patientKey: payload.PatientKey
        }),
        { baseMessage: 'Đã lưu lịch MRI' }
      );

      onRefreshData();
      return true;
    } catch (error: any) {
      const msg = error?.message || '';
      const friendly = msg.includes('Failed to fetch')
        ? 'Không kết nối được server. Vui lòng kiểm tra kết nối và thử lại.'
        : (msg || 'Có lỗi khi lưu lịch MRI.');
      if (confirmMode) setConfirmError(friendly); else setMessage(friendly);
      onRefreshData();
      return false;
    } finally {
      setSaving(false);
    }
  };

  // Save button -> open the confirmation popup (asks before saving).
  const requestSave = () => {
    if (!selectedItem) return;
    setConfirmError('');
    setConfirmMode('save');
  };

  // "Quay lại Lịch Tháng" -> confirm if there are unsaved changes.
  const requestExit = () => {
    if (hasUnsavedChanges()) {
      setConfirmError('');
      setConfirmMode('exit');
    } else {
      setSelectedItem(null);
    }
  };

  const closeConfirm = () => {
    setConfirmMode(null);
    setConfirmError('');
  };

  // Confirm-dialog "Lưu": validate, save, then optionally leave the form.
  const handleConfirmSave = async (closeAfter: boolean) => {
    const missing = getMissingScheduleFields();
    if (missing.length > 0) {
      setConfirmError(`Vui lòng nhập đủ: ${missing.join(', ')}.`);
      return;
    }
    const ok = await persistSchedule();
    if (ok) {
      setConfirmMode(null);
      setConfirmError('');
      if (closeAfter) setSelectedItem(null);
    }
  };

  // Confirm-dialog "Không lưu": discard changes and leave the form.
  const handleConfirmDiscard = () => {
    setConfirmMode(null);
    setConfirmError('');
    setSelectedItem(null);
  };

  const extraDoctorOptions = useMemo(() => {
    return Array.from(new Set([
      ...cmrs.map(cmr => String(cmr.RequestBy || '')),
      ...consults.map(consult => String(consult.RequestBy || ''))
    ])).filter(d => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d));
  }, [cmrs, consults, staffList]);

  const updateAdHocField = (key: keyof CMR, value: string) => {
    setAdHocForm(prev => ({ ...prev, [key]: value }));
  };

  const resetAdHoc = () => {
    setAdHocPatientMode('select');
    setAdHocSearchPat('');
    setAdHocSelectedPatKey('');
    setAdHocNewPatID1('');
    setAdHocNewPatID2('');
    setAdHocNewPatName('');
    setAdHocNewPatDOB('');
    setAdHocNewPatSex('Nam');
    setAdHocNewPatAddress('TP Hà Nội');
    setAdHocNewPatPhone('');
    setAdHocForm({
      CMRMethod: DEFAULT_CMR_METHOD,
      CMRDevice: DEFAULT_CMR_DEVICE
    });
    setAdHocSuccess('');
    setAdHocError('');
  };

  const getAdHocBlockingCmr = (patientKey: string): CMR | undefined =>
    findBlockingPendingCmr(cmrs, patientKey);

  const adHocBlockingCmr = adHocSelectedPatKey ? getAdHocBlockingCmr(adHocSelectedPatKey) : undefined;

  const handleAdHocSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdHocLoading(true);
    setAdHocError('');
    setAdHocSuccess('');

    try {
      if (!String(adHocForm.CMRDiagnosisID || '').trim()) {
        setAdHocError('Vui lòng chọn Mã chẩn đoán MRI!');
        setAdHocLoading(false);
        return;
      }

      let finalPatientKey = adHocSelectedPatKey;
      let finalPatient: Patient | undefined = findPatientByKey(patients, adHocSelectedPatKey) || undefined;

      if (adHocPatientMode === 'create') {
        if (!adHocNewPatID1.trim() || !adHocNewPatName.trim()) {
          setAdHocError(PATIENT_VALIDATION_MSG.missingIdAndName);
          setAdHocLoading(false);
          return;
        }
        const dup = findDuplicatePatientById1(patients, adHocNewPatID1);
        if (dup) {
          setAdHocError(PATIENT_VALIDATION_MSG.duplicateIdShort(dup.PatientName));
          setAdHocLoading(false);
          return;
        }
        finalPatientKey = `pat_${Date.now()}`;
        const patientPayload: Patient = {
          PatientKey: finalPatientKey,
          PatientID1: adHocNewPatID1.trim(),
          PatientID2: adHocNewPatID2.trim(),
          PatientName: adHocNewPatName,
          OtherPatientName: '',
          PatientDOB: adHocNewPatDOB || '2020-01-01',
          PatientSex: adHocNewPatSex,
          PatientAddress: adHocNewPatAddress || 'TP Hà Nội',
          PatientPhone1: adHocNewPatPhone || '',
          PatientPhone2: '',
          PatientCreateBy: currentStaff?.StaffKey || '01378',
          PatientCreateTime: new Date().toISOString(),
          Outcome: ''
        };
        onAddPatient?.(patientPayload);
        finalPatient = patientPayload;
      } else {
        if (!finalPatientKey) {
          setAdHocError(PATIENT_VALIDATION_MSG.selectExistingOrCreate);
          setAdHocLoading(false);
          return;
        }
        if (getAdHocBlockingCmr(finalPatientKey)) {
          setAdHocError(PATIENT_VALIDATION_MSG.pendingMriBlockShort);
          setAdHocLoading(false);
          return;
        }
      }

      const cmrPayload: CMR = {
        CMRKey: `cmr_${Date.now()}`,
        PatientKey: finalPatientKey,
        MBN: finalPatient?.PatientID1 || '',
        'Họ và tên': finalPatient?.PatientName || '',
        PatientWeight: String(adHocForm.PatientWeight || ''),
        CMRDiagnosisID: String(adHocForm.CMRDiagnosisID || ''),
        CMRDiagnosis: String(adHocForm.CMRDiagnosis || ''),
        CMRRequest: String(adHocForm.CMRRequest || ''),
        RequestBy: String(adHocForm.RequestBy || ''),
        DepartRequest: String(adHocForm.DepartRequest || ''),
        CMRMethod: resolveCMRMethod(adHocForm.CMRMethod),
        CMRDevice: resolveCMRDevice(adHocForm.CMRDevice),
        PostDepart: String(adHocForm.PostDepart || ''),
        Anesthesia: String(adHocForm.Anesthesia || ''),
        CMRScheduledDate: getFormattedDateKey(adHocForm.CMRScheduledDate),
        CMRCallStatus: String(adHocForm.CMRCallStatus || ''),
        CMRCallStatusNote: String(adHocForm.CMRCallStatusNote || ''),
        UpdateTime: new Date().toISOString()
      };

      onAddCmr?.(cmrPayload);
      setAdHocSuccess('Đã xếp bổ sung MRI thành công!');
      setShowAdHoc(false);
      resetAdHoc();
      setAdHocLoading(false);

      const persist = async () => {
        const syncContext = buildSyncContext('mri-scheduler', {
          patientName: finalPatient?.PatientName,
          patientKey: finalPatientKey
        });
        if (adHocPatientMode === 'create') {
          await persistWithSheetsSync(
            reportMutationResponse,
            '/api/patients',
            {
              method: 'POST',
              body: JSON.stringify({
                PatientKey: finalPatientKey,
                PatientID1: adHocNewPatID1.trim(),
                PatientID2: adHocNewPatID2.trim(),
                PatientName: adHocNewPatName,
                OtherPatientName: '',
                PatientDOB: adHocNewPatDOB || '2020-01-01',
                PatientSex: adHocNewPatSex,
                PatientAddress: adHocNewPatAddress || 'TP Hà Nội',
                PatientPhone1: adHocNewPatPhone || '',
                PatientPhone2: '',
                PatientCreateBy: currentStaff?.StaffKey || '01378',
                PatientCreateTime: new Date().toISOString()
              })
            },
            syncContext,
            { baseMessage: 'Đã tạo bệnh nhi mới' }
          );
        }
        await persistWithSheetsSync(
          reportMutationResponse,
          '/api/cmrs',
          { method: 'POST', body: JSON.stringify(cmrPayload) },
          syncContext,
          { baseMessage: 'Đã xếp bổ sung MRI' }
        );
        onRefreshData();
      };

      persist().catch((error: any) => {
        setAdHocError(`Đã xảy ra lỗi: ${error.message || error}`);
        onRefreshData();
      });
    } catch (error: any) {
      setAdHocError(`Đã xảy ra lỗi: ${error.message || error}`);
    } finally {
      setAdHocLoading(false);
    }
  };

  const renderInput = (key: keyof CMR, label: string, placeholder = '', required = false) => (
    <div>
      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
        {label}{required && <span className="text-[#d2145a] ml-0.5">*</span>}
      </label>
      <input
        type="text"
        value={String(formData[key] || '')}
        onChange={(event) => updateField(key, event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
      />
    </div>
  );

  const renderLongTextInput = (key: keyof CMR, label: string, placeholder = '', required = false) => (
    <div>
      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
        {label}{required && <span className="text-[#d2145a] ml-0.5">*</span>}
      </label>
      <MobileAutoExpandTextarea
        minRows={2}
        value={String(formData[key] || '')}
        onChange={(event) => updateField(key, event.target.value)}
        placeholder={placeholder}
        required={required}
        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
      />
    </div>
  );

  const renderEnumInput = (key: keyof CMR, label: string, options: string[], placeholder = 'Gõ để tìm hoặc chọn', required = false) => (
    <div>
      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
        {label}{required && <span className="text-[#d2145a] ml-0.5">*</span>}
      </label>
      <SearchableEnumSelect
        required={required}
        value={String(formData[key] || '')}
        options={options}
        onChange={(value) => updateField(key, value)}
        allowCreate={key === 'CMRDiagnosisID'}
        createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
        onCreateOption={key === 'CMRDiagnosisID' ? createDiagnosisSource : undefined}
        placeholder="-- Chọn --"
        searchPlaceholder={placeholder}
      />
    </div>
  );

  const renderTextarea = (key: keyof CMR, label: string, required = false) => (
    <div>
      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
        {label}{required && <span className="text-[#d2145a] ml-0.5">*</span>}
      </label>
      <MobileAutoExpandTextarea
        minRows={3}
        value={String(formData[key] || '')}
        onChange={(event) => updateField(key, event.target.value)}
        required={required}
        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
      />
    </div>
  );

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchQuery(value);
  }, []);

  const openAdHocModal = useCallback(() => {
    resetAdHoc();
    setShowAdHoc(true);
  }, []);

  const subheaderActions = useMemo(
    () => (
      <button
        type="button"
        onClick={openAdHocModal}
        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-1.5 rounded-xl text-[11px] flex items-center gap-1.5 shadow-sm transition cursor-pointer"
      >
        <Plus className="w-3.5 h-3.5" /> Xếp bổ sung
      </button>
    ),
    [openAdHocModal]
  );

  useModuleSubheader('mri-scheduler', {
    icon: <Activity className="w-4 h-4" />,
    searchValue: searchQuery,
    onSearchChange: handleSubheaderSearch,
    actions: subheaderActions,
  });

  return (
    <div className="flex-1 bg-slate-50 min-h-0 flex flex-col font-sans">
      <div className="flex-1 overflow-hidden p-3 lg:p-4 flex h-full min-h-0 gap-4">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
          <div className={`${isFilterExpanded ? 'hidden xl:flex xl:col-span-5' : 'lg:col-span-6'} ${selectedItem ? 'hidden lg:flex' : 'flex'} bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-full min-h-0 flex flex-col`}>
            {/* Mobile Tab bar: [Xếp bổ sung (+)] [Chờ xếp] [Đã xếp] [Lịch chụp] [Bộ lọc (hình tròn)] */}
            <div className="flex sm:hidden items-center justify-between p-2 bg-slate-50 border-b border-slate-200 gap-1.5 shrink-0">
               <button
                 type="button"
                 onClick={() => { resetAdHoc(); setShowAdHoc(true); }}
                 className="bg-indigo-600 hover:bg-indigo-700 text-white w-8 h-8 rounded-full flex items-center justify-center shadow-md transition shrink-0 cursor-pointer"
                 title="Xếp bổ sung"
               >
                 <Plus className="w-4 h-4 text-white" />
               </button>

               <div className="flex-1 flex items-center bg-white border border-slate-200 rounded-xl p-0.5 text-[11px] font-semibold text-slate-600 overflow-hidden">
                 <button
                   onClick={() => { setActiveTab('unscheduled'); setMobileActiveTab('unscheduled'); }}
                   className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                     mobileActiveTab === 'unscheduled' ? 'bg-[#d2145a] text-white font-bold' : 'text-[#d2145a]'
                   }`}
                 >
                   Chờ xếp <span className="text-[9px] opacity-75 font-mono">({segmentedItems.unscheduled.length})</span>
                 </button>
                 <button
                   onClick={() => { setActiveTab('scheduled'); setMobileActiveTab('scheduled'); }}
                   className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                     mobileActiveTab === 'scheduled' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700'
                   }`}
                 >
                   Đã xếp <span className="text-[9px] opacity-75 font-mono">({segmentedItems.scheduled.length})</span>
                 </button>
                 <button
                   onClick={() => setMobileActiveTab('calendar')}
                   className={`flex-1 text-center py-1.5 rounded-lg transition-colors cursor-pointer ${
                     mobileActiveTab === 'calendar' ? 'bg-indigo-600 text-white font-bold' : 'text-indigo-700'
                   }`}
                 >
                   Lịch chụp
                 </button>
               </div>

               <button
                 type="button"
                 onClick={() => setIsFilterExpanded(!isFilterExpanded)}
                 className={`w-8 h-8 rounded-full border border-slate-250 flex items-center justify-center transition shrink-0 cursor-pointer ${
                   isFilterExpanded ? 'bg-[#b31448] text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                 }`}
                 title="Bộ lọc"
               >
                 <Filter className="w-4 h-4" />
               </button>
            </div>

            <div className="hidden sm:flex p-4 border-b border-slate-100 bg-slate-50 shrink-0 items-center justify-between gap-2">
              <div>
                <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
                  <Activity className="w-4 h-4 text-[#d2145a]" />
                  Danh sách chờ xếp lịch MRI
                </h3>
                <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                  Tổng cộng: {allMriItems.length} ca MRI tim
                </p>
              </div>
              <button
                type="button"
                onClick={() => { resetAdHoc(); setShowAdHoc(true); }}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-3 py-2 rounded-xl text-[10px] flex items-center justify-center gap-1.5 shadow-md transition shrink-0 cursor-pointer uppercase tracking-wider"
              >
                <Plus className="w-3.5 h-3.5" /> Xếp bổ sung
              </button>
            </div>

            <div className="hidden sm:flex px-4 py-2 bg-slate-50/75 border-b border-slate-150 gap-2 shrink-0">
              <button
                onClick={() => setActiveTab('unscheduled')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  activeTab === 'unscheduled' ? 'bg-[#d2145a] text-white shadow-xs' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-600'
                }`}
              >
                Chờ xếp lịch
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${activeTab === 'unscheduled' ? 'bg-pink-100 text-[#d2145a]' : 'bg-slate-100 text-slate-600'}`}>
                  {segmentedItems.unscheduled.length}
                </span>
              </button>
              <button
                onClick={() => setActiveTab('scheduled')}
                className={`flex-1 py-2 px-3 rounded-xl text-xs font-bold flex items-center justify-center gap-2 transition ${
                  activeTab === 'scheduled' ? 'bg-emerald-600 text-white shadow-xs' : 'bg-white hover:bg-slate-100 border border-slate-200 text-slate-600'
                }`}
              >
                Đã xếp lịch
                <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-full ${activeTab === 'scheduled' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-600'}`}>
                  {segmentedItems.scheduled.length}
                </span>
              </button>
            </div>

            <div className="p-3 border-b border-slate-150 relative shrink-0 md:hidden">
              <Search className="w-4 h-4 text-slate-400 absolute left-6 top-5.5" />
              <input
                type="text"
                placeholder="Tìm họ tên, ID, chẩn đoán MRI..."
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                className="w-full pl-9 pr-9 py-2 bg-slate-100 border-0 rounded-2xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]/50"
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="absolute right-6 top-5 text-slate-400 hover:text-slate-600">
                  <X className="w-4 h-4" />
                </button>
              )}
            </div>

            <div className="flex-1 overflow-x-auto overflow-y-auto">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-xs font-medium text-slate-700">
                <thead className="bg-slate-50/70 text-slate-500 sticky top-0 uppercase text-[9px] font-extrabold tracking-wider z-10 shadow-xs">
                  <tr>
                    <th className="py-3 px-3 border-b border-slate-200 w-14 text-center">STT</th>
                    <th className="py-3 px-3 border-b border-slate-200 min-w-[170px]">PatientName</th>
                    <th className="py-3 px-3 border-b border-slate-200 min-w-[170px]">CMRDiagnosis</th>
                    <th className="py-3 px-3 border-b border-slate-200 min-w-[170px]">CMRRequest</th>
                    <th className="py-3 px-3 border-b border-slate-200 w-28">Anesthesia</th>
                    <th className="py-3 px-3 border-b border-slate-200 w-32">CMRScheduledDate</th>
                    <th className="py-3 px-3 border-b border-slate-200 w-36">CMRCallStatus</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150">
                  {displayItems.map((item, index) => {
                    const patient = item.__patient;
                    const isSelected = selectedItem?.CMRKey === item.CMRKey;
                    return (
                      <tr
                        key={item.CMRKey || item.CMRkey || `${item.PatientKey}-${index}`}
                        onClick={() => handleSelectItem(item)}
                        className={`hover:bg-indigo-50/45 cursor-pointer transition ${isSelected ? 'bg-indigo-50/90 font-bold' : ''}`}
                      >
                        <td className="py-3 px-3 text-center font-mono text-slate-500">{index + 1}</td>
                        <td className="py-3 px-3">
                          <span className="font-extrabold uppercase text-slate-900 block truncate max-w-[160px]">
                            {patient?.PatientName || item['Họ và tên'] || '—'}
                          </span>
                          <span className="text-[9px] text-slate-400 font-bold font-mono">
                            {patient?.PatientID1 || item.MBN || '—'}
                          </span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="text-[9px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded mr-1">
                            {item.CMRDiagnosisID || '—'}
                          </span>
                          <span className="line-clamp-2">{item.CMRDiagnosis || '—'}</span>
                        </td>
                        <td className="py-3 px-3">
                          <span className="line-clamp-2">{item.CMRRequest || '—'}</span>
                        </td>
                        <td className="py-3 px-3 font-bold text-slate-600">{item.Anesthesia || '—'}</td>
                        <td className="py-3 px-3 font-bold font-mono text-emerald-700">
                          {item.CMRScheduledDate ? formatVNTime(item.CMRScheduledDate) : '—'}
                        </td>
                        <td className="py-3 px-3">
                          <span className="bg-slate-100 text-slate-700 font-extrabold text-[9px] px-2 py-0.5 rounded-full">
                            {item.CMRCallStatus || 'Chưa gọi'}
                          </span>
                        </td>
                      </tr>
                    );
                  })}
                  {displayItems.length === 0 && (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 italic">
                        Không có bệnh nhi nào trong danh sách MRI này.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className={`${isFilterExpanded ? 'lg:col-span-12 xl:col-span-7' : 'lg:col-span-6'} ${!selectedItem && mobileActiveTab !== 'calendar' ? 'hidden lg:flex' : 'flex'} bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-full min-h-0 flex flex-col`}>
            {!selectedItem ? (
              <>
                <div className="p-3 sm:p-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between gap-3 shrink-0">
                  <div className="hidden sm:block">
                    <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#d2145a]" />
                      Lịch chụp MRI dự kiến
                    </h3>
                    <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                      Calendar lịch MRI tim bẩm sinh
                    </p>
                  </div>
                  <div className="flex items-center justify-between w-full sm:w-auto gap-3">
                    <button onClick={() => setCurrentMonth(prev => prev === 0 ? 11 : prev - 1)} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-extrabold text-[12px] sm:text-[13px] text-slate-800 uppercase tracking-wider text-center flex-1 sm:flex-initial">
                      Tháng {currentMonth + 1} {currentYear}
                    </span>
                    <button onClick={() => setCurrentMonth(prev => prev === 11 ? 0 : prev + 1)} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                      <ChevronRight className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="flex-1 p-3 flex flex-col min-h-0">
                  <div className="grid grid-cols-7 gap-1 text-center font-extrabold text-[#d2145a] text-[10px] uppercase py-2 bg-slate-50/70 border border-slate-200 rounded-t-2xl">
                    <div>T2</div><div>T3</div><div>T4</div><div>T5</div><div>T6</div><div>T7</div><div>CN</div>
                  </div>
                  <div className="grid grid-cols-7 gap-1 border-l border-r border-b border-slate-200 rounded-b-2xl bg-slate-100/50 p-1 flex-1 overflow-hidden">
                    {calendarCells.map((cell, index) => {
                      const matches = segmentedItems.scheduled.filter(item => getFormattedDateKey(item.CMRScheduledDate) === cell.dateStr);
                      return (
                        <div
                          key={`${cell.dateStr}-${index}`}
                          className={`min-h-[76px] xl:min-h-[92px] p-1.5 rounded-xl border border-slate-200 bg-white flex flex-col justify-between transition ${
                            cell.isCurrentMonth ? 'text-slate-800' : 'bg-slate-50/40 text-slate-300 pointer-events-none opacity-45'
                          } ${cell.isToday ? 'bg-[#d2145a]/5 border-[#d2145a]/30' : ''}`}
                        >
                          <div className="text-right">
                            <span className={`font-black font-mono text-[10px] ${cell.isToday ? 'bg-[#d2145a] text-white w-5 h-5 inline-flex items-center justify-center rounded-full' : 'text-slate-500'}`}>
                              {cell.day}
                            </span>
                          </div>
                          <div className="flex-1 overflow-y-auto mt-1 flex flex-col gap-1 pr-0.5">
                            {matches.map(item => {
                              const name = getPatientDisplayName(item.__patient?.PatientName || item['Họ và tên']);
                              return (
                                <button
                                  key={item.CMRKey || item.CMRkey}
                                  onClick={() => handleSelectItem(item)}
                                  className="bg-[#b31448] hover:bg-[#d61d56] text-white text-[8px] font-black leading-tight px-1.5 py-0.5 rounded-lg truncate transition uppercase text-center"
                                  title={item.__patient?.PatientName || item['Họ và tên']}
                                >
                                  {name}
                                </button>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 p-3 bg-slate-50 border border-slate-200 rounded-2xl flex items-center justify-between text-[10px] text-slate-500 font-medium shrink-0">
                    <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#b31448]"></span> Ca MRI đã xếp lịch</span>
                    <span className="text-[9px] text-[#d2145a] font-extrabold">CMR Scheduler</span>
                  </div>
                </div>
              </>
            ) : (
              <form onSubmit={(e) => e.preventDefault()} className="flex-1 flex flex-col min-h-0 bg-white">
                <div className="hidden lg:flex p-4 border-b border-indigo-100 bg-indigo-50/20 items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={requestExit} className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl transition">
                      ← Quay lại Lịch Tháng
                    </button>
                    <span className="bg-[#d2145a] text-white font-extrabold text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-lg">
                      Xếp lịch
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 font-bold font-mono">Mã: {selectedItem.CMRKey}</span>
                </div>

                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  {(() => {
                    const patient = selectedItem.__patient;
                    return (
                      <div className="bg-white border border-slate-150 p-3.5 rounded-2xl shadow-xs">
                        <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2.5">
                          Thông tin hành chính bệnh nhi
                        </span>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">Họ và tên:</span>
                            <span className="font-extrabold text-slate-900 uppercase text-[11.5px]">{patient?.PatientName || formData['Họ và tên'] || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">PatientID:</span>
                            <span className="font-extrabold font-mono text-slate-800 text-[11px]">{patient?.PatientID1 || formData.MBN || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">Tuổi / Ngày sinh:</span>
                            <span className="font-bold text-slate-800">{patient ? formatPatientDobWithAge(patient.PatientDOB, undefined, formatVNTime) : '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">Giới tính:</span>
                            <span className="font-bold text-slate-800">{patient?.PatientSex || '—'}</span>
                          </div>
                          <div className="col-span-2">
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">Địa chỉ:</span>
                            <span className="font-bold text-slate-800">{patient?.PatientAddress || '—'}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block font-bold text-[8px] uppercase">Điện thoại 1:</span>
                            <span className="font-extrabold text-slate-800 font-mono">{patient?.PatientPhone1 || '—'}</span>
                          </div>
                        </div>
                      </div>
                    );
                  })()}

                  <div className="bg-slate-50 border border-slate-200 p-3.5 rounded-2xl space-y-3">
                    <span className="font-extrabold text-[#d2145a] text-[10px] uppercase tracking-wider block">
                      Thông tin liên quan MRI
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
                      {renderInput('PatientWeight', 'Cân nặng (kg)', 'vd: 12', true)}
                      {renderEnumInput('CMRDiagnosisID', 'Mã chẩn đoán MRI', diagnosisOptions, 'Gõ ICD để tìm', true)}
                      {renderEnumInput('DepartRequest', 'Khoa yêu cầu', departmentOptions, 'Gõ khoa để tìm')}
                      {renderLongTextInput('CMRMethod', 'Phương thức chụp', 'Phương thức chụp')}
                      {renderLongTextInput('CMRDevice', 'Dự trù dụng cụ', 'Dự trù dụng cụ')}
                      {renderEnumInput('PostDepart', 'Khoa sau chụp', departmentOptions, 'Gõ khoa để tìm')}
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
                          Gây mê<span className="text-[#d2145a] ml-0.5">*</span>
                        </label>
                        <select
                          value={String(formData.Anesthesia || '')}
                          onChange={(event) => updateField('Anesthesia', event.target.value)}
                          required
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
                        >
                          {ANESTHESIA_OPTIONS.map(option => <option key={option} value={option}>{option || 'Chọn'}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
                          Ngày chụp MRI dự kiến<span className="text-[#d2145a] ml-0.5">*</span>
                        </label>
                        <VNDateInput
                          value={String(formData.CMRScheduledDate || '')}
                          onChange={(val) => updateField('CMRScheduledDate', val)}
                          required
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold font-sans focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
                        />
                      </div>
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-1">
                          Trạng thái gọi MRI<span className="text-[#d2145a] ml-0.5">*</span>
                        </label>
                        <select
                          value={String(formData.CMRCallStatus || '')}
                          onChange={(event) => updateField('CMRCallStatus', event.target.value)}
                          required
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
                        >
                          {CALL_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option || 'Chọn'}</option>)}
                        </select>
                      </div>
                    </div>
                    {renderTextarea('CMRDiagnosis', 'Chẩn đoán MRI', true)}
                    {renderTextarea('CMRRequest', 'Yêu cầu MRI', true)}
                    {renderTextarea('CMRCallStatusNote', 'Ghi chú gọi MRI')}
                  </div>
                </div>

                {/* Mobile Save Footer Bar (Single scrollable row) */}
                <div className="flex lg:hidden items-center gap-1.5 p-2 bg-slate-50 border-t border-slate-200 overflow-x-auto whitespace-nowrap shrink-0 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden">
                   <button
                     type="button"
                     onClick={requestExit}
                     className="bg-white hover:bg-slate-100 border border-slate-350 text-slate-700 font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center justify-center shrink-0 shadow-xs cursor-pointer"
                   >
                     ←
                   </button>
                   <button
                     type="button"
                     onClick={() => setSelectedItem(null)}
                     className="bg-white hover:bg-slate-100 border border-slate-200 text-slate-500 font-bold text-[10.5px] px-3.5 py-1.5 rounded-xl transition flex items-center gap-1 shrink-0 shadow-xs cursor-pointer"
                   >
                     Đóng
                   </button>
                   <button
                     type="button"
                     onClick={requestSave}
                     disabled={saving}
                     className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold text-[10.5px] px-4 py-1.5 rounded-xl shadow-xs transition flex items-center justify-center gap-1 shrink-0 disabled:opacity-50 cursor-pointer"
                   >
                     {saving ? 'Đang lưu...' : 'Lưu'}
                   </button>
                   {message && (
                     <span className={`text-[10px] font-bold ml-2 shrink-0 ${message.includes('lỗi') || message.includes('Không') ? 'text-rose-600' : 'text-emerald-700'}`}>
                       {message}
                     </span>
                   )}
                </div>

                <div className="hidden lg:flex p-4 border-t border-slate-100 bg-slate-50 justify-between items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-bold ${message.includes('lỗi') || message.includes('Không') ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {message}
                  </span>
                  <button
                    type="button"
                    onClick={requestSave}
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs transition flex items-center gap-2 disabled:opacity-50 cursor-pointer"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Đang lưu...' : 'Lưu kết quả xếp lịch'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className={`shrink-0 flex flex-col gap-4 self-start h-full min-h-0 w-full lg:w-auto ${
          isFilterExpanded
            ? 'fixed inset-0 z-40 p-3 bg-slate-50/95 backdrop-blur-[1px] lg:relative lg:inset-auto lg:z-auto lg:p-0 lg:bg-transparent'
            : 'hidden lg:flex'
        }`}>
          {isFilterExpanded && (
            <div className="lg:hidden flex justify-end shrink-0">
              <button
                type="button"
                onClick={() => setIsFilterExpanded(false)}
                className="px-3 py-1.5 rounded-xl bg-white border border-slate-200 text-xs font-bold text-slate-600"
              >
                Đóng bộ lọc
              </button>
            </div>
          )}

          <div className={`transition-all duration-300 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col ${isFilterExpanded ? 'w-full lg:w-[320px] flex-1 min-h-0' : 'hidden lg:flex lg:w-[52px]'}`}>
            {!isFilterExpanded ? (
              <button
                className="flex flex-col items-center py-5 hover:bg-slate-50 transition rounded-3xl h-full"
                onClick={() => setIsFilterExpanded(true)}
              >
                <div className="bg-slate-100 p-2.5 rounded-2xl text-slate-500 mb-6 hover:bg-indigo-50 hover:text-indigo-600 transition">
                  <Filter className="w-5 h-5" />
                </div>
                <span className="text-[11px] font-black uppercase tracking-[0.2em] text-slate-400" style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}>
                  BỘ LỌC XẾP LỊCH
                </span>
              </button>
            ) : (
              <div className="flex flex-col relative h-full min-h-0">
                <div className="p-4 border-b border-slate-100 bg-[#b31448] text-white rounded-t-3xl flex justify-between items-center shrink-0">
                  <h3 className="font-black text-[12px] uppercase tracking-wider flex items-center gap-2">
                    <Filter className="w-4 h-4" /> Bộ lọc xếp lịch
                  </h3>
                  <button onClick={() => setIsFilterExpanded(false)} className="p-1 hover:bg-[#80072d] rounded-lg transition">
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="p-4 overflow-y-auto space-y-3 flex-1 bg-white">
                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1.5">
                      Lọc theo ngày chụp dự kiến
                    </label>
                    <div className="flex bg-slate-100 p-1 rounded-xl mb-2.5">
                      <button
                        type="button"
                        className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${exportDateType === 'all' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setExportDateType('all')}
                      >
                        Tất cả
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${exportDateType === 'custom' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setExportDateType('custom')}
                      >
                        Tùy chọn
                      </button>
                      <button
                        type="button"
                        className={`flex-1 py-1 text-[10px] font-bold rounded-lg transition ${exportDateType === 'group' ? 'bg-white shadow-sm text-slate-800' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setExportDateType('group')}
                      >
                        Theo nhóm
                      </button>
                    </div>

                    {exportDateType === 'all' ? null : exportDateType === 'custom' ? (
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <VNDateInput
                            value={exportStartDate}
                            onChange={setExportStartDate}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-bold font-sans text-slate-700 focus:outline-none min-h-[24px]"
                          />
                        </div>
                        <div className="flex-1">
                          <VNDateInput
                            value={exportEndDate}
                            onChange={setExportEndDate}
                            className="w-full bg-slate-50 border border-slate-200 rounded-xl px-2.5 py-1 text-[10px] font-bold font-sans text-slate-700 focus:outline-none min-h-[24px]"
                          />
                        </div>
                      </div>
                    ) : (
                      <div className="flex gap-2">
                        <select
                          value={exportGroupType}
                          onChange={(e) => {
                            setExportGroupType(e.target.value as 'month' | 'quarter');
                            setExportGroupValue('1');
                          }}
                          className="w-1/3 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-[10px] font-bold"
                        >
                          <option value="month">Tháng</option>
                          <option value="quarter">Quý</option>
                        </select>
                        <select
                          value={exportGroupValue}
                          onChange={(e) => setExportGroupValue(e.target.value)}
                          className="flex-1 bg-slate-50 border border-slate-200 rounded-xl px-2 py-1 text-[10px] font-bold"
                        >
                          {exportGroupType === 'month'
                            ? [...Array(12)].map((_, i) => (
                                <option key={i + 1} value={i + 1}>Tháng {i + 1}</option>
                              ))
                            : [...Array(4)].map((_, i) => (
                                <option key={i + 1} value={i + 1}>Quý {i + 1}</option>
                              ))}
                        </select>
                      </div>
                    )}

                    {exportDateType !== 'all' && exportDateRange.start && exportDateRange.end && (
                      <p className="mt-2 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded-lg">
                        Lọc từ ngày: <strong>{exportDateRange.start.split('-').reverse().join('/')}</strong><br />
                        Đến ngày: <strong>{exportDateRange.end.split('-').reverse().join('/')}</strong>
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {filteredScheduleItems.map((item, index) => (
                      <button
                        key={item.CMRKey || item.CMRkey || index}
                        onClick={() => {
                          handleSelectItem(item);
                          if (typeof window !== 'undefined' && window.innerWidth < 1024) {
                            setIsFilterExpanded(false);
                          }
                        }}
                        className="w-full text-left bg-slate-50 hover:bg-pink-50 border border-slate-150 rounded-xl p-3 transition"
                      >
                        <span className="block text-[9px] font-black text-[#d2145a] font-mono">
                          {formatVNTime(item.CMRScheduledDate)}
                        </span>
                        <span className="block text-xs font-extrabold uppercase text-slate-900 truncate">
                          {item.__patient?.PatientName || item['Họ và tên'] || '—'}
                        </span>
                        <span className="block text-[10px] text-slate-500 truncate">
                          {item.CMRDiagnosisID || '—'} - {item.CMRCallStatus || 'Chưa gọi'}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-3xl space-y-3">
                  <p className="text-[10px] font-semibold text-slate-500 flex justify-between">
                    <span>Tổng số ca tìm thấy:</span>
                    <span className="font-black text-[#d2145a] text-[12px]">{filteredScheduleItems.length}</span>
                  </p>
                  {exportMsg && (
                    <div className={`px-3 py-2 text-[10px] rounded flex items-center gap-1 border ${exportMsg.includes('thành công') ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-rose-50 border-rose-200 text-rose-700'}`}>
                      <span>{exportMsg}</span>
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={handleExportExcel}
                    className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-black py-3 rounded-xl transition flex justify-center items-center gap-2 transform active:scale-[0.98] cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    XUẤT EXCEL (XLSX)
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* XẾP BỔ SUNG MRI MODAL */}
      {showAdHoc && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[96vh] md:max-h-[90vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150 relative">

            <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <Calendar className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase text-indigo-900">Xếp bổ sung MRI</h3>
                  <p className="text-[10px] text-slate-500 normal-case mt-0.5">Tạo nhanh một ca MRI và xếp lịch bổ sung.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowAdHoc(false); resetAdHoc(); }}
                className="text-slate-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 border border-slate-200 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleAdHocSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">

              {adHocSuccess && (
                <div className="absolute inset-x-0 top-0 bg-emerald-500 text-white py-3.5 px-6 font-bold text-center z-50 animate-in slide-in-from-top flex items-center justify-center gap-2 text-xs">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{adHocSuccess}</span>
                </div>
              )}

              {adHocError && (
                <div className="bg-rose-50 border-r-4 border-rose-500 text-rose-800 py-2.5 px-6 text-[11px] font-semibold animate-in slide-in-from-top flex items-center gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{adHocError}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">

                {/* Patient choice */}
                <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    1. Bệnh nhi
                  </span>

                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => { setAdHocPatientMode('select'); setAdHocSelectedPatKey(''); setAdHocSearchPat(''); }}
                      className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer rounded-lg ${
                        adHocPatientMode === 'select' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Chọn bệnh nhi có sẵn
                    </button>
                    <button
                      type="button"
                      onClick={() => { setAdHocPatientMode('create'); setAdHocSelectedPatKey(''); setAdHocSearchPat(''); }}
                      className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer rounded-lg ${
                        adHocPatientMode === 'create' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Tạo nhanh bệnh nhi mới
                    </button>
                  </div>

                  {adHocPatientMode === 'select' && (
                    <div className="space-y-1.5">
                      {!adHocSelectedPatKey && (
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                          </span>
                          <input
                            type="text"
                            placeholder="Tìm tên, mã NB (ID1) để chọn..."
                            value={adHocSearchPat}
                            onChange={(e) => setAdHocSearchPat(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 shadow-sm"
                          />
                        </div>
                      )}

                      {!adHocSelectedPatKey && adHocSearchPat.trim().length > 0 && (
                        <div className="max-h-32 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-lg">
                          {(() => {
                            const trimmed = removeDiacritics(adHocSearchPat).trim().toLowerCase();
                            const matched = patients.filter(p => {
                              const nameOk = p.PatientName ? removeDiacritics(String(p.PatientName)).toLowerCase().includes(trimmed) : false;
                              const idOk = p.PatientID1 ? removeDiacritics(String(p.PatientID1)).toLowerCase().includes(trimmed) : false;
                              return nameOk || idOk;
                            });
                            if (matched.length === 0) {
                              return <div className="p-3 text-center text-slate-400 italic">Không tìm thấy bệnh nhi "{adHocSearchPat}"</div>;
                            }
                            return matched.slice(0, 12).map(p => (
                              <button
                                key={p.PatientKey}
                                type="button"
                                onClick={() => { setAdHocSelectedPatKey(p.PatientKey); setAdHocSearchPat(''); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition flex justify-between items-center cursor-pointer"
                              >
                                <div>
                                  <span className="font-extrabold uppercase text-slate-800">{p.PatientName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono ml-1">(ID1: {p.PatientID1})</span>
                                </div>
                                <span className="text-[10px] text-slate-400 italic">DOB: {formatVNTime(p.PatientDOB)} | {p.PatientSex}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}

                      {adHocSelectedPatKey && (() => {
                        const selectedPat = findPatientByKey(patients, adHocSelectedPatKey);
                        if (!selectedPat) return null;
                        return (
                          <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-2.5 text-slate-800 flex flex-col gap-1.5 shadow-sm">
                            <div className="flex justify-between items-center border-b border-indigo-100 pb-1 shrink-0">
                              <span className="text-[10px] uppercase font-bold text-indigo-850">Thông tin đối chiếu</span>
                              <button
                                type="button"
                                onClick={() => setAdHocSelectedPatKey('')}
                                className="text-indigo-600 hover:text-red-500 font-bold text-[9px] bg-white hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-indigo-150 shadow-xs transition shrink-0 cursor-pointer"
                              >
                                ✕ Bỏ chọn
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Họ và tên:</span>
                                <span className="font-extrabold text-indigo-950 uppercase text-[11px]">{selectedPat.PatientName}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Mã NB1 (ID1):</span>
                                <span className="font-bold font-mono text-slate-800">{selectedPat.PatientID1}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {adHocBlockingCmr && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-[10px] flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                          <div>
                            <p className="font-bold">{PATIENT_VALIDATION_MSG.pendingMriUiHint}</p>
                            <p>Không thể xếp bổ sung cho đến khi hoàn tất lượt hiện tại.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {adHocPatientMode === 'create' && (
                    <div className="bg-pink-50/50 border border-pink-100 rounded-2xl p-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi (ID1) *</label>
                          <input type="text" placeholder="Mã ID1..." value={adHocNewPatID1} onChange={(e) => setAdHocNewPatID1(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi phụ (ID2)</label>
                          <input type="text" placeholder="Mã ID2 (nếu có)..." value={adHocNewPatID2} onChange={(e) => setAdHocNewPatID2(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Họ tên Bệnh Nhi *</label>
                        <input type="text" placeholder="Nhập họ và tên viết hoa..." value={adHocNewPatName} onChange={(e) => setAdHocNewPatName(e.target.value.toUpperCase())} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-xs focus:outline-none uppercase text-slate-800" />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày sinh</label>
                          <VNDateInput value={adHocNewPatDOB} onChange={setAdHocNewPatDOB} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-sans text-xs focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Giới tính</label>
                          <div className="flex gap-2 pt-1">
                            <label className="flex items-center gap-1 font-bold cursor-pointer">
                              <input type="radio" name="mri-adhoc-gender" checked={adHocNewPatSex === 'Nam'} onChange={() => setAdHocNewPatSex('Nam')} className="accent-indigo-600 scale-105" /> Nam
                            </label>
                            <label className="flex items-center gap-1 font-bold cursor-pointer">
                              <input type="radio" name="mri-adhoc-gender" checked={adHocNewPatSex === 'Nữ'} onChange={() => setAdHocNewPatSex('Nữ')} className="accent-indigo-600 scale-105" /> Nữ
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">SĐT gia đình</label>
                          <input type="text" placeholder="Số ĐT..." value={adHocNewPatPhone} onChange={(e) => setAdHocNewPatPhone(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none" />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Địa chỉ</label>
                          <select value={adHocNewPatAddress} onChange={(e) => setAdHocNewPatAddress(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800">
                            {ADDRESS_OPTIONS.map((addr) => <option key={addr} value={addr}>{addr}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* MRI fields */}
                <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2.5">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    2. Thông tin MRI &amp; Xếp lịch
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-2.5">
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Cân nặng (kg) *</label>
                      <input type="text" required placeholder="vd: 12" value={String(adHocForm.PatientWeight || '')} onChange={(e) => updateAdHocField('PatientWeight', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã chẩn đoán MRI *</label>
                      <SearchableEnumSelect
                        required
                        value={String(adHocForm.CMRDiagnosisID || '')}
                        options={diagnosisOptions}
                        onChange={(value) => updateAdHocField('CMRDiagnosisID', value)}
                        allowCreate
                        createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                        onCreateOption={createDiagnosisSource}
                        placeholder="-- Chọn ICD --"
                        searchPlaceholder="Gõ ICD để tìm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">BS đăng ký</label>
                      <select
                        value={String(adHocForm.RequestBy || '')}
                        onChange={(e) => updateAdHocField('RequestBy', e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800"
                      >
                        <option value="">-- Chọn BS --</option>
                        {staffList.map(s => {
                          const displayName = getShortStaffName(s.StaffName, staffList);
                          return <option key={s.StaffKey} value={displayName}>{displayName}</option>;
                        })}
                        {extraDoctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa yêu cầu</label>
                      <SearchableEnumSelect
                        value={String(adHocForm.DepartRequest || '')}
                        options={departmentOptions}
                        onChange={(value) => updateAdHocField('DepartRequest', value)}
                        placeholder="-- Chọn khoa --"
                        searchPlaceholder="Gõ khoa để tìm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Phương thức chụp</label>
                      <MobileAutoExpandTextarea minRows={2} value={String(adHocForm.CMRMethod || '')} onChange={(e) => updateAdHocField('CMRMethod', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Dự trù dụng cụ</label>
                      <MobileAutoExpandTextarea minRows={2} value={String(adHocForm.CMRDevice || '')} onChange={(e) => updateAdHocField('CMRDevice', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa sau chụp</label>
                      <SearchableEnumSelect
                        value={String(adHocForm.PostDepart || '')}
                        options={departmentOptions}
                        onChange={(value) => updateAdHocField('PostDepart', value)}
                        placeholder="-- Chọn khoa --"
                        searchPlaceholder="Gõ khoa để tìm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Gây mê</label>
                      <select value={String(adHocForm.Anesthesia || '')} onChange={(e) => updateAdHocField('Anesthesia', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs">
                        {ANESTHESIA_OPTIONS.map(option => <option key={option} value={option}>{option || 'Chọn'}</option>)}
                      </select>
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày chụp MRI dự kiến</label>
                      <VNDateInput value={String(adHocForm.CMRScheduledDate || '')} onChange={(val) => updateAdHocField('CMRScheduledDate', val)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold font-sans focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Trạng thái gọi MRI</label>
                      <select value={String(adHocForm.CMRCallStatus || '')} onChange={(e) => updateAdHocField('CMRCallStatus', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs">
                        {CALL_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option || 'Chọn'}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chẩn đoán MRI *</label>
                    <MobileAutoExpandTextarea required minRows={2} value={String(adHocForm.CMRDiagnosis || '')} onChange={(e) => updateAdHocField('CMRDiagnosis', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Yêu cầu MRI *</label>
                    <MobileAutoExpandTextarea required minRows={2} value={String(adHocForm.CMRRequest || '')} onChange={(e) => updateAdHocField('CMRRequest', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ghi chú gọi MRI</label>
                    <MobileAutoExpandTextarea minRows={2} value={String(adHocForm.CMRCallStatusNote || '')} onChange={(e) => updateAdHocField('CMRCallStatusNote', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none" />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowAdHoc(false); resetAdHoc(); }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl cursor-pointer transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={adHocLoading || !!adHocBlockingCmr}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4" />
                  {adHocLoading ? 'Đang lưu...' : 'Lưu xếp bổ sung'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* SAVE / EXIT CONFIRMATION DIALOG */}
      {confirmMode && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs z-[75] flex items-center justify-center p-4 animate-in fade-in duration-200">
          <div className="bg-white rounded-2xl shadow-xl w-full max-w-md overflow-hidden animate-in zoom-in-95">
            <div className="py-3 px-4 flex items-center gap-2 bg-amber-50 border-b border-amber-100">
              <AlertTriangle className="w-5 h-5 text-amber-600" />
              <h3 className="font-extrabold text-[13px] uppercase tracking-wide text-amber-900">
                {confirmMode === 'exit' ? 'Thay đổi chưa lưu' : 'Xác nhận lưu lịch MRI'}
              </h3>
            </div>
            <div className="p-5 space-y-3">
              <p className="text-sm font-semibold text-slate-700 leading-relaxed">
                {confirmMode === 'exit'
                  ? 'Bạn có thay đổi chưa được lưu. Bạn có muốn lưu kết quả xếp lịch không?'
                  : 'Bạn có muốn lưu kết quả xếp lịch không?'}
              </p>
              <p className="text-[11px] text-slate-500 font-semibold">
                Trường bắt buộc khi lưu: Cân nặng, Mã chẩn đoán MRI, Chẩn đoán MRI, Yêu cầu MRI, Gây mê, Ngày chụp MRI dự kiến, Trạng thái gọi MRI.
              </p>
              {confirmError && (
                <div className="p-3 bg-red-50 text-red-700 border border-red-200 rounded-xl text-xs font-semibold">
                  {confirmError}
                </div>
              )}
            </div>
            <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={closeConfirm}
                className="px-4 py-2 font-bold text-xs bg-white border border-slate-200 rounded-xl text-slate-600 hover:bg-slate-100 transition shadow-sm cursor-pointer"
              >
                {confirmMode === 'exit' ? 'Ở lại' : 'Hủy'}
              </button>
              {confirmMode === 'exit' && (
                <button
                  type="button"
                  onClick={handleConfirmDiscard}
                  disabled={saving}
                  className="px-4 py-2 font-bold text-xs bg-white border border-slate-300 rounded-xl text-slate-700 hover:bg-slate-100 transition shadow-sm cursor-pointer disabled:opacity-50"
                >
                  Không lưu
                </button>
              )}
              <button
                type="button"
                onClick={() => handleConfirmSave(confirmMode === 'exit')}
                disabled={saving}
                className="px-4 py-2 font-bold text-xs text-white bg-indigo-600 hover:bg-indigo-700 rounded-xl shadow-sm transition disabled:opacity-50 cursor-pointer"
              >
                {saving ? 'Đang lưu...' : 'Lưu'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
