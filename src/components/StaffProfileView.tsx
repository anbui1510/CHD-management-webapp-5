import React, { useEffect, useMemo, useRef, useState } from 'react';
import { motion } from 'motion/react';
import {
  Activity,
  AlertTriangle,
  Award,
  BellRing,
  CalendarDays,
  Camera,
  ChevronDown,
  ChevronUp,
  Clock,
  Mail,
  Pencil,
  Phone,
  Save,
  Shield,
  User,
  X,
} from 'lucide-react';
import type { CathLab, Consult, DoctorPerformanceMark, Operation, Patient, Staff } from '../types';
import { formatVNTime } from '../types';
import { useSheetsSyncFeedback } from '../context/SheetsSyncFeedbackContext';
import { buildSyncContext, persistWithSheetsSync } from '../utils/sheetsSyncMutation';
import { DateFieldWithCalendar, DateRangePickerPopover } from './MiniCalendarPopup';
import {
  ActivityDateFilter,
  ActivityMetricResult,
  ActivityPeriodPreset,
  StaffActivityMetrics,
  computeStaffActivityMetrics,
  resolveActivityRange,
} from '../utils/staffActivityStats';
import { getStaffInitial } from '../utils/staffNameMatch';

const isEqualStaffKey = (keyA: any, keyB: any): boolean => {
  if (!keyA || !keyB) return false;
  return String(keyA).trim().replace(/^0+/, '') === String(keyB).trim().replace(/^0+/, '');
};

interface StaffProfileViewProps {
  staff: Staff;
  staffList: Staff[];
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  operations: Operation[];
  doctorPerformanceMarks?: DoctorPerformanceMark[];
  onClose?: () => void;
  onStaffUpdated?: (updated: Staff) => void;
  triggerAlert?: (message: string, title?: string) => void;
  webPush?: {
    supported: boolean;
    configured: boolean;
    subscribed: boolean;
    permission: NotificationPermission;
    loading: boolean;
    error: string;
    enablePush: () => Promise<boolean>;
    disablePush: () => Promise<void>;
    resetDismiss: () => void;
  };
}

type AdminDraft = Pick<
  Staff,
  | 'StaffName'
  | 'Name'
  | 'Department'
  | 'Career'
  | 'StaffDOB'
  | 'StaffSex'
  | 'Email'
  | 'StaffPhone'
  | 'Avatar'
  | 'Password'
>;

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

function resolveAvatarUrl(avatar?: string): string {
  const raw = String(avatar || '').trim();
  if (!raw) return '';
  if (raw.startsWith('http://') || raw.startsWith('https://') || raw.startsWith('data:')) return raw;
  return `/${raw.replace(/^\//, '')}`;
}

function toAdminDraft(staff: Staff): AdminDraft {
  return {
    StaffName: staff.StaffName || '',
    Name: staff.Name || '',
    Department: staff.Department || '',
    Career: staff.Career || '',
    StaffDOB: staff.StaffDOB || '',
    StaffSex: staff.StaffSex || '',
    Email: staff.Email || '',
    StaffPhone: staff.StaffPhone || '',
    Avatar: staff.Avatar || '',
    Password: staff.Password || '',
  };
}

function parseDateKey(raw: string | undefined): string {
  const trimmed = String(raw || '').trim().split('T')[0];
  if (!trimmed) return '';
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;
  const parts = trimmed.split('/');
  if (parts.length === 3 && parts[2].length === 4) {
    return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
  }
  return trimmed;
}

function dateInRange(dateKey: string, from: string, to: string): boolean {
  if (!dateKey) return false;
  if (from && dateKey < from) return false;
  if (to && dateKey > to) return false;
  return true;
}

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
                    className="w-full bg-[#d2145a] rounded-t-md"
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
  patients,
  consults,
  cathlabs,
  operations,
  doctorPerformanceMarks = [],
  onClose,
  onStaffUpdated,
  triggerAlert,
  webPush,
}: StaffProfileViewProps) {
  const { reportMutationResponse } = useSheetsSyncFeedback();
  const now = new Date();
  const [profileStaff, setProfileStaff] = useState<Staff>(staff);
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
  const [isEditingAdmin, setIsEditingAdmin] = useState(false);
  const [adminDraft, setAdminDraft] = useState<AdminDraft>(() => toAdminDraft(staff));
  const [saving, setSaving] = useState(false);
  const avatarInputRef = useRef<HTMLInputElement>(null);

  const [showPassword, setShowPassword] = useState(false);
  const [showEditPassword, setShowEditPassword] = useState(false);
  const [sessionTimeout, setSessionTimeout] = useState<string>(() => {
    return localStorage.getItem(`SessionTimeout_${staff.StaffKey}`) || '30';
  });

  useEffect(() => {
    setProfileStaff(staff);
    setAdminDraft(toAdminDraft(staff));
    setIsEditingAdmin(false);
    setShowPassword(false);
    setShowEditPassword(false);
    setSessionTimeout(localStorage.getItem(`SessionTimeout_${staff.StaffKey}`) || '30');
  }, [staff]);

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
    () => computeStaffActivityMetrics(profileStaff, staffList, consults, cathlabs, operations, activeFilter),
    [profileStaff, staffList, consults, cathlabs, operations, activeFilter]
  );

  const filteredMarks = useMemo(() => {
    const range = resolveActivityRange(activeFilter);
    return doctorPerformanceMarks
      .filter(mark => isEqualStaffKey(mark.StaffKey, profileStaff.StaffKey))
      .filter(mark => dateInRange(parseDateKey(mark.CreatedTime), range.from, range.to))
      .sort((a, b) => String(b.CreatedTime || '').localeCompare(String(a.CreatedTime || '')));
  }, [doctorPerformanceMarks, profileStaff.StaffKey, activeFilter]);

  const totalMarkScore = filteredMarks.reduce((sum, mark) => sum + Number(mark.Score || 1), 0);

  const getMarkPatientContext = (mark: DoctorPerformanceMark) => {
    const relatedConsult = consults.find(consult =>
      String(consult.ConsultKey || '') === String(mark.RelatedEntityKey || '') ||
      String(consult.PatientKey || '') === String(mark.PatientKey || '')
    );
    const patient = patients.find(item =>
      String(item.PatientKey || '') === String(mark.PatientKey || '') ||
      String(item.PatientID1 || '') === String(mark.PatientID || '') ||
      String(item.PatientID2 || '') === String(mark.PatientID || '')
    );

    return {
      patientName: mark.PatientName || patient?.PatientName || patient?.OtherPatientName || '',
      patientId: mark.PatientID || patient?.PatientID1 || '',
      diagnosisID: relatedConsult?.DiagnosisID || ''
    };
  };

  const getMarkPatientLabel = (mark: DoctorPerformanceMark) => {
    const context = getMarkPatientContext(mark);
    const patientName = String(context.patientName || '').trim().toUpperCase();
    const diagnosisID = String(context.diagnosisID || '').trim();
    if (patientName && diagnosisID) return `BN ${patientName} - ${diagnosisID}`;
    if (patientName) return `BN ${patientName}`;
    if (context.patientId) return `BN ${context.patientId}`;
    return '';
  };

  const formatMarkReason = (mark: DoctorPerformanceMark) => {
    const patientLabel = getMarkPatientLabel(mark);
    if (!patientLabel) return mark.Reason;

    const rawReason = String(mark.Reason || '').trim();
    if (!rawReason) return patientLabel;

    const context = getMarkPatientContext(mark);
    const patientTokens = [
      context.patientId,
      context.patientName,
      mark.PatientID,
      mark.PatientName,
      mark.PatientKey
    ].map(value => String(value || '').trim()).filter(Boolean);

    for (const token of patientTokens) {
      const pattern = new RegExp(`^BN\\s+${token.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`, 'i');
      if (pattern.test(rawReason)) {
        return rawReason.replace(pattern, patientLabel);
      }
    }

    return rawReason.startsWith('BN ') ? rawReason : `${patientLabel} ${rawReason}`;
  };

  const initial = getStaffInitial(profileStaff);
  const avatarUrl = resolveAvatarUrl(profileStaff.Avatar);

  const handleSaveProfile = async () => {
    setSaving(true);
    try {
      const updated = await persistWithSheetsSync<Staff>(
        reportMutationResponse,
        `/api/staff/${encodeURIComponent(profileStaff.StaffKey)}`,
        {
          method: 'PUT',
          body: JSON.stringify({
            StaffName: adminDraft.StaffName?.trim(),
            Name: adminDraft.Name?.trim() || '',
            Department: adminDraft.Department?.trim() || '',
            Career: adminDraft.Career?.trim() || '',
            StaffDOB: adminDraft.StaffDOB || '',
            StaffSex: adminDraft.StaffSex || '',
            Email: adminDraft.Email?.trim() || '',
            StaffPhone: adminDraft.StaffPhone?.trim() || '',
            Avatar: adminDraft.Avatar || '',
            Password: adminDraft.Password?.trim() || '',
          })
        },
        buildSyncContext('profile', { viewLabel: 'Hồ sơ cá nhân' }),
        { baseMessage: 'Đã cập nhật thông tin hành chính' }
      );

      localStorage.setItem(`SessionTimeout_${profileStaff.StaffKey}`, sessionTimeout);
      window.dispatchEvent(new Event('storage'));

      setProfileStaff(updated);
      setAdminDraft(toAdminDraft(updated));
      setIsEditingAdmin(false);
      onStaffUpdated?.(updated);
    } catch (error) {
      triggerAlert?.(error instanceof Error ? error.message : 'Lỗi khi lưu hồ sơ', 'Lỗi');
    } finally {
      setSaving(false);
    }
  };

  const handleAvatarFile = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      triggerAlert?.('Vui lòng chọn file ảnh (JPG, PNG, WEBP...).', 'Không hợp lệ');
      return;
    }
    if (file.size > 1024 * 1024) {
      triggerAlert?.('Ảnh quá lớn. Vui lòng chọn file dưới 1MB.', 'Không hợp lệ');
      return;
    }

    const reader = new FileReader();
    reader.onload = async () => {
      const dataUrl = String(reader.result || '');
      const nextDraft = { ...adminDraft, Avatar: dataUrl };
      setAdminDraft(nextDraft);
      setProfileStaff(prev => ({ ...prev, Avatar: dataUrl }));

      setSaving(true);
      try {
        const updated = await persistWithSheetsSync<Staff>(
          reportMutationResponse,
          `/api/staff/${encodeURIComponent(profileStaff.StaffKey)}`,
          { method: 'PUT', body: JSON.stringify({ Avatar: dataUrl }) },
          buildSyncContext('profile', { viewLabel: 'Hồ sơ cá nhân' }),
          { baseMessage: 'Đã cập nhật avatar' }
        );
        setProfileStaff(updated);
        setAdminDraft(toAdminDraft(updated));
        onStaffUpdated?.(updated);
      } catch (error) {
        triggerAlert?.(error instanceof Error ? error.message : 'Lỗi khi lưu avatar', 'Lỗi');
      } finally {
        setSaving(false);
      }
    };
    reader.readAsDataURL(file);
    event.target.value = '';
  };

  const cancelAdminEdit = () => {
    setAdminDraft(toAdminDraft(profileStaff));
    setIsEditingAdmin(false);
  };

  const pushStatusLabel = (() => {
    if (!webPush) return '';
    if (!webPush.supported) return 'Thiết bị hoặc trình duyệt không hỗ trợ push';
    if (webPush.permission === 'denied') return 'Đã chặn — bật lại trong Cài đặt iOS → Thông báo';
    if (!webPush.configured) return 'Server chưa cấu hình push (VAPID)';
    if (webPush.subscribed) return 'Đang bật — nhận alert màn hình khóa';
    if (webPush.permission === 'granted') return 'Đã cho phép nhưng chưa đăng ký thiết bị';
    return 'Chưa bật';
  })();

  const canEnablePush = !!webPush
    && webPush.supported
    && webPush.configured
    && webPush.permission !== 'denied'
    && !webPush.subscribed;

  const canDisablePush = !!webPush && webPush.subscribed;

  return (
    <div className="h-full flex flex-col overflow-hidden bg-slate-50 animate-in fade-in duration-300">
      <div className="shrink-0 flex items-center justify-between gap-3 px-1 pb-3">
        <div>
          <p className="text-[10px] font-black uppercase tracking-wider text-[#d2145a] mb-1">Hồ sơ cá nhân</p>
          <h2 className="text-xl font-extrabold text-slate-900">Profile · {profileStaff.StaffName}</h2>
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
                <DateRangePickerPopover
                  from={customFrom}
                  to={customTo}
                  active={showCustomPicker}
                  onToggle={() => setShowCustomPicker(prev => !prev)}
                  onChange={({ from, to }) => {
                    setCustomFrom(from);
                    setCustomTo(to);
                    setShowCustomPicker(true);
                  }}
                />

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
                    <button type="button" onClick={() => setFilter(prev => ({ ...prev, year: prev.year + 1 }))} className="text-slate-400 hover:text-[#d2145a] p-0.5">
                      <ChevronUp className="w-3 h-3" />
                    </button>
                    <span className="text-[10px] font-extrabold font-mono text-[#d2145a] px-2">{filter.year}</span>
                    <button type="button" onClick={() => setFilter(prev => ({ ...prev, year: prev.year - 1 }))} className="text-slate-400 hover:text-[#d2145a] p-0.5">
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
                      <option key={month} value={month}>Tháng {month}</option>
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
                      <option key={quarter} value={quarter}>Quý {quarter}</option>
                    ))}
                  </select>
                )}
              </div>
            </div>

            {showCustomPicker && customFrom && customTo && (
              <div className="mb-4 rounded-2xl border border-pink-100 bg-pink-50/40 px-3 py-2 text-[10px] font-bold text-[#d2145a]">
                Đang lọc: {formatVNTime(customFrom)} → {formatVNTime(customTo)}
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

          <div className="bg-white border border-red-100 rounded-3xl p-4 shadow-sm">
            <div className="flex items-start justify-between gap-3 mb-3">
              <div>
                <h3 className="font-extrabold text-sm text-slate-800 flex items-center gap-2">
                  <Award className="w-4 h-4 text-red-500" />
                  Sẹo workflow
                </h3>
                <p className="text-[10px] font-bold text-slate-400 mt-1">Các điểm không hoàn thành được hệ thống ghi nhận tự động.</p>
              </div>
              <div className="rounded-2xl bg-red-50 border border-red-100 px-4 py-2 text-center">
                <p className="text-[9px] font-black uppercase text-red-400">Tổng sẹo</p>
                <p className="text-2xl font-black font-mono text-red-700">{totalMarkScore}</p>
              </div>
            </div>

            {filteredMarks.length === 0 ? (
              <div className="rounded-2xl border border-slate-100 bg-slate-50 px-3 py-4 text-xs font-bold text-slate-400 text-center">
                Không có sẹo workflow trong kỳ đang xem.
              </div>
            ) : (
              <div className="overflow-hidden rounded-2xl border border-red-50">
                <div className="max-h-[520px] overflow-y-auto">
                  <table className="w-full text-left text-[11px]">
                    <thead className="sticky top-0 z-10 bg-red-50 text-[9px] uppercase tracking-wider text-red-500">
                      <tr>
                        <th className="px-3 py-2 font-black w-44">Lỗi</th>
                        <th className="px-3 py-2 font-black">Nội dung</th>
                        <th className="px-3 py-2 font-black w-24">Ngày</th>
                        <th className="px-3 py-2 font-black text-right w-12">Điểm</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-red-50">
                      {filteredMarks.map(mark => (
                        <tr key={mark.MarkKey} className="bg-red-50/30 hover:bg-red-50/70 transition">
                          <td className="px-3 py-2 align-top">
                            <div className="flex items-start gap-1.5">
                              <AlertTriangle className="w-3.5 h-3.5 text-red-500 shrink-0 mt-0.5" />
                              <span className="font-black text-slate-800 leading-snug">{mark.Label}</span>
                            </div>
                          </td>
                          <td className="px-3 py-2 align-top font-semibold text-slate-650 leading-snug">
                            {formatMarkReason(mark)}
                          </td>
                          <td className="px-3 py-2 align-top font-mono font-bold text-slate-400 whitespace-nowrap">
                            {formatVNTime(mark.CreatedTime)}
                          </td>
                          <td className="px-3 py-2 align-top text-right font-mono font-black text-red-700">
                            -{Number(mark.Score || 1)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="xl:sticky xl:top-0 h-fit">
          <div className="bg-white border border-slate-150 rounded-3xl p-5 shadow-sm">
            <div className="flex flex-col items-center text-center">
              <div className="relative group">
                {avatarUrl ? (
                  <img
                    src={avatarUrl}
                    alt={profileStaff.StaffName}
                    className="w-28 h-28 rounded-3xl object-cover border-4 border-pink-50 shadow-sm"
                  />
                ) : (
                  <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-pink-500 to-[#d2145a] text-white flex items-center justify-center text-4xl font-black shadow-sm">
                    {initial}
                  </div>
                )}
                <button
                  type="button"
                  onClick={() => avatarInputRef.current?.click()}
                  className="absolute -bottom-1 -right-1 w-9 h-9 rounded-2xl bg-white border border-pink-200 text-[#d2145a] shadow-md flex items-center justify-center hover:bg-pink-50 transition"
                  title="Thay avatar"
                >
                  <Camera className="w-4 h-4" />
                </button>
                <input
                  ref={avatarInputRef}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={handleAvatarFile}
                />
              </div>
              <p className="mt-2 text-[10px] font-bold text-slate-400">Bấm biểu tượng máy ảnh để đổi avatar</p>

              <h3 className="mt-3 text-lg font-extrabold text-slate-900">{profileStaff.StaffName}</h3>
              {(profileStaff.Name || adminDraft.Name) && (
                <p className="text-xs font-semibold text-slate-500">{profileStaff.Name || adminDraft.Name}</p>
              )}
              <span className="mt-2 inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-pink-50 text-[#d2145a] text-[10px] font-black uppercase">
                <Shield className="w-3 h-3" />
                {profileStaff.Role}
              </span>
            </div>

            <div className="mt-5 pt-5 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[10px] font-black uppercase tracking-wider text-slate-400">Thông tin hành chính</p>
                {!isEditingAdmin ? (
                  <button
                    type="button"
                    onClick={() => setIsEditingAdmin(true)}
                    className="text-[10px] font-bold px-2.5 py-1 rounded-lg border border-slate-200 text-slate-600 hover:border-pink-200 hover:text-[#d2145a] inline-flex items-center gap-1 transition"
                  >
                    <Pencil className="w-3 h-3" /> Sửa
                  </button>
                ) : (
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={cancelAdminEdit}
                      className="text-[10px] font-bold px-2 py-1 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleSaveProfile}
                      disabled={saving}
                      className="text-[10px] font-bold px-2.5 py-1 rounded-lg bg-[#d2145a] text-white hover:bg-[#b8124e] inline-flex items-center gap-1 disabled:opacity-60"
                    >
                      <Save className="w-3 h-3" />
                      {saving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                  </div>
                )}
              </div>

              {!isEditingAdmin ? (
                <>
                  <AdminInfoRow icon={<User className="w-4 h-4" />} label="Mã nhân viên" value={profileStaff.StaffKey} mono />
                  <AdminInfoRow icon={<Shield className="w-4 h-4" />} label="Khoa / Phòng ban" value={profileStaff.Department || '—'} />
                  <AdminInfoRow icon={<Activity className="w-4 h-4" />} label="Chức danh" value={profileStaff.Career || '—'} />
                  <AdminInfoRow icon={<CalendarDays className="w-4 h-4" />} label="Ngày sinh" value={profileStaff.StaffDOB ? formatVNTime(profileStaff.StaffDOB) : '—'} />
                  <AdminInfoRow icon={<User className="w-4 h-4" />} label="Giới tính" value={profileStaff.StaffSex || '—'} />
                  <AdminInfoRow icon={<Mail className="w-4 h-4" />} label="Email" value={profileStaff.Email || '—'} breakAll />
                  <AdminInfoRow icon={<Phone className="w-4 h-4" />} label="Số điện thoại" value={profileStaff.StaffPhone || '—'} />
                  
                  {/* Mật khẩu đăng nhập row */}
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-slate-400 shrink-0 mt-0.5"><Shield className="w-4 h-4" /></span>
                    <div className="min-w-0 flex-1">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Mật khẩu đăng nhập</p>
                      <div className="flex items-center justify-between">
                        <p className="font-mono font-extrabold text-slate-800">
                          {showPassword ? profileStaff.Password : '••••••••'}
                        </p>
                        <button
                          type="button"
                          onClick={() => setShowPassword(!showPassword)}
                          className="text-[10px] font-bold text-indigo-600 hover:text-indigo-800 hover:underline"
                        >
                          {showPassword ? 'Ẩn' : 'Hiện'}
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Thời gian tự động đăng xuất row */}
                  <div className="flex items-start gap-2 text-xs">
                    <span className="text-slate-400 shrink-0 mt-0.5"><Clock className="w-4 h-4" /></span>
                    <div className="min-w-0">
                      <p className="text-[10px] font-bold text-slate-400 uppercase">Thời gian tự động đăng xuất</p>
                      <p className="font-bold text-slate-800">
                        {sessionTimeout === '1' ? '1 phút' :
                         sessionTimeout === '30' ? '30 phút' :
                         sessionTimeout === '60' ? '1 giờ' :
                         'Vô hạn (Không tự động đăng xuất)'}
                      </p>
                    </div>
                  </div>

                  {webPush && (
                    <div className="rounded-2xl border border-amber-100 bg-amber-50/60 p-3 space-y-2">
                      <div className="flex items-start gap-2">
                        <BellRing className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                        <div className="min-w-0 flex-1">
                          <p className="text-[10px] font-black uppercase text-amber-800">Thông báo điện thoại</p>
                          <p className="text-xs font-semibold text-amber-900 mt-0.5 leading-snug">{pushStatusLabel}</p>
                          {webPush.error && (
                            <p className="text-[10px] font-bold text-rose-700 mt-1">{webPush.error}</p>
                          )}
                        </div>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {canEnablePush && (
                          <button
                            type="button"
                            disabled={webPush.loading}
                            onClick={() => {
                              void webPush.enablePush().then(ok => {
                                if (ok) triggerAlert?.('Đã bật thông báo điện thoại', 'Thành công');
                              });
                            }}
                            className="px-3 py-1.5 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-[10px] font-black disabled:opacity-60"
                          >
                            {webPush.loading ? 'Đang bật...' : 'Bật thông báo'}
                          </button>
                        )}
                        {canDisablePush && (
                          <button
                            type="button"
                            disabled={webPush.loading}
                            onClick={() => { void webPush.disablePush(); }}
                            className="px-3 py-1.5 rounded-xl border border-amber-300 text-amber-900 text-[10px] font-bold hover:bg-amber-100 disabled:opacity-60"
                          >
                            {webPush.loading ? 'Đang tắt...' : 'Tắt thông báo'}
                          </button>
                        )}
                        {!webPush.subscribed && webPush.supported && webPush.permission !== 'denied' && (
                          <button
                            type="button"
                            onClick={webPush.resetDismiss}
                            className="px-3 py-1.5 rounded-xl border border-amber-200 text-amber-800 text-[10px] font-bold hover:bg-amber-100"
                          >
                            Hiện lại banner
                          </button>
                        )}
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <div className="space-y-3">
                  <AdminEditField label="Họ tên hiển thị" value={adminDraft.StaffName || ''} onChange={value => setAdminDraft(prev => ({ ...prev, StaffName: value }))} />
                  <AdminEditField label="Tên ngắn / BS." value={adminDraft.Name || ''} onChange={value => setAdminDraft(prev => ({ ...prev, Name: value }))} />
                  <AdminEditField label="Khoa / Phòng ban" value={adminDraft.Department || ''} onChange={value => setAdminDraft(prev => ({ ...prev, Department: value }))} />
                  <AdminEditField label="Chức danh" value={adminDraft.Career || ''} onChange={value => setAdminDraft(prev => ({ ...prev, Career: value }))} />
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Ngày sinh</span>
                    <DateFieldWithCalendar
                      label=""
                      value={adminDraft.StaffDOB || ''}
                      onChange={value => setAdminDraft(prev => ({ ...prev, StaffDOB: value }))}
                    />
                  </div>
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Giới tính</span>
                    <select
                      value={adminDraft.StaffSex || ''}
                      onChange={e => setAdminDraft(prev => ({ ...prev, StaffSex: e.target.value }))}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white"
                    >
                      <option value="">—</option>
                      <option value="Nam">Nam</option>
                      <option value="Nữ">Nữ</option>
                    </select>
                  </label>
                  <AdminEditField label="Email" value={adminDraft.Email || ''} onChange={value => setAdminDraft(prev => ({ ...prev, Email: value }))} />
                  <AdminEditField label="Số điện thoại" value={adminDraft.StaffPhone || ''} onChange={value => setAdminDraft(prev => ({ ...prev, StaffPhone: value }))} />
                  <AdminEditField label="Link avatar (tuỳ chọn)" value={adminDraft.Avatar?.startsWith('data:') ? '' : (adminDraft.Avatar || '')} onChange={value => setAdminDraft(prev => ({ ...prev, Avatar: value }))} placeholder="https://... hoặc NV_Images/..." />
                  
                  {/* Mật khẩu đăng nhập edit field */}
                  <div className="relative">
                    <AdminEditField
                      label="Mật khẩu đăng nhập"
                      value={adminDraft.Password || ''}
                      onChange={value => setAdminDraft(prev => ({ ...prev, Password: value }))}
                      placeholder="Để trống để giữ nguyên mật khẩu cũ"
                      type={showEditPassword ? 'text' : 'password'}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPassword(!showEditPassword)}
                      className="absolute right-3 bottom-2 text-[10px] font-bold text-indigo-600 hover:text-indigo-800"
                    >
                      {showEditPassword ? 'Ẩn' : 'Hiện'}
                    </button>
                  </div>

                  {/* Thời gian tự động đăng xuất select field */}
                  <label className="block">
                    <span className="text-[10px] font-bold text-slate-400 uppercase">Thời gian tự động đăng xuất</span>
                    <select
                      value={sessionTimeout}
                      onChange={e => setSessionTimeout(e.target.value)}
                      className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold bg-white"
                    >
                      <option value="1">1 phút</option>
                      <option value="30">30 phút</option>
                      <option value="60">1 giờ</option>
                      <option value="unlimit">Vô hạn (Không tự động đăng xuất)</option>
                    </select>
                  </label>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function AdminInfoRow({
  icon,
  label,
  value,
  mono,
  breakAll,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  mono?: boolean;
  breakAll?: boolean;
}) {
  return (
    <div className="flex items-start gap-2 text-xs">
      <span className="text-slate-400 shrink-0 mt-0.5">{icon}</span>
      <div className="min-w-0">
        <p className="text-[10px] font-bold text-slate-400 uppercase">{label}</p>
        <p className={`font-bold text-slate-800 ${mono ? 'font-mono font-extrabold' : ''} ${breakAll ? 'break-all' : ''}`}>{value}</p>
      </div>
    </div>
  );
}

function AdminEditField({
  label,
  value,
  onChange,
  placeholder,
  type = 'text',
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  type?: string;
}) {
  return (
    <label className="block">
      <span className="text-[10px] font-bold text-slate-400 uppercase">{label}</span>
      <input
        type={type}
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 w-full border border-slate-200 rounded-xl px-3 py-2 text-xs font-semibold"
      />
    </label>
  );
}
