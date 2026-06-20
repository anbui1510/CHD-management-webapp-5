import type { DailyTopic } from './types';

export const WEEKLY_TOPICS: DailyTopic[] = [
  {
    weekday: 1,
    topic: '3D/4D Echocardiography & Advanced Imaging in CHD',
    keywords:
      '3D echocardiography congenital heart disease, Strain imaging pediatrics, Cardiac MRI ventricular function CHD, Computational fluid dynamics',
    purpose:
      'Cập nhật tiến bộ đánh giá chức năng thất (thất phải, tuần hoàn đơn thất) bằng Speckle Tracking/Strain, siêu âm 3D/4D, hoặc 4D Flow MRI.',
    preferredTypes: 'Recommendations của ASE hoặc EACVI về chuẩn hóa siêu âm tim trẻ em.',
  },
  {
    weekday: 2,
    topic: 'Transcatheter Interventions & Device Innovation',
    keywords:
      'Transcatheter pulmonary valve implantation PPVI, Percutaneous Fontan completion, Stent angioplasty coarctation, Device closure complex VSD',
    purpose:
      'Clinical trials hoặc báo cáo đa trung tâm về dụng cụ can thiệp thế hệ mới: PPVI (Melody, Sapiens, Alterra), kỹ thuật hybrid.',
    preferredTypes: 'Tổng kết từ IMPACT Registry hoặc registry dữ liệu lớn tương đương.',
  },
  {
    weekday: 3,
    topic: 'Single Ventricle Outcomes & Fontan Palliation Failure',
    keywords:
      'Fontan-associated liver disease FALD, Protein-losing enteropathy Fontan, Fontan failure management, Total cavopulmonary connection long-term',
    purpose:
      'Biến chứng ngoài tim tuần hoàn Fontan: FALD, bệnh ruột mất protein, suy tuần hoàn ở bệnh nhân Fontan lớn tuổi.',
    preferredTypes: 'State-of-the-Art Review về bảo vệ đa cơ quan ở bệnh nhân Fontan.',
  },
  {
    weekday: 4,
    topic: 'Pediatric Arrhythmias & Catheter Ablation in CHD',
    keywords:
      'Catheter ablation congenital heart disease, Zero-fluoroscopy ablation pediatrics, Inherited arrhythmia syndromes, Pacemaker implantation infants',
    purpose:
      'Triệt đốt loạn nhịp zero-fluoroscopy bằng mapping 3D (EnSite/CARTO) ở trẻ nhỏ, quản lý rối loạn nhịp trên tim bẩm sinh đã phẫu thuật.',
    preferredTypes: 'Expert Consensus Statement phối hợp PACES và HRS.',
  },
  {
    weekday: 5,
    topic: 'Neonatal Critical CHD & Mechanical Circulatory Support',
    keywords:
      'Preoperative management critical CHD, Prostaglandin E1 safety, Pediatric ECMO congenital heart, Ventricular assist devices VAD pediatrics',
    purpose:
      'Hồi sức sơ sinh trước mổ tật tim phụ thuộc ống động mạch, ECMO sơ sinh, VAD trẻ em (Berlin Heart).',
    preferredTypes: 'Nghiên cứu đa trung tâm Quality Improvement về tối ưu hồi sức.',
  },
  {
    weekday: 6,
    topic: 'Heart Team Collaboration & Congenital Heart Surgery Limits',
    keywords:
      'Arterial switch operation long-term coronary, Tetralogy of Fallot pulmonary regurgitation timing, Heart team decision making CHD',
    purpose:
      'Tranh luận/đồng thuận Heart Team: can thiệp hở phổi sau TOF, theo dõi biến chứng động mạch vành sau Jatene.',
    preferredTypes: 'Meta-analysis và Guideline AATS/STS/ACC.',
  },
  {
    weekday: 0,
    topic: 'Fetal Cardiology & Adult Congenital Heart Disease (ACHD)',
    keywords:
      'In utero fetal cardiac intervention, Fetal arrhythmia transplacental therapy, Pregnancy adult congenital heart disease, ACHD heart failure',
    purpose:
      'Can thiệp tim thai (nong van ĐM chủ/ĐM phổi), điều trị thuốc qua nhau thai; phân tầng nguy cơ thai kỳ ACHD theo mWHO.',
    preferredTypes: 'Khuyến cáo AHA hoặc ESC về quản lý phân khúc bệnh nhân đặc biệt.',
  },
];

const VN_WEEKDAYS = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

export function getTopicForDate(date: Date = new Date()): DailyTopic {
  const weekday = date.getDay();
  return WEEKLY_TOPICS.find(t => t.weekday === weekday) ?? WEEKLY_TOPICS[0];
}

export function formatDateVN(date: Date = new Date()): string {
  const weekday = VN_WEEKDAYS[date.getDay()];
  const day = date.getDate();
  const month = date.getMonth() + 1;
  const year = date.getFullYear();
  return `${weekday}, ngày ${day} tháng ${month} năm ${year}`;
}

export function formatDateISO(date: Date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function parseDateISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}
