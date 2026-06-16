import { useMemo, useState } from 'react';
import { Wrench, X } from 'lucide-react';
import type { Consult, DeviceTemplate } from '../types';
import { normalizeDiagnosisID } from '../data/source';

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
  textareaClassName = 'w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800 leading-normal resize-y'
}: PlannedDeviceSuggestBoxProps) {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const normalizedDiagnosisID = normalizeDiagnosisID(diagnosisID);

  const suggestions = useMemo<PlannedDeviceSuggestion[]>(() => {
    if (!normalizedDiagnosisID) return [];

    const map = new Map<string, PlannedDeviceSuggestion>();
    const addSuggestion = (suggestion: PlannedDeviceSuggestion) => {
      const normalizedValue = trimSentence(suggestion.value).toLowerCase();
      if (!normalizedValue || map.has(normalizedValue)) return;
      map.set(normalizedValue, suggestion);
    };

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

        addSuggestion({
          key: `template-${index}-${labelText}`,
          value: suggestionValue,
          label: labelText,
          meta,
          source: 'template'
        });
      });

    consults
      .filter(consult => normalizeDiagnosisID(consult.DiagnosisID) === normalizedDiagnosisID)
      .flatMap(consult => normalizeText(consult.PlannedDevice).split('.'))
      .map(trimSentence)
      .filter(Boolean)
      .forEach((device, index) => {
        addSuggestion({
          key: `history-${index}-${device}`,
          value: device,
          label: device,
          meta: 'Từ lịch sử cùng mã bệnh',
          source: 'history'
        });
      });

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
        <textarea
          rows={rows}
          required={required}
          placeholder={placeholder}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          className={textareaClassName}
        />
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
