import React, { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, Clipboard, X } from 'lucide-react';
import { Consult, Patient, formatVNTime, normalizePriorityOrder, removeDiacritics, restoreWeightFromDate } from '../types';
import { ConsultSummaryReadOnly } from './ConsultSummaryReadOnly';
import { useIsMobile } from '../hooks/useMediaQuery';
import { useLockBodyScroll, usePreventBackgroundTouchScroll } from '../hooks/useLockBodyScroll';
import { formatPatientDobWithAge, getPatientAgeDescription } from '../utils/patientDisplay';
import { captureElementPngBlob, copyElementAsImage, CopyImageResultType, downloadBlob, openElementAsPdf } from '../utils/copySummaryImage';
import {
  formatSummaryPatientTitle,
  resolvePtvPhu1Display
} from '../utils/consultSummaryDisplay';
export const CONSULT_SUMMARY_SCREENSHOT_CARD_ID = 'consult-summary-screenshot-card';

const hasAdminField = (v?: string) => Boolean(v && String(v).trim() !== '' && v !== '-');

function PatientAdminPrintInfo({ patient }: { patient: Patient }) {
  const hasId2 = hasAdminField(patient.PatientID2);
  const hasPhone2 = hasAdminField(patient.PatientPhone2);
  const hasPhone1 = hasAdminField(patient.PatientPhone1);
  const hasOtherName = hasAdminField(patient.OtherPatientName);
  const isFullLayout = hasId2 && hasPhone2;
  const address = patient.PatientAddress || '—';

  const labelCls = 'text-slate-400 font-bold text-[9px] uppercase tracking-wider shrink-0 whitespace-nowrap';
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
            <Field label="Địa chỉ:" value={address} />
          </Row>
          <Row>
            <Field label="Ngày sinh:" value={formatPatientDobWithAge(patient.PatientDOB, undefined, formatVNTime)} />
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

const isSmsSummaryValueEmpty = (value?: string | null) => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) return true;
  const normalized = trimmed.toLowerCase();
  return trimmed === '—' || trimmed === '-' || normalized === 'không' || normalized === 'chưa kiểm' ||
    normalized === 'chưa gán' || normalized === 'chưa xếp' || normalized === 'chưa liên hệ';
};

const appendSmsLine = (lines: string[], label: string, value?: string | null) => {
  if (isSmsSummaryValueEmpty(value)) return;
  lines.push(`${label}: ${String(value).trim()}`);
};

export function buildConsultSummaryText(patient: Patient, consult: Consult, _ptvPhu1Display?: string) {
  const ageDesc = getPatientAgeDescription(patient.PatientDOB);
  const dobDisplay = formatVNTime(patient.PatientDOB);
  const sexDobLine = [patient.PatientSex, dobDisplay && ageDesc ? `${dobDisplay} (${ageDesc})` : dobDisplay || ageDesc]
    .filter(Boolean)
    .join(' - ');

  const phones = [patient.PatientPhone1, patient.PatientPhone2]
    .map(p => String(p || '').trim())
    .filter(p => p && p !== '-');
  const phoneLine = phones.join(' - ');

  const weightRaw = consult.PatientWeight ? restoreWeightFromDate(consult.PatientWeight) : '';
  const heightRaw = consult.PatientHeight ? restoreWeightFromDate(consult.PatientHeight) : '';
  const metricsLine = weightRaw || heightRaw
    ? `CN ${weightRaw || '—'} kg/ CC ${heightRaw || '—'} cm`
    : '';

  const staffDate = consult.ConsultDate ? formatVNTime(consult.ConsultDate) : '';
  const requestBy = String(consult.RequestBy || '').trim();
  const staffLine = staffDate || requestBy
    ? `Ngày staff: ${staffDate || '—'} - Đăng ký: ${requestBy || '—'}`
    : '';

  const ptvList = [
    consult.Scheduled1stInterventionist,
    consult.Scheduled2ndInterventionist,
    consult.Scheduled3rdInterventionist
  ].filter(v => v && String(v).trim());
  const ptvString = ptvList.length > 0 ? ptvList.join(' - ') : '';

  const priorityOrder = normalizePriorityOrder(consult.PriorityOrder);
  const plannedDate = consult.PlannedCathLabDate ? formatVNTime(consult.PlannedCathLabDate) : '';

  const lines: string[] = [];
  if (patient.PatientName?.trim()) lines.push(patient.PatientName.trim());
  if (sexDobLine) lines.push(sexDobLine);
  if (phoneLine) lines.push(phoneLine);
  if (patient.PatientAddress?.trim()) lines.push(patient.PatientAddress.trim());
  if (metricsLine) lines.push(metricsLine);
  if (staffLine) lines.push(staffLine);

  appendSmsLine(lines, 'Dx', consult.DetailDiagnosis || consult.DiagnosisID);
  appendSmsLine(lines, 'KQ hội chẩn', consult.DetailConsultResult || consult.ConsultResultID);
  appendSmsLine(lines, 'Kiểm dụng cụ', consult.CheckDevice);
  appendSmsLine(lines, 'Dụng cụ dự kiến', consult.PlannedDevice);
  appendSmsLine(lines, 'Số tiền dự kiến', consult.PlannedPrice);
  appendSmsLine(lines, 'Ghi chú từ Phòng Vật tư', consult.SupplyDepFeedback);
  appendSmsLine(lines, 'Ghi chú từ Phòng Mổ', consult.OperationFeedback);
  appendSmsLine(lines, 'Lịch thông tim chính thức', plannedDate);
  appendSmsLine(lines, 'Trạng thái gọi bệnh nhân', consult.CallStatus);
  appendSmsLine(lines, 'Mức độ ưu tiên gọi bệnh', priorityOrder);
  appendSmsLine(lines, 'PTV', ptvString);
  appendSmsLine(lines, 'Lưu ý/ghi chú gọi bệnh', consult.CallNote);

  return lines.join('\n');
}

export type ConsultSummaryLayoutMode = 'default' | 'compact' | 'capture169';

export const SUMMARY_16_9_WIDTH = 1280;
export const SUMMARY_16_9_HEIGHT = 720;

export function ConsultSummarySheet({
  patient,
  consult,
  compact = false,
  layoutMode,
  sheetId,
}: {
  patient: Patient;
  consult: Consult;
  compact?: boolean;
  layoutMode?: ConsultSummaryLayoutMode;
  sheetId?: string;
}) {
  const mode: ConsultSummaryLayoutMode = layoutMode ?? (compact ? 'compact' : 'default');
  const isCompact = mode === 'compact' || mode === 'capture169';
  const isCapture169 = mode === 'capture169';

  const ptvPhu1Display = resolvePtvPhu1Display(
    consult.RequestBy || '',
    consult.Scheduled2ndInterventionist,
    consult.Scheduled2ndInterventionist
  );

  const shellClass = isCapture169
    ? 'p-2 space-y-1.5 text-[10px] rounded-lg border border-slate-800'
    : isCompact
      ? 'p-2.5 space-y-2 text-[10.5px] rounded-2xl border-2 border-slate-800'
      : 'p-5 space-y-3.5 shrink-0 rounded-2xl border-2 border-slate-800';

  return (
    <div
      id={sheetId}
      className={`bg-white text-slate-700 shadow-xs max-w-full select-text ${shellClass}`}
    >
      <div className={isCapture169 ? 'space-y-0.5' : 'space-y-1'}>
        <div className={`flex justify-between items-start gap-2 font-semibold text-slate-600 leading-tight ${isCapture169 ? 'text-[8px]' : 'text-[9px]'}`}>
          <span>Khoa Tim Mạch</span>
          <span className="text-right">Bệnh viện Nhi Đồng Thành Phố</span>
        </div>
        <h2 className={`text-center font-black uppercase tracking-wide text-slate-900 ${isCapture169 ? 'text-[11px]' : 'text-[13px]'}`}>
          HỒ SƠ CAN THIỆP
        </h2>
      </div>

      <div className={isCompact ? '' : 'flex sm:flex-row flex-col sm:items-center justify-between gap-2 pb-1'}>
        <div className={`bg-[#d2145a] text-white font-black uppercase tracking-wide rounded-xl shrink-0 max-w-full break-words shadow-xs leading-snug ${
          isCapture169 ? 'text-[12px] px-2 py-0.5' : isCompact ? 'text-[14px] px-2.5 py-1' : 'text-sm px-3.5 py-1.5 sm:max-w-[75%]'
        }`}>
          {formatSummaryPatientTitle(patient.PatientName, consult, ptvPhu1Display)}
        </div>
      </div>

      <div className={`bg-white border border-slate-700 rounded-xl space-y-1.5 ${isCapture169 ? 'p-1.5' : isCompact ? 'p-2' : 'p-3.5'}`}>
        <span className={`font-black uppercase text-slate-800 tracking-wider block border-b border-slate-200 pb-0.5 ${isCapture169 ? 'text-[8px]' : 'text-[10px]'}`}>
          THÔNG TIN HÀNH CHÍNH
        </span>
        <PatientAdminPrintInfo patient={patient} />
      </div>

      <ConsultSummaryReadOnly
        consult={consult}
        compact={isCompact}
        capture169={isCapture169}
        sectionsOnly
      />
    </div>
  );
}

const scalesNearlyEqual = (a: number, b: number) => Math.abs(a - b) < 0.001;

export function ConsultSummaryCaptureFrame({
  patient,
  consult,
  sheetId,
  previewFitWidth = false,
  className = '',
}: {
  patient: Patient;
  consult: Consult;
  sheetId?: string;
  previewFitWidth?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const lastScalesRef = useRef({ content: 1, frame: 1 });
  const [contentScale, setContentScale] = useState(1);
  const [frameScale, setFrameScale] = useState(1);

  useLayoutEffect(() => {
    let rafId = 0;

    const measure = () => {
      const content = contentRef.current;
      if (!content) return;

      const naturalHeight = content.scrollHeight;
      const nextContentScale = naturalHeight > 0
        ? Math.min(1, SUMMARY_16_9_HEIGHT / naturalHeight)
        : 1;

      let nextFrameScale = 1;
      if (previewFitWidth && containerRef.current) {
        const w = containerRef.current.clientWidth;
        if (w > 0) nextFrameScale = w / SUMMARY_16_9_WIDTH;
      }

      const last = lastScalesRef.current;
      if (
        scalesNearlyEqual(last.content, nextContentScale) &&
        scalesNearlyEqual(last.frame, nextFrameScale)
      ) {
        return;
      }

      lastScalesRef.current = { content: nextContentScale, frame: nextFrameScale };
      setContentScale(nextContentScale);
      setFrameScale(nextFrameScale);
    };

    const scheduleMeasure = () => {
      cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(measure);
    };

    scheduleMeasure();
    window.addEventListener('resize', scheduleMeasure);

    let ro: ResizeObserver | null = null;
    const contentEl = contentRef.current;
    if (typeof ResizeObserver !== 'undefined' && contentEl) {
      ro = new ResizeObserver(scheduleMeasure);
      ro.observe(contentEl);
    }

    return () => {
      cancelAnimationFrame(rafId);
      window.removeEventListener('resize', scheduleMeasure);
      ro?.disconnect();
    };
  }, [patient.PatientKey, consult.ConsultKey, previewFitWidth]);

  return (
    <div
      ref={containerRef}
      className={`${previewFitWidth ? 'w-full mx-auto aspect-video overflow-hidden' : ''} ${className}`}
    >
      <div
        id={sheetId}
        className="bg-white overflow-hidden shrink-0"
        style={{
          width: SUMMARY_16_9_WIDTH,
          height: SUMMARY_16_9_HEIGHT,
          transform: previewFitWidth ? `scale(${frameScale})` : undefined,
          transformOrigin: 'top left',
        }}
      >
        <div
          ref={contentRef}
          style={{
            width: SUMMARY_16_9_WIDTH,
            transform: contentScale < 1 ? `scale(${contentScale})` : undefined,
            transformOrigin: 'top left',
          }}
        >
          <ConsultSummarySheet patient={patient} consult={consult} layoutMode="capture169" />
        </div>
      </div>
    </div>
  );
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
    const text = buildConsultSummaryText(patient, mergedConsult, ptvPhu1Display);
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
    ? `fixed inset-0 ${mobileZIndex} flex flex-col bg-white font-sans text-xs overflow-hidden`
    : `fixed inset-0 ${zIndexClass} bg-slate-900/60 backdrop-blur-xs items-center justify-center p-4 flex overflow-hidden overscroll-none animate-in fade-in duration-200`;

  const modalPanelClass = isMobile
    ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden'
    : 'bg-slate-50/95 backdrop-blur-md w-full max-w-3xl max-h-[95vh] rounded-3xl border border-slate-200 shadow-2xl flex flex-col min-h-0 overflow-hidden font-sans text-xs animate-in zoom-in-95 duration-200';

  const modal = (
    <div
      className={modalShellClass}
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
          <ConsultSummaryCaptureFrame
            patient={patient}
            consult={mergedConsult}
            previewFitWidth={isMobile}
            className={isMobile ? '' : 'max-w-[1280px] mx-auto'}
          />
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

  if (typeof document === 'undefined') return modal;
  return (
    <>
      {createPortal(modal, document.body)}
      {createPortal(
        <div aria-hidden style={{ position: 'fixed', left: -5000, top: 0, zIndex: -1 }}>
          <ConsultSummaryCaptureFrame
            patient={patient}
            consult={mergedConsult}
            sheetId={CONSULT_SUMMARY_SCREENSHOT_CARD_ID}
          />
        </div>,
        document.body
      )}
    </>
  );
}

const SUMMARY_CAPTURE_ID = 'staff-result-summary-capture';

function summaryFileBase(patient: Patient) {
  const patientId = String(patient.PatientID1 || 'Unknown').trim();
  const nameSlug = removeDiacritics(String(patient.PatientName || '')).replace(/\s+/g, '');
  return `${patientId}_${nameSlug}`;
}

export function StaffSummaryExportActions({
  patient,
  consult,
  onError,
}: {
  patient: Patient;
  consult: Consult;
  onError?: (message: string) => void;
}) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<'pdf' | 'png' | 'sms' | null>(null);
  const [busy, setBusy] = useState(false);
  const [copiedSms, setCopiedSms] = useState(false);
  const pngScrollRef = useRef<HTMLDivElement>(null);
  const onErrorRef = useRef(onError);
  onErrorRef.current = onError;
  usePreventBackgroundTouchScroll(pngScrollRef, isMobile && (mode === 'png' || mode === 'sms'));
  const smsText = useMemo(() => {
    const ptv = resolvePtvPhu1Display(
      consult.RequestBy || '',
      consult.Scheduled2ndInterventionist,
      consult.Scheduled2ndInterventionist
    );
    return buildConsultSummaryText(patient, consult, ptv);
  }, [patient, consult]);

  useEffect(() => {
    if (mode !== 'pdf') return;
    let cancelled = false;
    const run = async () => {
      setBusy(true);
      try {
        await new Promise<void>(resolve => {
          requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
        });
        const element = document.getElementById(SUMMARY_CAPTURE_ID);
        if (!element) throw new Error('Không tìm thấy khung tóm tắt.');
        await openElementAsPdf(element);
      } catch (err: unknown) {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : String(err);
          onErrorRef.current?.(`Không thể tạo PDF: ${message}`);
        }
      } finally {
        if (!cancelled) {
          setBusy(false);
          setMode(current => (current === 'pdf' ? null : current));
        }
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [mode]);

  const savePng = async () => {
    const element = document.getElementById(SUMMARY_CAPTURE_ID);
    if (!element) {
      onError?.('Không tìm thấy khung tóm tắt để lưu ảnh.');
      return;
    }
    setBusy(true);
    try {
      const blob = await captureElementPngBlob(element);
      downloadBlob(blob, `${summaryFileBase(patient)}.png`);
      setMode(null);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      onError?.(`Không thể lưu ảnh: ${message}`);
    } finally {
      setBusy(false);
    }
  };

  const copySms = async () => {
    try {
      await navigator.clipboard.writeText(smsText);
      setCopiedSms(true);
      setTimeout(() => setCopiedSms(false), 2000);
    } catch {
      onError?.('Không sao chép được. Hãy chọn nội dung tin nhắn rồi copy thủ công.');
    }
  };

  const actionBtn = 'px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white text-[11px] font-black tracking-wide text-slate-800 hover:bg-slate-50 hover:border-slate-400 transition cursor-pointer disabled:opacity-50';

  const overlayShellClass = isMobile
    ? 'fixed inset-0 z-[200] flex flex-col bg-white overflow-hidden'
    : 'fixed inset-0 z-[200] bg-slate-900/60 flex items-center justify-center p-4';

  const overlayPanelClass = isMobile
    ? 'flex flex-col flex-1 min-h-0 w-full overflow-hidden'
    : 'bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden';

  const overlay = mode === 'png' || mode === 'sms' ? (
    <div className={overlayShellClass} role="dialog" aria-modal="true">
      <div className={overlayPanelClass}>
        <div className={`border-b border-slate-200 flex items-center justify-between shrink-0 ${isMobile ? 'px-3 py-2 pt-[max(0.5rem,env(safe-area-inset-top,0px))]' : 'px-4 py-3'}`}>
          <h3 className="font-extrabold text-xs uppercase tracking-wider text-slate-800">
            {mode === 'png' ? 'Tóm tắt dạng ảnh' : 'Tóm tắt dạng tin nhắn'}
          </h3>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="text-slate-400 hover:text-slate-700 p-1 rounded-lg"
            aria-label="Đóng"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
        <div
          ref={pngScrollRef}
          data-touch-scroll-container
          className={`flex-1 overflow-y-auto overscroll-contain touch-pan-y min-h-0 bg-slate-100 ${isMobile ? 'px-1.5 py-1' : 'p-4'}`}
          style={{ WebkitOverflowScrolling: 'touch', touchAction: 'pan-y' }}
        >
          {mode === 'png' ? (
            <ConsultSummaryCaptureFrame
              patient={patient}
              consult={consult}
              previewFitWidth={isMobile}
              className={isMobile ? '' : 'max-w-[1280px] mx-auto'}
            />
          ) : (
            <textarea
              readOnly
              value={smsText}
              className={`w-full bg-white border border-slate-200 rounded-xl p-3 text-xs font-semibold text-slate-800 leading-relaxed resize-none ${isMobile ? 'min-h-[50vh] flex-1' : 'min-h-[360px]'}`}
              style={isMobile ? { minHeight: 'calc(100dvh - 9rem)' } : undefined}
            />
          )}
        </div>
        <div className={`border-t border-slate-200 bg-white flex justify-end gap-2 shrink-0 ${isMobile ? 'px-3 py-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]' : 'px-4 py-3'}`}>
          <button
            type="button"
            onClick={() => setMode(null)}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-50"
          >
            {mode === 'png' ? 'Hủy' : 'Đóng'}
          </button>
          {mode === 'png' ? (
            <button
              type="button"
              disabled={busy}
              onClick={() => { void savePng(); }}
              className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-black uppercase disabled:opacity-50"
            >
              {busy ? 'Đang lưu...' : 'Lưu về máy'}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => { void copySms(); }}
              className="px-4 py-2 rounded-xl bg-[#d2145a] hover:bg-pink-700 text-white text-xs font-black uppercase"
            >
              {copiedSms ? 'Đã sao chép' : 'Sao chép tin nhắn'}
            </button>
          )}
        </div>
      </div>
    </div>
  ) : null;

  return (
    <>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-500">Tóm tắt:</span>
        <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('pdf')}>
          {busy && mode === 'pdf' ? '...' : 'PDF'}
        </button>
        <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('png')}>PNG</button>
        <button type="button" className={actionBtn} disabled={busy} onClick={() => setMode('sms')}>SMS</button>
      </div>
      {(mode === 'pdf' || mode === 'png') && typeof document !== 'undefined' && createPortal(
        <div aria-hidden style={{ position: 'fixed', left: -5000, top: 0, zIndex: -1 }}>
          <ConsultSummaryCaptureFrame patient={patient} consult={consult} sheetId={SUMMARY_CAPTURE_ID} />
        </div>,
        document.body
      )}
      {overlay && typeof document !== 'undefined' ? createPortal(overlay, document.body) : null}
    </>
  );
}
