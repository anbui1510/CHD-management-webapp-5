import fs from 'fs';
import path from 'path';

const root = process.cwd();
const dataDir = path.join(root, 'data');

const readJson = (file, fallback = []) => {
  const fullPath = path.join(dataDir, file);
  if (!fs.existsSync(fullPath)) return fallback;
  return JSON.parse(fs.readFileSync(fullPath, 'utf8') || '[]');
};

const writeJson = (file, data) => {
  fs.writeFileSync(path.join(dataDir, file), `${JSON.stringify(data, null, 2)}\n`, 'utf8');
};

const mockPrefix = 'MOCK2025';
const pad = (value, width = 3) => String(value).padStart(width, '0');
const isoDate = (date) => date.toISOString().slice(0, 10);
const isoDateTime = (date, hour = 8, minute = 0) => {
  const copy = new Date(date);
  copy.setHours(hour, minute, 0, 0);
  return copy.toISOString();
};
const pick = (arr, index) => arr[index % arr.length];
const addDays = (date, days) => {
  const copy = new Date(date);
  copy.setDate(copy.getDate() + days);
  return copy;
};

const familyNames = [
  'Nguyễn', 'Trần', 'Lê', 'Phạm', 'Huỳnh', 'Võ', 'Đặng', 'Bùi', 'Đỗ', 'Hồ',
  'Dương', 'Lý', 'Mai', 'Vũ', 'Cao', 'Tạ', 'Châu', 'Trương', 'Phan', 'Tô'
];
const middleNames = [
  'Minh', 'Gia', 'Hoàng', 'Bảo', 'Nhật', 'Thiên', 'Khánh', 'An', 'Hải', 'Phương',
  'Tuấn', 'Quốc', 'Đức', 'Thành', 'Thanh', 'Ngọc', 'Kim', 'Diệu', 'Hữu', 'Đình'
];
const givenNames = [
  'Anh', 'Bình', 'Chi', 'Duy', 'Giang', 'Hân', 'Khang', 'Linh', 'Nam', 'Vy',
  'Yến', 'Nhi', 'Phúc', 'Tâm', 'Quân', 'Thảo', 'My', 'Khoa', 'Thư', 'Đạt',
  'Kiệt', 'Sơn', 'Trúc', 'Hà', 'Long', 'Tiên', 'Huy', 'Ngân', 'Vinh', 'Uyên'
];
const provinces = [
  'TP Hồ Chí Minh', 'Hà Nội', 'Đồng Nai', 'Bình Dương', 'Tây Ninh',
  'Long An', 'Tiền Giang', 'Bến Tre', 'Vĩnh Long', 'Cần Thơ',
  'Đà Nẵng', 'Khánh Hòa', 'Lâm Đồng', 'Bình Thuận', 'An Giang'
];
const doctors = ['BS. Ân', 'BS. Hiếu', 'BS. Tài', 'BS. Hùng', 'BS. Tĩnh', 'BS. Thịnh', 'BS. Lợi', 'BS. Phụng'];
const departments = ['Ngoại trú', 'Tim Mạch', 'Ngoại LN-TM', 'Hồi Sức Sơ Sinh', 'Hồi Sức Tim', 'HSTC-CĐ', 'Hô hấp', 'Tiêu hóa'];
const diagnoses = ['VSD', 'ASD', 'PDA', 'TOF', 'CoAo', 'TGA', 'AVSD', 'DORV', 'Pulmonary Stenosis', 'Arrhythmia'];
const detailDiagnoses = [
  'Thông liên thất phần quanh màng, shunt trái-phải',
  'Thông liên nhĩ lỗ thứ phát, giãn thất phải',
  'Còn ống động mạch kích thước trung bình',
  'Tứ chứng Fallot, tím khi gắng sức',
  'Hẹp eo động mạch chủ sau ống',
  'Chuyển vị đại động mạch sau can thiệp tạm',
  'Kênh nhĩ thất bán phần',
  'Thất phải hai đường ra, cần đánh giá giải phẫu',
  'Hẹp van động mạch phổi mức độ vừa',
  'Rối loạn nhịp nhanh trên thất tái phát'
];
const consultResults = ['Can thiệp thông tim', 'Can thiệp thông tim', 'Can thiệp thông tim', 'Chụp MRI', 'Mổ tim', 'Chụp chẩn đoán/Đo kháng lực'];
const cathMethods = [
  'Bít lỗ thông liên nhĩ/liên thất/ống động mạch (03.2270.0054)',
  'Đặt coli bít ống động mạch (03.2311.0055)',
  'Nong Van Động Mạch Phổi (03.2298.0054)',
  'Nong hẹp eo động mạch chủ (03.2297.0054)',
  'Chụp động mạch chủ số hóa xóa nền (DSA) (18.05.03.0052)',
  'Điều trị rối loạn nhịp tim bằng sóng tần số radio ( 02.0086.0106)'
];
const devices = [
  'ADO II 6/4; sheath 5F; guidewire 0.035',
  'ASO 14 mm; balloon sizing; TEE',
  'Coil 5x4; catheter multipurpose',
  'Balloon Tyshak II 12x30; sheath 6F',
  'Stent CP 8 zig; BIB balloon',
  'RF catheter; sheath 7F'
];
const priorities = ['Cấp cứu', 'Chương trình', 'Ngoại giao', 'YC'];
const risks = [
  '1 - Hỗ trợ SHH / NT khó kiểm soát',
  '2 - Không SHH / NT ổn / HF nhiều',
  '3 - Không HF, HF độ I-II / có chỉ định mổ',
  '1 - SpO2 < 65% / Huyết động không ổn định',
  '2 - SpO2 65-75% dao động không ổn định',
  '3 -SpO2 > 75% ổn định'
];
const callStatuses = ['Đồng ý', 'Chưa liên lạc được', 'Chờ tài trợ', 'Gia đình chưa đồng ý làm', 'Sai số điện thoại'];
const outcomes = ['', 'Chờ chỉ định', 'Đã thông', 'Đã mổ', 'Nặng xin về'];
const funding = ['Không tài trợ', 'Chờ duyệt', 'Đã duyệt'];
const cmrMethods = ['MRI tim có tiêm gadolinium', 'MRI tim không tiêm thuốc', 'MRI tim đánh giá dòng chảy', 'MRI tim gây mê'];

const patients = readJson('patients.json').filter((p) => !String(p.PatientKey || '').startsWith(mockPrefix));
const consults = readJson('consults.json').filter((c) => !String(c.ConsultKey || '').startsWith(mockPrefix));
const cmrs = readJson('cmrs.json').filter((c) => !String(c.CMRKey || c.CMRkey || '').startsWith(mockPrefix));
const cathlabs = readJson('cathlabs.json').filter((c) => !String(c.CathKey || '').startsWith(mockPrefix));

const mockPatients = [];
const mockConsults = [];
const mockCmrs = [];
const mockCathlabs = [];
const usedNames = new Set();

const makeUniqueName = (index) => {
  const zeroBased = index - 1;
  const name = [
    familyNames[zeroBased % familyNames.length],
    middleNames[Math.floor(zeroBased / familyNames.length) % middleNames.length],
    givenNames[(zeroBased * 7 + Math.floor(zeroBased / familyNames.length)) % givenNames.length]
  ].join(' ').toUpperCase();

  if (usedNames.has(name)) {
    throw new Error(`Duplicate generated name: ${name}`);
  }
  usedNames.add(name);
  return name;
};

for (let i = 1; i <= 100; i++) {
  const patientKey = `${mockPrefix}_PAT_${pad(i)}`;
  const consultKey = `${mockPrefix}_CON_${pad(i)}`;
  const name = makeUniqueName(i);
  const birthYear = 2012 + (i % 14);
  const dob = new Date(birthYear, i % 12, (i % 27) + 1);
  const consultDate = addDays(new Date(2025, 0, 3), i * 7);
  const plannedDate = i % 4 === 0 ? '' : isoDate(addDays(consultDate, 18 + (i % 35)));
  const result = pick(consultResults, i);
  const requestBy = pick(doctors, i);
  const secondDoctor = requestBy === 'BS. Ân' ? 'BS. Tài' : 'BS. Ân';
  const checkDevice = i % 5 === 0 ? 'Thiếu' : i % 3 === 0 ? '' : 'Đủ';
  const callStatus = plannedDate ? pick(callStatuses, i) : '';
  const transferred = i % 9 === 0;
  const removed = i % 17 === 0;

  mockPatients.push({
    PatientKey: patientKey,
    PatientID1: `25${pad(i, 8)}`,
    PatientID2: i % 6 === 0 ? `ALT-${pad(i, 4)}-${2025 + (i % 2)}` : '',
    PatientName: name,
    OtherPatientName: i % 8 === 0 ? `${name} (KHAI SINH)` : '',
    PatientDOB: isoDate(dob),
    PatientSex: i % 2 === 0 ? 'Nam' : 'Nữ',
    PatientAddress: pick(provinces, i),
    PatientPhone1: `09${String(10000000 + i * 13729).slice(-8)}`,
    PatientPhone2: i % 5 === 0 ? `03${String(20000000 + i * 9137).slice(-8)}` : '',
    PatientCreateBy: pick(['01378', '11111', '01651'], i),
    PatientCreateTime: isoDateTime(addDays(new Date(2025, 0, 1), i * 5), 7 + (i % 8), (i * 11) % 60),
    Outcome: pick(outcomes, i)
  });

  mockConsults.push({
    ConsultKey: consultKey,
    PatientKey: patientKey,
    Status: plannedDate ? '5. Đã xếp lịch' : '3. Chờ xếp lịch',
    ConsultType: result === 'Mổ tim' ? 'Staff mổ' : 'Staff thông',
    ConsultMember: [requestBy, secondDoctor],
    PatientWeight: (5 + (i % 45) * 0.7).toFixed(1),
    PatientHeight: String(55 + (i % 90)),
    ConsultDate: isoDate(consultDate),
    RequestBy: requestBy,
    DiagnosisID: pick(diagnoses, i),
    DetailDiagnosis: pick(detailDiagnoses, i),
    Department: pick(departments, i),
    ConsultCreateBy: '01378',
    ConsultCreateTime: isoDateTime(consultDate, 8 + (i % 5), (i * 7) % 60),
    ConsultResultID: result,
    DetailConsultResult: result === 'Chụp MRI' ? 'Đề nghị chụp cộng hưởng từ tim đánh giá giải phẫu và chức năng thất' : pick(cathMethods, i),
    ConsultNote: i % 7 === 0 ? 'Gia đình cần tư vấn thêm về chi phí và thời điểm nhập viện.' : '',
    PlannedDevice: result === 'Can thiệp thông tim' ? pick(devices, i) : '',
    PlannedPrice: result === 'Can thiệp thông tim' ? `${(18 + (i % 45)) * 1000000}` : '',
    PriorityOrder: pick(priorities, i),
    RiskFactor: pick(risks, i),
    ConsultResultCreateBy: '01378',
    ConsultResultCreateTime: isoDateTime(addDays(consultDate, 1), 14, (i * 3) % 60),
    CheckDevice: result === 'Can thiệp thông tim' ? checkDevice : '',
    OperationFeedback: result === 'Mổ tim' ? 'Phòng mổ ghi nhận, chờ bố trí lịch.' : '',
    SupplyDepFeedback: checkDevice === 'Thiếu' ? 'Thiếu device cùng size, cần phương án thay thế.' : '',
    CallStatus: callStatus,
    Removed: removed,
    CallNote: callStatus === 'Chờ tài trợ' ? 'Gia đình chờ duyệt hỗ trợ tài chính.' : '',
    PlannedCathLabDate: result === 'Can thiệp thông tim' ? plannedDate : '',
    DayOfWeek: '',
    FundingRequest: pick(funding, i),
    CheckDeviceDate: checkDevice ? isoDateTime(addDays(consultDate, 4), 9, (i * 5) % 60) : '',
    CheckDeviceBy: checkDevice ? '01472' : '',
    CathMethod: result === 'Can thiệp thông tim' ? pick(cathMethods, i) : '',
    PostCathDepart: pick(departments, i + 2),
    Scheduled1stInterventionist: plannedDate ? requestBy : '',
    Scheduled2ndInterventionist: plannedDate ? secondDoctor : '',
    Scheduled3rdInterventionist: plannedDate && i % 4 === 0 ? pick(doctors, i + 3) : '',
    TransferredToCathLab: transferred
  });

  if (result === 'Chụp MRI' || i % 4 === 0) {
    const cmrKey = `${mockPrefix}_CMR_${pad(i)}`;
    const scheduledDate = isoDate(addDays(consultDate, 21 + (i % 20)));
    mockCmrs.push({
      CMRKey: cmrKey,
      CMRkey: cmrKey,
      ConsultKey: consultKey,
      PatientKey: patientKey,
      MBN: `25${pad(i, 8)}`,
      'Họ và tên': name,
      'Tình trạng': i % 3 === 0 ? '2. Đã xếp lịch MRI' : '1. Chờ xếp lịch MRI',
      PatientWeight: (5 + (i % 45) * 0.7).toFixed(1),
      CMRDiagnosisID: pick(diagnoses, i),
      CMRDiagnosis: pick(detailDiagnoses, i),
      CMRRequest: 'Đánh giá giải phẫu tim, chức năng thất và dòng chảy',
      DepartRequest: pick(departments, i),
      CMRDate: i % 3 === 0 ? scheduledDate : '',
      CMRMethod: pick(cmrMethods, i),
      CMRDevice: i % 2 === 0 ? 'Coil tim trẻ em' : 'Coil body',
      PostDepart: pick(departments, i + 1),
      Anesthesia: i % 2 === 0 ? 'Có gây mê' : 'Không gây mê',
      CMRScheduledDate: scheduledDate,
      DayOfWeek: '',
      CMRCallStatus: pick(['Đồng ý chương trình', 'Chưa liên lạc được', 'Chờ xác nhận'], i),
      CMRCallStatusNote: i % 5 === 0 ? 'Gia đình xin đổi lịch trong tuần sau.' : '',
      CMRResult: i % 3 === 0 ? 'Đã có kết quả MRI, cần staff lại.' : '',
      CMRNote: 'Dữ liệu ảo phục vụ test chức năng MRI/CMR.',
      ConcludedResult: i % 3 === 0 ? 'Kết luận MRI mẫu: cần đối chiếu siêu âm tim và hội chẩn.' : '',
      PDFResult: '',
      NextPlan: pick(['Staff lại', 'Theo dõi', 'Can thiệp thông tim', 'Mổ tim'], i),
      UpdateTime: isoDateTime(addDays(consultDate, 25), 15, (i * 9) % 60)
    });
  }

  if (plannedDate && result === 'Can thiệp thông tim' && i % 3 === 0) {
    mockCathlabs.push({
      CathKey: `${mockPrefix}_CATH_${pad(i)}`,
      PatientKey: patientKey,
      ConsultKey: consultKey,
      CathDate: plannedDate,
      PostDiagnosisID: pick(diagnoses, i),
      PostDiagnosis: pick(detailDiagnoses, i),
      CathResultID: pick(['Thành công', 'Thành công', 'Hoãn', 'Không thành công'], i),
      CathMethod: pick(cathMethods, i),
      CathPlan: pick(['Tái khám thường', 'Theo dõi sát', 'Cần thông tim can thiệp lại', 'Đăng ký staff nội-ngoại khoa'], i),
      CathNote: 'Dữ liệu ảo kết quả thông tim phục vụ test.',
      _1stInterventionist: requestBy,
      _2ndInterventionist: secondDoctor,
      _3rdInterventionist: i % 4 === 0 ? pick(doctors, i + 4) : '',
      _4thInterventionist: '',
      PlannedFollowUpDate: isoDate(addDays(new Date(plannedDate), 45 + (i % 30))),
      CathUpdatedBy: '01378',
      CathUpdatedTime: isoDateTime(addDays(new Date(plannedDate), 1), 10, (i * 13) % 60)
    });
  }
}

writeJson('patients.json', [...patients, ...mockPatients]);
writeJson('consults.json', [...consults, ...mockConsults]);
writeJson('cmrs.json', [...cmrs, ...mockCmrs]);
writeJson('cathlabs.json', [...cathlabs, ...mockCathlabs]);

console.log(`Generated ${mockPatients.length} mock patients`);
console.log(`Generated ${mockConsults.length} mock consults`);
console.log(`Generated ${mockCmrs.length} mock CMR records`);
console.log(`Generated ${mockCathlabs.length} mock cathlab records`);
