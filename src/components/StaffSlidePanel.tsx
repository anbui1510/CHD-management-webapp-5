import React, { useEffect, useState } from 'react';
import { Download, ExternalLink, Loader2, Presentation, RefreshCw } from 'lucide-react';
import type { Consult, Patient } from '../types';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import {
  buildStaffPptxBase64,
  downloadPptxBase64,
  resolveStaffSlideDriveTarget,
  buildStaffSlideFileName,
} from '../consultSlide/browserApi';
import { buildExtractFromRegistration } from '../consultSlide/fromRegistration';
import { uploadStaffSlideToDrive } from '../consultSlide/uploadDrive';
import { buildSyncContext, withSyncContext } from '../utils/sheetsSyncMutation';
import { MODAL_TITLE } from '../utils/modalTitles';

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
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const [driveUrl, setDriveUrl] = useState(String(consult.FilePPTX || ''));

  useEffect(() => {
    setDriveUrl(String(consult.FilePPTX || ''));
  }, [consult.FilePPTX, consult.ConsultKey]);

  const buildAndMaybeUpload = async (upload: boolean) => {
    setBusy(true);
    setStatus(upload ? 'Đang tạo slide từ hồ sơ…' : 'Đang chuẩn bị file tải về…');
    try {
      const extract = buildExtractFromRegistration(patient, consult);
      const built = await buildStaffPptxBase64({
        extract,
        requestBy: requestByDisplay || consult.RequestBy,
        consultDate: consult.ConsultDate,
      });
      const fileName = buildStaffSlideFileName({
        patientName: extract.PatientName || patient.PatientName,
        patientId: extract.PatientID1 || patient.PatientID1,
        consultDate: consult.ConsultDate,
      });

      if (!upload) {
        downloadPptxBase64(fileName, built.base64);
        setStatus('');
        onSaveSuccess?.('Đã tải slide PPTX về máy.');
        return;
      }

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
        throw new Error((d as { error?: string }).error || 'Đã tạo slide nhưng không lưu được FilePPTX trên hồ sơ');
      }
      setStatus('');
      onSaveSuccess?.(
        `Đã tạo lại slide và lưu Drive (${target.monthFolderName}).`
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
          Slide staff
        </span>
        {driveUrl ? (
          <Badge variant="secondary" className="text-[10px] font-bold">
            Đã có trên Drive
          </Badge>
        ) : (
          <Badge variant="outline" className="text-[10px] font-bold">
            Chưa có file
          </Badge>
        )}
      </div>

      {status ? (
        <p className="text-[11px] text-slate-600 font-semibold flex items-center gap-1.5">
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : null}
          {status}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5">
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy || !driveUrl}
          className="h-8 text-[11px] font-bold"
          onClick={() => driveUrl && window.open(driveUrl, '_blank', 'noopener,noreferrer')}
        >
          <ExternalLink className="size-3.5" />
          Mở Drive
        </Button>
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={busy}
          className="h-8 text-[11px] font-bold"
          onClick={() => void buildAndMaybeUpload(false)}
        >
          <Download className="size-3.5" />
          Tải về
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          disabled={busy}
          className="h-8 text-[11px] font-bold"
          onClick={() => void buildAndMaybeUpload(true)}
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
          {driveUrl ? 'Tạo lại từ hồ sơ' : 'Tạo từ hồ sơ'}
        </Button>
      </div>
    </div>
  );
}

export default StaffSlidePanel;
