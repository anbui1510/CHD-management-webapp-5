import React, { useMemo, useState, useCallback } from 'react';
import {
  Activity,
  ArrowUpDown,
  CalendarDays,
  Search,
  Stethoscope,
  Undo2,
  User
} from 'lucide-react';
import { Operation, Patient, findPatientByKey, formatVNTime, removeDiacritics } from '../types';
import { SearchTextInput } from './SearchTextInput';
import { compareFormattedDates } from '../utils/patientFormValidation';
import { useModuleSubheader } from '../hooks/useModuleSubheader';

interface SurgeryRoomViewProps {
  patients: Patient[];
  operations: Operation[];
  onViewPatientRecord?: (patient: Patient) => void;
}

const joinSurgeons = (op: Operation): string => {
  return [
    op['1stSurgeon'],
    op['2ndSurgeon'],
    op['3rdSurgeon'],
    op['4thSurgeon']
  ]
    .map(name => String(name || '').trim())
    .filter(Boolean)
    .join(' - ');
};

export default function SurgeryRoomView({
  patients,
  operations,
  onViewPatientRecord
}: SurgeryRoomViewProps) {
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(false);
  const [selectedDone, setSelectedDone] = useState<{ patient: Patient; operation: Operation } | null>(null);

  const doneOperations = useMemo(() => {
    let list = [...operations];
    if (searchTerm.trim()) {
      const q = removeDiacritics(searchTerm).toLowerCase();
      list = list.filter(op => {
        const patient = findPatientByKey(patients, op.PatientKey);
        const name = removeDiacritics(String(patient?.PatientName || '')).toLowerCase();
        const diagnosis = removeDiacritics(String(op.PostDiagnosis || '')).toLowerCase();
        const method = removeDiacritics(String(op.SurgMethod || '')).toLowerCase();
        const surgeons = removeDiacritics(joinSurgeons(op)).toLowerCase();
        return name.includes(q) || diagnosis.includes(q) || method.includes(q) || surgeons.includes(q);
      });
    }
    list.sort((a, b) => {
      const cmp = compareFormattedDates(a.SurgDate, b.SurgDate);
      return sortAsc ? cmp : -cmp;
    });
    return list;
  }, [operations, patients, searchTerm, sortAsc]);

  const handleSubheaderSearch = useCallback((value: string) => {
    setSearchTerm(value);
  }, []);

  useModuleSubheader('surgery-room', {
    icon: <Activity className="w-4 h-4" />,
    searchValue: searchTerm,
    onSearchChange: handleSubheaderSearch,
  });

  const closeModal = () => setSelectedDone(null);

  const openDoneDetail = (operation: Operation) => {
    const patient = findPatientByKey(patients, operation.PatientKey);
    if (!patient) return;
    setSelectedDone({ patient, operation });
  };

  return (
    <div className="flex-1 flex flex-col p-4 w-full h-full overflow-hidden bg-slate-50">
      <div className="flex flex-wrap items-center gap-3 mb-3 shrink-0">
        <button
          type="button"
          onClick={() => setActiveTab('pending')}
          className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'pending' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
        >
          <CalendarDays className="w-4 h-4" />
          Chờ phẫu thuật
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab === 'pending' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>0</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('done')}
          className={`font-extrabold text-[13px] px-5 py-2.5 rounded-2xl transition flex items-center gap-2 ${activeTab === 'done' ? 'bg-indigo-600 text-white shadow-md' : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50 shadow-sm'}`}
        >
          <Activity className="w-4 h-4" />
          Đã phẫu thuật
          <span className={`px-2 py-0.5 rounded-full text-[11px] font-black ${activeTab === 'done' ? 'bg-indigo-500 text-white' : 'bg-slate-100 text-slate-500'}`}>{doneOperations.length}</span>
        </button>
      </div>

      <div className="mb-4 shrink-0 md:hidden">
        <div className="flex items-center gap-2 bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-2.5 max-w-xl">
          <Search className="w-4 h-4 text-slate-400 shrink-0" />
          <SearchTextInput
            type="text"
            placeholder="Tìm tên, chẩn đoán, phương pháp PT, PTV..."
            value={searchTerm}
            onChange={setSearchTerm}
            className="bg-transparent border-none outline-none text-[13px] text-slate-700 w-full font-bold placeholder:font-medium placeholder:text-slate-400"
          />
        </div>
      </div>

      {activeTab === 'pending' && (
        <div className="flex-1 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="flex-1 flex items-center justify-center p-10">
            <div className="text-center max-w-md">
              <p className="text-slate-500 font-semibold text-sm">Chưa có ca chờ phẫu thuật</p>
              <p className="text-slate-400 text-xs mt-2 font-medium">Tính năng đang phát triển</p>
            </div>
          </div>
          <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0">
            <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
              TỔNG SỐ CHỜ: 0 CA
            </div>
          </div>
        </div>
      )}

      {activeTab === 'done' && (
        <div className="flex-1 overflow-hidden bg-white rounded-xl shadow-sm border border-slate-200 flex flex-col">
          <div className="flex-1 overflow-auto custom-scrollbar">
            <table className="w-full text-left text-xs border-collapse min-w-[900px]">
              <thead className="sticky top-0 z-10">
                <tr className="bg-slate-50 text-slate-600 border-b border-slate-200 text-[10px] uppercase font-black tracking-wider font-mono">
                  <th className="py-3 px-4 w-12 text-center">STT</th>
                  <th className="py-3 px-4 min-w-[200px]">Họ tên Bệnh Nhi</th>
                  <th
                    className="py-3 px-4 w-36 text-center cursor-pointer group"
                    onClick={() => setSortAsc(!sortAsc)}
                  >
                    <span className="flex items-center justify-center gap-1">
                      Ngày PT (SurgDate)
                      <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-indigo-600" />
                    </span>
                  </th>
                  <th className="py-3 px-4 min-w-[220px]">Chẩn đoán PT (PostDiagnosis)</th>
                  <th className="py-3 px-4 min-w-[180px]">Phương pháp PT (SurgMethod)</th>
                  <th className="py-3 px-4 min-w-[160px]">Ghi chú PT (SurgNote)</th>
                  <th className="py-3 px-4 min-w-[160px] text-center">PTV</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-semibold text-slate-700">
                {doneOperations.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-slate-400 italic font-semibold">
                      Chưa có ca đã phẫu thuật
                    </td>
                  </tr>
                )}
                {doneOperations.map((op, index) => {
                  const patient = findPatientByKey(patients, op.PatientKey);
                  if (!patient) return null;
                  return (
                    <tr
                      key={op.SurgKey || `${op.PatientKey}_${index}`}
                      onClick={() => openDoneDetail(op)}
                      className="hover:bg-slate-50 cursor-pointer transition"
                    >
                      <td className="py-4 px-4 text-center text-slate-400 font-bold">{index + 1}</td>
                      <td className="py-4 px-4 text-slate-800 font-extrabold uppercase">{patient.PatientName}</td>
                      <td className="py-4 px-4 text-center text-slate-500 font-medium font-mono">
                        {op.SurgDate ? formatVNTime(op.SurgDate) : '—'}
                      </td>
                      <td className="py-4 px-4 text-slate-700 font-medium line-clamp-2">{op.PostDiagnosis || '—'}</td>
                      <td className="py-4 px-4 text-slate-700 font-medium whitespace-pre-wrap">{op.SurgMethod || '—'}</td>
                      <td className="py-4 px-4 text-slate-600 font-medium line-clamp-2">{op.SurgNote || '—'}</td>
                      <td className="py-4 px-4 text-center text-indigo-700 font-bold">{joinSurgeons(op) || '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="bg-slate-50 border-t border-slate-200 p-4 shrink-0">
            <div className="text-[11px] text-slate-500 font-semibold font-mono uppercase">
              TỔNG SỐ ĐÃ PHẪU THUẬT: {doneOperations.length} CA
            </div>
          </div>
        </div>
      )}

      {selectedDone && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white rounded-xl max-w-3xl w-full max-h-[92vh] shadow-2xl border border-slate-200 flex flex-col text-sm font-medium overflow-hidden">
            <div className="bg-[#1e293b] text-white px-5 py-3 flex justify-between items-center shrink-0">
              <h3 className="font-extrabold uppercase tracking-wide flex items-center gap-2">
                <Stethoscope />
                HỒ SƠ PHẪU THUẬT (CHỈ XEM)
              </h3>
              <button type="button" onClick={closeModal} className="p-2 hover:bg-slate-700 rounded-lg transition">
                <Undo2 className="w-4 h-4" />
              </button>
            </div>

            <div className="flex-1 p-4 bg-slate-50/50 space-y-4 overflow-y-auto custom-scrollbar">
              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <div className="font-extrabold text-primary text-xs uppercase mb-3 border-b border-indigo-50 pb-2">
                    Thông tin hành chính
                  </div>
                  <div className="space-y-1.5 text-xs">
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Họ tên:</span>
                      <span className="font-extrabold text-slate-800 uppercase">{selectedDone.patient.PatientName}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Giới tính:</span>
                      <span className="font-bold text-slate-800">{selectedDone.patient.PatientSex || '—'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Ngày sinh:</span>
                      <span className="font-bold text-slate-800">{formatVNTime(selectedDone.patient.PatientDOB)}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Mã NB:</span>
                      <span className="font-bold text-slate-800 font-mono">{selectedDone.patient.PatientID1 || '—'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Địa chỉ:</span>
                      <span className="font-bold text-slate-800 break-words">{selectedDone.patient.PatientAddress || '—'}</span>
                    </div>
                    <div className="flex gap-2">
                      <span className="text-slate-500 w-24 shrink-0">Điện thoại:</span>
                      <span className="font-bold text-slate-800 font-mono">{selectedDone.patient.PatientPhone1 || '—'}</span>
                    </div>
                  </div>
                </div>
                <div className="flex flex-col gap-2">
                  {onViewPatientRecord && (
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        onViewPatientRecord(selectedDone.patient);
                      }}
                      className="self-start bg-white hover:bg-indigo-50 border border-slate-300 text-indigo-700 font-bold text-xs py-1.5 px-3 rounded-lg transition flex items-center gap-1"
                    >
                      <User className="w-3.5 h-3.5" /> Mở hồ sơ bệnh án
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-3">
                <div className="font-extrabold text-primary text-xs uppercase border-b border-indigo-50 pb-2">
                  Thông tin phẫu thuật
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-500 font-bold block text-[10px] uppercase mb-0.5">Ngày PT (SurgDate)</span>
                    <span className="font-bold text-slate-800 font-mono">{selectedDone.operation.SurgDate ? formatVNTime(selectedDone.operation.SurgDate) : '—'}</span>
                  </div>
                  <div>
                    <span className="text-slate-500 font-bold block text-[10px] uppercase mb-0.5">PTV</span>
                    <span className="font-bold text-indigo-800">{joinSurgeons(selectedDone.operation) || '—'}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase mb-0.5">Chẩn đoán PT (PostDiagnosis)</span>
                    <span className="font-semibold text-slate-800 whitespace-pre-wrap">{selectedDone.operation.PostDiagnosis || '—'}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase mb-0.5">Phương pháp PT (SurgMethod)</span>
                    <span className="font-semibold text-slate-800 whitespace-pre-wrap">{selectedDone.operation.SurgMethod || '—'}</span>
                  </div>
                  <div className="md:col-span-2">
                    <span className="text-slate-500 font-bold block text-[10px] uppercase mb-0.5">Ghi chú PT (SurgNote)</span>
                    <span className="font-semibold text-slate-800 whitespace-pre-wrap">{selectedDone.operation.SurgNote || '—'}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="p-4 border-t border-slate-200 bg-white flex justify-end shrink-0">
              <button
                type="button"
                onClick={closeModal}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2 rounded-xl text-xs transition"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
