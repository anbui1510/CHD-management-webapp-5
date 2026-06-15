import React, { useMemo, useRef, useState } from 'react';
import {
  Activity,
  AlertTriangle,
  ArrowUpDown,
  CheckCircle2,
  Eye,
  Pencil,
  Plus,
  Save,
  Search,
  UserCog,
  X
} from 'lucide-react';
import {
  CMR,
  Consult,
  Patient,
  Source,
  Staff,
  formatVNTime,
  removeDiacritics,
  findPatientByKey,
  normalizePatientKey
} from '../types';
import { SearchableEnumSelect } from './SearchableEnumSelect';
import { getSourceDiagnosisOptions, normalizeDiagnosisID } from '../data/source';
import {
  DEFAULT_CMR_DEVICE,
  DEFAULT_CMR_METHOD,
  resolveCMRDevice,
  resolveCMRMethod
} from '../data/cmrDefaults';

interface MRIRegisterViewProps {
  patients: Patient[];
  consults: Consult[];
  cmrs: CMR[];
  sources?: Source[];
  staffList?: Staff[];
  currentStaff?: Staff | null;
  onRefreshData: () => void;
  onPatchCmr?: (cmrKey: string, patch: Partial<CMR>) => void;
  onAddCmr?: (cmr: CMR) => void;
  onAddPatient?: (patient: Patient) => void;
  onEditPatientAdmin?: (patient: Patient) => void;
}

type RegisterTab = 'pending' | 'done';

type MRIRegisterItem = CMR & { __patient?: Patient };

const ADDRESS_OPTIONS = [
  "TP Hà Nội", "Tuyên Quang", "Cao Bằng", "Lai Châu", "Lào Cai", "Thái Nguyên", "Điện Biên", "Lạng Sơn", "Sơn La", "Phú Thọ", "Bắc Ninh", "Quảng Ninh", "TP Hải Phòng", "Hưng Yên", "Ninh Bình", "Thanh Hoá", "Nghệ An", "Hà Tĩnh", "Quảng Trị", "TP Huế", "TP Đà Nẵng", "Quảng Ngãi", "Gia Lai", "Đắk Lắk", "Khánh Hoà", "Lâm Đồng", "Đồng Nai", "Tây Ninh", "TP Hồ Chí Minh", "Đồng Tháp", "An Giang", "Vĩnh Long", "TP Cần Thơ", "Cà Mau"
];

const getFormattedDateKey = (str?: string): string => {
  if (!str) return '';
  const trimmed = String(str).trim().split('T')[0];
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  const slashParts = trimmed.split('/');
  if (slashParts.length === 3) {
    if (slashParts[2].length === 4) {
      return `${slashParts[2]}-${slashParts[1].padStart(2, '0')}-${slashParts[0].padStart(2, '0')}`;
    }
    if (slashParts[0].length === 4) {
      return `${slashParts[0]}-${slashParts[1].padStart(2, '0')}-${slashParts[2].padStart(2, '0')}`;
    }
  }

  const dashParts = trimmed.split('-');
  if (dashParts.length === 3 && dashParts[2].length === 4) {
    return `${dashParts[2]}-${dashParts[1].padStart(2, '0')}-${dashParts[0].padStart(2, '0')}`;
  }

  return trimmed;
};

const getShortStaffName = (fullName: string, staffList: { StaffName: string }[] = []): string => {
  if (!fullName) return '';
  let cleaned = fullName.replace(/\s*\(.*?\)\s*/g, '').trim();
  cleaned = cleaned.replace(/^(BS\.|BS)\s+/i, '').trim();
  const parts = cleaned.split(/\s+/);
  if (parts.length === 0) return '';

  const firstName = parts[parts.length - 1];
  if (parts.length === 1) return `BS. ${firstName}`;

  const middleName = parts[parts.length - 2];
  const hasFirstNameDuplicate = staffList.length > 0 && staffList.some(s => {
    let sClean = s.StaffName.replace(/\s*\(.*?\)\s*/g, '').trim();
    sClean = sClean.replace(/^(BS\.|BS)\s+/i, '').trim();
    const sParts = sClean.split(/\s+/);
    if (sParts.length <= 1) return false;
    const sFirstName = sParts[sParts.length - 1];
    return sFirstName === firstName && s.StaffName !== fullName;
  });

  if (hasFirstNameDuplicate && middleName) {
    return `BS. ${middleName} ${firstName}`;
  }
  return `BS. ${firstName}`;
};

export default function MRIRegisterView({
  patients,
  consults,
  cmrs,
  sources = [],
  staffList = [],
  currentStaff,
  onRefreshData,
  onPatchCmr,
  onAddCmr,
  onAddPatient,
  onEditPatientAdmin
}: MRIRegisterViewProps) {
  const [activeTab, setActiveTab] = useState<RegisterTab>('pending');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOrder, setSortOrder] = useState<'desc' | 'asc'>('desc');

  // Preview / edit-registration popup states
  const [previewItem, setPreviewItem] = useState<MRIRegisterItem | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [editForm, setEditForm] = useState<Partial<CMR>>({});
  const [editSaving, setEditSaving] = useState(false);
  const [editMsg, setEditMsg] = useState('');
  // Timestamp of when edit mode was entered, used to ignore stray/phantom
  // submits that can fire right after toggling to edit (prevents auto-save).
  const editArmedAtRef = useRef(0);

  // Registration popup states
  const [showForm, setShowForm] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  const [patientMode, setPatientMode] = useState<'select' | 'create'>('select');
  const [searchPatQuery, setSearchPatQuery] = useState('');
  const [selectedPatKey, setSelectedPatKey] = useState('');

  const [newPatID1, setNewPatID1] = useState('');
  const [newPatID2, setNewPatID2] = useState('');
  const [newPatName, setNewPatName] = useState('');
  const [newPatDOB, setNewPatDOB] = useState('');
  const [newPatSex, setNewPatSex] = useState<'Nam' | 'Nữ'>('Nam');
  const [newPatAddress, setNewPatAddress] = useState('TP Hà Nội');
  const [newPatPhone, setNewPatPhone] = useState('');

  const [patientWeight, setPatientWeight] = useState('');
  const [cmrDiagnosisID, setCmrDiagnosisID] = useState('');
  const [cmrDiagnosis, setCmrDiagnosis] = useState('');
  const [requestBy, setRequestBy] = useState('');
  const [showAddDocInput, setShowAddDocInput] = useState(false);
  const [customDocVal, setCustomDocVal] = useState('');
  const [cmrRequest, setCmrRequest] = useState('');
  const [departRequest, setDepartRequest] = useState('');

  const patientsByKey = useMemo(() => {
    const map = new Map<string, Patient>();
    patients.forEach(patient => {
      if (patient.PatientKey) map.set(String(patient.PatientKey).trim().toLowerCase(), patient);
      if (patient.PatientID1) map.set(String(patient.PatientID1).trim().toLowerCase(), patient);
    });
    return map;
  }, [patients]);

  const diagnosisOptions = useMemo(() => getSourceDiagnosisOptions(sources), [sources]);

  const departmentOptions = useMemo(() => {
    return Array.from(new Set(
      [
        ...sources.map(source => String(source.Department || '').trim()),
        ...consults.map(consult => String(consult.Department || '').trim()),
        ...cmrs.flatMap(cmr => [
          String(cmr.DepartRequest || '').trim(),
          String(cmr.PostDepart || '').trim()
        ])
      ].filter(Boolean)
    )).sort((a, b) => a.localeCompare(b, 'vi'));
  }, [sources, consults, cmrs]);

  const extraDoctorOptions = useMemo(() => {
    return Array.from(new Set([
      ...cmrs.map(cmr => String(cmr.RequestBy || '')),
      ...consults.map(consult => String(consult.RequestBy || ''))
    ])).filter(d => d && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === d));
  }, [cmrs, consults, staffList]);

  const createDiagnosisSource = async (DiagnosisID: string) => {
    const trimmed = DiagnosisID.trim();
    if (!trimmed) return;
    const response = await fetch('/api/sources', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ DiagnosisID: trimmed })
    });
    if (!response.ok) {
      throw new Error('Không thể thêm DiagnosisID vào Source');
    }
    onRefreshData();
  };

  const allItems = useMemo<MRIRegisterItem[]>(() => {
    return cmrs.map((cmr, index) => {
      const key = cmr.CMRKey || cmr.CMRkey || `cmr_no_key_${index}`;
      const patient =
        patientsByKey.get(String(cmr.PatientKey || '').trim().toLowerCase()) ||
        patientsByKey.get(String(cmr.MBN || '').trim().toLowerCase());
      return { ...cmr, CMRKey: key, __patient: patient };
    });
  }, [cmrs, patientsByKey]);

  const segmented = useMemo(() => {
    const pending = allItems.filter(item => !getFormattedDateKey(item.CMRDate));
    const done = allItems.filter(item => !!getFormattedDateKey(item.CMRDate));
    return { pending, done };
  }, [allItems]);

  const displayItems = useMemo(() => {
    const source = activeTab === 'pending' ? segmented.pending : segmented.done;
    const q = removeDiacritics(searchQuery).toLowerCase().trim();
    const filtered = !q
      ? source
      : source.filter(item => {
          const patient = item.__patient;
          return [
            patient?.PatientName,
            patient?.PatientID1,
            item['Họ và tên'],
            item.MBN,
            item.CMRDiagnosisID,
            item.CMRDiagnosis,
            item.CMRRequest,
            item.CMRCallStatus
          ].some(value => removeDiacritics(String(value || '')).toLowerCase().includes(q));
        });

    return [...filtered].sort((a, b) => {
      const da = getFormattedDateKey(a.CMRScheduledDate);
      const db = getFormattedDateKey(b.CMRScheduledDate);
      return sortOrder === 'asc' ? da.localeCompare(db) : db.localeCompare(da);
    });
  }, [activeTab, segmented, searchQuery, sortOrder]);

  const resetForm = () => {
    setPatientMode('select');
    setSearchPatQuery('');
    setSelectedPatKey('');
    setNewPatID1('');
    setNewPatID2('');
    setNewPatName('');
    setNewPatDOB('');
    setNewPatSex('Nam');
    setNewPatAddress('TP Hà Nội');
    setNewPatPhone('');
    setPatientWeight('');
    setCmrDiagnosisID('');
    setCmrDiagnosis('');
    setRequestBy('');
    setShowAddDocInput(false);
    setCustomDocVal('');
    setCmrRequest('');
    setDepartRequest('');
    setSuccessMsg('');
    setErrorMsg('');
  };

  // Block: a patient with an existing CMR record still pending (no scheduled date AND no imaging date)
  const getBlockingCmr = (patientKey: string): CMR | undefined => {
    const normalized = normalizePatientKey(patientKey);
    if (!normalized) return undefined;
    return cmrs.find(cmr =>
      normalizePatientKey(cmr.PatientKey) === normalized &&
      !getFormattedDateKey(cmr.CMRScheduledDate) &&
      !getFormattedDateKey(cmr.CMRDate)
    );
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitLoading(true);
    setErrorMsg('');
    setSuccessMsg('');

    try {
      if (!cmrDiagnosisID) {
        setErrorMsg('Vui lòng chọn Mã chẩn đoán MRI!');
        setSubmitLoading(false);
        return;
      }

      let finalPatientKey = selectedPatKey;
      let finalPatient: Patient | undefined = findPatientByKey(patients, selectedPatKey) || undefined;

      if (patientMode === 'create') {
        if (!newPatID1.trim() || !newPatName.trim()) {
          setErrorMsg('Vui lòng nhập Mã bệnh nhi (ID1) và Họ tên bệnh nhi!');
          setSubmitLoading(false);
          return;
        }
        const dup = patients.find(p => String(p.PatientID1 || '').trim().toLowerCase() === newPatID1.trim().toLowerCase());
        if (dup) {
          setErrorMsg(`Mã bệnh nhân này đã tồn tại trong hệ thống (Họ tên: ${dup.PatientName}). Đề nghị chọn bệnh nhi sẵn có hoặc kiểm tra lại thông tin!`);
          setSubmitLoading(false);
          return;
        }

        finalPatientKey = `pat_${Date.now()}`;
        const patientPayload: Patient = {
          PatientKey: finalPatientKey,
          PatientID1: newPatID1.trim(),
          PatientID2: newPatID2.trim(),
          PatientName: newPatName,
          OtherPatientName: newPatName,
          PatientDOB: newPatDOB || '2020-01-01',
          PatientSex: newPatSex,
          PatientAddress: newPatAddress || 'TP Hà Nội',
          PatientPhone1: newPatPhone || '',
          PatientPhone2: '',
          PatientCreateBy: currentStaff?.StaffKey || '01378',
          PatientCreateTime: new Date().toISOString(),
          Outcome: ''
        };
        onAddPatient?.(patientPayload);
        finalPatient = patientPayload;
      } else {
        if (!finalPatientKey) {
          setErrorMsg('Vui lòng tìm và chọn bệnh nhi sẵn có hoặc đổi sang chế độ tạo mới!');
          setSubmitLoading(false);
          return;
        }
        const blocking = getBlockingCmr(finalPatientKey);
        if (blocking) {
          setErrorMsg('Bệnh nhi này đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp). Không thể đăng ký thêm cho đến khi hoàn tất lượt hiện tại!');
          setSubmitLoading(false);
          return;
        }
      }

      const chosenDoc = showAddDocInput ? customDocVal : requestBy;

      const cmrPayload: CMR = {
        CMRKey: `cmr_${Date.now()}`,
        PatientKey: finalPatientKey,
        MBN: finalPatient?.PatientID1 || '',
        'Họ và tên': finalPatient?.PatientName || '',
        PatientWeight: patientWeight,
        CMRDiagnosisID: cmrDiagnosisID,
        CMRDiagnosis: cmrDiagnosis,
        CMRRequest: cmrRequest,
        RequestBy: chosenDoc || '',
        DepartRequest: departRequest,
        CMRMethod: DEFAULT_CMR_METHOD,
        CMRDevice: DEFAULT_CMR_DEVICE,
        CMRScheduledDate: '',
        CMRDate: '',
        CMRCallStatus: '',
        UpdateTime: new Date().toISOString()
      };

      onAddCmr?.(cmrPayload);
      setSuccessMsg('Đã đăng ký chụp MRI thành công!');
      setShowForm(false);
      resetForm();
      setSubmitLoading(false);

      const persist = async () => {
        if (patientMode === 'create') {
          const patRes = await fetch('/api/patients', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              PatientKey: finalPatientKey,
              PatientID1: newPatID1.trim(),
              PatientID2: newPatID2.trim(),
              PatientName: newPatName,
              OtherPatientName: newPatName,
              PatientDOB: newPatDOB || '2020-01-01',
              PatientSex: newPatSex,
              PatientAddress: newPatAddress || 'TP Hà Nội',
              PatientPhone1: newPatPhone || '',
              PatientPhone2: '',
              PatientCreateBy: currentStaff?.StaffKey || '01378',
              PatientCreateTime: new Date().toISOString()
            })
          });
          if (!patRes.ok) throw new Error('Không thể tạo bệnh nhi mới');
        }
        const res = await fetch('/api/cmrs', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(cmrPayload)
        });
        if (!res.ok) throw new Error('Không thể đăng ký chụp MRI');
        onRefreshData();
      };

      persist().catch((err: any) => {
        setErrorMsg(`Đã xảy ra lỗi: ${err.message || err}`);
        onRefreshData();
      });
    } catch (err: any) {
      setErrorMsg(`Đã xảy ra lỗi: ${err.message || err}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const selectedBlockingCmr = selectedPatKey ? getBlockingCmr(selectedPatKey) : undefined;

  const openPreview = (item: MRIRegisterItem) => {
    setPreviewItem(item);
    setEditMode(false);
    setEditMsg('');
    setEditForm({
      PatientWeight: item.PatientWeight || '',
      CMRDiagnosisID: item.CMRDiagnosisID || '',
      CMRDiagnosis: item.CMRDiagnosis || '',
      CMRRequest: item.CMRRequest || '',
      RequestBy: item.RequestBy || '',
      DepartRequest: item.DepartRequest || '',
      CMRMethod: resolveCMRMethod(item.CMRMethod),
      CMRDevice: resolveCMRDevice(item.CMRDevice)
    });
  };

  const closePreview = () => {
    setPreviewItem(null);
    setEditMode(false);
    setEditForm({});
    setEditMsg('');
  };

  const handleEditAdmin = () => {
    const patient = previewItem?.__patient;
    if (patient && onEditPatientAdmin) {
      closePreview();
      onEditPatientAdmin(patient);
    }
  };

  const handleSaveEdit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!previewItem) return;
    // Ignore submits firing within 350ms of entering edit mode (phantom clicks).
    if (Date.now() - editArmedAtRef.current < 350) return;
    if (editSaving) return;
    if (!String(editForm.CMRDiagnosisID || '').trim()) {
      setEditMsg('Vui lòng chọn Mã chẩn đoán MRI!');
      return;
    }
    const key = previewItem.CMRKey || previewItem.CMRkey;
    if (!key) {
      setEditMsg('Không xác định được mã CMR để cập nhật!');
      return;
    }

    const payload: CMR = {
      ...previewItem,
      PatientWeight: String(editForm.PatientWeight || ''),
      CMRDiagnosisID: String(editForm.CMRDiagnosisID || ''),
      CMRDiagnosis: String(editForm.CMRDiagnosis || ''),
      CMRRequest: String(editForm.CMRRequest || ''),
      RequestBy: String(editForm.RequestBy || ''),
      DepartRequest: String(editForm.DepartRequest || ''),
      CMRMethod: resolveCMRMethod(editForm.CMRMethod),
      CMRDevice: resolveCMRDevice(editForm.CMRDevice),
      UpdateTime: new Date().toISOString()
    };
    delete (payload as any).__patient;

    onPatchCmr?.(key, payload);
    closePreview();

    fetch(`/api/cmrs/${encodeURIComponent(key)}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(res => {
        if (!res.ok) throw new Error('Không cập nhật được đăng ký MRI (server trả lỗi)');
        onRefreshData();
      })
      .catch((err: any) => {
        console.error(err);
        const msg = err?.message || '';
        alert(msg.includes('Failed to fetch') ? 'Không kết nối được server. Vui lòng kiểm tra kết nối và thử lại.' : (msg || 'Có lỗi khi cập nhật đăng ký MRI.'));
        onRefreshData();
      });
  };

  return (
    <div className="flex-1 h-full flex flex-col gap-4 animate-in fade-in duration-200 font-sans min-h-0 p-4 lg:p-6 bg-slate-50">

      {/* Title + action */}
      <div className="shrink-0 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white p-4 sm:p-5 border border-slate-200 rounded-3xl shadow-sm">
        <div>
          <h2 className="text-base font-extrabold tracking-tight flex items-center gap-2 uppercase text-[#d2145a]">
            <Activity className="w-5 h-5 text-[#d2145a]" /> Danh sách đăng ký chụp MRI
          </h2>
          <p className="text-xs text-slate-500 mt-0.5 font-medium">Đăng ký chỉ định và theo dõi tiến trình chụp MRI tim.</p>
        </div>
        <button
          type="button"
          onClick={() => {
            resetForm();
            setShowForm(true);
          }}
          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-4 py-2.5 rounded-2xl text-xs flex items-center justify-center gap-1.5 shadow-md hover:shadow-lg transition duration-200 shrink-0 cursor-pointer uppercase tracking-wider"
        >
          <Plus className="w-4 h-4 text-white" /> Đăng ký chụp MRI
        </button>
      </div>

      {/* Tabs + search */}
      <div className="shrink-0 bg-white border border-slate-200 rounded-3xl shadow-sm p-4 space-y-3">
        <div className="flex items-center bg-white border border-slate-200 rounded-xl p-1 text-xs font-semibold text-slate-600">
          <button
            onClick={() => setActiveTab('pending')}
            className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'pending' ? 'bg-[#d2145a] text-white font-bold' : 'text-[#d2145a] hover:bg-pink-50'
            }`}
          >
            Chờ chụp MRI <span className="text-[10px] opacity-75 font-mono">({segmented.pending.length})</span>
          </button>
          <button
            onClick={() => setActiveTab('done')}
            className={`flex-1 text-center py-2 rounded-lg transition-colors cursor-pointer ${
              activeTab === 'done' ? 'bg-emerald-600 text-white font-bold' : 'text-emerald-700 hover:bg-emerald-50'
            }`}
          >
            Đã chụp MRI <span className="text-[10px] opacity-75 font-mono">({segmented.done.length})</span>
          </button>
        </div>

        <div className="flex gap-2">
          <div className="relative flex-1">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <Search className="h-4 w-4 text-slate-400" />
            </span>
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Tìm họ tên, ID, chẩn đoán MRI..."
              className="w-full pl-9 pr-8 py-2.5 bg-white border border-slate-200 rounded-xl text-xs font-semibold focus:outline-none focus:ring-1 focus:ring-pink-400 focus:border-pink-400 shadow-sm"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 flex items-center pr-2.5 text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>
          <button
            onClick={() => setSortOrder(prev => (prev === 'desc' ? 'asc' : 'desc'))}
            className="bg-white border border-slate-200 text-slate-600 px-3 rounded-xl flex items-center justify-center hover:bg-slate-50 transition-colors shrink-0 shadow-sm cursor-pointer"
            title="Sắp xếp theo ngày dự kiến chụp"
          >
            <ArrowUpDown className={`w-4 h-4 transition-transform duration-300 ${sortOrder === 'asc' ? 'rotate-180' : ''}`} />
          </button>
        </div>
      </div>

      {/* List table */}
      <div className="flex-1 min-h-0 bg-white border border-slate-200 rounded-3xl shadow-sm overflow-hidden flex flex-col">
        <div className="flex-1 overflow-x-auto overflow-y-auto">
          <table className="w-full min-w-[1100px] border-separate border-spacing-0 text-left text-xs font-medium text-slate-700">
            <thead className="bg-slate-50/70 text-slate-500 sticky top-0 uppercase text-[9px] font-extrabold tracking-wider z-10 shadow-xs">
              <tr>
                <th className="py-3 px-3 border-b border-slate-200 w-12 text-center">STT</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[170px]">Họ tên / ID</th>
                <th className="py-3 px-3 border-b border-slate-200 w-24">Cân nặng</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[160px]">Chẩn đoán MRI</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[160px]">Yêu cầu MRI</th>
                <th className="py-3 px-3 border-b border-slate-200 w-32">Ngày dự kiến</th>
                <th className="py-3 px-3 border-b border-slate-200 w-32">Trạng thái gọi</th>
                <th className="py-3 px-3 border-b border-slate-200 w-28">Ngày chụp</th>
                <th className="py-3 px-3 border-b border-slate-200 min-w-[160px]">Kết quả MRI</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-150">
              {displayItems.map((item, index) => {
                const patient = item.__patient;
                return (
                  <tr
                    key={item.CMRKey || `${item.PatientKey}-${index}`}
                    onClick={() => openPreview(item)}
                    className="hover:bg-indigo-50/45 transition cursor-pointer"
                  >
                    <td className="py-3 px-3 text-center font-mono text-slate-500">{index + 1}</td>
                    <td className="py-3 px-3">
                      <span className="font-extrabold uppercase text-slate-900 block truncate max-w-[160px]">
                        {patient?.PatientName || item['Họ và tên'] || '—'}
                      </span>
                      <span className="text-[9px] text-slate-400 font-bold font-mono">
                        {patient?.PatientID1 || item.MBN || '—'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold text-slate-600">{item.PatientWeight ? `${item.PatientWeight} kg` : '—'}</td>
                    <td className="py-3 px-3">
                      <span className="text-[9px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded mr-1">
                        {item.CMRDiagnosisID || '—'}
                      </span>
                      <span className="line-clamp-2">{item.CMRDiagnosis || '—'}</span>
                    </td>
                    <td className="py-3 px-3"><span className="line-clamp-2">{item.CMRRequest || '—'}</span></td>
                    <td className="py-3 px-3 font-bold font-mono text-emerald-700">
                      {item.CMRScheduledDate ? formatVNTime(item.CMRScheduledDate) : '—'}
                    </td>
                    <td className="py-3 px-3">
                      <span className="bg-slate-100 text-slate-700 font-extrabold text-[9px] px-2 py-0.5 rounded-full">
                        {item.CMRCallStatus || 'Chưa gọi'}
                      </span>
                    </td>
                    <td className="py-3 px-3 font-bold font-mono text-indigo-700">
                      {item.CMRDate ? formatVNTime(item.CMRDate) : '—'}
                    </td>
                    <td className="py-3 px-3"><span className="line-clamp-2">{item.CMRResult || '—'}</span></td>
                  </tr>
                );
              })}
              {displayItems.length === 0 && (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-slate-400 italic">
                    Không có bệnh nhi nào trong danh sách này.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* REGISTRATION MODAL */}
      {showForm && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[96vh] md:max-h-[88vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150 relative">

            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-indigo-50/50 shrink-0">
              <div className="flex items-center gap-2">
                <Activity className="w-5 h-5 text-indigo-600" />
                <div>
                  <h3 className="font-extrabold text-sm uppercase text-indigo-900">Đăng ký chụp MRI tim</h3>
                  <p className="text-[10px] text-slate-500 normal-case mt-0.5">Đăng ký chỉ định chụp MRI tim cho bệnh nhi.</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => { setShowForm(false); resetForm(); }}
                className="text-slate-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 border border-slate-200 rounded-full transition cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden min-h-0">

              {successMsg && (
                <div className="absolute inset-x-0 top-0 bg-emerald-500 text-white py-3.5 px-6 font-bold text-center z-50 animate-in slide-in-from-top flex items-center justify-center gap-2 text-xs">
                  <CheckCircle2 className="w-5 h-5 shrink-0" />
                  <span>{successMsg}</span>
                </div>
              )}

              {errorMsg && (
                <div className="bg-rose-50 border-r-4 border-rose-500 text-rose-800 py-2.5 px-6 text-[11px] font-semibold animate-in slide-in-from-top flex items-center gap-2 shrink-0">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">

                {/* Patient choice */}
                <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    1. Bệnh nhi
                  </span>

                  <div className="flex gap-2 p-1 bg-slate-100 rounded-xl">
                    <button
                      type="button"
                      onClick={() => { setPatientMode('select'); setSelectedPatKey(''); setSearchPatQuery(''); }}
                      className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer rounded-lg ${
                        patientMode === 'select' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Chọn bệnh nhi có sẵn
                    </button>
                    <button
                      type="button"
                      onClick={() => { setPatientMode('create'); setSelectedPatKey(''); setSearchPatQuery(''); }}
                      className={`flex-1 py-1 px-2 text-center font-bold transition-all text-xs cursor-pointer rounded-lg ${
                        patientMode === 'create' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:text-slate-800'
                      }`}
                    >
                      Tạo nhanh bệnh nhi mới
                    </button>
                  </div>

                  {patientMode === 'select' && (
                    <div className="space-y-1.5">
                      {!selectedPatKey && (
                        <div className="relative">
                          <span className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
                            <Search className="h-4 w-4 text-slate-400" />
                          </span>
                          <input
                            type="text"
                            placeholder="Tìm tên, mã NB (ID1) để chọn..."
                            value={searchPatQuery}
                            onChange={(e) => setSearchPatQuery(e.target.value)}
                            className="w-full pl-9 pr-3 py-1.5 bg-white border border-slate-200 rounded-xl text-[11px] font-semibold focus:outline-none focus:ring-1 focus:ring-indigo-500 text-slate-800 shadow-sm"
                          />
                        </div>
                      )}

                      {!selectedPatKey && searchPatQuery.trim().length > 0 && (
                        <div className="max-h-32 overflow-y-auto border border-slate-250 rounded-xl bg-white divide-y divide-slate-100 shadow-lg">
                          {(() => {
                            const trimmed = removeDiacritics(searchPatQuery).trim().toLowerCase();
                            const matched = patients.filter(p => {
                              const nameOk = p.PatientName ? removeDiacritics(String(p.PatientName)).toLowerCase().includes(trimmed) : false;
                              const idOk = p.PatientID1 ? removeDiacritics(String(p.PatientID1)).toLowerCase().includes(trimmed) : false;
                              return nameOk || idOk;
                            });
                            if (matched.length === 0) {
                              return <div className="p-3 text-center text-slate-400 italic">Không tìm thấy bệnh nhi "{searchPatQuery}"</div>;
                            }
                            return matched.slice(0, 12).map(p => (
                              <button
                                key={p.PatientKey}
                                type="button"
                                onClick={() => { setSelectedPatKey(p.PatientKey); setSearchPatQuery(''); }}
                                className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50 transition flex justify-between items-center cursor-pointer"
                              >
                                <div>
                                  <span className="font-extrabold uppercase text-slate-800">{p.PatientName}</span>
                                  <span className="text-[10px] text-slate-500 font-mono ml-1">(ID1: {p.PatientID1})</span>
                                </div>
                                <span className="text-[10px] text-slate-400 italic">DOB: {formatVNTime(p.PatientDOB)} | {p.PatientSex}</span>
                              </button>
                            ));
                          })()}
                        </div>
                      )}

                      {selectedPatKey && (() => {
                        const selectedPat = findPatientByKey(patients, selectedPatKey);
                        if (!selectedPat) return null;
                        return (
                          <div className="bg-indigo-50/50 border border-indigo-150 rounded-xl p-2.5 text-slate-800 flex flex-col gap-1.5 shadow-sm">
                            <div className="flex justify-between items-center border-b border-indigo-100 pb-1 shrink-0">
                              <span className="text-[10px] uppercase font-bold text-indigo-850">Thông tin đối chiếu</span>
                              <button
                                type="button"
                                onClick={() => setSelectedPatKey('')}
                                className="text-indigo-600 hover:text-red-500 font-bold text-[9px] bg-white hover:bg-rose-50 px-2 py-0.5 rounded-lg border border-indigo-150 shadow-xs transition shrink-0 cursor-pointer"
                              >
                                ✕ Bỏ chọn
                              </button>
                            </div>
                            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-xs">
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Họ và tên:</span>
                                <span className="font-extrabold text-indigo-950 uppercase text-[11px]">{selectedPat.PatientName}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Giới tính:</span>
                                <span className="font-bold text-slate-800 text-[11px]">{selectedPat.PatientSex}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Mã NB1 (ID1):</span>
                                <span className="font-bold font-mono text-slate-800">{selectedPat.PatientID1}</span>
                              </div>
                              <div>
                                <span className="text-slate-400 font-bold block text-[8px] uppercase">Ngày sinh (DOB):</span>
                                <span className="font-bold font-mono text-slate-800">{formatVNTime(selectedPat.PatientDOB)}</span>
                              </div>
                            </div>
                          </div>
                        );
                      })()}

                      {selectedBlockingCmr && (
                        <div className="bg-rose-50 border border-rose-200 text-rose-800 rounded-xl p-3 text-[10px] flex gap-2">
                          <AlertTriangle className="w-4 h-4 shrink-0 text-rose-600 mt-0.5" />
                          <div>
                            <p className="font-bold">Bệnh nhi đã có lượt đăng ký MRI đang chờ (chưa xếp lịch và chưa chụp).</p>
                            <p>Không thể đăng ký thêm cho đến khi hoàn tất lượt hiện tại.</p>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {patientMode === 'create' && (
                    <div className="bg-pink-50/50 border border-pink-100 rounded-2xl p-2.5 space-y-2">
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi (ID1) *</label>
                          <input
                            type="text"
                            placeholder="Mã ID1..."
                            value={newPatID1}
                            onChange={(e) => setNewPatID1(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã bệnh nhi phụ (ID2)</label>
                          <input
                            type="text"
                            placeholder="Mã ID2 (nếu có)..."
                            value={newPatID2}
                            onChange={(e) => setNewPatID2(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Họ tên Bệnh Nhi *</label>
                        <input
                          type="text"
                          placeholder="Nhập họ và tên viết hoa..."
                          value={newPatName}
                          onChange={(e) => setNewPatName(e.target.value.toUpperCase())}
                          className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold text-xs focus:outline-none uppercase text-slate-800"
                        />
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Ngày sinh</label>
                          <input
                            type="date"
                            value={newPatDOB}
                            onChange={(e) => setNewPatDOB(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Giới tính</label>
                          <div className="flex gap-2 pt-1">
                            <label className="flex items-center gap-1 font-bold cursor-pointer">
                              <input type="radio" name="mri-gender" checked={newPatSex === 'Nam'} onChange={() => setNewPatSex('Nam')} className="accent-indigo-600 scale-105" /> Nam
                            </label>
                            <label className="flex items-center gap-1 font-bold cursor-pointer">
                              <input type="radio" name="mri-gender" checked={newPatSex === 'Nữ'} onChange={() => setNewPatSex('Nữ')} className="accent-indigo-600 scale-105" /> Nữ
                            </label>
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">SĐT gia đình</label>
                          <input
                            type="text"
                            placeholder="Số ĐT..."
                            value={newPatPhone}
                            onChange={(e) => setNewPatPhone(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-semibold font-mono text-xs focus:outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Địa chỉ</label>
                          <select
                            value={newPatAddress}
                            onChange={(e) => setNewPatAddress(e.target.value)}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1 font-bold focus:outline-none text-xs text-slate-800"
                          >
                            {ADDRESS_OPTIONS.map((addr) => <option key={addr} value={addr}>{addr}</option>)}
                          </select>
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                {/* MRI registration fields */}
                <div className="bg-white border border-slate-200 p-2.5 rounded-2xl shadow-sm space-y-2.5">
                  <span className="font-extrabold text-[#d2145a] text-[11px] uppercase tracking-wider block border-b border-slate-200 pb-1">
                    2. Thông tin chỉ định MRI
                  </span>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Cân nặng (kg) *</label>
                      <input
                        type="text"
                        required
                        placeholder="vd: 12.5"
                        value={patientWeight}
                        onChange={(e) => setPatientWeight(e.target.value)}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã chẩn đoán MRI *</label>
                      <SearchableEnumSelect
                        required
                        value={cmrDiagnosisID}
                        options={diagnosisOptions}
                        onChange={setCmrDiagnosisID}
                        allowCreate
                        createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                        onCreateOption={createDiagnosisSource}
                        placeholder="-- Chọn ICD --"
                        searchPlaceholder="Gõ ICD để tìm"
                      />
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">BS đăng ký</label>
                      <select
                        value={showAddDocInput ? 'ADD_NEW' : requestBy}
                        onChange={(e) => {
                          const val = e.target.value;
                          if (val === 'ADD_NEW') {
                            setShowAddDocInput(true);
                            setRequestBy('');
                          } else {
                            setShowAddDocInput(false);
                            setRequestBy(val);
                          }
                        }}
                        className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800"
                      >
                        <option value="">-- Chọn BS --</option>
                        {staffList.map(s => {
                          const displayName = getShortStaffName(s.StaffName, staffList);
                          return <option key={s.StaffKey} value={displayName}>{displayName}</option>;
                        })}
                        {extraDoctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                        <option value="ADD_NEW" className="text-rose-500 font-bold">+ Thêm bác sĩ mới...</option>
                      </select>
                      {showAddDocInput && (
                        <div className="flex items-center gap-1 mt-1">
                          <input
                            type="text"
                            placeholder="Tên BS mới (vd: BS. Nghi)"
                            value={customDocVal}
                            onChange={(e) => setCustomDocVal(e.target.value)}
                            className="flex-1 bg-white border border-rose-300 rounded-xl px-2.5 py-1.5 text-xs font-bold focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => { setShowAddDocInput(false); setCustomDocVal(''); setRequestBy(''); }}
                            className="text-slate-400 hover:text-[#d2145a] px-2 text-xs font-bold"
                            title="Quay lại"
                          >
                            ✕
                          </button>
                        </div>
                      )}
                    </div>
                    <div>
                      <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa yêu cầu</label>
                      <SearchableEnumSelect
                        value={departRequest}
                        options={departmentOptions}
                        onChange={setDepartRequest}
                        placeholder="-- Chọn khoa --"
                        searchPlaceholder="Gõ khoa để tìm"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chẩn đoán MRI *</label>
                    <textarea
                      required
                      rows={2}
                      value={cmrDiagnosis}
                      onChange={(e) => setCmrDiagnosis(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Yêu cầu MRI *</label>
                    <textarea
                      required
                      rows={2}
                      value={cmrRequest}
                      onChange={(e) => setCmrRequest(e.target.value)}
                      className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                    />
                  </div>
                </div>
              </div>

              <div className="p-4 border-t border-slate-100 bg-slate-50 flex justify-end gap-3 shrink-0">
                <button
                  type="button"
                  onClick={() => { setShowForm(false); resetForm(); }}
                  className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl cursor-pointer transition"
                >
                  Hủy bỏ
                </button>
                <button
                  type="submit"
                  disabled={submitLoading || !!selectedBlockingCmr}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  <Plus className="w-4 h-4" />
                  {submitLoading ? 'Đang lưu...' : 'Đăng ký chụp MRI'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* PREVIEW / EDIT REGISTRATION MODAL */}
      {previewItem && (() => {
        const patient = previewItem.__patient;
        const isPending = !getFormattedDateKey(previewItem.CMRDate);
        return (
          <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[94vh] shadow-2xl border border-slate-200 flex flex-col overflow-hidden text-xs text-slate-700 font-semibold leading-relaxed animate-in zoom-in-95 duration-150">

              {/* Header */}
              <div className="flex items-center justify-between border-b border-slate-150 px-6 py-4 bg-indigo-50/50 shrink-0">
                <div className="flex items-center gap-2">
                  {editMode ? <Pencil className="w-5 h-5 text-indigo-600" /> : <Eye className="w-5 h-5 text-indigo-600" />}
                  <div>
                    <h3 className="font-extrabold text-sm uppercase text-indigo-900">
                      {editMode ? 'Sửa đăng ký MRI' : 'Xem trước thông tin MRI'}
                    </h3>
                    <p className="text-[10px] text-slate-500 normal-case mt-0.5">
                      {isPending ? 'Ca đang chờ chụp MRI' : 'Ca đã chụp MRI (chỉ xem)'}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={closePreview}
                  className="text-slate-400 hover:text-red-600 p-1 bg-white hover:bg-red-50 border border-slate-200 rounded-full transition cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form onSubmit={(e) => e.preventDefault()} className="flex-1 flex flex-col overflow-hidden min-h-0">
                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 bg-slate-50/50">

                  {/* Admin info */}
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm">
                    <span className="font-extrabold text-slate-800 text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5 mb-2.5">
                      Thông tin hành chính
                    </span>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                      <div className="col-span-2">
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Họ và tên:</span>
                        <span className="font-extrabold text-slate-900 uppercase text-[11.5px]">{patient?.PatientName || previewItem['Họ và tên'] || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Mã NB (ID1):</span>
                        <span className="font-extrabold font-mono text-slate-800 text-[11px]">{patient?.PatientID1 || previewItem.MBN || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Ngày sinh:</span>
                        <span className="font-bold font-mono text-slate-800">{patient?.PatientDOB ? formatVNTime(patient.PatientDOB) : '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Giới tính:</span>
                        <span className="font-bold text-slate-800">{patient?.PatientSex || '—'}</span>
                      </div>
                      <div className="col-span-2">
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Địa chỉ:</span>
                        <span className="font-bold text-slate-800">{patient?.PatientAddress || '—'}</span>
                      </div>
                      <div>
                        <span className="text-slate-400 block font-bold text-[8px] uppercase">Điện thoại:</span>
                        <span className="font-extrabold font-mono text-slate-800">{patient?.PatientPhone1 || '—'}</span>
                      </div>
                    </div>
                  </div>

                  {/* MRI info */}
                  <div className="bg-white border border-slate-200 p-3 rounded-2xl shadow-sm space-y-2.5">
                    <span className="font-extrabold text-[#d2145a] text-[10px] uppercase tracking-wider block border-b border-slate-100 pb-1.5">
                      Thông tin đăng ký MRI
                    </span>

                    {!editMode ? (
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Cân nặng (kg):</span>
                          <span className="font-bold text-slate-800">{previewItem.PatientWeight ? `${previewItem.PatientWeight} kg` : '—'}</span>
                        </div>
                        <div>
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">BS đăng ký:</span>
                          <span className="font-bold text-slate-800">{previewItem.RequestBy || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Mã chẩn đoán:</span>
                          <span className="text-[10px] text-[#d2145a] font-black bg-pink-50 px-1.5 py-0.5 rounded">{previewItem.CMRDiagnosisID || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Chẩn đoán MRI:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{previewItem.CMRDiagnosis || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Yêu cầu MRI:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{previewItem.CMRRequest || '—'}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Phương thức chụp:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{resolveCMRMethod(previewItem.CMRMethod)}</span>
                        </div>
                        <div className="sm:col-span-2">
                          <span className="text-slate-400 block font-bold text-[8px] uppercase">Dự trù dụng cụ:</span>
                          <span className="font-semibold text-slate-800 whitespace-pre-wrap">{resolveCMRDevice(previewItem.CMRDevice)}</span>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Cân nặng (kg) *</label>
                            <input
                              type="text"
                              required
                              value={String(editForm.PatientWeight || '')}
                              onChange={(e) => setEditForm(prev => ({ ...prev, PatientWeight: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Mã chẩn đoán MRI *</label>
                            <SearchableEnumSelect
                              required
                              value={String(editForm.CMRDiagnosisID || '')}
                              options={diagnosisOptions}
                              onChange={(value) => setEditForm(prev => ({ ...prev, CMRDiagnosisID: value }))}
                              allowCreate
                              createLabel={(value) => `Thêm DiagnosisID "${value}" vào Source`}
                              onCreateOption={createDiagnosisSource}
                              placeholder="-- Chọn ICD --"
                              searchPlaceholder="Gõ ICD để tìm"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">BS đăng ký</label>
                            <select
                              value={String(editForm.RequestBy || '')}
                              onChange={(e) => setEditForm(prev => ({ ...prev, RequestBy: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-bold focus:outline-none text-xs text-slate-800"
                            >
                              <option value="">-- Chọn BS --</option>
                              {staffList.map(s => {
                                const displayName = getShortStaffName(s.StaffName, staffList);
                                return <option key={s.StaffKey} value={displayName}>{displayName}</option>;
                              })}
                              {extraDoctorOptions.map(d => <option key={d} value={d}>{d}</option>)}
                              {editForm.RequestBy && !staffList.some(s => getShortStaffName(s.StaffName, staffList) === editForm.RequestBy) && !extraDoctorOptions.includes(String(editForm.RequestBy)) && (
                                <option value={String(editForm.RequestBy)}>{String(editForm.RequestBy)}</option>
                              )}
                            </select>
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Khoa yêu cầu</label>
                            <SearchableEnumSelect
                              value={String(editForm.DepartRequest || '')}
                              options={departmentOptions}
                              onChange={(value) => setEditForm(prev => ({ ...prev, DepartRequest: value }))}
                              placeholder="-- Chọn khoa --"
                              searchPlaceholder="Gõ khoa để tìm"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Phương thức chụp</label>
                            <input
                              type="text"
                              value={String(editForm.CMRMethod || '')}
                              onChange={(e) => setEditForm(prev => ({ ...prev, CMRMethod: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Dự trù dụng cụ</label>
                            <input
                              type="text"
                              value={String(editForm.CMRDevice || '')}
                              onChange={(e) => setEditForm(prev => ({ ...prev, CMRDevice: e.target.value }))}
                              className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 font-semibold focus:outline-none text-xs"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Chẩn đoán MRI *</label>
                          <textarea
                            required
                            rows={2}
                            value={String(editForm.CMRDiagnosis || '')}
                            onChange={(e) => setEditForm(prev => ({ ...prev, CMRDiagnosis: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                        <div>
                          <label className="block text-slate-500 font-bold text-[9px] uppercase mb-0.5">Yêu cầu MRI *</label>
                          <textarea
                            required
                            rows={2}
                            value={String(editForm.CMRRequest || '')}
                            onChange={(e) => setEditForm(prev => ({ ...prev, CMRRequest: e.target.value }))}
                            className="w-full bg-white border border-slate-200 rounded-xl px-2.5 py-1.5 text-xs font-semibold focus:outline-none resize-none"
                          />
                        </div>
                      </div>
                    )}
                  </div>

                  {editMsg && (
                    <div className={`rounded-xl px-3 py-2 text-[11px] font-bold ${editMsg.includes('thành công') ? 'bg-emerald-50 text-emerald-700 border border-emerald-100' : 'bg-rose-50 text-rose-700 border border-rose-100'}`}>
                      {editMsg}
                    </div>
                  )}
                </div>

                {/* Footer actions */}
                <div className="p-4 border-t border-slate-100 bg-slate-50 flex flex-wrap justify-end gap-2 shrink-0">
                  {!editMode ? (
                    <>
                      {onEditPatientAdmin && (
                        <button
                          type="button"
                          onClick={handleEditAdmin}
                          className="px-4 py-2 text-xs font-extrabold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 rounded-2xl cursor-pointer transition flex items-center gap-2"
                        >
                          <UserCog className="w-4 h-4" /> Sửa hành chính
                        </button>
                      )}
                      {isPending && (
                        <button
                          type="button"
                          onClick={() => { editArmedAtRef.current = Date.now(); setEditMode(true); setEditMsg(''); }}
                          className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-5 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2"
                        >
                          <Pencil className="w-4 h-4" /> Sửa đăng ký
                        </button>
                      )}
                    </>
                  ) : (
                    <>
                      <button
                        type="button"
                        onClick={() => { setEditMode(false); setEditMsg(''); }}
                        className="px-4 py-2 text-xs font-bold text-slate-500 hover:text-slate-800 hover:bg-slate-200/50 rounded-2xl cursor-pointer transition"
                      >
                        Quay lại
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSaveEdit()}
                        disabled={editSaving}
                        className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold px-6 py-2 rounded-2xl shadow-xs text-xs cursor-pointer transition flex items-center gap-2 disabled:opacity-50"
                      >
                        <Save className="w-4 h-4" />
                        {editSaving ? 'Đang lưu...' : 'Lưu đăng ký'}
                      </button>
                    </>
                  )}
                </div>
              </form>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
