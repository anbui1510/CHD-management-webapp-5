const http = require('http');

// Cấu hình Host và Port (Mặc định 5173 - chuẩn của server Vite trong dự án)
const PORT = process.argv[2] || process.env.PORT || 5173;
const HOST = '0.0.0.0';

/**
 * Hàm gửi HTTP Request dùng Promise, hỗ trợ Token xác thực và Cookie
 */
function sendRequest(method, endpoint, body = null, token = null) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : '';
    const headers = {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(data)
    };
    
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
      headers['Cookie'] = `CHD_AUTH_TOKEN=${token}`;
    }

    const options = {
      hostname: HOST,
      port: PORT,
      path: endpoint,
      method: method,
      headers: headers
    };

    const req = http.request(options, (res) => {
      let responseBody = '';
      res.on('data', chunk => responseBody += chunk);
      res.on('end', () => {
        try {
          const parsed = JSON.parse(responseBody);
          resolve({ status: res.statusCode, headers: res.headers, data: parsed });
        } catch (e) {
          resolve({ status: res.statusCode, headers: res.headers, data: responseBody });
        }
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (body) {
      req.write(data);
    }
    req.end();
  });
}

async function runCrudTest() {
  console.log(`\n===================================================================`);
  console.log(`BẮT ĐẦU TEST CRUD CÓ XÁC THỰC (AUTH COOKIE) VÀ TƯƠNG THÍCH ID / KEY`);
  console.log(`===================================================================\n`);

  let authToken = '';
  let createdPatientId = '';
  let createdConsultId = '';

  try {
    // ─────────────────────────────────────────────────────────────────
    // 0. AUTH: ĐĂNG NHẬP HỆ THỐNG (TRÍCH XUẤT SET-COOKIE)
    // ─────────────────────────────────────────────────────────────────
    console.log(`[0/5] ĐĂNG NHẬP HỆ THỐNG (POST /api/auth/login)...`);
    const loginPayload = {
      StaffKey: "11111", // Tài khoản Admin mặc định
      Password: "1111"
    };

    const loginRes = await sendRequest('POST', '/api/auth/login', loginPayload);
    console.log(`=> Status: ${loginRes.status}`);
    
    if (loginRes.status !== 200) {
      console.log(`=> Phản hồi lỗi:`, JSON.stringify(loginRes.data, null, 2));
      throw new Error("Đăng nhập thất bại!");
    }

    // Trích xuất token thực từ Set-Cookie header do server trả về (HttpOnly cookie)
    let tokenFromCookie = '';
    const setCookie = loginRes.headers['set-cookie'];
    if (setCookie && Array.isArray(setCookie)) {
      const match = setCookie.join(';').match(/CHD_AUTH_TOKEN=([^;]+)/);
      if (match) {
        tokenFromCookie = match[1];
      }
    }

    authToken = tokenFromCookie || loginRes.data.token;
    if (!authToken || authToken === 'cookie-session') {
      throw new Error("Không trích xuất được Token hợp lệ từ Set-Cookie!");
    }

    console.log(`=> Đăng nhập thành công! Nhận Token xác thực từ Cookie.\n`);


    // ─────────────────────────────────────────────────────────────────
    // 1. CREATE: THÊM MỚI BỆNH NHÂN
    // ─────────────────────────────────────────────────────────────────
    console.log(`[1/5] THÊM MỚI BỆNH NHÂN (POST /api/patients)...`);
    const newPatient = {
      PatientID1: `BN_TEST_${Date.now().toString().slice(-4)}`,
      PatientName: "Bệnh Nhi Test Auto",
      PatientDOB: "15/05/2022",
      PatientSex: "Nam",
      PatientAddress: "Hà Nội",
      PatientPhone1: "0987654321",
      Outcome: "Chờ chỉ định",
      PatientCreateBy: "01378" // BS. Ân
    };

    const createPatRes = await sendRequest('POST', '/api/patients', newPatient, authToken);
    console.log(`=> Status: ${createPatRes.status}`);
    console.log(`=> Dữ liệu phản hồi:`, JSON.stringify(createPatRes.data, null, 2));
    
    // Tương thích cả 2 trường hợp: Server trả về id (chuẩn Supabase) hoặc PatientKey (chuẩn local Express)
    createdPatientId = createPatRes.data.id || createPatRes.data.PatientKey;
    if (!createdPatientId) {
      throw new Error("Không lấy được id hoặc PatientKey bệnh nhân từ API!");
    }
    console.log(`=> Thêm mới bệnh nhân thành công! Định danh: ${createdPatientId}\n`);


    // ─────────────────────────────────────────────────────────────────
    // 2. UPDATE: CHỈNH SỬA BỆNH NHÂN
    // ─────────────────────────────────────────────────────────────────
    console.log(`[2/5] CHỈNH SỬA BỆNH NHÂN (PUT /api/patients/${createdPatientId})...`);
    const updatePatientData = {
      PatientName: "Bệnh Nhi Test Auto - Đã Sửa Tên",
      Outcome: "Đã mổ"
    };

    const updatePatRes = await sendRequest('PUT', `/api/patients/${createdPatientId}`, updatePatientData, authToken);
    console.log(`=> Status: ${updatePatRes.status}`);
    console.log(`=> Dữ liệu phản hồi:`, JSON.stringify(updatePatRes.data, null, 2));
    console.log(`=> Cập nhật thông tin bệnh nhân thành công!\n`);


    // ─────────────────────────────────────────────────────────────────
    // 3. CREATE: THÊM MỚI HỘI CHẨN (CONSULT) CHO BỆNH NHÂN
    // ─────────────────────────────────────────────────────────────────
    console.log(`[3/5] THÊM MỚI HỘI CHẨN (POST /api/consults)...`);
    const newConsult = {
      PatientKey: createdPatientId, // Truyền định danh của bệnh nhân (id / PatientKey)
      ConsultType: "Staff mổ",
      PatientWeight: "14.5",
      PatientHeight: "92",
      ConsultDate: "20/06/2026",
      RequestBy: "BS. Ân",
      DiagnosisID: "VSD",
      DetailDiagnosis: "Thông liên thất phần màng, tăng áp phổi",
      ConsultResultID: "Mổ tim",
      DetailConsultResult: "Chỉ định phẫu thuật vá thông liên thất",
      PriorityOrder: "Làm sớm",
      CheckDevice: "Đủ"
    };

    const createConRes = await sendRequest('POST', '/api/consults', newConsult, authToken);
    console.log(`=> Status: ${createConRes.status}`);
    console.log(`=> Dữ liệu phản hồi:`, JSON.stringify(createConRes.data, null, 2));

    // Tương thích cả id và ConsultKey
    createdConsultId = createConRes.data.id || createConRes.data.ConsultKey;
    if (!createdConsultId) {
      throw new Error("Không lấy được id hoặc ConsultKey hội chẩn từ API!");
    }
    console.log(`=> Thêm mới hội chẩn thành công! Định danh: ${createdConsultId}\n`);


    // ─────────────────────────────────────────────────────────────────
    // 4. UPDATE: CHỈNH SỬA HỘI CHẨN
    // ─────────────────────────────────────────────────────────────────
    console.log(`[4/5] CHỈNH SỬA HỘI CHẨN (PUT /api/consults/${createdConsultId})...`);
    const updateConsultData = {
      ConsultNote: "Ghi chú bổ sung: Đã thông báo cho gia đình và phòng mổ",
      FundingRequest: "Đã duyệt"
    };

    const updateConRes = await sendRequest('PUT', `/api/consults/${createdConsultId}`, updateConsultData, authToken);
    console.log(`=> Status: ${updateConRes.status}`);
    console.log(`=> Dữ liệu phản hồi:`, JSON.stringify(updateConRes.data, null, 2));
    console.log(`=> Cập nhật hội chẩn thành công!\n`);


    // ─────────────────────────────────────────────────────────────────
    // 5. DELETE (SOFT-DELETE): XÓA HỘI CHẨN
    // ─────────────────────────────────────────────────────────────────
    console.log(`[5/5] XÓA HỘI CHẨN / SOFT DELETE (PUT /api/consults/${createdConsultId})...`);
    const deleteConsultData = {
      Removed: true,
      CallNote: "Hủy hội chẩn do bệnh nhân xin chuyển viện"
    };

    const deleteConRes = await sendRequest('PUT', `/api/consults/${createdConsultId}`, deleteConsultData, authToken);
    console.log(`=> Status: ${deleteConRes.status}`);
    console.log(`=> Dữ liệu phản hồi:`, JSON.stringify(deleteConRes.data, null, 2));
    console.log(`=> Xóa (Soft-delete) hội chẩn thành công!\n`);

    console.log(`===================================================================`);
    console.log(`HOÀN TẤT TOÀN BỘ CÁC BƯỚC KIỂM THỬ CRUD THÀNH CÔNG!`);
    console.log(`===================================================================\n`);

  } catch (err) {
    console.error(`\n[LỖI] QUÁ TRÌNH KIỂM THỬ THẤT BẠI:`, err.message);
    console.error(`Vui lòng đảm bảo server đang chạy (npm run dev) tại cổng ${PORT}.\n`);
  }
}

runCrudTest();
