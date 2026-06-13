import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  Calendar,
  CalendarDays,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Filter,
  Plus,
  Save,
  Search,
  X
} from 'lucide-react';
import { CMR, Consult, Patient, Source, Staff, formatVNTime, removeDiacritics, findPatientByKey, normalizePatientKey } from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { getDiagnosisOptions } from '../data/source';

interface MRISchedulerViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  sources: Source[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
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

const getFormattedDateKey = (str?: string): string => {
  if (!str) return '';
  const trimmed = String(str).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  return trimmed;
};

const getPatientDisplayName = (patientName?: string): string => {
  if (!patientName) return 'MRI';
  const parts = patientName.trim().split(/\s+/);
  return parts.slice(-2).join(' ');
};

const getAgeDescription = (dobStr?: string): string => {
  if (!dobStr) return '';
  const key = getFormattedDateKey(dobStr);
  const parts = key.split('-');
  if (parts.length !== 3) return '';
  const dob = new Date(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]));
  if (Number.isNaN(dob.getTime())) return '';
  const today = new Date(2026, 5, 6);
  let years = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    years -= 1;
  }
  if (years <= 0) {
    const months = Math.max(0, (today.getFullYear() - dob.getFullYear()) * 12 + today.getMonth() - dob.getMonth());
    return months <= 0 ? 'Sơ sinh' : `${months} tháng`;
  }
  return `${years} tuổi`;
};

export default function MRISchedulerView({
  patients,
  consults,
  cmrs,
  sources,
  staffList = [],
  currentStaff,
  onRefreshData
}: MRISchedulerViewProps) {
  const [activeTab, setActiveTab] = useState<MriTab>('unscheduled');

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
  const [exportStartDate, setExportStartDate] = useState('');
  const [currentMonth, setCurrentMonth] = useState(5);
  const [currentYear, setCurrentYear] = useState(2026);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  const [formData, setFormData] = useState<Partial<CMR>>({});

  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.PatientKey) map.set(String(patient.PatientKey).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  const diagnosisOptions = useMemo(() => {
    return getDiagnosisOptions(sources, [
      ...consults.map(consult => consult.DiagnosisID),
      ...cmrs.map(cmr => cmr.CMRDiagnosisID)
    ]);
  }, [sources, consults, cmrs]);

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = DiagnosisID.trim();
    if (!trimmed) return;

    const response = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DiagnosisID: trimmed })
    });

    if (!response.ok) {
      throw new Error('Không thể thêm DiagnosisID vào Source');
    }

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

  const exportEndDate = useMemo(() => {
    if (!exportStartDate) return '';
    const date = new Date(exportStartDate);
    date.setDate(date.getDate() + 7);
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  }, [exportStartDate]);

  const filteredScheduleItems = useMemo(() => {
    if (!exportStartDate || !exportEndDate) return [];
    return segmentedItems.scheduled.filter(item => {
      const date = getFormattedDateKey(item.CMRScheduledDate);
      return date >= exportStartDate && date <= exportEndDate;
    });
  }, [exportStartDate, exportEndDate, segmentedItems.scheduled]);

  const handleSelectItem = (item: MRISchedulerItem) => {
    setSelectedItem(item);
    setFormData({
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
      CMRMethod: item.CMRMethod || '',
      CMRDevice: item.CMRDevice || '',
      PostDepart: item.PostDepart || '',
      Anesthesia: item.Anesthesia || '',
      CMRScheduledDate: getFormattedDateKey(item.CMRScheduledDate),
      CMRCallStatus: item.CMRCallStatus || '',
      CMRCallStatusNote: item.CMRCallStatusNote || ''
    });
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

  const handleSave = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedItem) return;

    const patient = selectedItem.__patient;
    const requiredFields: { key: keyof CMR; label: string }[] = [
      { key: 'PatientWeight', label: 'Cân nặng (kg)' },
      { key: 'CMRDiagnosisID', label: 'Mã chẩn đoán MRI' },
      { key: 'CMRDiagnosis', label: 'Chẩn đoán MRI' },
      { key: 'CMRRequest', label: 'Yêu cầu MRI' },
      { key: 'Anesthesia', label: 'Gây mê' },
      { key: 'CMRScheduledDate', label: 'Ngày chụp MRI dự kiến' },
      { key: 'CMRCallStatus', label: 'Trạng thái gọi MRI' }
    ];
    const missingFields = requiredFields.filter(field => !String(formData[field.key] || '').trim());
    if (missingFields.length > 0) {
      setMessage(`Vui lòng nhập đủ: ${missingFields.map(field => field.label).join(', ')}.`);
      return;
    }

    const payload: CMR = {
      ...selectedItem,
      ...formData,
      CMRKey: selectedItem.__isSynthetic ? `cmr_${Date.now()}` : (selectedItem.CMRKey || selectedItem.CMRkey || `cmr_${Date.now()}`),
      PatientKey: String(formData.PatientKey || selectedItem.PatientKey || patient?.PatientKey || ''),
      MBN: String(formData.MBN || patient?.PatientID1 || ''),
      'Họ và tên': String(formData['Họ và tên'] || patient?.PatientName || ''),
      UpdateTime: new Date().toISOString()
    };

    setSaving(true);
    setMessage('');
    try {
      const method = selectedItem.__isSynthetic ? 'POST' : 'PUT';
      const url = selectedItem.__isSynthetic ? '/api/cmrs' : `/api/cmrs/${selectedItem.CMRKey || selectedItem.CMRkey}`;
      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!response.ok) {
        throw new Error('Không lưu được lịch MRI');
      }

      setMessage(`Đã lưu lịch MRI${currentStaff?.StaffName ? ` bởi ${currentStaff.StaffName}` : ''}.`);
      await onRefreshData();
      setSelectedItem({ ...payload, __patient: patient, __consult: selectedItem.__consult });
      setTimeout(() => setMessage(''), 3500);
    } catch (error: any) {
      setMessage(error?.message || 'Có lỗi khi lưu lịch MRI.');
    } finally {
      setSaving(false);
    }
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
    setAdHocForm({});
    setAdHocSuccess('');
    setAdHocError('');
  };

  const getAdHocBlockingCmr = (patientKey: string): CMR | undefined => {
    const normalized = normalizePatientKey(patientKey);
    if (!normalized) return undefined;
    return cmrs.find(cmr =>
      normalizePatientKey(cmr.PatientKey) === normalized &&
      !getFormattedDateKey(cmr.CMRScheduledDate) &&
      !getFormattedDateKey(cmr.CMRDate)
    );
  };

  const adHocBlockingCmr = adHocSelectedPatKey ? getAdHocBlockingCmr(adHocSelectedPatKey) : undefined;

  const handleAdHocSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setAdHocLoading(true);
    setAdHocError('');
    setAdHocSuccess('');

    try {
      if (!String(adHocForm.CMRDiagnosisID || '').trim()) {
        setAdHocError('Vui lòng chọn Mã chẩn đoán MRI (CMRDiagnosisID)!');
        setAdHocLoading(false);
        return;
      }

      let finalPatientKey = adHocSelectedPatKey;
      let finalPatient: Patient | undefined = findPatientByKey(patients, adHocSelectedPatKey) || undefined;

      if (adHocPatientMode === 'create') {
        if (!adHocNewPatID1.trim() || !adHocNewPatName.trim()) {
          setAdHocError('Vui lòng nhập Mã bệnh nhi (ID1) và Họ tên bệnh nhi!');
          setAdHocLoading(false);
          return;
        }
        const dup = patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === adHocNewPatID1.trim().toLowerCase());
        if (dup) {
          setAdHocError(`Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${dup.PatientName}).`);
          setAdHocLoading(false);
          return;
        }
        finalPatientKey = `pat_${Date.now()}`;
        const patientPayload = {
          PatientKey: finalPatientKey,
          PatientID1: adHocNewPatID1.trim(),
          PatientID2: adHocNewPatID2.trim(),
          PatientName: adHocNewPatName,
          OtherPatientName: adHocNewPatName,
          PatientDOB: adHocNewPatDOB || '2020-01-01',
          PatientSex: adHocNewPatSex,
          PatientAddress: adHocNewPatAddress || 'TP Hà Nội',
          PatientPhone1: adHocNewPatPhone || '',
          PatientPhone2: '',
          PatientCreateBy: currentStaff?.StaffKey || '01378',
          PatientCreateTime: new Date().toISOString()
        };
        const patRes = await fetch('/api/patients', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patientPayload)
        });
        if (!patRes.ok) throw new Error('Không thể tạo bệnh nhi mới');
        finalPatient = patientPayload as unknown as Patient;
      } else {
        if (!finalPatientKey) {
          setAdHocError('Vui lòng tìm và chọn bệnh nhi sẵn có hoặc đổi sang chế độ tạo mới!');
          setAdHocLoading(false);
          return;
        }
        if (getAdHocBlockingCmr(finalPatientKey)) {
          setAdHocError('Bệnh nhi này đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp).');
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
        CMRMethod: String(adHocForm.CMRMethod || ''),
        CMRDevice: String(adHocForm.CMRDevice || ''),
        PostDepart: String(adHocForm.PostDepart || ''),
        Anesthesia: String(adHocForm.Anesthesia || ''),
        CMRScheduledDate: getFormattedDateKey(adHocForm.CMRScheduledDate),
        CMRCallStatus: String(adHocForm.CMRCallStatus || ''),
        CMRCallStatusNote: String(adHocForm.CMRCallStatusNote || ''),
        UpdateTime: new Date().toISOString()
      };

      const res = await fetch('/api/cmrs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(cmrPayload)
      });
      if (!res.ok) throw new Error('Không thể xếp bổ sung MRI');

      setAdHocSuccess('Đã xếp bổ sung MRI thành công!');
      setTimeout(() => {
        setShowAdHoc(false);
        resetAdHoc();
        onRefreshData();
      }, 1500);
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
      <textarea
        value={String(formData[key] || '')}
        onChange={(event) => updateField(key, event.target.value)}
        rows={3}
        required={required}
        className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a] resize-none"
      />
    </div>
  );

  return (
    <div className="flex-1 bg-slate-50 min-h-0 flex flex-col font-sans">
      <div className="flex-1 overflow-hidden p-3 lg:p-4 flex h-full min-h-0 gap-4">
        <div className="flex-1 grid grid-cols-1 lg:grid-cols-12 gap-4 h-full min-h-0">
          <div className={`${isFilterExpanded ? 'hidden xl:flex xl:col-span-5' : 'lg:col-span-6'} bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-full min-h-0 flex flex-col`}>
            <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0 flex items-center justify-between gap-2">
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

            <div className="px-4 py-2 bg-slate-50/75 border-b border-slate-150 flex gap-2 shrink-0">
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

            <div className="p-3 border-b border-slate-150 relative shrink-0">
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

          <div className={`${isFilterExpanded ? 'lg:col-span-12 xl:col-span-7' : 'lg:col-span-6'} bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-full min-h-0 flex flex-col`}>
            {!selectedItem ? (
              <>
                <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
                  <div>
                    <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-[#d2145a]" />
                      Lịch chụp MRI dự kiến
                    </h3>
                    <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                      Calendar lịch MRI tim bẩm sinh
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setCurrentMonth(prev => prev === 0 ? 11 : prev - 1)} className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100">
                      <ChevronLeft className="w-4 h-4" />
                    </button>
                    <span className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider">
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
              <form onSubmit={handleSave} className="flex-1 flex flex-col min-h-0 bg-white">
                <div className="p-4 border-b border-indigo-100 bg-indigo-50/20 flex items-center justify-between gap-2 shrink-0">
                  <div className="flex items-center gap-2">
                    <button type="button" onClick={() => setSelectedItem(null)} className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-extrabold text-[10.5px] px-3.5 py-1.5 rounded-xl transition">
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
                            <span className="font-bold text-slate-800">{patient ? `${getAgeDescription(patient.PatientDOB)} (${formatVNTime(patient.PatientDOB)})` : '—'}</span>
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
                      {renderInput('CMRMethod', 'Phương thức chụp', 'Phương thức chụp')}
                      {renderInput('CMRDevice', 'Máy/thiết bị MRI', 'Máy/thiết bị MRI')}
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
                        <input
                          type="date"
                          value={String(formData.CMRScheduledDate || '')}
                          onChange={(event) => updateField('CMRScheduledDate', event.target.value)}
                          required
                          className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-[#d2145a]"
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

                <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-between items-center gap-3 shrink-0">
                  <span className={`text-[11px] font-bold ${message.includes('lỗi') || message.includes('Không') ? 'text-rose-600' : 'text-emerald-700'}`}>
                    {message}
                  </span>
                  <button
                    type="submit"
                    disabled={saving}
                    className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs transition flex items-center gap-2 disabled:opacity-50"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Đang lưu...' : 'Lưu kết quả xếp lịch'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>

        <div className="shrink-0 flex flex-col gap-4 self-start h-full min-h-0">
          <div className={`transition-all duration-300 bg-white border border-slate-200 rounded-3xl shadow-sm flex flex-col ${isFilterExpanded ? 'w-[320px] flex-1 min-h-0' : 'w-[52px]'}`}>
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

                <div className="p-5 overflow-y-auto space-y-6 flex-1">
                  <div>
                    <label className="block text-slate-500 font-bold text-[10px] uppercase mb-2 flex items-center gap-1.5">
                      <CalendarDays className="w-4 h-4" /> Chọn ngày đầu tuần
                    </label>
                    <input
                      type="date"
                      value={exportStartDate}
                      onChange={(event) => setExportStartDate(event.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-3 py-2.5 font-extrabold text-xs text-slate-800 shadow-sm"
                    />
                    {exportEndDate && (
                      <p className="mt-2 text-[10.5px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-100 p-2 rounded-lg">
                        Lọc từ ngày: <strong>{exportStartDate.split('-').reverse().join('/')}</strong><br />
                        Đến ngày: <strong>{exportEndDate.split('-').reverse().join('/')}</strong> (+7 ngày)
                      </p>
                    )}
                  </div>

                  <div className="space-y-2">
                    {filteredScheduleItems.map((item, index) => (
                      <button
                        key={item.CMRKey || item.CMRkey || index}
                        onClick={() => handleSelectItem(item)}
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

                <div className="p-4 border-t border-slate-100 shrink-0 bg-slate-50 rounded-b-3xl">
                  <p className="text-[10px] font-semibold text-slate-500 flex justify-between">
                    <span>Tổng số ca tìm thấy:</span>
                    <span className="font-black text-[#d2145a] text-[12px]">{filteredScheduleItems.length}</span>
                  </p>
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
                            <p className="font-bold">Bệnh nhi đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp).</p>
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
                          <input type="date" value={adHocNewPatDOB} onChange={(e) => setAdHocNewPatDOB(e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none" />
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
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">BS đăng ký (RequestBy)</label>
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
                      <input type="text" value={String(adHocForm.CMRMethod || '')} onChange={(e) => updateAdHocField('CMRMethod', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Máy/thiết bị MRI</label>
                      <input type="text" value={String(adHocForm.CMRDevice || '')} onChange={(e) => updateAdHocField('CMRDevice', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs" />
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
                      <input type="date" value={String(adHocForm.CMRScheduledDate || '')} onChange={(e) => updateAdHocField('CMRScheduledDate', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs" />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Trạng thái gọi MRI</label>
                      <select value={String(adHocForm.CMRCallStatus || '')} onChange={(e) => updateAdHocField('CMRCallStatus', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs">
                        {CALL_STATUS_OPTIONS.map(option => <option key={option} value={option}>{option || 'Chọn'}</option>)}
                      </select>
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chẩn đoán MRI (CMRDiagnosis) *</label>
                    <textarea required rows={2} value={String(adHocForm.CMRDiagnosis || '')} onChange={(e) => updateAdHocField('CMRDiagnosis', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Yêu cầu MRI (CMRRequest) *</label>
                    <textarea required rows={2} value={String(adHocForm.CMRRequest || '')} onChange={(e) => updateAdHocField('CMRRequest', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none" />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ghi chú gọi MRI (CMRCallStatusNote)</label>
                    <textarea rows={2} value={String(adHocForm.CMRCallStatusNote || '')} onChange={(e) => updateAdHocField('CMRCallStatusNote', e.target.value)} className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none" />
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
    </div>
  );
}
