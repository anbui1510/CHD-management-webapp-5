import React, { useState, useMemo, useEffect } from 'react';
import { Patient, Consult, Staff, CathLab, formatVNTime } from '../types';
import { Search, Plus, Undo2, Stethoscope, Save, Archive, Ban, CalendarDays, Activity, ArrowUpDown } from 'lucide-react';
import { SOURCE_DIAGNOSIS_ID, SOURCE_CATH_METHOD } from '../data/source';
import { MethodMultiSelect } from './MethodMultiSelect';

interface Props {
  patients: Patient[];
  consults: Consult[];
  cathlabs: CathLab[];
  staffList: Staff[];
  onRefreshData: () => void;
  triggerConfirm: (msg: string, onConfirm: () => void, title?: string) => void;
  onViewPatientRecord: (pat: Patient) => void;
}

const CATH_METHODS_SPECIAL = [
  "Đặt stent Động Mạch Thận", 
  "Đặt stent Ống Động Mạch", 
  "Đặt máy tạo nhịp", 
  "Nong mạch/đặt stent mạch các loại"
];

const INIT_CATHLAB: Partial<CathLab> = {
  CathDate: '',
  PostDiagnosisID: '',
  PostDiagnosis: '',
  CathResultID: 'Thành công',
  CathMethod: [],
  CathPlan: 'Tái khám thường',
  CathNote: '',
  _1stInterventionist: '',
  _2ndInterventionist: '',
  _3rdInterventionist: '',
  _4thInterventionist: '',
  PlannedFollowUpDate: ''
};

export default function CathLabRoomView({ patients, consults, cathlabs, staffList, onRefreshData, triggerConfirm, onViewPatientRecord }: Props) {
  // Tabs
  const [activeTab, setActiveTab] = useState<'pending' | 'done'>('pending');
  const [searchTerm, setSearchTerm] = useState('');
  const [sortAsc, setSortAsc] = useState(true);
  
  // Data prep
  const pendingConsults = useMemo(() => {
     let list = consults.filter(c => 
       c.TransferredToCathLab === true && 
       !c.Removed &&
       !cathlabs.some(cath => cath.ConsultKey === c.ConsultKey)
     );
     
     if (searchTerm.trim() !== '') {
        const lowerSearch = searchTerm.toLowerCase();
        list = list.filter(c => {
           const p = patients.find(pa => pa.PatientKey === c.PatientKey);
           return (p && p.PatientName.toLowerCase().includes(lowerSearch)) || 
                  (c.DiagnosisID && c.DiagnosisID.toLowerCase().includes(lowerSearch));
        });
     }

     list.sort((a, b) => {
        const da = new Date(a.PlannedCathLabDate || '2100-01-01').getTime();
        const db = new Date(b.PlannedCathLabDate || '2100-01-01').getTime();
        return sortAsc ? da - db : db - da;
     });

     return list;
  }, [consults, cathlabs, patients, searchTerm, sortAsc]);

  const doneCathlabs = useMemo(() => {
     let list = cathlabs;
     if (searchTerm.trim() !== '') {
        const lowerSearch = searchTerm.toLowerCase();
        list = list.filter(cath => {
           const p = patients.find(pa => pa.PatientKey === cath.PatientKey);
           return (p && p.PatientName.toLowerCase().includes(lowerSearch)) || 
                  (cath.PostDiagnosisID && cath.PostDiagnosisID.toLowerCase().includes(lowerSearch));
        });
     }
     return list;
  }, [cathlabs, patients, searchTerm]);

  const [selectedPending, setSelectedPending] = useState<{c: Consult, p: Patient} | null>(null);
  const [selectedDone, setSelectedDone] = useState<{c: Consult, p: Patient, cath: CathLab} | null>(null);

  // Form State
  const [formData, setFormData] = useState<Partial<CathLab>>(INIT_CATHLAB);
  const [callNote, setCallNote] = useState('');

  const loggedInStaffId = localStorage.getItem('CurrentStaffKey') || '';
  const loggedInStaff = staffList.find(s => s.StaffKey === loggedInStaffId);
  const loggedInStaffNameShort = loggedInStaff ? (['bs', 'bs.', 'pgs', 'gs', 'th.s', 'ths', 'pgs.ts', 'gs.ts'].includes(loggedInStaff.StaffName.split(' ')[0].toLowerCase()) ? loggedInStaff.StaffName : `BS. ${loggedInStaff.StaffName.split(' ').pop()}`) : '';
  
  const openPendingForm = (c: Consult, p: Patient) => {
    setSelectedPending({c, p});
    setFormData({
      ...INIT_CATHLAB,
      CathDate: new Date().toISOString().split('T')[0],
      _1stInterventionist: c.Scheduled1stInterventionist || '',
      _2ndInterventionist: loggedInStaffNameShort || '',
      _3rdInterventionist: c.Scheduled3rdInterventionist || ''
    });
    setCallNote('');
  };

  const openDoneForm = (cath: CathLab) => {
    const c = consults.find(co => co.ConsultKey === cath.ConsultKey);
    const p = patients.find(pa => pa.PatientKey === cath.PatientKey);
    if(c && p) {
      setSelectedDone({c, p, cath});
      setFormData({...cath});
    }
  };

  const closeModal = () => {
    setSelectedPending(null);
    setSelectedDone(null);
  };

  // Logic: Auto fill CathPlan based on CathMethod
  useEffect(() => {
    if (formData.CathMethod && formData.CathMethod.length > 0) {
      const hasSpecial = formData.CathMethod.some(m => CATH_METHODS_SPECIAL.includes(m));
      if (hasSpecial) {
        setFormData(prev => ({ ...prev, CathPlan: 'Theo dõi sát' }));
      } else {
        setFormData(prev => ({ ...prev, CathPlan: 'Tái khám thường' }));
      }
    }
  }, [formData.CathMethod]);

  const handleCathMethodToggle = (method: string) => {
     setFormData(prev => {
        const methods = prev.CathMethod || [];
        if (methods.includes(method)) {
           return { ...prev, CathMethod: methods.filter(m => m !== method) };
        } else {
           return { ...prev, CathMethod: [...methods, method] };
        }
     });
  };

  const saveCathLab = async (isEdit: boolean) => {
     if (!formData.CathDate || !formData.PostDiagnosisID || !formData.CathResultID || (formData.CathMethod || []).length === 0 || !formData.CathPlan || !formData._1stInterventionist || !formData._2ndInterventionist) {
        alert("Vui lòng điền đầy đủ các thông tin bắt buộc (*)");
        return;
     }

     const target = isEdit ? selectedDone?.c : selectedPending?.c;
     if (!target) return;

     const method = isEdit ? 'PUT' : 'POST';
     const url = isEdit ? `/api/cathlabs/${formData.CathKey}` : '/api/cathlabs';
     
     const payload = {
       ...formData,
       ConsultKey: target.ConsultKey,
       PatientKey: target.PatientKey,
     };

     try {
       await fetch(url, {
          method,
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
       });
       onRefreshData();
       closeModal();
     } catch (e) {
       console.error(e);
     }
  };

  const handlePostpone = (action: 'return' | 'remove') => {
     if(!selectedPending) return;
     if(!callNote) {
       alert("Vui lòng điền ghi chú (Call Note) lý do trạng thái hoãn");
       return;
     }

     triggerConfirm(`Xác nhận ${action === 'return' ? 'chuyển về Xếp lịch' : 'Loại ca này'} với lý do nãy?`, async () => {
       try {
         await fetch(`/api/consults/${selectedPending.c.ConsultKey}`, {
            method: 'PUT',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({
              TransferredToCathLab: action === 'return' ? false : selectedPending.c.TransferredToCathLab,
              Removed: action === 'remove' ? true : selectedPending.c.Removed,
              CallNote: callNote
            })
         });
         onRefreshData();
         closeModal();
       } catch (err) {
         console.error(err);
       }
     });
  };

  return (
    <div className="flex-1 flex flex-col p-4 w-full h-full overflow-hidden bg-slate-50">
       <div className="flex flex-wrap items-center gap-4 mb-4">
          <button 
            onClick={() => setActiveTab('pending')}
            className={`font-black text-sm px-6 py-3 rounded-2xl transition flex items-center gap-2 border-2 ${activeTab === 'pending' ? 'bg-indigo-600 text-white border-indigo-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
             <CalendarDays className="w-5 h-5"/>
             Danh sách chờ thông tim
             <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab==='pending'?'bg-indigo-500 text-white':'bg-slate-100 text-slate-600'}`}>{pendingConsults.length}</span>
          </button>
          
          <button 
            onClick={() => setActiveTab('done')}
            className={`font-black text-sm px-6 py-3 rounded-2xl transition flex items-center gap-2 border-2 ${activeTab === 'done' ? 'bg-emerald-600 text-white border-emerald-600 shadow-md' : 'bg-white text-slate-500 border-slate-200 hover:border-slate-300'}`}
          >
             <Activity className="w-5 h-5"/>
             Danh sách đã thông tim
             <span className={`px-2 py-0.5 rounded-full text-xs ${activeTab==='done'?'bg-emerald-500 text-white':'bg-slate-100 text-slate-600'}`}>{doneCathlabs.length}</span>
          </button>

          <div className="ml-auto flex items-center gap-2 bg-white rounded-2xl shadow-sm border border-slate-200 px-4 py-3">
             <Search className="w-4 h-4 text-slate-400" />
             <input 
                type="text" 
                placeholder="Tìm tên, mã ICD..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="bg-transparent border-none outline-none text-sm text-slate-700 w-48 font-semibold placeholder:font-medium"
             />
          </div>
       </div>

       {activeTab === 'pending' && (
         <div className="flex-1 overflow-auto bg-white rounded-3xl shadow-sm border border-slate-200 p-2">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-slate-100/80 text-slate-500 text-[10px] uppercase font-black tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-12 text-center">STT</th>
                  <th className="p-3">Họ tên Bệnh Nhi</th>
                  <th className="p-3 w-32 text-center">Ngày sinh</th>
                  <th className="p-3 w-32 text-center">Mã bệnh (ICD)</th>
                  <th className="p-3 w-40 text-center flex items-center justify-center gap-1 cursor-pointer group" onClick={() => setSortAsc(!sortAsc)}>
                    Ngày TT dự kiến
                    <ArrowUpDown className="w-3 h-3 text-slate-400 group-hover:text-indigo-600" />
                  </th>
                  <th className="p-3 w-48 text-center">PTV Phụ 1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {pendingConsults.length === 0 && (
                   <tr>
                     <td colSpan={6} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca chờ thông tim</td>
                   </tr>
                 )}
                 {pendingConsults.map((c, i) => {
                    const p = patients.find(pa => pa.PatientKey === c.PatientKey);
                    if (!p) return null;
                    return (
                      <tr key={c.ConsultKey} onClick={() => openPendingForm(c, p)} className="hover:bg-slate-50 cursor-pointer transition">
                        <td className="p-3 text-center text-slate-400 font-bold">{i+1}</td>
                        <td className="p-3 text-slate-800 font-extrabold uppercase text-sm">{p.PatientName}</td>
                        <td className="p-3 text-slate-600 text-center font-bold">{formatVNTime(p.PatientDOB) || '-'}</td>
                        <td className="p-3 text-center font-bold text-[#d2145a] font-mono">{c.DiagnosisID}</td>
                        <td className="p-3 text-center text-slate-600 font-medium">
                          {c.PlannedCathLabDate ? formatVNTime(c.PlannedCathLabDate) : '-'}
                        </td>
                        <td className="p-3 text-center text-indigo-700 font-bold">{c.Scheduled2ndInterventionist || '-'}</td>
                      </tr>
                    );
                 })}
              </tbody>
            </table>
         </div>
       )}

       {activeTab === 'done' && (
         <div className="flex-1 overflow-auto bg-white rounded-3xl shadow-sm border border-slate-200 p-2">
            <table className="w-full text-left border-collapse min-w-[800px]">
              <thead className="bg-emerald-50/50 text-slate-500 text-[10px] uppercase font-black tracking-wider sticky top-0 z-10">
                <tr>
                  <th className="p-3 w-12 text-center">STT</th>
                  <th className="p-3">Họ tên Bệnh Nhi</th>
                  <th className="p-3 w-32 text-center">Ngày sinh</th>
                  <th className="p-3 w-32 text-center">ICD (Sau TT)</th>
                  <th className="p-3 w-40 text-center">Ngày thực hiện</th>
                  <th className="p-3 w-48 text-center">PTV Phụ 1</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                 {doneCathlabs.length === 0 && (
                   <tr>
                     <td colSpan={6} className="p-8 text-center text-slate-400 italic font-semibold">Chưa có ca đã thông tim</td>
                   </tr>
                 )}
                 {doneCathlabs.map((cath, i) => {
                    const p = patients.find(pa => pa.PatientKey === cath.PatientKey);
                    if (!p) return null;
                    return (
                      <tr key={cath.CathKey} onClick={() => openDoneForm(cath)} className="hover:bg-slate-50 cursor-pointer transition">
                        <td className="p-3 text-center text-slate-400 font-bold">{i+1}</td>
                        <td className="p-3 text-slate-800 font-extrabold uppercase text-sm">{p.PatientName}</td>
                        <td className="p-3 text-slate-600 text-center font-bold">{formatVNTime(p.PatientDOB) || '-'}</td>
                        <td className="p-3 text-center font-bold text-[#d2145a] font-mono">{cath.PostDiagnosisID}</td>
                        <td className="p-3 text-center text-slate-600 font-medium">
                          {cath.CathDate ? formatVNTime(cath.CathDate) : '-'}
                        </td>
                        <td className="p-3 text-center text-indigo-700 font-bold">{cath._2ndInterventionist || '-'}</td>
                      </tr>
                    );
                 })}
              </tbody>
            </table>
         </div>
       )}

       {/* ===================== FORM MODAL ===================== */}
       {(selectedPending || selectedDone) && (
         <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
           <div className="bg-white rounded-3xl max-w-4xl w-full max-h-[96vh] md:max-h-[85vh] overflow-y-auto custom-scrollbar shadow-2xl border border-slate-200 flex flex-col text-sm font-medium">
              <div className="bg-[#1e293b] text-white px-6 py-4 flex justify-between items-center shrink-0 sticky top-0 z-10">
                <h3 className="font-extrabold uppercase tracking-wide flex items-center gap-2">
                   <Stethoscope /> 
                   {selectedDone ? 'HỒ SƠ THÔNG TIM (SỬA)' : 'NHẬP KẾT QUẢ THÔNG TIM'}
                </h3>
                <button onClick={closeModal} className="p-2 hover:bg-slate-700 rounded-lg transition"><Undo2 className="w-4 h-4"/></button>
              </div>

              <div className="flex-1 p-6 bg-slate-50/50 space-y-6">
                
                {/* Hành chính & Hội chẩn info card */}
                {(() => {
                   const {c, p} = selectedPending || selectedDone!;
                   return (
                     <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                           <div className="font-extrabold text-[#d2145a] text-xs uppercase mb-3 border-b border-indigo-50 pb-2">Thông tin hành chính</div>
                           <div className="space-y-1.5 text-xs">
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Họ tên:</span> <span className="font-extrabold text-slate-800 uppercase">{p.PatientName}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Giới tính:</span> <span className="font-bold text-slate-800">{p.PatientSex}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Ngày sinh:</span> <span className="font-bold text-slate-800">{formatVNTime(p.PatientDOB)}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Mã NB:</span> <span className="font-bold text-slate-800 font-mono">{p.PatientID1}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-20 shrink-0">Địa chỉ:</span> <span className="font-bold text-slate-800 break-words">{(p as any).PatientAdress || p.PatientAdress}</span></div>
                           </div>
                        </div>
                        <div>
                           <div className="font-extrabold text-[#d2145a] text-xs uppercase mb-3 border-b border-indigo-50 pb-2">Thông tin hội chẩn</div>
                           <div className="space-y-1.5 text-xs">
                             <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Chẩn đoán chi tiết:</span> <span className="font-bold text-slate-800 break-words">{c.DetailDiagnosis}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Kết quả chi tiết HC:</span> <span className="font-bold text-slate-800 break-words">{c.DetailConsultResult}</span></div>
                             <div className="flex gap-2"><span className="text-slate-500 w-28 shrink-0">Ngày staff:</span> <span className="font-bold text-slate-800">{formatVNTime(c.ConsultDate)}</span></div>
                           </div>
                        </div>
                     </div>
                   );
                })()}

                {/* Form Editor */}
                <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-5 space-y-4">
                  <div className="font-extrabold text-indigo-700 text-xs uppercase mb-3 border-b border-indigo-50 pb-2 flex justify-between items-center">
                    <span>KẾT QUẢ THÔNG TIM</span>
                    {formData.CathResultID === 'Hoãn' && <span className="px-2 py-0.5 rounded bg-rose-100 text-rose-700 text-[10px]">Chế độ Hoãn Thủ Thuật</span>}
                  </div>
                  
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-semibold">
                    <div>
                      <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Kết quả thông tim <span className="text-rose-500">*</span></label>
                      <select 
                        value={formData.CathResultID} 
                        onChange={e => setFormData({...formData, CathResultID: e.target.value as any})}
                        className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                         <option value="Thành công">Thành công</option>
                         <option value="Không thành công">Không thành công</option>
                         <option value="Hoãn">Hoãn</option>
                      </select>
                    </div>
                  </div>

                  {formData.CathResultID !== 'Hoãn' ? (
                    <>
                    <div className="grid grid-cols-2 md:grid-cols-3 gap-4 text-xs font-semibold">
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ngày thông tim <span className="text-rose-500">*</span></label>
                        <input
                          type="date"
                          value={formData.CathDate || ''} 
                          onClick={(e: any) => e.target.showPicker && e.target.showPicker()}
                          onChange={(e) => setFormData({...formData, CathDate: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        />
                      </div>
                      
                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">ICD Sau TT <span className="text-rose-500">*</span></label>
                        <select 
                          value={formData.PostDiagnosisID} 
                          onChange={e => setFormData({...formData, PostDiagnosisID: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                           <option value="">- Chọn mã -</option>
                           {SOURCE_DIAGNOSIS_ID.map(d => <option key={d} value={d}>{d}</option>)}
                        </select>
                      </div>

                      <div>
                        <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Kế hoạch (Sau TT) <span className="text-rose-500">*</span></label>
                        <select 
                          value={formData.CathPlan} 
                          onChange={e => setFormData({...formData, CathPlan: e.target.value})}
                          className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                        >
                           <option value="Tái khám thường">Tái khám thường</option>
                           <option value="Theo dõi sát">Theo dõi sát</option>
                           <option value="Cần thông tim can thiệp lại">Cần thông tim can thiệp lại</option>
                           <option value="Đăng ký staff nội-ngoại khoa">Đăng ký staff nội-ngoại khoa</option>
                           <option value="Mổ khẩn">Mổ khẩn</option>
                        </select>
                      </div>
                    </div>

                    <div className="space-y-4 pt-2">
                       <div>
                         <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Phương pháp can thiệp <span className="text-rose-500">*</span></label>
                         <MethodMultiSelect 
                           options={SOURCE_CATH_METHOD}
                           selectedMethods={formData.CathMethod || []}
                           onChange={(methods) => setFormData({...formData, CathMethod: methods})}
                           direction="up"
                         />
                       </div>

                       {formData.CathPlan === 'Theo dõi sát' && (
                          <div className="bg-amber-50 border border-amber-200 p-4 rounded-xl animate-in slide-in-from-top-1">
                             <label className="block text-amber-800 font-bold text-[10px] uppercase mb-1 flex items-center gap-1">
                               <CalendarDays className="w-3 h-3"/> Ngày hẹn tái khám <span className="text-rose-500">*</span>
                             </label>
                             <input type="date" onClick={(e: any) => e.target.showPicker && e.target.showPicker()}
                               value={formData.PlannedFollowUpDate || ''} 
                               onChange={(e) => setFormData({...formData, PlannedFollowUpDate: e.target.value})}
                               className="w-full max-w-[250px] bg-white border border-amber-300 rounded-xl px-3 py-2 font-bold text-slate-800 font-mono focus:outline-none focus:ring-1 focus:ring-amber-500"
                             />
                          </div>
                       )}

                       <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Chẩn đoán chi tiết sau TT <span className="text-[9px] font-normal italic lowercase opacity-80">[Điền Nếu có khác biệt lớn]</span></label>
                           <textarea 
                             rows={2}
                             value={formData.PostDiagnosis} 
                             onChange={e => setFormData({...formData, PostDiagnosis: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                           />
                         </div>
                         <div>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">Ghi chú</label>
                           <textarea 
                             rows={2}
                             value={formData.CathNote} 
                             onChange={e => setFormData({...formData, CathNote: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500 resize-y"
                           />
                         </div>
                       </div>
                    </div>

                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 pt-2">
                       {/* Surgeons */}
                       {[
                         { id: 1, label: 'PTV Chính *', field: '_1stInterventionist', options: ['BS. Phụng', 'BS. Lợi', 'BS. Thịnh'] },
                         { id: 2, label: 'PTV Phụ 1 *', field: '_2ndInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] },
                         { id: 3, label: 'PTV Phụ 2', field: '_3rdInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] },
                         { id: 4, label: 'PTV Phụ 3', field: '_4thInterventionist', options: ['BS. Thịnh', 'BS. Ân', 'BS. Hùng', 'BS. Hiếu', 'BS. Tài', 'BS Tĩnh'] }
                       ].map(s => (
                         <div key={s.id}>
                           <label className="block text-slate-500 font-bold text-[10px] uppercase mb-1">{s.label}</label>
                           <select 
                             value={(formData as any)[s.field] || ''} 
                             onChange={e => setFormData({...formData, [s.field]: e.target.value})}
                             className="w-full bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 font-bold text-slate-800 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                           >
                              <option value="">-- Chọn BS --</option>
                              {s.options.map(o => <option key={o} value={o}>{o}</option>)}
                           </select>
                         </div>
                       ))}
                    </div>
                    </>
                  ) : (
                    <div className="bg-rose-50 border border-rose-200 rounded-xl p-4 mt-2">
                      <label className="block text-rose-800 font-bold text-xs uppercase mb-1">Ghi chú / Lý do hoãn <span className="text-rose-500">*</span></label>
                      <textarea 
                         rows={2}
                         value={callNote} 
                         onChange={e => setCallNote(e.target.value)}
                         placeholder="Vì sao phải hoãn không làm can thiệp..."
                         className="w-full bg-white border border-rose-300 rounded-xl px-3 py-2 text-rose-800 focus:outline-none focus:ring-1 focus:ring-rose-500 resize-y"
                      />
                    </div>
                  )}

                </div>
              </div>

              {/* Action Footer */}
              <div className="px-6 py-4 bg-slate-100 border-t border-slate-200 flex justify-end gap-3 shrink-0">
                 {formData.CathResultID === 'Hoãn' ? (
                    <>
                      <button 
                        onClick={() => handlePostpone('return')}
                        className="px-6 py-2 bg-indigo-100 text-indigo-700 hover:bg-indigo-200 rounded-xl font-black text-xs transition"
                      >Chuyển về Xếp lịch</button>
                      <button 
                        onClick={() => handlePostpone('remove')}
                        className="px-6 py-2 bg-rose-600 text-white hover:bg-rose-700 rounded-xl font-black text-xs transition"
                      >Loại</button>
                    </>
                 ) : (
                    <>
                      {selectedDone && (
                        <button 
                          onClick={() => {
                            closeModal();
                            onViewPatientRecord(selectedDone.p);
                          }}
                          className="mr-auto px-6 py-2 bg-slate-200 text-slate-800 hover:bg-slate-300 rounded-xl font-black text-xs transition"
                        >Xem hồ sơ</button>
                      )}
                      
                      <button 
                        onClick={() => saveCathLab(!!selectedDone)}
                        className="px-6 py-2 bg-indigo-600 text-white hover:bg-indigo-700 rounded-xl font-black text-xs transition flex items-center gap-2"
                      ><Save className="w-4 h-4"/> Lưu hồ sơ TDTT</button>
                    </>
                 )}
              </div>
           </div>
         </div>
       )}

    </div>
  );
}
