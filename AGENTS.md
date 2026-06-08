# Định nghĩa Database Google Sheets và Hướng dẫn Agent (AGENTS.md)

Chào Agent, đây là file `AGENTS.md` - nơi quy định cấu trúc dữ liệu, tên biến và hướng dẫn lập trình cho dự án "Hệ Thống Cơ Sở Dữ Liệu Virtual Google Sheets" (Pediatric Cardiac Patient Management System). Bạn PHẢI tuân thủ các quy tắc trong file này.

## Quy tắc chung
1. KHI VIẾT CODE CẦN ĐẢM BẢO TÊN BIẾN PHẢI TRÙNG KHỚP HOÀN TOÀN VỚI TÊN CỘT TRONG GOOGLE SHEETS theo định nghĩa dưới đây.
2. Không tự ý chế tên biến hoặc thay đổi cách viết hoa/thường (ví dụ `PatientName` không được thành `patientName`).
3. Nếu thêm tính năng liên quan đến Table nào, phải dùng đúng Schema đã khai báo.

## Cấu trúc dữ liệu

### 1. Bảng Staff (Nhân viên y tế)
*   `StaffKey`: Mã NV (Primary Key)
*   `StaffName`: Tên nhân viên hiển thị
*   `Name`: Tên đầy đủ
*   `StaffSex`: Giới tính
*   `Avatar`: Link ảnh
*   `StaffDOB`: Ngày sinh
*   `Department`: Khoa / Phòng ban
*   `Career`: Chức danh chuyên môn
*   `StaffPhone`: Số điện thoại
*   `Password`: Mật khẩu đăng nhập
*   `Role`: Quyền ('Admin' | 'User')
*   `Email`: Địa chỉ email
*   `FireDate`: Ngày nghỉ việc (Trống nếu còn làm)

### 2. Bảng Patient (Bệnh nhi)
*   `PatientKey`: Khóa ca bệnh (Primary Key)
*   `PatientID1`: Mã Y tế (MBN)
*   `PatientID2`: Mã khác
*   `PatientName`: Tên bệnh nhi
*   `OtherPatientName`: Tên khác
*   `PatientDOB`: Ngày sinh
*   `PatientSex`: Giới tính ('Nam' | 'Nữ')
*   `PatientAdress`: Địa chỉ (Lưu ý: Viết là PatientAdress theo đúng DB gốc)
*   `PatientPhone1`: SDT 1
*   `PatientPhone2`: SDT 2
*   `PatientCreateBy`: Khóa nhân viên tạo 
*   `PatientCreateTime`: Thời gian tạo
*   `Outcome`: Kết cục sức khỏe của BN ('Tử vong' | 'Nặng xin về' | 'Đã mổ' | 'Đã thông')

### 3. Bảng Consult (Hội chẩn / Lịch trình)
*   `ConsultKey`: Mã hội chẩn (Primary Key)
*   `PatientKey`: Liên kết Patient
*   `ConsultType`: Loại hội chẩn ('Staff mổ' | 'Staff thông')
*   `PatientWeight`: Cân nặng
*   `PatientHeight`: Chiều cao
*   `ConsultDate`: Ngày hội chẩn
*   `RequestBy`: Bác sĩ yêu cầu
*   `DiagnosisID`: ID chẩn đoán bệnh
*   `DetailDiagnosis`: Chi tiết chẩn đoán
*   `Department`: Khoa / Khu vực
*   `ConsultCreateBy`: Người tạo đăng ký
*   `ConsultCreateTime`: Thời gian lập
*   `ConsultMember`: Thành phần tham gia
*   `ConsultResultID`: Kết luận chính
*   `DetailConsultResult`: Chi tiết điều trị
*   `ConsultNote`: Ghi chú nội bộ
*   `PlannedDevice`: Dụng cụ dự kiến
*   `PlannedPrice`: Giá dự kiến
*   `PriorityOrder`: Mức độ ưu tiên ('Cấp cứu' | 'Chương trình' | 'Ngoại giao' | 'YC')
*   `RiskFactor`: Yếu tố nguy cơ
*   `ConsultResultCreateBy`: Người nhập kết quả hội chẩn
*   `ConsultResultCreateTime`: Ngày tạo kết quả hội chẩn
*   `CheckDevice`: Kiểm tra dụng cụ ('Đủ' | 'Thiếu')
*   `OperationFeedback`: Phản hồi phòng mổ
*   `SupplyDepFeedback`: Phòng vật tư phản hồi
*   `CallStatus`: Trạng thái gọi bệnh
*   `CallNote`: Ghi chú gọi bệnh
*   `PlannedCathLabDate`: Ngày dự kiến thông tim
*   `FundingRequest`: Quỹ tài trợ
*   `CheckDeviceDate`: Ngày kiểm dụng cụ
*   `CheckDeviceBy`: Người kiểm dụng cụ / gọi bệnh
*   `CathMethod`: Phương pháp can thiệp (liên kết Sourse)
*   `PostCathDepart`: Khoa nằm sau TT
*   `Scheduled1stInterventionist`: PTV chính dự kiến
*   `Scheduled2ndInterventionist`: PTV phụ 1 dự kiến
*   `Scheduled3rdInterventionist`: PTV phụ 2 dự kiến

### 4. Bảng CathLab (Can thiệp tim mạch)
*   `CathKey`: ID can thiệp (Primary Key)
*   `PatientKey`: Liên kết Patient
*   `ConsultKey`: Liên kết Consult 
*   `CathDate`: Ngày thông tim
*   `PostDiagnosisID`: Bệnh chính sau TT
*   `PostDiagnosis`: Chẩn đoán chi tiết sau PT
*   `CathResultID`: Kết luận sau TT
*   `CathMethod`: Phương pháp TT
*   `CathPlan`: Kế hoạch tiếp theo 
*   `CathNote`: Ghi chú thông tim
*   `_1stInterventionist`: PTV chính
*   `_2ndInterventionist`: PTV phụ 1
*   `_3rdInterventionist`: PTV phụ 2
*   `_4thInterventionist`: PTV phụ 3
*   `PlannedFollowUpDate`: Ngày hẹn tái khám
*   `CathUpdatedBy`: Người cập nhật kết quả TT
*   `CathUpdatedTime`: Ngày cập nhật kết quả TT

### 5. Bảng Operation (Mổ tim - Phẫu thuật)
*   `SurgKey`: Khóa mổ
*   `PatientKey`: Khóa bệnh nhi
*   `ConsultKey`: Khóa hội chẩn tương ứng
*   `SurgDate`: Ngày mổ
*   `DetailDiagnosisManual`: Chẩn đoán ...
*   `PostDiagnosis`: Chẩn đoán PT
*   `SurgResultID`: Kết quả PT
*   `SurgNote`: Ghi chú PT
*   `SurgMethod`: Phương pháp PT
*   `PlannedFollowUpDate`: Ngày tái khám
*   `1stSurgeon`: PTV chính
*   `2ndSurgeon`: PTV phụ 1
*   `3rdSurgeon`: PTV phụ 2
*   `4thSurgeon`: PTV phụ 3
*   `SurgCreateTime`: Ngày tạo mổ
*   `SurgUpdatedBy`: Người cập nhật kết quả mổ

### 6. Bảng CMR (Chụp cộng hưởng từ tim)
*   `CMRKey`: Khóa CMR
*   `ConsultKey`: Khóa hội chẩn 
*   `PatientKey`: Khóa bệnh nhi
*   `CMRDate`: Ngày chụp 
*   `CMRMethod`: Phương thức chụp 
*   `CMRResult`: Kết quả CMR
*   `CMRNote`: Ghi chú CMR


### 7. Bảng Sourse (Cấu hình nguồn và danh mục)
*   Do cấu trúc linh hoạt hoặc chứa các danh mục thiết lập, các cột phụ thuộc vào cấu hình người dùng cung cấp. Hiện tại hệ thống tự động tải toàn bộ cột.

## Lưu ý khi tùy biến hoặc update
Bất cứ khi nào user bảo "Hãy update lại tên cột", bạn phải cập nhật lại tài liệu này (bằng lệnh edit file AGENTS.md) và update interface cho file `/src/types.ts` cũng như script fetch.
