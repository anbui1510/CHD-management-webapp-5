import React, { useMemo, useState } from 'react';
import {
  Activity,
  Calendar,
  ChevronLeft,
  ChevronRight,
  X
} from 'lucide-react';
import { CMR, Consult, Patient, formatVNTime } from '../types';
import { resolveCMRDevice, resolveCMRMethod } from '../data/cmrDefaults';

interface MRICalendarViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
}

type MRICalendarItem = CMR & { __patient?: Patient };

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

export default function MRICalendarView({ patients, cmrs }: MRICalendarViewProps) {
  const [currentMonth, setCurrentMonth] = useState(5);
  const [currentYear, setCurrentYear] = useState(2026);
  const [selectedItem, setSelectedItem] = useState<MRICalendarItem | null>(null);

  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.id) map.set(String(patient.id).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  // Only scheduled MRI cases (CMRScheduledDate has value)
  const scheduledItems = useMemo<MRICalendarItem[]>(() => {
    return cmrs
      .map((cmr, index) => {
        const key = cmr.id || cmr.id || `cmr_no_key_${index}`;
        const patient =
          patientsByKey.get(String(cmr.PatientKey || '').trim().toLowerCase()) ||
          patientsByKey.get(String(cmr.MBN || '').trim().toLowerCase());
        return { ...cmr, CMRKey: key, __patient: patient };
      })
      .filter(item => !!getFormattedDateKey(item.CMRScheduledDate));
  }, [cmrs, patientsByKey]);

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

  return (
    <div className="flex-1 bg-slate-50 min-h-0 flex flex-col font-sans p-3 lg:p-4">
      <div className="flex-1 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden h-full min-h-0 flex flex-col">

        <div className="p-4 border-b border-slate-100 bg-slate-50 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div>
            <h3 className="font-extrabold text-slate-800 text-[13px] uppercase tracking-wide flex items-center gap-1.5">
              <Calendar className="w-4 h-4 text-[#d2145a]" />
              Lịch chụp MRI tim
            </h3>
            <p className="text-[9px] text-[#d2145a] font-bold uppercase mt-0.5">
              {scheduledItems.length} ca MRI dự kiến
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => setCurrentMonth(prev => {
                if (prev === 0) { setCurrentYear(y => y - 1); return 11; }
                return prev - 1;
              })}
              className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <span className="font-extrabold text-[13px] text-slate-800 uppercase tracking-wider">
              Tháng {currentMonth + 1} {currentYear}
            </span>
            <button
              onClick={() => setCurrentMonth(prev => {
                if (prev === 11) { setCurrentYear(y => y + 1); return 0; }
                return prev + 1;
              })}
              className="p-1.5 bg-white border border-slate-200 rounded-lg hover:bg-slate-100"
            >
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
              const matches = scheduledItems.filter(item => getFormattedDateKey(item.CMRScheduledDate) === cell.dateStr);
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
                          key={item.id || item.id}
                          onClick={() => setSelectedItem(item)}
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
            <span className="flex items-center gap-1.5"><span className="w-2.5 h-2.5 rounded-full bg-[#b31448]"></span> Ca MRI dự kiến chụp</span>
            <span className="text-[9px] text-[#d2145a] font-extrabold">CMR Calendar</span>
          </div>
        </div>
      </div>

      {/* VIEW-ONLY DETAIL MODAL */}
      {selectedItem && (() => {
        const patient = selectedItem.__patient;
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-xl w-full max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150">

              <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-indigo-50/50 shrink-0">
                <div className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-indigo-600" />
                  <div>
                    <h3 className="font-extrabold text-sm uppercase text-indigo-900">Chi tiết ca MRI tim</h3>
                    <p className="text-[10px] text-slate-500 normal-case mt-0.5">
                      Ngày chụp dự kiến: {selectedItem.CMRScheduledDate ? formatVNTime(selectedItem.CMRScheduledDate) : '—'} (chỉ xem)
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="text-slate-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 border border-slate-200 rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">
                {/* Admin info */}
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                  <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2.5">
                    Thông tin hành chính
                  </span>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                    <div className="col-span-2">
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Họ và tên:</span>
                      <span className="font-extrabold text-slate-900 uppercase text-[11.5px]">{patient?.PatientName || selectedItem['Họ và tên'] || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Mã NB (ID1):</span>
                      <span className="font-extrabold font-mono text-slate-800 text-[11px]">{patient?.PatientID1 || selectedItem.MBN || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Ngày sinh:</span>
                      <span className="font-bold font-mono text-slate-800">{patient?.PatientDOB ? formatVNTime(patient.PatientDOB) : '—'}</span>
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
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Điện thoại:</span>
                      <span className="font-extrabold font-mono text-slate-800">{patient?.PatientPhone1 || '—'}</span>
                    </div>
                  </div>
                </div>

                {/* MRI info */}
                <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                  <span className="font-extrabold text-[#d2145a] text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2.5">
                    Thông tin MRI
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Cân nặng (kg):</span>
                      <span className="font-bold text-slate-800">{selectedItem.PatientWeight ? `${selectedItem.PatientWeight} kg` : '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">BS đăng ký:</span>
                      <span className="font-bold text-slate-800">{selectedItem.RequestBy || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Khoa yêu cầu:</span>
                      <span className="font-bold text-slate-800">{selectedItem.DepartRequest || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Gây mê:</span>
                      <span className="font-bold text-slate-800">{selectedItem.Anesthesia || '—'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Mã chẩn đoán:</span>
                      <span className="text-[10px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded">{selectedItem.CMRDiagnosisID || '—'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Chẩn đoán MRI:</span>
                      <span className="font-semibold text-slate-800 whitespace-pre-wrap">{selectedItem.CMRDiagnosis || '—'}</span>
                    </div>
                    <div className="sm:col-span-2">
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Yêu cầu MRI:</span>
                      <span className="font-semibold text-slate-800 whitespace-pre-wrap">{selectedItem.CMRRequest || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Trạng thái gọi MRI:</span>
                      <span className="font-bold text-slate-800">{selectedItem.CMRCallStatus || '—'}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Phương thức chụp:</span>
                      <span className="font-bold text-slate-800 whitespace-pre-wrap">{resolveCMRMethod(selectedItem.CMRMethod)}</span>
                    </div>
                    <div>
                      <span className="text-slate-400 block font-bold text-[8px] uppercase">Dự trù dụng cụ:</span>
                      <span className="font-bold text-slate-800 whitespace-pre-wrap">{resolveCMRDevice(selectedItem.CMRDevice)}</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
                <button
                  type="button"
                  onClick={() => setSelectedItem(null)}
                  className="px-5 py-2 text-xs font-extrabold text-white bg-indigo-600 hover:bg-indigo-700 rounded-2xl cursor-pointer transition"
                >
                  Đóng
                </button>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
