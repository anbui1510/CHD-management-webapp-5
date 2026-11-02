import React, { useRef, useState } from 'react';
import { Download, ExternalLink, FileUp, Loader2, Presentation, X } from 'lucide-react';
import type { Consult, Patient } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import {
  buildStaffPptxBase64,
  downloadPptxBase64,
  prepareAttachmentFile,
  requestConsultSlideExtract,
  resolveStaffSlideDriveTarget,
  buildStaffSlideFileName,
} from '../consultSlide/browserApi';
import { uploadStaffSlideToDrive } from '../consultSlide/uploadDrive';
import type { ConsultSlideAttachment, ConsultSlideAttachmentKind } from '../consultSlide/types';
import { buildSyncContext, withSyncContext } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

type SlotKey = 'admin' | 'tte' | 'ecg' | 'cxr' | 'pdf';

const SLOTS: Array<{ key: SlotKey; kind: ConsultSlideAttachmentKind; label: string; accept: string }> = [
  { key: 'admin', kind: 'admin', label: 'Hành chính', accept: 'image/*,application/pdf' },
  { key: 'tte', kind: 'tte', label: 'TTE', accept: 'image/*,application/pdf' },
  { key: 'ecg', kind: 'ecg', label: 'ECG', accept: 'image/*,application/pdf' },
  { key: 'cxr', kind: 'cxr', label: 'CXR', accept: 'image/*,application/pdf' },
  { key: 'pdf', kind: 'pdf', label: 'PDF gộp', accept: 'application/pdf,image/*' },
];

export interface StaffSlidePanelProps {
  patient: Patient;
  consult: Consult;
  requestByDisplay?: string;
  onPatchConsult: (consultKey: string, patch: Partial<Consult>) => void;
  triggerAlert: (message: string, title?: string) => void;
  onSaveSuccess?: (message: string) => void;
}

export function StaffSlidePanel({
  patient,
  consult,
  requestByDisplay,
  onPatchConsult,
  triggerAlert,
  onSaveSuccess,
}: StaffSlidePanelProps) {
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [driveUrl, setDriveUrl] = useState(String(consult.FilePPTX || ''));
  const [lastFileName, setLastFileName] = useState('');
  const [lastBase64, setLastBase64] = useState('');
  const inputRefs = useRef<Partial<Record<SlotKey, HTMLInputElement | null>>>({});

  const setSlotFile = (key: SlotKey, file: File | undefined) => {
    setFiles(prev => {
      const next = { ...prev };
      if (!file) delete next[key];
      else next[key] = file;
      return next;
    });
  };

  const attachmentCount = Object.keys(files).length;

  const handleGenerate = async () => {
    if (!attachmentCount) {
      triggerAlert('Hãy upload ít nhất một ảnh/PDF (hành chính, TTE, ECG hoặc PDF gộp).', MODAL_TITLE.missingInfo);
      return;
    }

    setBusy(true);
    setStatus('Đang đọc ảnh bằng AI…');
    try {
      const attachments: ConsultSlideAttachment[] = [];
      for (const slot of SLOTS) {
        const file = files[slot.key];
        if (!file) continue;
        attachments.push(await prepareAttachmentFile(file, slot.kind));
      }

      const extract = await requestConsultSlideExtract({
        patient: {
          PatientName: patient.PatientName,
          OtherPatientName: patient.OtherPatientName,
          PatientID1: patient.PatientID1,
          PatientID2: patient.PatientID2,
          PatientSex: patient.PatientSex,
          PatientDOB: patient.PatientDOB,
          PatientAddress: patient.PatientAddress,
          PatientPhone1: patient.PatientPhone1,
          PatientPhone2: patient.PatientPhone2,
        },
        consult: {
          ConsultKey: consult.ConsultKey,
          ConsultType: consult.ConsultType,
          ConsultDate: consult.ConsultDate,
          RequestBy: consult.RequestBy,
          DiagnosisID: consult.DiagnosisID,
          DetailDiagnosis: consult.DetailDiagnosis,
          PatientWeight: consult.PatientWeight,
          PatientHeight: consult.PatientHeight,
          ConsultResultID: consult.ConsultResultID,
          DetailConsultResult: consult.DetailConsultResult,
          ConsultNote: consult.ConsultNote,
          PlannedDevice: consult.PlannedDevice,
        },
        attachments,
      });

      setStatus('Đang ghép template PPTX…');
      const imageAttachments = attachments.filter(a => a.mimeType.startsWith('image/'));
      const built = await buildStaffPptxBase64({
        extract,
        requestBy: requestByDisplay || consult.RequestBy,
        consultDate: consult.ConsultDate,
        attachments: imageAttachments,
      });
      // Prefer filename with consult date already applied
      const fileName = buildStaffSlideFileName({
        patientName: extract.PatientName || patient.PatientName,
        patientId: extract.PatientID1 || patient.PatientID1,
        consultDate: consult.ConsultDate,
      });
      setLastFileName(fileName);
      setLastBase64(built.base64);
      downloadPptxBase64(fileName, built.base64);

      setStatus('Đang lưu Google Drive…');
      const target = resolveStaffSlideDriveTarget(consult.ConsultType, consult.ConsultDate);
      const uploaded = await uploadStaffSlideToDrive({
        fileName,
        base64: built.base64,
        target,
      });
      setDriveUrl(uploaded.url);

      onPatchConsult(consult.ConsultKey, { FilePPTX: uploaded.url });
      const syncContext = buildSyncContext('results-staff', {
        patientName: patient.PatientName,
        patientKey: patient.PatientKey,
        patientID: patient.PatientID1,
      });
      const response = await fetch(`/api/consults/${consult.ConsultKey}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(withSyncContext({ FilePPTX: uploaded.url }, syncContext)),
      });
      if (!response.ok) {
        const d = await response.json().catch(() => ({}));
        throw new Error(d.error || 'Đã tạo slide nhưng không lưu được FilePPTX trên hồ sơ');
      }

      setStatus('Hoàn tất');
      onSaveSuccess?.(
        `Đã tạo slide và lưu Drive (${target.monthFolderName}). File cũng đã tải về máy.`
      );
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('');
      triggerAlert(message, MODAL_TITLE.warning);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="w-full flex flex-col gap-2 rounded-2xl border border-slate-200 bg-slate-50/80 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <Presentation className="size-4 text-primary shrink-0" />
        <span className="text-[11px] font-extrabold uppercase tracking-wide text-slate-700">
          Slide staff (AI)
        </span>
        {driveUrl ? (
          <Badge variant="secondary" className="text-[10px] font-bold">
            Đã có trên Drive
          </Badge>
        ) : null}
      </div>

      <div className="flex flex-wrap gap-1.5">
        {SLOTS.map(slot => {
          const selected = files[slot.key];
          return (
            <div key={slot.key} className="flex items-center gap-1">
              <input
                ref={el => {
                  inputRefs.current[slot.key] = el;
                }}
                type="file"
                accept={slot.accept}
                className="hidden"
                onChange={e => {
                  const file = e.target.files?.[0];
                  setSlotFile(slot.key, file || undefined);
                  e.target.value = '';
                }}
              />
              <Button
                type="button"
                variant={selected ? 'default' : 'outline'}
                size="sm"
                className="h-8 rounded-xl text-[10px] font-bold"
                disabled={busy}
                onClick={() => inputRefs.current[slot.key]?.click()}
              >
                <FileUp />
                {selected ? selected.name.slice(0, 18) : slot.label}
              </Button>
              {selected ? (
                <button
                  type="button"
                  className="text-slate-400 hover:text-slate-700 cursor-pointer"
                  disabled={busy}
                  onClick={() => setSlotFile(slot.key, undefined)}
                  aria-label={`Xóa ${slot.label}`}
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </div>
          );
        })}
      </div>

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          size="sm"
          className="h-9 rounded-2xl font-extrabold uppercase text-[10px]"
          disabled={busy || attachmentCount === 0}
          onClick={() => void handleGenerate()}
        >
          {busy ? <Loader2 className="animate-spin" /> : <Presentation />}
          {busy ? 'Đang tạo…' : 'Tạo slide staff'}
        </Button>

        {lastBase64 ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-2xl font-bold text-[10px]"
            disabled={busy}
            onClick={() => downloadPptxBase64(lastFileName || 'staff-slide.pptx', lastBase64)}
          >
            <Download />
            Tải lại PPTX
          </Button>
        ) : null}

        {driveUrl ? (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-9 rounded-2xl font-bold text-[10px]"
            onClick={() => window.open(driveUrl, '_blank', 'noopener,noreferrer')}
          >
            <ExternalLink />
            Mở Drive
          </Button>
        ) : null}

        {status ? (
          <span className="text-[10px] font-semibold text-slate-500">{status}</span>
        ) : (
          <span className="text-[10px] text-slate-400">
            Upload ảnh/PDF → AI điền template → tải về + lưu Drive
          </span>
        )}
      </div>
    </div>
  );
}

export default StaffSlidePanel;
