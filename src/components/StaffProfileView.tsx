import React, { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  Mail,
  Phone,
  Shield,
  User,
  X,
} from 'lucide-react';
import type { CathLab, Consult, Operation, Staff } from '../types';
import { VNDateInput } from './VNDateInput';
import {
  ActivityDateFilter,
  ActivityMetricResult,
  ActivityPeriodPreset,
  StaffActivityMetrics,
  computeStaffActivityMetrics,
} from '../utils/staffActivityStats';
import { getStaffInitial } from '../utils/staffNameMatch';

interface StaffProfileViewProps {
  staff: Staff;
  staffList: Staff[];
  consults: Consult[];
  cathlabs: CathLab[];
  operations: Operation[];
  onClose?: () => void;
}

const PERIOD_OPTIONS: { id: ActivityPeriodPreset; label: string }[] = [
  { id: 'all', label: 'Tất cả' },
  { id: 'month', label: 'Theo tháng' },
  { id: 'quarter', label: 'Theo quý' },
  { id: 'year', label: 'Theo năm' },
];

const METRIC_CARDS: {
  metricKey: keyof StaffActivityMetrics;
  title: string;
  accent: string;
  border: string;
  valueColor: string;
}[] = [
  {
    metricKey: 'consultRegistered',
    title: 'Số ca hội chẩn',
    accent: 'bg-emerald-50',
    border: 'border-emerald-100',
    valueColor: 'text-emerald-950',
  },
  {
    metricKey: 'ptvMain',
    title: 'Số ca PTV chính',
    accent: 'bg-blue-50',
    border: 'border-blue-100',
    valueColor: 'text-blue-950',
  },
  {
    metricKey: 'ptvAssistant',
    title: 'Số ca PTV phụ',
    accent: 'bg-violet-50',
    border: 'border-violet-100',
    valueColor: 'text-violet-950',
  },
];

function ActivityMetricRow({
  title,
  metric,
  accent,
  border,
  valueColor,
}: {
  title: string;
  metric: ActivityMetricResult;
  accent: string;
  border: string;
  valueColor: string;
}) {
  const maxValue = Math.max(...metric.chartData.map(point => point.value), 1);

  return (
    <div className="grid grid-cols-1 xl:grid-cols-[220px_minmax(0,1fr)] gap-3">
      <div className={`rounded-2xl border ${border} ${accent} p-4 shadow-sm relative overflow-hidden min-h-[110px] flex flex-col justify-between`}>
        <div className="absolute top-2 right-2 opacity-[0.08]">
          <Activity className="w-12 h-12" />
        </div>
        <span className="text-[10px] font-black uppercase text-slate-500 tracking-tight relative z-10">{title}</span>
        <p className={`text-4xl font-black font-mono leading-none mt-2 relative z-10 ${valueColor}`}>{metric.total}</p>
      </div>

      <div className="rounded-2xl border border-slate-150 bg-white p-3 shadow-sm min-h-[110px] flex items-end">
        <div className="flex-1 flex items-end justify-around h-[88px] px-1">
          {metric.chartData.map(point => {
            const percentage = Math.max((point.value / maxValue) * 100, point.value > 0 ? 6 : 0);
            return (
              <div key={point.key} className="flex flex-col items-center justify-end h-full group relative flex-1 max-w-[28px]">
                <div className="absolute bottom-full mb-1 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-800 text-white font-mono text-[9px] font-black px-1.5 py-0.5 rounded shadow-lg pointer-events-none z-50 whitespace-nowrap">
                  {point.value} ca
                </div>
                <div className="w-2.5 bg-slate-50 rounded-t-md relative overflow-hidden flex-1 flex items-end">
                  <motion.div
                    initial={{ height: 0 }}
                    animate={{ height: `${percentage}%` }}
                    transition={{ duration: 0.6, ease: 'easeOut' }}
                    className="w-full bg-gradient-to-t from-pink-500 to-[#d2145a] rounded-t-md"
                  />
                </div>
                <span className="text-[8px] font-black text-slate-400 font-mono mt-1 truncate max-w-full">
                  {point.label.length > 5 ? point.label.slice(0, 5) : point.label}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

export default function StaffProfileView({
  staff,
  staffList,
  consults,
  cathlabs,
  operations,
  onClose,
}: StaffProfileViewProps) {
  const now = new Date();
  const [filter, setFilter] = useState<ActivityDateFilter>({
    preset: 'year',
    year: now.getFullYear() !== 2026 ? 2026 : now.getFullYear(),
    month: now.getMonth() + 1,
    quarter: Math.floor(now.getMonth() / 3) + 1,
    useCustomRange: false,
  });
  const [showCustomPicker, setShowCustomPicker] = useState(false);
  const [customFrom, setCustomFrom] = useState('2026-01-01');
  const [customTo, setCustomTo] = useState('2026-12-31');

  const activeFilter = useMemo<ActivityDateFilter>(
    () => ({
      ...filter,
      customFrom: showCustomPicker ? customFrom : undefined,
      customTo: showCustomPicker ? customTo : undefined,
      useCustomRange: showCustomPicker,
    }),
    [filter, showCustomPicker, customFrom, customTo]
  );

  const metrics = useMemo(
    () => computeStaffActivityMetrics(staff, staffList, consults, cathlabs, operations, activeFilter),
    [staff, staffList, consults, cathlabs, operations, activeFilter]
  );

  const initial = getStaffInitial(staff);
  const avatarUrl = String(staff.Avatar || '').trim();

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 animate-in fade-in duration-300">
      <div className="shrink-0 flex items-center justify-between gap-3 px-1 pb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#d2145a] mb-1">Hồ sơ cá nhân</p>
          <h2 className="text-xl font-extrabold text-slate-900">Profile · {staff.StaffName}</h2>
        </div>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl border border-slate-200 bg-white text-slate-500 hover:text-[#d2145a] hover:border-pink-200 transition"
            title="Quay lại"
          >
            <X className="w-4 h-4" />
          </button>
        )}
      </div>

      <div className="flex-1 min-h-0 grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_320px] gap-4 overflow-y-auto pr-1">
        <div className="space-y-4 min-w-0">
          <div className="bg-white border border-slate-150 rounded-3xl p-4 shadow-sm">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3 mb-4">
              <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                <Activity className="w-4 h-4 text-[#d2145a]" />
                Thống kê hoạt động
              </h3>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowCustomPicker(prev => !prev)}
                  className={`px-3 py-1.5 rounded-xl text-[11px] font-bold border transition ${
                    showCustomPicker
                      ? 'bg-pink-50 border-pink-200 text-[#d2145a]'
                      : 'bg-white border-slate-200 text-slate-600 hover:border-pink-200'
                  }`}
                >
                  <CalendarDays className="w-3.5 h-3.5 inline mr-1 -mt-0.5" />
                  Tùy chọn
                </button>

                <div className="relative">
                  <select
                    value={filter.preset}
                    onChange={e => {
                      setShowCustomPicker(false);
                      setFilter(prev => ({ ...prev, preset: e.target.value as ActivityPeriodPreset }));
                    }}
                    className="appearance-none pl-3 pr-8 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 bg-white text-slate-700 focus:outline-none focus:border-pink-300"
                  >
                    {PERIOD_OPTIONS.map(option => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                  <ChevronDown className="w-3.5 h-3.5 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                </div>

                {(filter.preset === 'year' || filter.preset === 'month' || filter.preset === 'quarter') && !showCustomPicker && (
                  <div className="flex items-center border border-slate-100 rounded-lg bg-slate-50 p-0.5">
                    <button
                      type="button"
                      onClick={() => setFilter(prev => ({ ...prev, year: prev.year + 1 }))}
                      className="text-slate-400 hover:text-[#d2145a] p-0.5"
                    >
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-extrabold font-mono text-[#d2145a] px-2">{filter.year}</span>
                    <button
                      type="button"
                      onClick={() => setFilter(prev => ({ ...prev, year: prev.year - 1 }))}
                      className="text-slate-400 hover:text-[#d2145a] p-0.5"
                    >
                      <ChevronDown className="w-3 h-3" />
                    </button>
                  </div>
                )}

                {filter.preset === 'month' && !showCustomPicker && (
                  <select
                    value={filter.month}
                    onChange={e => setFilter(prev => ({ ...prev, month: Number(e.target.value) }))}
                    className="px-2 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 bg-white"
                  >
                    {Array.from({ length: 12 }, (_, idx) => idx + 1).map(month => (
                      <option key={month} value={month}>
                        Tháng {month}
                      </option>
                    ))}
                  </select>
                )}

                {filter.preset === 'quarter' && !showCustomPicker && (
                  <select
                    value={filter.quarter}
                    onChange={e => setFilter(prev => ({ ...prev, quarter: Number(e.target.value) }))}
                    className="px-2 py-1.5 rounded-xl text-[11px] font-bold border border-slate-200 bg-white"
                  >
                    {[1, 2, 3, 4].map(quarter => (
                      <option key={quarter} value={quarter}>
                        Quý {quarter}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {showCustomPicker && (
              <div className="mb-4 rounded-2xl border border-pink-100 bg-pink-50/40 p-3 grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-slate-500">Từ ngày</span>
                  <VNDateInput value={customFrom} onChange={setCustomFrom} className="mt-1 w-full" />
                </label>
                <label className="block">
                  <span className="text-[10px] font-black uppercase text-slate-500">Đến ngày</span>
                  <VNDateInput value={customTo} onChange={setCustomTo} className="mt-1 w-full" />
                </label>
              </div>
            )}

            <div className="space-y-4">
              {METRIC_CARDS.map(({ metricKey, title, accent, border, valueColor }) => (
                <React.Fragment key={metricKey}>
                  <ActivityMetricRow
                    title={title}
                    metric={metrics[metricKey]}
                    accent={accent}
                    border={border}
                    valueColor={valueColor}
                  />
                </React.Fragment>
              ))}
            </div>
          </div>
        </div>

        <div className="xl:sticky xl:top-0 h-fit">
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm">
            <div className="flex flex-col items-center text-center">
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt={staff.StaffName}
                  className="w-28 h-28 rounded-3xl object-cover border-4 border-pink-50 shadow-sm"
                />
              ) : (
                <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-pink-500 to-[#d2145a] text-white flex items-center justify-center text-4xl font-black shadow-sm">
                  {initial}
                </div>
              )}
              <h3 className="mt-4 text-lg font-extrabold text-slate-900">{staff.StaffName}</h3>
              {staff.Name && staff.Name !== staff.StaffName && (
                <p className="text-xs font-semibold text-slate-500">{staff.Name}</p>
              )}
              <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-50 text-[#d2145a] text-[10px] font-black uppercase">
                <Shield className="w-3 h-3" />
                {staff.Role}
              </span>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
              <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Thông tin hành chính</p>

              <div className="flex items-start gap-2 text-xs">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Mã nhân viên</p>
                  <p className="font-extrabold text-slate-800 font-mono">{staff.StaffKey}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <Shield className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Khoa / Phòng ban</p>
                  <p className="font-bold text-slate-800">{staff.Department || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <Activity className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Chức danh</p>
                  <p className="font-bold text-slate-800">{staff.Career || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <CalendarDays className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Ngày sinh</p>
                  <p className="font-bold text-slate-800">{staff.StaffDOB || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <User className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Giới tính</p>
                  <p className="font-bold text-slate-800">{staff.StaffSex || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <Mail className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Email</p>
                  <p className="font-bold text-slate-800 break-all">{staff.Email || '—'}</p>
                </div>
              </div>

              <div className="flex items-start gap-2 text-xs">
                <Phone className="w-4 h-4 text-slate-400 shrink-0 mt-0.5" />
                <div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase">Số điện thoại</p>
                  <p className="font-bold text-slate-800">{staff.StaffPhone || '—'}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
