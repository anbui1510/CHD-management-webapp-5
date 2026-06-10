/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useRef } from 'react';
import { Consult, Patient, formatVNTime } from '../types';
import { Printer, Download, X, ClipboardCheck, Calendar, Activity, ShieldAlert } from 'lucide-react';

interface A4ReportProps {
  consult: Consult;
  patient: Patient;
  onClose: () => void;
}

export default function A4Report({ consult, patient, onClose }: A4ReportProps) {
  const reportRef = useRef<HTMLDivElement>(null);

  const calculateAge = (dobString: string) => {
    if (!dobString) return '—';
    const birthday = new Date(dobString);
    const today = new Date();
    let age = today.getFullYear() - birthday.getFullYear();
    const m = today.getMonth() - birthday.getMonth();
    if (m < 0 || (m === 0 && today.getDate() < birthday.getDate())) {
      age--;
    }
    return age > 0 ? `${age} tuổi` : 'Dưới 1 tuổi';
  };

  const handlePrint = () => {
    const printContent = reportRef.current?.innerHTML;
    const originalContent = document.body.innerHTML;
    if (printContent) {
      window.print();
    }
  };

  return (
    <div className="fixed inset-0 bg-gray-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-xl shadow-2xl max-w-4xl w-full overflow-hidden flex flex-col my-8 border border-gray-100 animate-in fade-in zoom-in-95 duration-150">
        
        {/* Modal Controller Bar */}
        <div className="bg-slate-900 text-white px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ClipboardCheck className="w-5 h-5 text-teal-400" />
            <div>
              <h3 className="font-semibold text-sm">Biên bản Hội chẩn (A4 Preview)</h3>
              <p className="text-xs text-slate-400 font-mono">File: BBHC_{consult.ConsultType === 'Staff mổ' ? 'MO' : 'THONG'}_{consult.ConsultDate.replace(/-/g, '')}_{patient.PatientName.replace(/\s+/g, '_')}.pdf</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrint}
              className="flex items-center gap-1 bg-slate-800 hover:bg-slate-700 text-white px-3 py-1.5 rounded-lg text-xs font-semibold border border-slate-700 transition"
            >
              <Printer className="w-4 h-4 text-teal-400" /> In Biên bản
            </button>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-white transition p-1.5 rounded-lg hover:bg-slate-800"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Scrollable Clinical Document Frame */}
        <div className="bg-slate-100 p-8 flex justify-center max-h-[75vh] overflow-y-auto border-b border-gray-200">
          
          {/* Printable A4 Container */}
          <div 
            ref={reportRef}
            className="bg-white w-[210mm] min-h-[297mm] p-12 text-gray-800 relative shadow-md select-text print:p-0 print:shadow-none print:w-full"
            style={{ fontFamily: '"Inter", sans-serif' }}
          >
            {/* Header / National Emblem spacing */}
            <div className="flex justify-between items-start border-b border-gray-300 pb-6 mb-8">
              <div>
                <p className="text-[11px] font-bold tracking-wider text-teal-700 uppercase">CHD Management System 3.0</p>
                <p className="text-xs font-medium text-gray-500">Bệnh viện Tim Mạch &amp; Khoa Nhi CHD</p>
                <p className="text-[10px] text-gray-400 font-mono">Độc lập - Tự do - Hạnh phúc</p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-gray-500 font-mono">Mã BBHC: <span className="font-bold text-gray-900">{consult.ConsultKey}</span></p>
                <p className="text-[10px] text-gray-400 font-mono">Ngày in: {new Date().toLocaleDateString('vi-VN')}</p>
              </div>
            </div>

            {/* Document Title */}
            <div className="text-center mb-8">
              <h1 className="text-xl font-bold font-serif uppercase tracking-tight text-gray-900">Biên bản Hội chẩn Bệnh nhi CHD</h1>
              <p className="text-xs text-gray-500 italic mt-1">(Ban hành theo hệ thống quản lý CHD và AppSheet CHD 3.0)</p>
              <div className="inline-block mt-3 px-3 py-1 bg-slate-100 rounded-full text-xs font-semibold uppercase text-slate-800">
                Kiểu Staff: {consult.ConsultType}
              </div>
            </div>

            {/* Block 1: Patient Information */}
            <div className="mb-6">
              <h2 className="text-xs font-bold text-gray-900 uppercase border-b border-gray-200 pb-1 mb-3 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-teal-600 rounded-sm"></span> I. Thông tin Hành chính Bệnh nhân
              </h2>
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <span className="text-gray-500 font-medium">Họ và tên bệnh nhi:</span>{' '}
                  <span className="font-bold text-gray-900 text-sm uppercase">{patient.PatientName}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Họ tên khai sinh:</span>{' '}
                  <span className="font-medium text-gray-800">{patient.OtherPatientName || patient.PatientName}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium font-sans">Ngày sinh:</span>{' '}
                  <span className="font-medium text-gray-800">
                    {formatVNTime(patient.PatientDOB)} ({calculateAge(patient.PatientDOB)})
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Giới tính:</span>{' '}
                  <span className="font-medium text-gray-800">{patient.PatientSex}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Địa chỉ cư trú:</span>{' '}
                  <span className="font-medium text-gray-800">{patient.PatientAddress || (patient as any).PatientAddress || 'Thành phố lớn'}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium font-sans">Mã HS bệnh nhi (ID1/ID2):</span>{' '}
                  <span className="font-semibold text-blue-600">{patient.PatientID1}</span> / <span className="text-gray-500 font-mono">{patient.PatientID2 || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Cân nặng khi hội chẩn:</span>{' '}
                  <span className="font-semibold text-gray-900">{consult.PatientWeight || '—'}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Số điện thoại liên lạc:</span>{' '}
                  <span className="font-medium text-gray-800">{patient.PatientPhone1} {patient.PatientPhone2 ? `| ${patient.PatientPhone2}` : ''}</span>
                </div>
              </div>
            </div>

            {/* Block 2: Request Details */}
            <div className="mb-6">
              <h2 className="text-xs font-bold text-gray-900 uppercase border-b border-gray-200 pb-1 mb-3 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-teal-600 rounded-sm"></span> II. Nội dung Yêu cầu Hội chẩn
              </h2>
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div>
                  <span className="text-gray-500 font-medium">Ngày đăng ký hội chẩn:</span>{' '}
                  <span className="font-medium text-gray-800">
                    {new Date(consult.ConsultDate).toLocaleDateString('vi-VN')}
                  </span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium">Khoa điều trị đề nghị:</span>{' '}
                  <span className="font-medium text-gray-800">{consult.Department}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium font-sans">Mã bệnh án chẩn đoán (ICD):</span>{' '}
                  <span className="font-bold text-red-600 bg-red-50 border border-red-200 px-1.5 py-0.5 rounded">{consult.DiagnosisID}</span>
                </div>
                <div>
                  <span className="text-gray-500 font-medium text-xs">Người đăng ký hội chẩn:</span>{' '}
                  <span className="font-medium text-gray-800">{consult.RequestBy}</span>
                </div>
                <div className="col-span-2 mt-1">
                  <span className="text-gray-500 font-medium block">Mô tả chẩn đoán lâm sàng / cận lâm sàng chi tiết:</span>
                  <p className="mt-1 p-2 bg-gray-50 rounded text-gray-700 italic border border-gray-200 text-xs leading-relaxed whitespace-pre-wrap">
                    {consult.DetailDiagnosis || 'Chưa cung cấp chẩn đoán chi tiết.'}
                  </p>
                </div>
              </div>
            </div>

            {/* Block 3: Decision & Medical Resolution State */}
            <div className="mb-6">
              <h2 className="text-xs font-bold text-gray-900 uppercase border-b border-gray-200 pb-1 mb-3 tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-3 bg-indigo-600 rounded-sm"></span> III. Kết quả Hội chẩn &amp; Chỉ định lâm sàng
              </h2>
              
              {consult.ConsultResultID ? (
                <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 text-xs space-y-3">
                  <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                    <div>
                      <span className="text-gray-500 font-medium">Mã kết quả quyết định:</span>{' '}
                      <span className="font-bold text-indigo-700">{consult.ConsultResultID}</span>
                    </div>
                    <div>
                      <span className="text-gray-500 font-medium">Phân nhóm ưu tiên:</span>{' '}
                      <span className="font-semibold text-red-700">{consult.PriorityOrder || 'Chương trình'}</span>
                    </div>
                  </div>
                  <div>
                    <span className="text-gray-500 font-medium block">Chi tiết chỉ định hội chẩn &amp; quy trình:</span>
                    <p className="mt-1 text-gray-800 font-medium whitespace-pre-wrap leading-relaxed">
                      {consult.DetailConsultResult || '—'}
                    </p>
                  </div>
                  {(consult.PlannedDevice || consult.PlannedPrice) && (
                    <div className="border-t border-slate-200 pt-2 grid grid-cols-2 gap-4">
                      <div>
                        <span className="text-gray-500 font-medium block">Dự trù thiết bị dụng cụ y khoa:</span>
                        <span className="font-medium text-slate-800">{consult.PlannedDevice || 'Không yêu cầu'}</span>
                      </div>
                      <div>
                        <span className="text-gray-500 font-medium block font-sans">Dự toán chi phí dự trù:</span>
                        <span className="font-bold font-mono text-emerald-700">{consult.PlannedPrice || 'Miễn phí'}</span>
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div className="bg-amber-50 border border-amber-300 rounded-lg p-4 text-center text-xs">
                  <ShieldAlert className="w-6 h-6 text-amber-600 mx-auto mb-1" />
                  <p className="font-bold text-amber-800">CA ĐANG CHỜ KẾT QUẢ KHÁM (STAFF PENDING)</p>
                  <p className="text-amber-700 mt-1">Biên bản này được lập tạm thời khi quá trình hội chẩn chưa kết thúc.</p>
                </div>
              )}
            </div>

            {/* Block 4: Risks and Logistics Check */}
            <div className="mb-8 grid grid-cols-2 gap-6 text-xs">
              <div>
                <dt className="text-gray-500 font-bold border-b border-gray-100 pb-0.5 mb-1.5 uppercase tracking-wider text-[10px]">Phân loại Nguy cơ (RiskFactor)</dt>
                <dd className="font-medium text-gray-800 font-sans italic">
                  {consult.RiskFactor || 'Không xác định'}
                </dd>
              </div>
              <div>
                <dt className="text-gray-500 font-bold border-b border-gray-100 pb-0.5 mb-1.5 uppercase tracking-wider text-[10px]">Kiểm tra thiết bị (CheckDevice)</dt>
                <dd className="font-medium text-gray-800 flex items-center gap-1.5">
                  <span className={`w-3.5 h-3.5 rounded-full flex items-center justify-center text-[9px] text-white ${
                    consult.CheckDevice === 'Đủ' ? 'bg-green-600' : 'bg-rose-600'
                  }`}>✓</span>
                  Thiết bị: <span className="font-bold">{consult.CheckDevice || 'Chưa kiểm'}</span>
                </dd>
              </div>
            </div>

            {/* Signatures block */}
            <div className="mt-12 flex justify-between text-xs border-t border-gray-200 pt-6">
              <div className="text-center w-48">
                <p className="text-gray-500 font-mono text-[10px] uppercase">Thư ký Lập biên bản</p>
                <div className="h-14 flex items-end justify-center">
                  <span className="italic font-mono text-emerald-800 text-[10px]">AppSheet Cloud Synced</span>
                </div>
                <p className="font-bold text-gray-900 mt-1 border-t border-gray-100 pt-1 text-[11px]">{consult.RequestBy}</p>
                <p className="text-[9px] text-gray-400 font-mono">ID: {consult.ConsultCreateBy}</p>
              </div>
              <div className="text-center w-48">
                <p className="text-gray-500 font-mono text-[10px] uppercase">Chủ tọa Hội đồng</p>
                <div className="h-14 flex items-end justify-center">
                  {consult.ConsultResultID ? (
                    <span className="italic font-serif text-slate-800 font-bold border border-slate-300 py-0.5 px-2 rounded transform rotate-1">
                      Đã Phê Duyệt ✔
                    </span>
                  ) : (
                    <span className="text-rose-500 font-bold italic">Chưa duyệt</span>
                  )}
                </div>
                <p className="font-bold text-gray-900 mt-1 border-t border-gray-100 pt-1 text-[11px]">Ban Giám đốc Tim Mạch</p>
                <p className="text-[9px] text-gray-400 font-mono">Duyệt điện tử thành công</p>
              </div>
            </div>

          </div>
        </div>

        {/* Modal Info Footer */}
        <div className="bg-slate-50 px-6 py-4 flex items-center justify-between text-xs text-slate-500">
          <span>In tài liệu này để nộp lưu trữ hồ sơ bệnh nhi CHD.</span>
          <span className="font-mono text-slate-400">AppSheet ID: {consult.ConsultKey}</span>
        </div>

      </div>
    </div>
  );
}
