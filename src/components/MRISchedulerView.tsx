import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Filter,
  Save,
  Search,
  X
} from 'lucide-react';
import { CMR, Consult, Patient, Source, Staff, formatVNTime, removeDiacritics } from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';

interface MRISchedulerViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  sources: Source[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
}

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
  currentStaff,
  onRefreshData
}: MRISchedulerViewProps) {
  const [activeTab, setActiveTab] = useState<MriTab>('unscheduled');
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
    return Array.from(new Set(
      [
        ...sources.map(source => String(source.DiagnosisID || '').trim()),
        ...consults.map(consult => String(consult.DiagnosisID || '').trim()),
        ...cmrs.map(cmr => String(cmr.CMRDigagnosisID || '').trim())
      ]
        .filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [sources, consults, cmrs]);

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
          CMRDigagnosisID: consult.DiagnosisID || '',
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
        item.CMRDigagnosisID,
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
      CMRDigagnosisID: item.CMRDigagnosisID || item.__consult?.DiagnosisID || '',
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
      { key: 'CMRDigagnosisID', label: 'Mã chẩn đoán MRI' },
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
            <div className="p-4 border-b border-slate-100 bg-slate-50 shrink-0">
              <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-[#d2145a]" />
                Danh sách chờ xếp lịch MRI
              </h3>
              <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
                Tổng cộng: {allMriItems.length} ca MRI tim
              </p>
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
                            {item.CMRDigagnosisID || '—'}
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
                      {renderEnumInput('CMRDigagnosisID', 'Mã chẩn đoán MRI', diagnosisOptions, 'Gõ ICD để tìm', true)}
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
                          {item.CMRDigagnosisID || '—'} - {item.CMRCallStatus || 'Chưa gọi'}
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
    </div>
  );
}
