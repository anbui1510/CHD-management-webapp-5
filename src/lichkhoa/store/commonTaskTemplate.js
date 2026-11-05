/** Task mẫu chung cho khoa mới (F-304 bootstrap) — không kèm nhân sự Tim mạch. */
export const COMMON_TASK_TEMPLATE = [
  { id: 'task_tn', code: 'TN', name: 'Trực Ngày', category: 'THUONG_TRUC', session: 'SANG', triggerRT: false, delta: 0, blocker: true, bgColor: '#fff2cc', textColor: '#cc0000', dutyRole: 'truc_ngay' },
  { id: 'task_vg', code: 'VG', name: 'Vào Gác (Trực Đêm)', category: 'THUONG_TRUC', session: 'DEM', triggerRT: true, delta: 0, blocker: true, bgColor: '#ffe599', textColor: '#cc0000', dutyRole: 'vao_gac' },
  { id: 'task_rt', code: 'RT', name: 'Ra Trực (Nghỉ bắt buộc)', category: 'THUONG_TRUC', session: 'SANG_CHIEU', triggerRT: false, delta: 0, blocker: true, bgColor: '#e6ecef', textColor: '#555555', dutyRole: 'ra_truc' },
  { id: 'task_phep', code: 'P', name: 'Nghỉ Phép Năm', category: 'NGHI_VANG', session: 'SANG_CHIEU', triggerRT: false, delta: -0.5, blocker: true, bgColor: '#f44336', textColor: '#ffffff' },
  { id: 'task_bu', code: 'BÙ', name: 'Nghỉ Bù', category: 'NGHI_VANG', session: 'SANG_CHIEU', triggerRT: false, delta: -0.5, blocker: true, bgColor: '#ff9800', textColor: '#ffffff' },
  { id: 'task_ct', code: 'CT', name: 'Đi Công Tác', category: 'NGHI_VANG', session: 'SANG_CHIEU', triggerRT: false, delta: 0, blocker: true, bgColor: '#9c27b0', textColor: '#ffffff' },
  { id: 'task_hoc', code: 'H', name: 'Đi Học Bên Ngoài', category: 'NGHI_VANG', session: 'SANG_CHIEU', triggerRT: false, delta: 0, blocker: true, bgColor: '#2196f3', textColor: '#ffffff' },
  { id: 'task_sn', code: 'SN', name: 'PK / Phòng khám', category: 'PHONG_KHAM', session: 'SANG', triggerRT: false, delta: 0, blocker: true, bgColor: '#d9ead3', textColor: '#274e13' },
  { id: 'task_tt', code: 'TT', name: 'Thủ thuật / Can thiệp', category: 'THU_THUAT', session: 'SANG_CHIEU', triggerRT: false, delta: 0, blocker: true, bgColor: '#f4ccd8', textColor: '#990000' },
  { id: 'task_round', code: 'round', name: 'Visit buồng bệnh', category: 'CHUYEN_MON', session: 'SANG', triggerRT: false, delta: 0, blocker: true, bgColor: '#d9ead3', textColor: '#274e13' },
];

export const DEFAULT_KHOA_RULES = {
  maxLeavesPerDay: 2,
  enableAutoRT: true,
  enableBalancingTeaching: true,
  enableCrossMonthSundayRT: true,
};
