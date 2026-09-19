import React, { useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, X } from 'lucide-react';
import { Consult, Patient, formatVNTime, normalizePriorityOrder, removeDiacritics, restoreWeightFromDate } from '../types';
import { ConsultSummaryReadOnly } from './ConsultSummaryReadOnly';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useLockBodyScroll, usePreventBackgroundTouchScroll } from '../hooks/useLockBodyScroll';
import { formatPatientDobWithAge, getPatientAgeDescription } from '../utils/patientDisplay';
import { copyElementAsImage, CopyImageResultType } from '../utils/copySummaryImage';
import {
  formatPatientWithPtvPhu,
  resolvePtvPhu1Display
} from '../utils/consultSummaryDisplay';
import {
  buildSchedulingSummaryHeader,
  SCHEDULING_SUMMARY_UPDATE_SECTION_HEADER
} from '../utils/workflowMessages';

export const CONSULT_SUMMARY_SCREENSHOT_CARD_ID = 'consult-summary-screenshot-card';

const formatSummaryWeight = (value?: string) =>
  value ? restoreWeightFromDate(value) + (String(value).includes('kg') ? '' : ' kg') : '—';

const formatSummaryHeight = (value?: string) =>
  value ? restoreWeightFromDate(value) + (String(value).includes('cm') ? '' : ' cm') : '—';

const hasAdminField = (v?: string) => Boolean(v && String(v).trim() !== '' && v !== '-');

function PatientAdminPrintInfo({ patient }: { patient: Patient }) {
  const hasId2 = hasAdminField(patient.PatientID2);
  const hasPhone2 = hasAdminField(patient.PatientPhone2);
  const hasPhone1 = hasAdminField(patient.PatientPhone1);
  const hasOtherName = hasAdminField(patient.OtherPatientName);
  const isFullLayout = hasId2 && hasPhone2;
  const address = patient.PatientAddress || '—';

  const labelCls = 'text-slate-400 font-bold text-[9px] uppercase tracking-wider shrink-0';
  const valueCls = 'font-bold text-slate-800 text-[12.5px]';
  const monoCls = 'font-extrabold font-mono text-slate-800 text-[12.5px]';

  const Field = ({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) => (
    <span className="inline-flex items-baseline gap-x-1.5">
      <span className={labelCls}>{label}</span>
      <span className={mono ? monoCls : valueCls}>{value}</span>
    </span>
  );

  const Row = ({ children }: { children: React.ReactNode }) => (
    <div className="flex flex-wrap items-baseline gap-x-5 gap-y-0.5">{children}</div>
  );

  return (
    <div className="space-y-2.5 text-[12px]">
      {hasOtherName && (
        <Row>
          <Field label="Tên khác:" value={patient.OtherPatientName} />
        </Row>
      )}
      {isFullLayout ? (
        <>
          <Row>
            <Field label="Mã NB:" value={patient.PatientID1 || '—'} mono />
            <Field label="Mã NB khác:" value={patient.PatientID2} mono />
          </Row>
          <Row>
            <Field label="Ngày sinh:" value={formatPatientDobWithAge(patient.PatientDOB, undefined, formatVNTime)} />
            <Field label="Giới:" value={patient.PatientSex || '—'} />
          </Row>
          <Row>
            <Field label="Địa chỉ:" value={address} />
          </Row>
          <Row>
            <Field label="SĐ1:" value={patient.PatientPhone1} mono />
            <Field label="SĐ2:" value={patient.PatientPhone2} mono />
          </Row>
        </>
      ) : (
        <>
          <Row>
            <Field label="Mã NB:" value={patient.PatientID1 || '—'} mono />
            <Field label="Giới:" value={patient.PatientSex || '—'} />
          </Row>
          <Row>
            <Field label="Ngày sinh:" value={formatPatientDobWithAge(patient.PatientDOB, undefined, formatVNTime)} />
          </Row>
          <Row>
            <Field label="Địa chỉ:" value={address} />
          </Row>
          {(hasPhone1 || hasPhone2) && (
            <Row>
              {hasPhone1 && <Field label="SĐ1:" value={patient.PatientPhone1} mono />}
              {hasPhone2 && <Field label="SĐ2:" value={patient.PatientPhone2} mono />}
            </Row>
          )}
        </>
      )}
    </div>
  );
}

function buildTextSummary(patient: Patient, consult: Consult, ptvPhu1Display: string) {
  const summaryDetailConsultResult = (consult.DetailConsultResult || consult.ConsultResultID || '').trim() || '—';
  const weightDisplay = formatSummaryWeight(consult.PatientWeight);
  const heightDisplay = formatSummaryHeight(consult.PatientHeight);
  const ageDesc = getPatientAgeDescription(patient.PatientDOB) || '—';
  const addressDisplay = patient.PatientAddress || '';
  const phoneList = [patient.PatientPhone1, patient.PatientPhone2].filter(Boolean).join(' | ');
  const ptvList = [
    consult.Scheduled1stInterventionist,
    consult.Scheduled2ndInterventionist,
    consult.Scheduled3rdInterventionist
  ].filter(Boolean);
  const ptvString = ptvList.length > 0 ? ptvList.join(' - ') : 'Chưa gán';
  const priorityOrder = normalizePriorityOrder(consult.PriorityOrder);

  return `${buildSchedulingSummaryHeader(formatPatientWithPtvPhu(patient.PatientName.toUpperCase(), ptvPhu1Display).toUpperCase())}\n` +
    `-----------------------------------\n` +
    `👤 *HÀNH CHÍNH BỆNH NHÂN:*\n` +
    `- Họ và tên bệnh nhân: ${patient.PatientName.toUpperCase()} (${patient.PatientSex}, ${ageDesc})\n` +
    (patient.OtherPatientName && String(patient.OtherPatientName).trim() !== '' && patient.OtherPatientName !== '-' ? `- Họ và tên khác: ${patient.OtherPatientName.toUpperCase()}\n` : '') +
    `- Mã bệnh nhân (ID1): ${patient.PatientID1}\n` +
    (patient.PatientID2 && String(patient.PatientID2).trim() !== '' && patient.PatientID2 !== '-' ? `- Mã NB khác (ID2): ${patient.PatientID2}\n` : '') +
    `- Số điện thoại liên hệ: ${phoneList || '—'}\n` +
    `- Địa chỉ thường trú: ${addressDisplay}\n` +
    `- Chỉ số bé: ${weightDisplay} / ${heightDisplay}\n\n` +
    `🩺 *ĐĂNG KÝ HỘI CHẨN & CHẨN ĐOÁN:*\n` +
    `- Ngày staff hội chẩn: ${formatVNTime(consult.ConsultDate)}\n` +
    `- Người đăng ký hội chẩn: ${consult.RequestBy || '—'}\n` +
    `- Chẩn đoán chi tiết: ${consult.DetailDiagnosis || consult.DiagnosisID || '—'}\n` +
    `- Kết quả staff chi tiết: ${summaryDetailConsultResult}\n\n` +
    `🛠 *CHUẨN BỊ DỤNG CỤ:*\n` +
    `- Kiểm dụng cụ: ${consult.CheckDevice || 'Chưa kiểm'}\n` +
    `- Dụng cụ dự kiến: ${consult.PlannedDevice || '—'}\n` +
    `- Số tiền dự kiến: ${consult.PlannedPrice ? `${consult.PlannedPrice} VNĐ` : '—'}\n` +
    `- Ghi chú từ Phòng Vật tư: ${consult.SupplyDepFeedback || 'Không'}\n` +
    `- Ghi chú từ Phòng Mổ: ${consult.OperationFeedback || 'Không'}\n\n` +
    `${SCHEDULING_SUMMARY_UPDATE_SECTION_HEADER}\n` +
    `- Lịch thông tim chính thức: ${consult.PlannedCathLabDate ? formatVNTime(consult.PlannedCathLabDate) : 'Chưa xếp'}\n` +
    `- Trạng thái gọi bệnh nhân: ${consult.CallStatus || 'Chưa liên hệ'}\n` +
    `- Mức độ ưu tiên gọi bệnh: ${priorityOrder}\n` +
    `- PTV: ${ptvString}\n` +
    `- Lưu ý/ghi chú gọi bệnh: ${consult.CallNote || 'Không'}\n`;
}

export interface ConsultSummaryModalProps {
  patient: Patient;
  consult: Consult;
  /** Merge unsaved edits (staff form / scheduler) over persisted consult. */
  consultOverride?: Partial<Consult>;
  onClose: () => void;
  onError?: (message: string) => void;
  zIndexClass?: string;
}

export function ConsultSummaryModal({
  patient,
  consult,
  consultOverride,
  onClose,
  onError,
  zIndexClass = 'z-[80]'
}: ConsultSummaryModalProps) {
  const isMobile = useIsMobile();
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  useLockBodyScroll(!isMobile);
  usePreventBackgroundTouchScroll(scrollContainerRef, isMobile);
  const [copied, setCopied] = useState(false);
  const [copiedImage, setCopiedImage] = useState(false);
  const [copiedImageType, setCopiedImageType] = useState<CopyImageResultType | null>(null);
  const [isCopyingImage, setIsCopyingImage] = useState(false);

  const mergedConsult = useMemo(
    () => ({ ...consult, ...consultOverride }),
    [consult, consultOverride]
  );

  const ptvPhu1Display = resolvePtvPhu1Display(
    mergedConsult.RequestBy || '',
    mergedConsult.Scheduled2ndInterventionist,
    consultOverride?.Scheduled2ndInterventionist
  );

  const buildSummaryImageFileName = () => {
    const patientId = String(patient.PatientID1 || 'Unknown').trim();
    const nameSlug = removeDiacritics(String(patient.PatientName || '')).replace(/\s+/g, '');
    return `${patientId}_${nameSlug}.png`;
  };

  const handleCopy = () => {
    const text = buildTextSummary(patient, mergedConsult, ptvPhu1Display);
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleCopyImage = async () => {
    setIsCopyingImage(true);
    try {
      const result = await copyElementAsImage(CONSULT_SUMMARY_SCREENSHOT_CARD_ID, {
        isMobile,
        fileName: isMobile
          ? buildSummaryImageFileName()
          : `TomTatXepLich_${patient.PatientID1 || patient.PatientName}.png`,
        shareTitle: 'Tóm tắt xếp lịch',
      });
      setCopiedImageType(result);
      setCopiedImage(true);
      setTimeout(() => setCopiedImage(false), 2550);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      onError?.(`Không thể tạo ảnh: ${message}`);
    } finally {
      setIsCopyingImage(false);
    }
  };

  const mobileZIndex = 'z-[150]';

  const modalShellClass = isMobile
    ? `${mobileZIndex} flex flex-col bg-white font-sans text-xs overflow-hidden`
    : `${zIndexClass} bg-slate-900/60 backdrop-blur-xs items-center justify-center p-4 flex overflow-hidden overscroll-none animate-in fade-in duration-200`;

  const modalPanelClass = isMobile
    ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden'
    : 'bg-slate-50/95 backdrop-blur-md w-full max-w-3xl max-h-[95vh] rounded-3xl border border-slate-250 shadow-2xl flex flex-col min-h-0 overflow-hidden font-sans text-xs animate-in zoom-in-95 duration-200';

  const modal = (
    <div
      className={isMobile ? mobileShellClass : modalShellClass}
      style={isMobile ? {
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        width: '100%',
        height: '100dvh',
        maxHeight: '100dvh',
      } : undefined}
      onClick={isMobile ? undefined : onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className={modalPanelClass}
        onClick={(e) => e.stopPropagation()}
      >
        <div className={`border-b border-slate-200 bg-white flex items-center justify-between text-[#d2145a] shrink-0 ${isMobile ? 'px-3 pb-3 pt-[max(0.75rem,env(safe-area-inset-top,0px))]' : 'p-4 rounded-t-3xl'}`}>
          <div className="flex items-center gap-2 min-w-0">
            <div className="bg-emerald-50 text-emerald-600 rounded-xl p-2 shrink-0">
              <Clipboard className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="font-extrabold text-xs uppercase tracking-wider leading-tight">
                Tóm tắt thông tin xếp lịch
              </h3>
              <p className="text-[9px] text-emerald-600 font-bold uppercase mt-0.5 leading-snug">
                (Dùng cho text / hình ảnh gửi Zalo cho BS chỉnh sửa)
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 transition cursor-pointer p-1.5 hover:bg-slate-100 rounded-xl outline-none shrink-0"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div
          ref={scrollContainerRef}
          data-touch-scroll-container
          className={`flex-1 overflow-y-auto overscroll-contain touch-pan-y min-h-0 ${isMobile ? 'p-2 pb-2' : 'p-4 shrink-0'}`}
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          <div
            id={CONSULT_SUMMARY_SCREENSHOT_CARD_ID}
            className={`bg-white border-2 border-slate-800 rounded-2xl text-slate-700 shadow-xs max-w-full select-text ${isMobile ? 'p-2.5 space-y-2 text-[10.5px]' : 'p-5 space-y-3.5 shrink-0'}`}
          >
            <div className="space-y-1">
              <div className="flex justify-between items-start gap-2 text-[9px] font-semibold text-slate-600 leading-tight">
                <span>Khoa Tim Mạch</span>
                <span className="text-right">Bệnh viện Nhi Đồng Thành Phố</span>
              </div>
              <h2 className="text-center font-black text-[13px] uppercase tracking-wide text-slate-900">
                HỒ SƠ CAN THIỆP
              </h2>
              <div className="h-1" />
            </div>

            <div className={isMobile ? '' : 'border-b-2 border-slate-800 flex sm:flex-row flex-col sm:items-center justify-between gap-3 pb-3'}>
              <div className={`bg-[#d2145a] text-white font-black uppercase tracking-wide rounded-xl shrink-0 max-w-full break-words shadow-xs leading-snug ${isMobile ? 'text-[14px] px-2.5 py-1' : 'text-sm px-3.5 py-1.5 sm:max-w-[75%]'}`}>
                {formatPatientWithPtvPhu(patient.PatientName, ptvPhu1Display)}
              </div>
            </div>

            <div className={`bg-white border border-slate-700 rounded-xl space-y-2 ${isMobile ? 'p-2' : 'p-3.5'}`}>
              <span className="text-[10px] font-black uppercase text-slate-800 tracking-wider block border-b border-slate-200 pb-1">
                THÔNG TIN HÀNH CHÍNH
              </span>
              <PatientAdminPrintInfo patient={patient} />
            </div>

            <ConsultSummaryReadOnly consult={mergedConsult} compact={isMobile} sectionsOnly />
          </div>
        </div>

        <div className={`border-t border-slate-200 bg-white shrink-0 ${isMobile ? 'px-3 pt-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]' : 'p-4 rounded-b-3xl flex flex-col sm:flex-row items-center justify-between gap-3'}`}>
          {!isMobile && (
            <span className="text-[9.5px] text-slate-400 font-semibold italic text-center sm:text-left leading-normal px-1">
              Mẹo: Bấm Sao chép hình ảnh rồi dùng Ctrl+V dán trực tiếp gửi nhóm Zalo vô cùng nhanh chóng!
            </span>
          )}

          <div className={`flex flex-wrap gap-2 shrink-0 justify-stretch ${isMobile ? 'w-full' : 'w-full sm:w-auto sm:justify-end'}`}>
            <button
              type="button"
              onClick={onClose}
              className={`border border-slate-200 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-50 rounded-xl transition cursor-pointer ${isMobile ? 'flex-1 min-w-[5rem] py-2.5' : 'px-4 py-2'}`}
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={isCopyingImage}
              onClick={handleCopyImage}
              className={`rounded-xl text-xs font-black uppercase text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 outline-none disabled:opacity-50 ${
                copiedImage ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-slate-800 hover:bg-slate-900'
              } ${isMobile ? 'flex-1 min-w-[5rem] py-2.5 px-3' : 'px-4 py-2'}`}
            >
              {isCopyingImage ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin shrink-0"></div>
                  <span>Đang tạo ảnh...</span>
                </>
              ) : (
                <>
                  <Check className="w-3.5 h-3.5 shrink-0" />
                  <span>{copiedImage
                    ? (copiedImageType === 'share'
                      ? 'Đã mở menu lưu!'
                      : copiedImageType === 'download'
                        ? 'Đã tải ảnh về!'
                        : 'Đã copy ảnh!')
                    : (isMobile ? 'Lưu ảnh' : 'Sao chép Hình ảnh')}</span>
                </>
              )}
            </button>
            <button
              type="button"
              onClick={handleCopy}
              className={`rounded-xl text-xs font-black uppercase text-white shadow-md transition cursor-pointer flex items-center justify-center gap-1.5 outline-none ${
                copied ? 'bg-emerald-600 hover:bg-emerald-700' : 'bg-[#d2145a] hover:bg-pink-700'
              } ${isMobile ? 'flex-1 min-w-[5rem] py-2.5 px-3' : 'px-4 py-2'}`}
            >
              <Check className="w-3.5 h-3.5 shrink-0" />
              {copied ? 'Đã Copy text!' : 'Sao chép Tin nhắn'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );

  if (isMobile && typeof document !== 'undefined') {
    return createPortal(modal, document.documentElement);
  }

  return modal;
}
