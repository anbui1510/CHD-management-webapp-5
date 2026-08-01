import { useMemo, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import type { Consult, DeviceTemplate } from '../types';
import { normalizeDiagnosisID } from '../data/source';
import { MobileAutoExpandTextarea } from './MobileAutoExpandTextarea';

type PlannedDeviceSuggestion = {
  key: string;
  value: string;
  label: string;
  meta: string;
  source: 'template' | 'history';
};

type PlannedDeviceSuggestBoxProps = {
  diagnosisID?: string;
  value: string;
  onChange: (value: string) => void;
  deviceTemplates?: DeviceTemplate[];
  consults?: Consult[];
  label?: string;
  placeholder?: string;
  rows?: number;
  required?: boolean;
  textareaClassName?: string;
  autoExpandOnMobile?: boolean;
};

const normalizeText = (value?: unknown) =>
  String(value || '').trim().replace(/\s+/g, ' ');

const trimSentence = (value: string) =>
  normalizeText(value).replace(/[.\s]+$/g, '');

const appendSentence = (currentValue: string, nextValue: string) => {
  const next = trimSentence(nextValue);
  if (!next) return currentValue;

  const existingParts = normalizeText(currentValue)
    .split('.')
    .map(part => trimSentence(part).toLowerCase())
    .filter(Boolean);

  if (existingParts.includes(next.toLowerCase())) {
    return currentValue;
  }

  const current = trimSentence(currentValue);
  return current ? `${current}. ${next}` : next;
};

const getTemplateValue = (template: DeviceTemplate) =>
  normalizeText(template.FullDeviceName) || normalizeText(template.DeviceName);

const getTemplateLabel = (template: DeviceTemplate) =>
  normalizeText(template.DeviceName) || normalizeText(template.FullDeviceName);

/** Parse a date string (dd/mm/yyyy or yyyy-mm-dd) to ms timestamp, returns 0 if invalid. */
const getDateMs = (dateStr?: string): number => {
  if (!dateStr) return 0;
  const s = dateStr.trim();
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/');
    const ms = new Date(`${y}-${m}-${d}`).getTime();
    return isNaN(ms) ? 0 : ms;
  }
  const ms = new Date(s).getTime();
  return isNaN(ms) ? 0 : ms;
};

export function PlannedDeviceSuggestBox({
  diagnosisID,
  value,
  onChange,
  deviceTemplates = [],
  consults = [],
  label = 'Dụng cụ dự kiến',
  placeholder = 'Nhập chi tiết dụng cụ dự kiến đầy đủ...',
  rows = 2,
  required = false,
  textareaClassName = 'w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800 leading-normal',
  autoExpandOnMobile = true
}: PlannedDeviceSuggestBoxProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const normalizedDiagnosisID = normalizeDiagnosisID(diagnosisID);

  const suggestions = useMemo<PlannedDeviceSuggestion[]>(() => {
    if (!normalizedDiagnosisID) return [];

    // Use a Map keyed by lowercase value to deduplicate
    const map = new Map<string, PlannedDeviceSuggestion>();

    // 1. Templates from DeviceTemplate (no count limit, appear first)
    deviceTemplates
      .filter(template => normalizeDiagnosisID(template.DiagnosisID) === normalizedDiagnosisID)
      .forEach((template, index) => {
        const suggestionValue = getTemplateValue(template);
        const labelText = getTemplateLabel(template) || suggestionValue;
        const meta = [
          normalizeText(template.Size),
          normalizeText(template.Price),
          normalizeText(template.bhyt)
        ].filter(Boolean).join(' • ');

        const key = trimSentence(suggestionValue).toLowerCase();
        if (!key || map.has(key)) return;
        map.set(key, {
          key: `template-${index}-${labelText}`,
          value: suggestionValue,
          label: labelText,
          meta,
          source: 'template'
        });
      });

    // 2. History from consults – sort newest → oldest, cap at 10 unique history devices
    const sortedConsults = [...consults]
      .filter(c => normalizeDiagnosisID(c.DiagnosisID) === normalizedDiagnosisID && normalizeText(c.PlannedDevice))
      .sort((a, b) => {
        const dateA = getDateMs(a.PlannedCathLabDate || a.ConsultDate);
        const dateB = getDateMs(b.PlannedCathLabDate || b.ConsultDate);
        return dateB - dateA; // descending: newest first
      });

    let historyCount = 0;
    for (const consult of sortedConsults) {
      if (historyCount >= 10) break;
      const devices = normalizeText(consult.PlannedDevice)
        .split('.')
        .map(trimSentence)
        .filter(Boolean);

      for (const device of devices) {
        if (historyCount >= 10) break;
        const key = device.toLowerCase();
        if (!map.has(key)) {
          map.set(key, {
            key: `history-${historyCount}-${device}`,
            value: device,
            label: device,
            meta: 'Từ lịch sử cùng mã bệnh',
            source: 'history'
          });
          historyCount++;
        }
      }
    }

    return Array.from(map.values());
  }, [consults, deviceTemplates, normalizedDiagnosisID]);

  const appendSuggestion = (suggestionValue: string) => {
    onChange(appendSentence(value, suggestionValue));
  };

  const appendAllSuggestions = () => {
    const nextValue = suggestions.reduce(
      (current, suggestion) => appendSentence(current, suggestion.value),
      value
    );
    onChange(nextValue);
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-2 mb-1">
        {label ? (
          <label className="block text-slate-500 font-bold text-[9px] uppercase">
            {label}{required ? <span className="text-rose-500"> *</span> : null}
          </label>
        ) : (
          <span />
        )}
      </div>

      <div className="relative">
        {autoExpandOnMobile ? (
          <MobileAutoExpandTextarea
            minRows={rows}
            required={required}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={textareaClassName}
          />
        ) : (
          <textarea
            rows={rows}
            required={required}
            placeholder={placeholder}
            value={value}
            onChange={(event) => onChange(event.target.value)}
            className={textareaClassName}
          />
        )}
        <button
          type="button"
          onClick={() => setShowSuggestions(prev => !prev)}
          title="Gợi ý dụng cụ"
          className={`absolute bottom-2 right-2 w-7 h-7 rounded-full border shadow-sm flex items-center justify-center transition cursor-pointer ${
            showSuggestions
              ? 'bg-[#d2145a] border-[#d2145a] text-white'
              : 'bg-white/95 border-pink-200 text-[#d2145a] hover:bg-pink-50'
          }`}
        >
          <Wrench className="w-3.5 h-3.5" />
          {suggestions.length > 0 && (
            <span className="absolute -top-1 -right-1 min-w-4 h-4 px-1 rounded-full bg-indigo-600 text-white text-[8px] font-black leading-4">
              {suggestions.length}
            </span>
          )}
        </button>
      </div>

      {showSuggestions && (
        <div className="mt-2 rounded-2xl border border-pink-200 bg-pink-50/80 p-2 shadow-sm">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <span className="text-[9px] font-extrabold uppercase tracking-wider text-[#d2145a]">
              Gợi ý dụng cụ {normalizedDiagnosisID ? `(${normalizedDiagnosisID})` : ''}
            </span>
            <div className="flex items-center gap-2">
              {suggestions.length > 0 && (
                <button
                  type="button"
                  onClick={appendAllSuggestions}
                  className="text-[9px] font-extrabold text-indigo-700 hover:text-indigo-900 uppercase tracking-wide cursor-pointer"
                >
                  Điền tất cả
                </button>
              )}
              <button
                type="button"
                onClick={() => setShowSuggestions(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Đóng gợi ý"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          {suggestions.length > 0 ? (
            <div className="max-h-32 overflow-y-auto space-y-1 pr-1">
              {suggestions.map((suggestion) => (
                <button
                  key={suggestion.key}
                  type="button"
                  onClick={() => appendSuggestion(suggestion.value)}
                  className="w-full text-left bg-white hover:bg-pink-100 border border-pink-100 hover:border-pink-300 rounded-xl px-2.5 py-1.5 transition cursor-pointer"
                >
                  <span className="block text-[10.5px] font-extrabold text-slate-800 leading-snug">
                    {suggestion.label}
                  </span>
                  <span className="block text-[9px] font-semibold text-slate-400 leading-snug">
                    {suggestion.meta || (suggestion.source === 'template' ? 'Từ bảng DeviceTemplate' : 'Từ lịch sử cùng mã bệnh')}
                  </span>
                </button>
              ))}
            </div>
          ) : (
            <div className="text-[10px] text-slate-400 italic py-1">
              Chưa có gợi ý dụng cụ cho mã bệnh này.
            </div>
          )}
        </div>
      )}
    </div>
  );
}
