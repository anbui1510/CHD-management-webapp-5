import React from 'react';
import { Patient, Consult, formatVNTime } from '../types';
import { 
  X, 
  MapPin, 
  Calendar, 
  Phone, 
  CheckCircle, 
  UserSquare2, 
  ShieldCheck, 
  ClipboardCheck, 
  Cpu, 
  Info, 
  FileText,
  AlertTriangle
} from 'lucide-react';

interface PatientDetailsDrawerProps {
  patient: Patient;
  consults: Consult[];
  onClose: () => void;
  onEditPatientAdmin: (patient: Patient) => void;
  onSelectPDF: (consult: Consult, patient: Patient) => void;
  onRegisterNewConsult: (patient: Patient) => void;
}

export default function PatientDetailsDrawer({
  patient,
  consults,
  onClose,
  onEditPatientAdmin,
  onSelectPDF,
  onRegisterNewConsult
}: PatientDetailsDrawerProps) {

  // Calculate age helper
  const getAgeString = (dobString: string) => {
    if (!dobString) return '';
    try {
      const birth = new Date(dobString);
      const today = new Date();
      let age = today.getFullYear() - birth.getFullYear();
      const monthDiff = today.getMonth() - birth.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
        age--;
      }
      return age > 0 ? `${age} tuổi` : 'Dưới 1 tuổi';
    } catch (e) {
      return '';
    }
  };

  // Get historical consults
  const patientConsults = consults
    .filter(c => c.PatientKey === patient.PatientKey)
    .sort((a, b) => new Date(b.ConsultDate).getTime() - new Date(a.ConsultDate).getTime());

  // Detect latest consultation
  const lastConsult = patientConsults[0];

  return (
    <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-40 flex items-center justify-center p-4 animate-in fade-in duration-200">
      
      {/* Click outside backdrop to close */}
      <div className="absolute inset-0" onClick={onClose}></div>

      {/* Centered Modal Content Card Box */}
      <div className="relative bg-white w-full max-w-2xl max-h-[90vh] rounded-3xl shadow-2xl flex flex-col z-50 animate-in zoom-in-95 duration-250 overflow-hidden">
        
        {/* Drawer header */}
        <div className="bg-[#d2145a] text-white px-6 py-4 flex items-center justify-between shadow-sm shrink-0 rounded-t-3xl">
          <div className="flex items-center gap-2">
            <UserSquare2 className="w-5 h-5" />
            <h3 className="font-extrabold text-sm tracking-wide uppercase">
              Hồ sơ chi tiết bệnh nhi
            </h3>
          </div>
          <button 
            onClick={onClose}
            className="text-white hover:bg-white/10 p-1.5 rounded-full transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body with custom single-panel scroll */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          
          {/* Top section: Avatar, Name, and compact Edit Button */}
          <div className="flex items-center justify-between gap-4 p-4 bg-slate-50 border border-slate-150 rounded-2xl shadow-sm">
            <div className="flex items-center gap-3">
              <div className="w-14 h-14 rounded-full bg-pink-101 bg-pink-100 border-2 border-pink-200 text-[#d2145a] flex items-center justify-center font-bold text-xl uppercase shadow-inner shrink-0">
                {patient.PatientSex === 'Nam' ? '👦' : '👧'}
              </div>
              <div>
                <span className="text-[10px] uppercase font-mono tracking-wider font-extrabold text-[#d2145a] bg-pink-50 border border-pink-200 rounded px-1.5 py-0.5">
                  Mã người bệnh: {patient.PatientID1} {patient.PatientID2 ? `| Mã người bệnh khác: ${patient.PatientID2}` : ''}
                </span>
                <h2 className="text-lg font-black text-slate-800 leading-none uppercase pt-2">
                  {patient.PatientName}
                </h2>
                {patient.OtherPatientName && patient.OtherPatientName !== patient.PatientName && (
                  <p className="text-xs font-semibold text-slate-500 mt-1">Tên lúc khai sinh: {patient.OtherPatientName}</p>
                )}
              </div>
            </div>
            
            {/* Small beautiful Sửa hành chính button */}
            <button
              onClick={() => onEditPatientAdmin(patient)}
              className="bg-white hover:bg-[#d2145a] hover:text-white border border-slate-300 hover:border-[#d2145a] text-[#d2145a] font-bold text-xs py-1.5 px-3 rounded-lg shadow-sm transition flex items-center gap-1 shrink-0 cursor-pointer"
            >
              ✏️ Sửa hành chính
            </button>
          </div>

          {/* Detailed Info Grid */}
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
                <span className="font-bold text-slate-800">{formatVNTime(patient.PatientDOB)} ({getAgeString(patient.PatientDOB)})</span>
              </p>
              <p className="flex items-center gap-1.5">
                <MapPin className="w-4 h-4 text-slate-400" />
                <span className="text-slate-400 font-medium">Địa chỉ:</span>
                <span className="font-extrabold text-slate-800">{patient.PatientAdress || (patient as any).PatientAdress || ''}</span>
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
              <p className="flex items-center gap-1.5">
                <span className="text-slate-400 font-medium">🏁 Outcome cuối:</span>
                <span className={`font-bold px-1.5 py-0.5 rounded text-[10px] uppercase border ${
                  patient.Outcome ? 'bg-emerald-50 text-emerald-800 border-emerald-200' : 'bg-slate-100 text-slate-500 border-slate-200'
                }`}>
                  {patient.Outcome || 'Chưa cập nhật'}
                </span>
              </p>
            </div>
          </div>

          {/* Separated "Chẩn đoán gần nhất" Box (Requirement B.6) */}
          {lastConsult && (
            <div className="bg-rose-50/50 border border-rose-100 rounded-2xl p-4 shadow-sm">
              <span className="text-[10px] font-black uppercase text-rose-600 font-mono tracking-wider flex items-center gap-1 mb-2">
                🩺 Chẩn đoán gần nhất
              </span>
              <div className="text-xs font-semibold leading-relaxed">
                <span className="text-red-700 bg-red-50 border border-red-200 font-bold px-1.5 py-0.5 rounded text-[11px] font-mono mr-2">
                  {lastConsult.DiagnosisID}
                </span>
                <span className="text-slate-800 italic font-medium">{lastConsult.DetailDiagnosis || 'Không có mô tả chi tiết'}</span>
              </div>
            </div>
          )}

          {/* Preoperative Logistics checklist status (Trạng thái chuẩn bị gần nhất) */}
          {lastConsult && (
            <div className="space-y-3 bg-indigo-50/50 border border-indigo-100 rounded-2xl p-4 shadow-sm">
              <h4 className="text-xs font-black text-indigo-950 uppercase tracking-wider flex items-center gap-1.5 border-b border-indigo-100 pb-2">
                <ShieldCheck className="w-4 h-4 text-indigo-700" />
                Trạng thái chuẩn bị dự kiến gần nhất
              </h4>
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-xs font-semibold">
                <div>
                  <span className="text-slate-500 font-medium">✅ Kiểm dụng cụ:</span>{' '}
                  <span className={`font-bold leading-none ${lastConsult.CheckDevice === 'Đủ' ? 'text-green-600' : 'text-amber-600'}`}>
                    {lastConsult.CheckDevice === 'Đủ' ? '✓ Đủ dụng cụ' : '⚠ Chưa đủ/Thiếu'}
                  </span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">📞 Tình trạng gọi:</span>{' '}
                  <span className="font-bold text-indigo-900">{lastConsult.CallStatus || 'Đồng ý nhập viện'}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">📅 Ngày TT dự kiến:</span>{' '}
                  <span className="font-extrabold text-indigo-950 font-mono">{formatVNTime(lastConsult.ConsultDate)}</span>
                </div>
                <div>
                  <span className="text-slate-500 font-medium">👨‍⚕️ PTV chính:</span>{' '}
                  <span className="font-semibold text-slate-700">{lastConsult.Scheduled1stInterventionist || 'BS. Phụng'}</span>
                </div>
                {lastConsult.Scheduled2ndInterventionist && (
                  <div>
                    <span className="text-slate-500 font-medium">👨‍⚕️ PTV phụ 1:</span>{' '}
                    <span className="font-semibold text-slate-700">{lastConsult.Scheduled2ndInterventionist}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Historical Consultation Grid records */}
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b border-slate-200 pb-2">
              <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <ClipboardCheck className="w-4.5 h-4.5 text-[#d2145a]" />
                Lịch sử hội chẩn ({patientConsults.length})
              </h4>
            </div>

            {patientConsults.length === 0 ? (
              <div className="bg-slate-50 border border-slate-200 italic text-slate-400 p-4 text-center rounded-2xl text-xs">
                Bệnh nhi chưa thực hiện lần hội chẩn (Staff) nào trên danh sách.
              </div>
            ) : (
              <div className="space-y-3">
                {patientConsults.map((c) => (
                  <div 
                    key={c.ConsultKey}
                    className="bg-white border text-xs border-slate-200 hover:border-pink-300 rounded-2xl p-4 shadow-sm flex flex-col justify-between hover:shadow transition"
                  >
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-2 mb-2">
                      <div>
                        <p className="font-extrabold text-slate-900 uppercase">
                          Ngày staff: {formatVNTime(c.ConsultDate)}
                        </p>
                        <p className="text-[10px] text-slate-500 font-bold">Bởi: {c.RequestBy} ({c.Department})</p>
                      </div>
                      <span className="self-start sm:self-auto bg-pink-50 text-[#d2145a] border border-pink-200 font-bold px-2 py-0.5 rounded text-[10px] uppercase font-mono tracking-wide">
                        {c.ConsultType}
                      </span>
                    </div>

                    <div className="space-y-2">
                      <div>
                        <span className="text-slate-400 font-medium">Chẩn đoán (ICD): </span>
                        <span className="font-bold text-red-600 bg-red-50 px-1 border border-red-200 rounded text-[11px] font-mono">{c.DiagnosisID}</span>
                        {c.DetailDiagnosis && (
                          <p className="text-slate-600 text-[11px] leading-relaxed italic mt-1 font-semibold bg-slate-50 p-1.5 rounded border border-slate-150">
                            {c.DetailDiagnosis}
                          </p>
                        )}
                      </div>

                      <div>
                        <span className="text-slate-400 font-medium">Kết quả quyết định:</span>{' '}
                        {c.ConsultResultID ? (
                          <span className="font-extrabold text-[#d2145a] bg-pink-50 border border-pink-200 px-1.5 py-0.5 rounded">
                            {c.ConsultResultID}
                          </span>
                        ) : (
                          <span className="text-amber-700 bg-amber-50 border border-amber-200 font-bold px-1.5 py-0.5 rounded">
                            Đang đợi chỉ định kết quả
                          </span>
                        )}
                        {c.DetailConsultResult && (
                          <p className="mt-1 font-semibold text-slate-700 text-[11px] bg-slate-50/60 p-2 border border-slate-100 rounded leading-relaxed">
                            {c.DetailConsultResult}
                          </p>
                        )}
                      </div>

                      {/* PDF / AppsScript Document triggering buttons */}
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
                  </div>
                ))}
              </div>
            )}
          </div>

        </div>

      </div>
    </div>
  );
}
