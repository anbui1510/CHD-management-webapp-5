import React, { useEffect, useRef, useState } from 'react';
import { FileUp, Loader2, Presentation, X } from 'lucide-react';
import { Button } from './ui/button';
import { Badge } from './ui/badge';
import { Separator } from './ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './ui/dialog';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { VNDateInput } from './VNDateInput';
import { prepareAttachmentFile, requestConsultSlideExtract } from '../consultSlide/browserApi';
import type {
  ConsultSlideAttachment,
  ConsultSlideAttachmentKind,
  ConsultSlideExtract,
} from '../consultSlide/types';
import type { ConsultTypeEnum } from '../types';
import { MODAL_TITLE } from '../utils/modalTitles';

type SlotKey = 'admin' | 'tte' | 'ecg' | 'cxr' | 'pdf';

const SLOTS: Array<{ key: SlotKey; kind: ConsultSlideAttachmentKind; label: string; accept: string }> = [
  { key: 'admin', kind: 'admin', label: 'Hành chính', accept: 'image/*,application/pdf' },
  { key: 'tte', kind: 'tte', label: 'TTE', accept: 'image/*,application/pdf' },
  { key: 'ecg', kind: 'ecg', label: 'ECG', accept: 'image/*,application/pdf' },
  { key: 'cxr', kind: 'cxr', label: 'CXR', accept: 'image/*,application/pdf' },
  { key: 'pdf', kind: 'pdf', label: 'PDF gộp', accept: 'application/pdf,image/*' },
];

export interface AiRegisterConsultResult {
  extract: ConsultSlideExtract;
  attachments: ConsultSlideAttachment[];
  ConsultType: ConsultTypeEnum;
  ConsultDate: string;
  RequestBy: string;
}

export interface AiRegisterConsultModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  doctorOptions: string[];
  defaultRequestBy?: string;
  defaultConsultDate?: string;
  triggerAlert: (message: string, title?: string) => void;
  onComplete: (result: AiRegisterConsultResult) => void;
}

export function AiRegisterConsultModal({
  open,
  onOpenChange,
  doctorOptions,
  defaultRequestBy = '',
  defaultConsultDate,
  triggerAlert,
  onComplete,
}: AiRegisterConsultModalProps) {
  const todayIso = new Date().toISOString().split('T')[0];
  const [consultType, setConsultType] = useState<ConsultTypeEnum>('Staff mổ');
  const [consultDate, setConsultDate] = useState(defaultConsultDate || todayIso);
  const [requestBy, setRequestBy] = useState(defaultRequestBy);
  const [files, setFiles] = useState<Partial<Record<SlotKey, File>>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState('');
  const inputRefs = useRef<Partial<Record<SlotKey, HTMLInputElement | null>>>({});

  useEffect(() => {
    if (!open) return;
    setConsultType('Staff mổ');
    setConsultDate(defaultConsultDate || todayIso);
    setRequestBy(defaultRequestBy);
    setFiles({});
    setBusy(false);
    setStatus('');
  }, [open, defaultConsultDate, defaultRequestBy, todayIso]);

  const setSlotFile = (key: SlotKey, file: File | undefined) => {
    setFiles(prev => {
      const next = { ...prev };
      if (!file) delete next[key];
      else next[key] = file;
      return next;
    });
  };

  const attachmentCount = Object.keys(files).length;

  const handleExtract = async () => {
    if (!consultType) {
      triggerAlert('Hãy chọn kiểu staff (Staff mổ / Staff thông) trước khi đọc AI.', MODAL_TITLE.missingInfo);
      return;
    }
    if (!consultDate) {
      triggerAlert('Hãy chọn ngày staff.', MODAL_TITLE.missingInfo);
      return;
    }
    if (!requestBy.trim()) {
      triggerAlert('Hãy chọn người đăng ký (RequestBy).', MODAL_TITLE.missingInfo);
      return;
    }
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
        patient: {},
        consult: {
          ConsultType: consultType,
          ConsultDate: consultDate,
          RequestBy: requestBy,
        },
        attachments,
        preferOcr: true,
      });

      onComplete({
        extract,
        attachments,
        ConsultType: consultType,
        ConsultDate: consultDate,
        RequestBy: requestBy,
      });
      onOpenChange(false);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setStatus('');
      triggerAlert(message, MODAL_TITLE.warning);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={next => !busy && onOpenChange(next)}>
      <DialogContent className="sm:max-w-xl max-h-[min(90dvh,640px)] overflow-y-auto gap-3">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 text-base">
            <Presentation className="size-4 text-primary" />
            Đăng ký mode AI
          </DialogTitle>
          <DialogDescription>
            Chọn kiểu staff trước, upload giấy tờ, AI điền form đăng ký. Slide PPTX tạo sau khi bạn Lưu đăng ký.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div>
            <p className="text-[10px] font-bold uppercase text-muted-foreground mb-1.5">Kiểu staff *</p>
            <div className="flex flex-wrap gap-2">
              {(['Staff mổ', 'Staff thông'] as ConsultTypeEnum[]).map(type => (
                <Button
                  key={type}
                  type="button"
                  size="sm"
                  variant={consultType === type ? 'default' : 'outline'}
                  className="rounded-xl text-xs font-bold"
                  disabled={busy}
                  onClick={() => setConsultType(type)}
                >
                  {type}
                </Button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Ngày staff *</p>
              <VNDateInput
                required
                value={consultDate}
                onChange={setConsultDate}
                disabled={busy}
                className="w-full"
              />
            </div>
            <div className="space-y-1 min-w-0">
              <p className="text-[10px] font-bold uppercase text-muted-foreground">Người đăng ký *</p>
              <SearchableEnumSelect
                required
                options={doctorOptions}
                value={requestBy}
                onChange={setRequestBy}
                allowCreate
                createLabel={val => `Thêm BS "${val}"`}
                placeholder="-- Chọn BS --"
                searchPlaceholder="Gõ tên BS..."
                className="min-w-0"
              />
            </div>
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span className="text-[11px] font-extrabold uppercase tracking-wide text-foreground">
                Upload giấy tờ
              </span>
              {attachmentCount > 0 ? (
                <Badge variant="secondary" className="text-[10px] font-bold">
                  {attachmentCount} file
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
                        className="text-muted-foreground hover:text-foreground cursor-pointer"
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
            <p className="text-[10px] text-muted-foreground">
              Upload ảnh/PDF → AI điền form đăng ký → bạn kiểm tra &amp; Lưu → tạo slide Drive
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange(false)}>
            Hủy
          </Button>
          <Button
            type="button"
            disabled={busy || attachmentCount === 0}
            onClick={() => void handleExtract()}
            className="font-bold"
          >
            {busy ? <Loader2 className="animate-spin" /> : <Presentation />}
            {busy ? 'Đang đọc…' : 'Đọc AI & điền form'}
          </Button>
        </DialogFooter>

        {status ? (
          <p className="text-[10px] font-semibold text-muted-foreground -mt-1">{status}</p>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default AiRegisterConsultModal;
