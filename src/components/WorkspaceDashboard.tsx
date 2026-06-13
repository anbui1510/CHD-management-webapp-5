import React from 'react';

import {

  Heart,

  ClipboardList,

  PenTool,

  SlidersHorizontal,

  Archive,

  Calendar,

  Activity,

  Clock,

  ShieldCheck,

  Scissors

} from 'lucide-react';



interface WorkspaceDashboardProps {

  onNavigate: (menu: string) => void;

  patientCount: number;

  pendingConsultCount: number;

  pendingMriCount?: number;

}



export default function WorkspaceDashboard({

  onNavigate,

  patientCount,

  pendingConsultCount,

  pendingMriCount = 0

}: WorkspaceDashboardProps) {



  return (

    <div className="space-y-8 animate-in fade-in duration-300 p-2 sm:p-4">



      {/* 1. QUẢN LÝ BỆNH NHÂN - LỊCH HẸN */}

      <div>

        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">

          <span className="w-2 h-2 rounded-full bg-[#d2145a]" /> 1. QUẢN LÝ BỆNH NHÂN - LỊCH HẸN

        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <button

            onClick={() => onNavigate('patients')}

            className="bg-white border rounded-2xl p-5 hover:border-pink-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-pink-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Heart className="w-6 h-6 text-[#d2145a]" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Hồ sơ bệnh án</h3>

            <p className="text-xs text-slate-500">{patientCount} BN trong hệ thống</p>

          </button>



          <button

            onClick={() => onNavigate('schedule-view')}

            className="bg-white border rounded-2xl p-5 hover:border-rose-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Calendar className="w-6 h-6 text-[#d2145a]" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Lịch thông tim dự kiến</h3>

            <p className="text-xs text-slate-500">Lịch phòng Cathlab</p>

          </button>



          <button

            onClick={() => onNavigate('mri-calendar')}

            className="bg-white border rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Calendar className="w-6 h-6 text-purple-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Lịch chụp MRI tim</h3>

            <p className="text-xs text-slate-500">Lịch các ca dự kiến chụp MRI</p>

          </button>



          <button className="bg-white border rounded-2xl p-5 opacity-60 cursor-not-allowed text-left">

            <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center mb-4">

              <Clock className="w-6 h-6 text-amber-500" />

            </div>

            <h3 className="font-extrabold text-sm text-amber-600 mb-1">Lịch tái khám</h3>

            <p className="text-xs text-slate-500">Theo dõi ngoại trú</p>

          </button>

        </div>

      </div>



      {/* 2. QUẢN LÝ HỘI CHẨN */}

      <div>

        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">

          <span className="w-2 h-2 rounded-full bg-[#d2145a]" /> 2. QUẢN LÝ HỘI CHẨN

        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <button

            onClick={() => onNavigate('consult-list')}

            className="bg-white border border-pink-500 shadow-sm rounded-2xl p-5 hover:bg-pink-50 transition text-left group relative"

          >

            <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <ClipboardList className="w-6 h-6 text-teal-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Hội chẩn</h3>

            <p className="text-xs text-slate-500">{pendingConsultCount} lượt staff hoàn tất</p>

          </button>



          <button

            onClick={() => onNavigate('results-staff')}

            className="bg-white border rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <PenTool className="w-6 h-6 text-blue-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Nhập kết quả staff</h3>

            <p className="text-xs text-slate-500">Ca đang đợi nhận định</p>

          </button>

        </div>

      </div>



      {/* 3. QUẢN LÝ THÔNG TIM */}

      <div>

        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">

          <span className="w-2 h-2 rounded-full bg-[#d2145a]" /> 3. QUẢN LÝ THÔNG TIM

        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <button

            onClick={() => onNavigate('schedule-tt')}

            className="bg-white border rounded-2xl p-5 hover:border-emerald-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-emerald-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <SlidersHorizontal className="w-6 h-6 text-emerald-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Xếp lịch &amp; Dụng cụ</h3>

            <p className="text-xs text-slate-500">Phân ca can thiệp</p>

          </button>



          <button

            onClick={() => onNavigate('cathlab-room')}

            className="bg-white border rounded-2xl p-5 hover:border-teal-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-teal-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <ShieldCheck className="w-6 h-6 text-teal-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Phòng thông tim</h3>

            <p className="text-xs text-slate-500">Kiểm soát ca thủ thuật</p>

          </button>



          <button

            onClick={() => onNavigate('archive')}

            className="bg-white border rounded-2xl p-5 hover:border-slate-400 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Archive className="w-6 h-6 text-slate-500" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Lưu trữ</h3>

            <p className="text-xs text-slate-500">Đã chuyển phòng TT &amp; ca lưu trữ</p>

          </button>

        </div>

      </div>



      {/* 4. QUẢN LÝ PHẪU THUẬT */}

      <div>

        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">

          <span className="w-2 h-2 rounded-full bg-[#d2145a]" /> 4. QUẢN LÝ PHẪU THUẬT

        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <button

            onClick={() => onNavigate('surgery-room')}

            className="bg-white border rounded-2xl p-5 hover:border-rose-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Scissors className="w-6 h-6 text-rose-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Phòng phẫu thuật</h3>

            <p className="text-xs text-slate-500">Kiểm soát ca phẫu thuật tim</p>

          </button>



          <button

            onClick={() => onNavigate('surgery-scheduler')}

            className="bg-white border rounded-2xl p-5 hover:border-rose-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <SlidersHorizontal className="w-6 h-6 text-rose-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Xếp lịch phẫu thuật</h3>

            <p className="text-xs text-slate-500">Phân ca mổ tim</p>

          </button>



          <button

            onClick={() => onNavigate('surgery-schedule-view')}

            className="bg-white border rounded-2xl p-5 hover:border-rose-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-rose-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Calendar className="w-6 h-6 text-rose-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Lịch phẫu thuật dự kiến</h3>

            <p className="text-xs text-slate-500">Lịch phòng mổ tim</p>

          </button>

        </div>

      </div>



      {/* 5. QUẢN LÝ MRI TIM */}

      <div>

        <h2 className="text-[11px] font-extrabold text-slate-500 uppercase tracking-wider mb-4 flex items-center gap-2">

          <span className="w-2 h-2 rounded-full bg-[#d2145a]" /> 5. QUẢN LÝ MRI TIM

        </h2>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">

          <button

            onClick={() => onNavigate('mri-register')}

            className="bg-white border rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Activity className="w-6 h-6 text-purple-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Đăng ký MRI tim</h3>

            <p className="text-xs text-slate-500">Danh sách đăng ký chụp MRI</p>

          </button>



          <button

            onClick={() => onNavigate('mri-scheduler')}

            className="bg-white border rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <Activity className="w-6 h-6 text-purple-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Xếp lịch MRI</h3>

            <p className="text-xs text-slate-500">{pendingMriCount} ca MRI cần theo dõi</p>

          </button>



          <button

            onClick={() => onNavigate('mri-result')}

            className="bg-white border rounded-2xl p-5 hover:border-purple-300 hover:shadow-md transition text-left group"

          >

            <div className="w-12 h-12 bg-purple-50 rounded-xl flex items-center justify-center mb-4 group-hover:scale-105 transition-transform">

              <PenTool className="w-6 h-6 text-purple-600" />

            </div>

            <h3 className="font-extrabold text-sm text-[#d2145a] mb-1">Điền KQ MRI tim</h3>

            <p className="text-xs text-slate-500">Danh sách chờ điền kết quả MRI tim</p>

          </button>

        </div>

      </div>



    </div>

  );

}


