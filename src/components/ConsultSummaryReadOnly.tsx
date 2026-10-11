import React from 'react';
import { Consult, formatVNTime, normalizePriorityOrder } from '../types';

const formatSummaryWeight = (value?: string) => {
  const v = String(value || '').trim();
  if (!v) return '—';
  return v.toLowerCase().includes('kg') ? v : `${v} kg`;
};

const formatSummaryHeight = (value?: string) => {
  const v = String(value || '').trim();
  if (!v) return '—';
  return v.toLowerCase().includes('cm') ? v : `${v} cm`;
};

const normalizeConsultMembers = (value: Consult['ConsultMember']): string => {
  if (!value) return '';
  if (Array.isArray(value)) return value.join(', ');
  return String(value).trim();
};

export interface ConsultSummaryReadOnlyProps {
  consult: Consult;
  compact?: boolean;
  sectionsOnly?: boolean;
  /** Bố cục dày cho khung xuất PNG dọc 9:16. */
  capture169?: boolean;
}

export function ConsultSummaryReadOnly({ consult, compact = false, sectionsOnly = false, capture169 = false }: ConsultSummaryReadOnlyProps) {
  const isDense = compact || capture169;
  const checkDevice = consult.CheckDevice || '';
  const plannedDevice = consult.PlannedDevice || '';
  const plannedPrice = consult.PlannedPrice || '';
  const supplyDepFeedback = consult.SupplyDepFeedback || '';
  const operationFeedback = consult.OperationFeedback || '';
  const plannedCathLabDate = consult.PlannedCathLabDate || '';
  const callStatus = consult.CallStatus || '';
  const callNote = consult.CallNote || '';
  const priorityOrder = normalizePriorityOrder(consult.PriorityOrder);
  const detailConsultResult = consult.DetailConsultResult || consult.ConsultResultID || '—';
  const ptvDisplay = [
    consult.Scheduled1stInterventionist,
    consult.Scheduled2ndInterventionist,
    consult.Scheduled3rdInterventionist
  ]
    .map(v => String(v || '').trim())
    .filter(Boolean)
    .join(' - ') || 'Chưa gán';

  const boxPad = capture169 ? 'p-2.5' : compact ? 'p-2' : 'p-3';
  const labelSize = capture169 ? 'text-[11px]' : compact ? 'text-[7.5px]' : 'text-[9px]';
  const valueSize = capture169 ? 'text-[15px]' : compact ? 'text-[10px]' : 'text-[12.5px]';
  const sectionTitle = capture169 ? 'text-[14px]' : 'text-[10px]';
  const bodyText = capture169 ? 'text-[15px]' : isDense ? 'text-[10px]' : 'text-[11.5px]';
  const badgeText = capture169 ? 'text-[12px]' : compact ? 'text-[9px]' : 'text-[10px]';
  const rowText = capture169 ? 'text-[14px]' : compact ? 'text-[9px]' : 'text-[12px]';

  const sections = (
    <>
      <div className={`bg-white border border-slate-700 rounded-xl space-y-2 ${boxPad}`}>
        <span className={`${sectionTitle} font-black uppercase text-indigo-900 tracking-wider block border-b border-slate-200 pb-1`}>
          THÔNG TIN ĐĂNG KÝ HỘI CHẨN
        </span>
        {(() => {
          const InlineField = ({
            label,
            value,
            mono,
          }: {
            label: string;
            value: React.ReactNode;
            mono?: boolean;
          }) => (
            <span className="inline-flex items-baseline gap-x-1 min-w-0 flex-wrap leading-tight">
              <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0 whitespace-nowrap`}>
                {label}:
              </span>
              <span className={`${mono ? 'font-mono font-bold' : 'font-extrabold'} text-slate-800 ${valueSize} break-words`}>
                {value}
              </span>
            </span>
          );
          return (
            <div className={`space-y-1 ${rowText}`}>
              <div className={`grid grid-cols-2 ${capture169 ? 'gap-x-3 gap-y-1' : compact ? 'gap-x-2 gap-y-0.5' : 'gap-x-4 gap-y-1'}`}>
                <InlineField label="Ngày staff" value={formatVNTime(consult.ConsultDate)} mono />
                <InlineField label="BS đăng ký" value={consult.RequestBy || '—'} />
              </div>
              <div className={`grid grid-cols-2 ${capture169 ? 'gap-x-3 gap-y-1' : compact ? 'gap-x-2 gap-y-0.5' : 'gap-x-4 gap-y-1'}`}>
                <InlineField label="Cân nặng" value={formatSummaryWeight(consult.PatientWeight)} mono />
                <InlineField label="Chiều cao" value={formatSummaryHeight(consult.PatientHeight)} mono />
              </div>
            </div>
          );
        })()}

        <div className={`grid grid-cols-1 ${capture169 ? '' : 'md:grid-cols-2'} gap-3 pt-1.5 border-t border-slate-100 ${compact || capture169 ? 'gap-2' : ''}`}>
          <div>
            <span className={`text-slate-400 block font-bold ${labelSize} uppercase tracking-wider mb-1`}>Chẩn đoán chi tiết:</span>
            <div className={`border border-slate-200 rounded-xl px-2.5 py-2 bg-slate-50 font-bold text-slate-800 leading-snug ${bodyText} min-h-0`}>
              {consult.DetailDiagnosis || consult.DiagnosisID || '—'}
            </div>
          </div>
          <div>
            <span className={`text-slate-400 block font-bold ${labelSize} uppercase tracking-wider mb-1`}>Kết quả staff chi tiết:</span>
            <div className={`border border-slate-200 rounded-xl px-2.5 py-2 bg-indigo-50/30 text-indigo-950 font-bold leading-snug ${bodyText} min-h-0`}>
              {detailConsultResult}
            </div>
          </div>
        </div>

        {normalizeConsultMembers(consult.ConsultMember) && (
          <p className={`text-slate-600 font-semibold ${bodyText}`}>
            <span className={`text-slate-400 font-bold uppercase ${capture169 ? 'text-[11px]' : 'text-[9px]'}`}>Thành viên duyệt HC: </span>
            {normalizeConsultMembers(consult.ConsultMember)}
          </p>
        )}
      </div>

      <div className={`grid grid-cols-1 ${capture169 ? 'gap-1.5' : `sm:grid-cols-2 ${compact ? 'gap-2' : 'gap-3'}`}`}>
        <div className={`bg-white border border-slate-700 rounded-xl space-y-2 ${boxPad}`}>
          <span className={`${sectionTitle} font-black uppercase text-rose-600 tracking-wider block border-b border-slate-200 pb-1`}>
            CHUẨN BỊ DỤNG CỤ VẬT TƯ
          </span>
          <div className="space-y-1.5">
            <div className={`flex justify-between items-center gap-2 bg-slate-50 p-1.5 px-2 rounded-lg border border-slate-100 ${capture169 ? 'text-[14px]' : compact ? '' : 'text-[12.5px]'}`}>
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Kiểm dụng cụ:</span>
                <span className={`px-1.5 py-0.5 rounded-md font-black uppercase leading-tight ${badgeText} ${
                  checkDevice === 'Đủ'
                    ? 'bg-emerald-100 text-emerald-850 border border-emerald-200'
                    : checkDevice === 'Thiếu'
                      ? 'bg-rose-100 text-rose-850 border border-rose-200'
                      : 'bg-slate-100 text-slate-600 border border-slate-200'
                }`}>
                  {checkDevice || 'Chưa kiểm'}
                </span>
              </div>
              <div className="flex items-center gap-1 min-w-0 flex-1 justify-end text-right">
                <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Số tiền dự kiến:</span>
                <span className={`font-black text-rose-650 font-mono ${valueSize}`}>{plannedPrice ? `${plannedPrice} VNĐ` : '—'}</span>
              </div>
            </div>
            <div className="flex justify-between items-start gap-2 border-b border-slate-200 pb-1.5 pt-0.5 px-1">
              <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Dụng cụ dự kiến:</span>
              <span className={`font-extrabold text-slate-800 text-right break-words max-w-[70%] ${valueSize}`}>{plannedDevice || '—'}</span>
            </div>
            {(supplyDepFeedback || operationFeedback) && (
              <div className={`bg-amber-50/20 border border-amber-200 p-2 rounded-lg text-amber-900 font-semibold leading-normal whitespace-pre-wrap break-words ${bodyText}`}>
                <span className={`block font-black uppercase tracking-wider text-amber-800 ${capture169 ? 'text-[11px]' : 'text-[8px]'}`}>Liên khoa phản hồi:</span>
                {[supplyDepFeedback, operationFeedback].filter(Boolean).join(' | ')}
              </div>
            )}
          </div>
        </div>

        <div className={`bg-white border border-slate-700 rounded-xl space-y-2 ${boxPad}`}>
          <span className={`${sectionTitle} font-black uppercase text-emerald-600 tracking-wider block border-b border-slate-200 pb-1`}>
            KẾT QUẢ XẾP LỊCH CAN THIỆP
          </span>
          <div className="space-y-1.5">
            <div className={`flex justify-between items-center gap-2 bg-slate-50 p-1.5 px-2 rounded-lg border border-slate-100 ${capture169 ? 'text-[14px]' : compact ? '' : 'text-[12.5px]'}`}>
              <div className="flex items-center gap-1 min-w-0 flex-1">
                <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Lịch TT dự kiến:</span>
                <span className={`px-1.5 py-0.5 rounded-md font-black border uppercase leading-tight ${badgeText} ${
                  plannedCathLabDate
                    ? 'bg-emerald-100 border-emerald-300 text-emerald-850'
                    : 'bg-rose-100 border-rose-300 text-rose-850'
                }`}>
                  {plannedCathLabDate ? formatVNTime(plannedCathLabDate) : 'Chưa xếp'}
                </span>
              </div>
              <div className="flex items-center gap-1 min-w-0 flex-1 justify-end text-right">
                <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Trạng thái gọi:</span>
                <span className={`font-bold text-slate-800 ${valueSize}`}>{callStatus || '—'}</span>
              </div>
            </div>
            <div className="flex justify-between items-start gap-2 border-b border-slate-200 pb-1.5 pt-0.5 px-1">
              <span className={`text-[#d2145a] font-black tracking-wider uppercase shrink-0 ${capture169 ? 'text-[12px]' : 'text-[9px]'}`}>PTV:</span>
              <span className={`font-extrabold text-slate-850 uppercase text-right break-words max-w-[75%] ${valueSize}`}>
                {ptvDisplay}
              </span>
            </div>
            <div className="flex justify-between items-start gap-2 pt-0.5 px-1">
              <span className={`text-slate-400 font-bold ${labelSize} uppercase tracking-wider shrink-0`}>Lưu ý / Ưu tiên:</span>
              <span className={`font-bold text-slate-800 text-right break-words max-w-[70%] ${bodyText}`}>
                {callNote ? `${priorityOrder} (${callNote})` : priorityOrder}
              </span>
            </div>
          </div>
        </div>
      </div>
    </>
  );

  if (sectionsOnly) {
    return (
      <div className={capture169 ? 'space-y-2 text-[14px]' : compact ? 'space-y-2 text-[10.5px]' : 'space-y-3 text-xs'}>
        {sections}
      </div>
    );
  }

  return (
    <div className={`bg-white border-2 border-slate-800 rounded-2xl text-slate-700 shadow-xs max-w-full ${compact ? 'p-2.5 space-y-2 text-[10.5px]' : 'p-4 space-y-3 text-xs'}`}>
      {sections}
    </div>
  );
}
