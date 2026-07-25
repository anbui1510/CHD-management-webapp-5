import React, { useRef } from 'react';
import { Patient, Consult, CathLab, CMR, Operation, formatVNTime } from '../types';
import { useLockBodyScroll, usePreventBackgroundTouchScroll } from '../hooks/useLockBodyScroll';
import {
  parseMedicalDateTime,
  resolveLatestDiagnosis,
  normalizeRecordKey,
  filterPatientConsults,
  filterPatientCathlabs,
  filterPatientOperations
} from '../utils/latestDiagnosis';
import { hasPlannedCathLabDate } from '../utils/cathlabWaitlist';
import { formatPatientDobWithAge } from '../utils/patientDisplay';
import { PatientAdminEditButton } from './PatientAdminEditButton';
import {
  X,
  MapPin,
  UserSquare2,
  ShieldCheck,
  ClipboardCheck,
  FileText,
  Activity,
  AlertTriangle,
  CalendarDays,
  Scissors
} from 'lucide-react';

interface PatientDetailsDrawerProps {
  patient: Patient;
  consults: Consult[];
  cathlabs: CathLab[];
  cmrs: CMR[];
  operations?: Operation[];
  onClose: () => void;
  onEditPatientAdmin: (patient: Patient) => void;
  onSelectPDF: (consult: Consult, patient: Patient) => void;
  onRegisterNewConsult: (patient: Patient) => void;
}

const INTERVENTION_RESULTS = new Set([
  'can thiệp thông tim',
  'chụp chẩn đoán-đo kháng lực',
  'chụp chẩn đoán/đo kháng lực',
  'chụp chẩn đoán +/- can thiệp',
  'tiền glenn',
  'tiền fontan',
  'điện sinh lý'
]);

const joinPeople = (people: Array<string | undefined>) => people.map(person => String(person || '').trim()).filter(Boolean).join(' - ');

export default function PatientDetailsDrawer({
  patient,
  consults,
  cathlabs,
  cmrs,
  operations = [],
  onClose,
  onEditPatientAdmin,
  onSelectPDF,
  onRegisterNewConsult
}: PatientDetailsDrawerProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useLockBodyScroll(true);
  usePreventBackgroundTouchScroll(scrollContainerRef, true);

  const patientKey = normalizeRecordKey(patient.PatientKey);
  const patientId1 = normalizeRecordKey(patient.PatientID1);

  const patientConsults = filterPatientConsults(consults, patient.PatientKey)
    .sort((a, b) => parseMedicalDateTime(b.ConsultDate) - parseMedicalDateTime(a.ConsultDate));

  const patientConsultKeys = new Set(patientConsults.map(c => normalizeRecordKey(c.ConsultKey)).filter(Boolean));

  const patientCathlabs = filterPatientCathlabs(cathlabs, patient.PatientKey, patientConsultKeys)
    .sort((a, b) => parseMedicalDateTime(b.CathDate) - parseMedicalDateTime(a.CathDate));

  const patientCmrs = cmrs
    .filter(cmr =>
      normalizeRecordKey(cmr.PatientKey) === patientKey ||
      normalizeRecordKey(cmr.MBN) === patientId1 ||
      patientConsultKeys.has(normalizeRecordKey(cmr.ConsultKey))
    )
    .sort((a, b) =>
      parseMedicalDateTime(b.CMRDate || b.CMRScheduledDate || b.UpdateTime) -
      parseMedicalDateTime(a.CMRDate || a.CMRScheduledDate || a.UpdateTime)
    );

  const patientOperations = filterPatientOperations(operations, patient.PatientKey, patientConsultKeys)
    .sort((a, b) => parseMedicalDateTime(b.SurgDate) - parseMedicalDateTime(a.SurgDate));

  const joinSurgeons = (op: Operation) => joinPeople([
    op['1stSurgeon'],
    op['2ndSurgeon'],
    op['3rdSurgeon'],
    op['4thSurgeon']
  ]);

  const latestDiagnosis = resolveLatestDiagnosis({
    consults: patientConsults,
    cathlabs: patientCathlabs,
    operations: patientOperations
  });

  const latestPendingPrep = patientConsults.find(c => {
    const isCathLabIndication = INTERVENTION_RESULTS.has(String(c.ConsultResultID || '').trim().toLowerCase());
    if (!isCathLabIndication) return false;

    const cKey = normalizeRecordKey(c.ConsultKey);
    if (!cKey) return false;

    // Kiểm tra xem đã có bản ghi thông tim tương ứng nào chưa
    const hasMatchingCath = patientCathlabs.some(cath => {
      const cathConsultKey = normalizeRecordKey(cath.ConsultKey);
      if (cathConsultKey === cKey) return true;

      // Dự phòng: Nếu bản ghi thông tim không liên kết rõ ràng với hội chẩn nào, đối khớp theo ngày
      if (!cathConsultKey) {
        const cathTime = parseMedicalDateTime(cath.CathDate);
        const consultTime = parseMedicalDateTime(c.ConsultDate);
        return cathTime >= consultTime;
      }
      return false;
    });

    return !hasMatchingCath;
  });

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-3 md:p-4 pb-[calc(4rem+env(safe-area-inset-bottom))] md:pb-4 overflow-hidden overscroll-none animate-in fade-in duration-200">
      <div className="absolute inset-0" onClick={onClose} aria-hidden="true"></div>

      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="patient-details-drawer-title"
        className="relative bg-white w-full max-w-2xl max-h-[min(88dvh,calc(100dvh-4.5rem-env(safe-area-inset-bottom)))] md:max-h-[90vh] rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-250 overflow-hidden min-h-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="bg-[#d2145a] text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0 rounded-t-3xl">
          <div className="flex items-center gap-2">
            <UserSquare2 className="w-5 h-5" />
            <h3 id="patient-details-drawer-title" className="font-extrabold text-sm tracking-wide uppercase">Hồ sơ chi tiết bệnh nhi</h3>
          </div>
          <button onClick={onClose} className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          className="flex-1 min-h-0 overflow-y-auto overscroll-contain touch-pan-y p-6 space-y-6"
          style={{ WebkitOverflowScrolling: 'touch' }}
        >
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3 min-w-0 flex-1">
              <div className="hidden md:flex w-14 h-14 rounded-full bg-pink-100 border-2 border-pink-200 text-[#d2145a] items-center justify-center font-bold text-xl uppercase shadow-inner shrink-0">
                {patient.PatientSex === 'Nam' ? '👦' : '👧'}
              </div>
              <div className="min-w-0">
                <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-[#d2145a] bg-pink-50 border border-pink-200 rounded px-1.5 py-0.5">
                  MNB: {patient.PatientID1}{patient.PatientID2 ? ` | MNB khác: ${patient.PatientID2}` : ''}
                </span>
                <h2 className="text-lg font-black text-slate-800 leading-none uppercase pt-2">{patient.PatientName}</h2>
                {patient.OtherPatientName && patient.OtherPatientName !== patient.PatientName && (
                  <p className="text-xs font-semibold text-slate-500 mt-1">Tên lúc khai sinh: {patient.OtherPatientName}</p>
                )}
              </div>
            </div>

            <PatientAdminEditButton onClick={() => onEditPatientAdmin(patient)} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs font-semibold text-slate-700 bg-slate-50/50 border border-slate-150 rounded-2xl p-4">
            <div className="space-y-2">
              <p className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">⚧ Giới tính:</span>
                <span className={`font-bold px-1.5 py-0.5 rounded ${patient.PatientSex === 'Nam' ? 'bg-blue-100 text-blue-800' : 'bg-pink-100 text-pink-800'}`}>
                  {patient.PatientSex}
                </span>
              </p>
              <p className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">📅 Ngày sinh:</span>
                <span className="font-bold text-slate-800">{formatPatientDobWithAge(patient.PatientDOB, undefined, formatVNTime)}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400 font-medium">Địa chỉ:</span>
                <span className="font-extrabold text-slate-800">{patient.PatientAddress || ''}</span>
              </p>
            </div>

            <div className="space-y-2 border-t md:border-t-0 md:border-l border-slate-200 pt-2.5 md:pt-0 md:pl-4">
              <p className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">📞 Số điện thoại 1:</span>
                <span className="font-extrabold text-slate-800 font-mono">{patient.PatientPhone1}</span>
              </p>
              {patient.PatientPhone2 && (
                <p className="flex items-center gap-1.5">
                  <span className="text-slate-400 font-medium">Số điện thoại 2:</span>
                  <span className="font-bold text-slate-800 font-mono">{patient.PatientPhone2}</span>
                </p>
              )}
            </div>
          </div>

          {patient.PatientAddressDefaultWarning && (
            <div className="bg-amber-50 border border-amber-200 rounded-2xl p-3 flex items-start gap-2 text-xs font-bold text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>{patient.PatientAddressDefaultWarning}</span>
            </div>
          )}

          {latestDiagnosis && (
            <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-rose-600 font-mono tracking-wider flex items-center gap-1 mb-2">
                🩺 Chẩn đoán gần nhất
              </span>
              <div className="text-xs font-semibold leading-relaxed">
                <span className="text-red-700 bg-red-50 border border-red-200 font-bold px-1.5 py-0.5 rounded text-[11px] font-mono mr-2">
                  {latestDiagnosis.code || '—'}
                </span>
                <span className="text-slate-400 mr-2">-</span>
                <span className="text-slate-800 italic font-medium">{latestDiagnosis.detail || 'Không có mô tả chi tiết'}</span>
              </div>
            </div>
          )}

          {latestPendingPrep && (
            <div className="space-y-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 shadow-sm">
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5 border-b border-indigo-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
                Trạng thái chuẩn bị dự kiến gần nhất
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold">
                <div>
                  <span className="text-slate-500 font-medium">✅ Kiểm dụng cụ:</span>{' '}
                  <span className={`font-bold leading-none ${latestPendingPrep.CheckDevice === 'Đủ' ? 'text-green-600' : 'text-amber-600'}`}>
                    {latestPendingPrep.CheckDevice || 'Chưa kiểm'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">📞 Tình trạng gọi:</span>{' '}
                  <span className="font-bold text-indigo-900">{latestPendingPrep.CallStatus || 'Chưa cập nhật'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">📅 Ngày TT dự kiến:</span>{' '}
                  <span className="font-extrabold text-indigo-950 font-mono">
                    {hasPlannedCathLabDate(latestPendingPrep)
                      ? formatVNTime(latestPendingPrep.PlannedCathLabDate)
                      : 'Chưa xếp'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">👨‍⚕️ PTV:</span>{' '}
                  <span className="font-semibold text-slate-700">
                    {joinPeople([
                      latestPendingPrep.Scheduled1stInterventionist,
                      latestPendingPrep.Scheduled2ndInterventionist,
                      latestPendingPrep.Scheduled3rdInterventionist
                    ]) || 'Chưa xếp'}
                  </span>
                </div>
              </div>
            </div>
          )}

          {patientConsults.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <ClipboardCheck className="w-4.5 h-4.5 text-[#d2145a]" />
                  Lịch sử hội chẩn ({patientConsults.length})
                </h4>
              </div>

              <div className="space-y-3">
                {patientConsults.map((c) => (
                  <div key={c.ConsultKey} className="bg-white border text-xs border-slate-200 hover:border-pink-300 rounded-2xl p-4 shadow-sm hover:shadow transition space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-extrabold text-slate-900 uppercase">Ngày staff: {formatVNTime(c.ConsultDate)}</p>
                      <p className="text-[10px] text-slate-500 font-bold text-right">Staff bởi: {c.RequestBy || '—'}</p>
                    </div>
                    <p className="font-semibold text-slate-700 leading-relaxed">
                      <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 border border-red-200 rounded text-[11px] font-mono">{c.DiagnosisID || '—'}</span>
                      {' - '}{c.DetailDiagnosis || '—'}
                    </p>
                    <p className="font-semibold text-slate-700 leading-relaxed">
                      <span className="font-extrabold text-[#d2145a] bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded">{c.ConsultResultID || '—'}</span>
                      {' - '}{c.DetailConsultResult || '—'}
                    </p>
                    {c.FilePDFBBHC && (
                      <div className="pt-2 border-t border-slate-100 flex justify-end">
                        <button
                          onClick={() => onSelectPDF(c, patient)}
                          className="bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-extrabold px-3 py-1.5 rounded-lg text-[10px] transition flex items-center gap-1 shadow-sm cursor-pointer"
                        >
                          <FileText className="w-3.5 h-3.5" /> Xem Biên Bản A4
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {patientCathlabs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Activity className="w-4.5 h-4.5 text-[#d2145a]" />
                  Lịch sử thông tim ({patientCathlabs.length})
                </h4>
              </div>
              <div className="space-y-3">
                {patientCathlabs.map((cath) => {
                  const ptv = joinPeople([
                    (cath as any).Scheduled1stInterventionist || cath._1stInterventionist,
                    (cath as any).Scheduled2ndInterventionist || cath._2ndInterventionist,
                    (cath as any).Scheduled3rdInterventionist || cath._3rdInterventionist
                  ]);
                  return (
                    <div key={cath.CathKey} className="bg-white border text-xs border-slate-200 hover:border-indigo-300 rounded-2xl p-4 shadow-sm hover:shadow transition space-y-2">
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-extrabold text-slate-900 uppercase">Ngày TT: {formatVNTime(cath.CathDate)}</p>
                        <p className="text-[10px] text-slate-500 font-bold text-right">PTV: {ptv || '—'}</p>
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-semibold text-slate-700">
                        <p><span className="text-slate-400 font-bold">KQ:</span> {cath.CathResultID || '—'}</p>
                        <p><span className="text-slate-400 font-bold">KH:</span> {cath.CathPlan || '—'}</p>
                      </div>
                      {(cath.PostDiagnosisID || cath.PostDiagnosis) && (
                        <p className="font-semibold text-slate-700 leading-relaxed">
                          <span className="font-bold text-red-600 bg-red-50 px-1.5 py-0.5 border border-red-200 rounded text-[11px] font-mono">
                            {cath.PostDiagnosisID || '—'}
                          </span>
                          {' - '}{cath.PostDiagnosis || '—'}
                        </p>
                      )}
                      {cath.CathNote && <p className="font-semibold text-slate-700 leading-relaxed"><span className="text-slate-400 font-bold">Ghi chú:</span> {cath.CathNote}</p>}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {patientCmrs.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="w-4.5 h-4.5 text-[#d2145a]" />
                  Lịch sử chụp MRI ({patientCmrs.length})
                </h4>
              </div>
              <div className="space-y-3">
                {patientCmrs.map((cmr) => (
                  <div key={cmr.CMRKey || cmr.CMRkey} className="bg-white border text-xs border-slate-200 hover:border-emerald-300 rounded-2xl p-4 shadow-sm hover:shadow transition space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-extrabold text-slate-900 uppercase">Ngày chụp: {formatVNTime(cmr.CMRDate) || '—'}</p>
                      <p className="text-[10px] text-slate-500 font-bold text-right">{cmr.CMRCallStatus || '—'}</p>
                    </div>
                    {cmr.CMRRequest && <p className="font-semibold text-slate-700 leading-relaxed">{cmr.CMRRequest}</p>}
                    {cmr.CMRResult && <p className="font-semibold text-slate-700 leading-relaxed">{cmr.CMRResult}</p>}
                  </div>
                ))}
              </div>
            </div>
          )}

          {patientOperations.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between border-b border-slate-200 pb-2">
                <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                  <Scissors className="w-4.5 h-4.5 text-[#d2145a]" />
                  Lịch sử phẫu thuật ({patientOperations.length})
                </h4>
              </div>
              <div className="space-y-3">
                {patientOperations.map((op) => (
                  <div key={op.SurgKey || `${op.PatientKey}_${op.SurgDate}`} className="bg-white border text-xs border-slate-200 hover:border-rose-300 rounded-2xl p-4 shadow-sm hover:shadow transition space-y-2">
                    <div className="flex items-center justify-between gap-3">
                      <p className="font-extrabold text-slate-900 uppercase">Ngày PT: {formatVNTime(op.SurgDate) || '—'}</p>
                      <p className="text-[10px] text-slate-500 font-bold text-right">PTV: {joinSurgeons(op) || '—'}</p>
                    </div>
                    {op.PostDiagnosis && (
                      <p className="font-semibold text-slate-700 leading-relaxed">
                        <span className="text-slate-400 font-bold">Chẩn đoán:</span> {op.PostDiagnosis}
                      </p>
                    )}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 font-semibold text-slate-700">
                      <p><span className="text-slate-400 font-bold">PP PT:</span> {op.SurgMethod || '—'}</p>
                      {op.SurgNote && <p><span className="text-slate-400 font-bold">Ghi chú:</span> {op.SurgNote}</p>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
