# Định nghĩa Database Google Sheets và Hướng dẫn Agent (AGENTS.md)

Chào Agent, đây là file `AGENTS.md` - nơi quy định cấu trúc dữ liệu, tên biến và hướng dẫn lập trình cho dự án "Hệ Thống Cơ Sở Dữ Liệu Virtual Google Sheets" (Pediatric Cardiac Patient Management System). Bạn PHẢI tuân thủ các quy tắc trong file này.

## Quy tắc chung
1. KHI VIẾT CODE CẦN ĐẢM BẢO TÊN BIẾN PHẢI TRÙNG KHỚP HOÀN TOÀN VỚI TÊN CỘT TRONG GOOGLE SHEETS theo định nghĩa dưới đây.
2. Không tự ý chế tên biến hoặc thay đổi cách viết hoa/thường (ví dụ `PatientName` không được thành `patientName`).
3. Nếu thêm tính năng liên quan đến Table nào, phải dùng đúng Schema đã khai báo.
4. Bất cứ khi nào user yêu cầu cập nhật hoặc thêm cột, hãy cập nhật lại tài liệu này và file `src/types.ts` cùng `src/data/appsScriptCode.ts`.

---

## Cấu trúc dữ liệu chi tiết

### 1. Bảng Patient (Danh sách bệnh nhi)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `PatientKey` | Key | Text | UniqueID() | Bắt buộc | Mỗi bệnh nhân sẽ có 1 key duy nhất. |
| `PatientID1` | Mã bệnh nhân / Mã BN | Text | | Bắt buộc | |
| `PatientID2` | Mã bệnh nhân khác / Mã BN khác | Text | | | Mã BN khác có thể có từ 2 ID trở đi, cách nhau bởi dấu gạch ngang "-" |
| `PatientName` | Họ và tên | Text | | Bắt buộc | |
| `OtherPatientName`| Họ và tên khai sinh | Text | | | |
| `PatientDOB` | Ngày sinh | Date | | Bắt buộc | Định dạng dd/mm/yyyy |
| `PatientSex` | Giới tính | Enum | Nam/Nữ | Bắt buộc | |
| `PatientAddress` | Địa chỉ | Enum | Danh sách tỉnh | Bắt buộc | Lưu ý ghi đúng tên `PatientAddress` |
| `PatientPhone1` | Số ĐT 1 | Phone | | | |
| `PatientPhone2` | Số ĐT 2 | Phone | | | |
| `PatientCreateBy` | Người tạo thông tin BN | Ref | | | Liên kết đến bảng Staff thông qua StaffKey |
| `PatientCreateTime`| Ngày tạo thông tin BN | DateTime | | | |
| `Outcome` | Trạng thái cuối cùng của BN | Enum | Tử vong / Nặng xin về / Đã mổ / Đã thông / Chờ chỉ định | | |

### 2. Bảng Consult (Lịch trình / Biên bản hội chẩn)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `ConsultKey` | Key | Text | UniqueID() | Bắt buộc | Mỗi lượt hội chẩn sẽ có 1 ConsultKey duy nhất |
| `PatientKey` | | Ref | | Bắt buộc | Liên kết với Bảng Patient |
| `ConsultType` | Loại hội chẩn | Enum | Staff mổ / Staff thông | Bắt buộc | |
| `PatientWeight` | Cân nặng (kg) | Text | | Bắt buộc | |
| `PatientHeight` | Chiều cao (cm) | Text | | | |
| `ConsultDate` | Ngày hội chẩn | Date | | Bắt buộc | Định dạng dd/mm/yyyy |
| `RequestBy` | BS đăng ký | Enum | Danh sách bác sĩ | Bắt buộc | Người đăng ký hội chẩn |
| `DiagnosisID` | Bệnh chính | Enum | VSD, ASD, PDA... | Bắt buộc | Mã ICD bệnh theo chữ |
| `DetailDiagnosis`| Chẩn đoán chi tiết | LongText| | Bắt buộc | |
| `Department` | Khoa hội chẩn | Enum | Khoa Tim mạch / Khoa NgLMM | | |
| `ConsultCreateBy`| Người tạo đăng ký staff| Ref | | | Liên kết bảng Staff qua StaffKey |
| `ConsultCreateTime`| Ngày tạo đăng ký staff| DateTime| | | |
| `ConsultMember` | Thành viên quyết định staff| Enumlist| Danh sách bác sĩ | | |
| `ConsultResultID`| Kết luận chính | Enum | Can thiệp thông tim / Chụp chẩn đoán... / Mổ tim / Thêm CĐHA... | Bắt buộc | |
| `DetailConsultResult`| Kết luận staff chi tiết| LongText| | Bắt buộc | |
| `ConsultNote` | Lưu ý staff khác | LongText| | | |
| `PlannedDevice` | Dụng cụ dự kiến | LongText| | Bắt buộc | |
| `PlannedPrice` | Giá tiền dự kiến | Text | | | |
| `PriorityOrder` | Ưu tiên | Enum | Cấp cứu / Làm sớm / Chương trình | | |
| `RiskFactor` | Nguy cơ | Enumlist| 1 - Hỗ trợ SHH / NT khó kiểm soát... | | |
| `ConsultResultCreateBy`| Người nhập kết quả | Ref | | | Liên kết Staff |
| `ConsultResultCreateTime`| Ngày tạo kết quả | DateTime| | | |
| `CheckDevice` | Check dụng cụ | Enum | Đủ / Thiếu | Bắt buộc | |
| `OperationFeedback`| Phòng mổ phản hồi | LongText| | | |
| `SupplyDepFeedback`| Phòng vật tư phản hồi| LongText| | | |
| `CallStatus` | Trạng thái gọi bệnh | Enum | Sai số điện thoại / Chưa liên lạc được... | Bắt buộc | |
| `CallNote` | Ghi chú gọi bệnh | LongText| Muốn theo dõi nơi khác / Chờ tài trợ...| | |
| `PlannedCathLabDate`| Dự kiến ngày thông tim| Date | | Bắt buộc | Định dạng dd/mm/yyyy |
| `FundingRequest` | Hỗ trợ tài chính | Enum | Không tài trợ / Chờ duyệt / Đã duyệt | | |
| `CheckDeviceDate`| Ngày kiểm dụng cụ | DateTime| | | |
| `CheckDeviceBy` | Người kiểm dụng cụ | Ref | | | |
| `CathMethod` | Phương pháp can thiệp | Ref | Ref tới bảng Source | | |
| `PostCathDepart` | Khoa nằm sau TT | Enum | Danh sách khoa | | |
| `Scheduled1stInterventionist`| PTV chính dự kiến | Enum | Danh sách bác sĩ | | |
| `Scheduled2ndInterventionist`| PTV phụ 1 dự kiến | Enum | Danh sách bác sĩ | | |
| `Scheduled3rdInterventionist`| PTV phụ 2 dự kiến | Enum | Danh sách bác sĩ | | |

### 3. Bảng CathLab (Can thiệp tim mạch)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CathKey` | Khoá chính | Text | UniqueID() | Bắt buộc | |
| `PatientKey` | Liên kết Patient | Ref | | Bắt buộc | Liên kết với Bảng Patient |
| `ConsultKey` | Liên kết Consult | Ref | | | Liên kết với Bảng Consult |
| `CathDate` | Ngày thông tim | Date | | Bắt buộc | Định dạng dd/mm/yyyy |
| `PostDiagnosisID`| Bệnh chính sau TT | Enum | | Bắt buộc | |
| `PostDiagnosis` | Chẩn đoán chi tiết sau PT| LongText| | | |
| `CathResultID` | Kết luận sau TT | Enum | Thành công / Không thành công / Hoãn | Bắt buộc | |
| `CathMethod` | Phương pháp TT | Enumlist| Danh sách can thiệp | Bắt buộc | |
| `CathPlan` | Kế hoạch tiếp theo | Enum | Tái khám theo hẹn / Cần thông tim can thiệp lại...| Bắt buộc | |
| `CathNote` | Ghi chú thông tim | LongText| | | |
| `_1stInterventionist`| PTV chính | Enum | Danh sách bác sĩ can thiệp | Bắt buộc | |
| `_2ndInterventionist`| PTV phụ 1 | Enum | Danh sách bác sĩ can thiệp | Bắt buộc | |
| `_3rdInterventionist`| PTV phụ 2 | Enum | Danh sách bác sĩ can thiệp | | |
| `_4thInterventionist`| PTV phụ 3 | Enum | Danh sách bác sĩ can thiệp | | |
| `PlannedFollowUpDate`| Ngày hẹn tái khám | Date | | | Định dạng dd/mm/yyyy |
| `CathUpdatedBy` | Người cập nhật | Ref | | | |
| `CathUpdatedTime`| Ngày cập nhật | DateTime| | | |

### 4. Bảng Operation (Mổ tim)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `SurgKey` | Key | Text | UniqueID() | Bắt buộc | Khóa mổ |
| `PatientKey` | Key | Ref | | Bắt buộc | Liên kết Bảng Patient |
| `ConsultKey` | Key | Ref | | | Liên kết Bảng Consult |
| `SurgDate` | Ngày PT | Date | | Bắt buộc | |
| `DetailDiagnosisManual`| Chẩn đoán thủ công | LongText| | | |
| `PostDiagnosis` | Chẩn đoán PT | LongText| | | |
| `SurgResultID` | Kết quả PT | Enum | | | |
| `SurgNote` | Ghi chú PT | LongText| | | |
| `SurgMethod` | Phương pháp PT | Enum | | | |
| `PlannedFollowUpDate`| Ngày tái khám | Date | | | |
| `1stSurgeon` | PTV chính | Enum | | | |
| `2ndSurgeon` | PTV phụ 1 | Enum | | | |
| `3rdSurgeon` | PTV phụ 2 | Enum | | | |
| `4thSurgeon` | PTV phụ 3 | Enum | | | |
| `SurgCreateTime` | Thời gian tạo | DateTime| | | |
| `SurgUpdatedBy` | Người cập nhật | Ref | | | |

### 5. Bảng Staff (Nhân viên Y Tế)
*   **Lưu ý**: Bảng Staff quản lý phân quyền và phiên đăng nhập.
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
*   `Permissions`: Danh sách module được phép (Enumlist, mã module cách nhau bởi dấu phẩy). Ví dụ: `patients,consult-list,results-staff`. Admin tự có toàn bộ module.
*   `StaffRolePreset`: Mã vai trò mẫu phân quyền (ví dụ `bs-hoi-chan`, `dieu-phoi-tt`, `admin-khoa`). Dùng khi gán nhanh bộ quyền trong view Quản lý nhân sự.
*   `Email`: Địa chỉ email
*   `FireDate`: Ngày nghỉ việc (Trống nếu còn làm)

### 6. Bảng CMR (Cộng hưởng từ tim / MRI tim)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `CMRKey` | Khóa CMR | Text | UniqueID() | Bắt buộc | Khóa chính của lượt CMR/MRI tim. |
| `CMRkey` | Khóa CMR legacy | Text | | | Cột dữ liệu cũ, giữ nguyên tên nếu Google Sheets đang dùng. |
| `ConsultKey` | Khóa hội chẩn | Ref | | | Liên kết bảng Consult. |
| `PatientKey` | Khóa bệnh nhi | Ref | | Bắt buộc | Liên kết bảng Patient. |
| `MBN` | Mã bệnh nhân | Text | | | Mã bệnh nhân legacy trong bảng CMR. |
| `Họ và tên` | Họ và tên | Text | | | Cột legacy trong bảng CMR, giữ đúng dấu và khoảng trắng. |
| `Tình trạng` | Tình trạng | Text | | | Trạng thái legacy trong bảng CMR. |
| `PatientWeight` | Cân nặng (kg) | Text | | Bắt buộc | Cân nặng tại thời điểm đăng ký MRI. |
| `CMRDiagnosisID` | Mã chẩn đoán MRI | Enum | Ref tới `Source.DiagnosisID` | Bắt buộc | Mã chẩn đoán MRI dùng chung danh mục với DiagnosisID. |
| `CMRDiagnosis` | Chẩn đoán MRI | LongText | | Bắt buộc | Chẩn đoán phục vụ chỉ định MRI. |
| `CMRRequest` | Yêu cầu MRI | LongText | | Bắt buộc | Nội dung cần khảo sát/chỉ định MRI. |
| `RequestBy` | BS đăng ký MRI | Enum | Danh sách bác sĩ | | Người đăng ký chụp MRI, logic giống `RequestBy` bảng Consult, không bắt buộc. |
| `DepartRequest` | Khoa yêu cầu | Enum | Ref tới `Source.Department` | | Khoa/phòng đăng ký chụp MRI. |
| `CMRMethod` | Phương thức chụp | Text | Mặc định: Chụp cộng hưởng từ tim (1.5T) có tiêm thuốc cản quang | | Phương thức/kỹ thuật CMR. |
| `CMRDevice` | Máy/thiết bị MRI | Text | Mặc định: Dụng cụ cấp cứu cơ bản (dây oxy, bóng, mask, NKQ, hộp chống sốc, an thần) | | Thiết bị/dụng cụ dự trù khi chụp MRI. |
| `PostDepart` | Khoa sau chụp | Enum | Ref tới `Source.Department` | | Khoa nằm/sau chụp MRI. |
| `Anesthesia` | Gây mê | Enum | Khám gây mê trước / Không | Bắt buộc | Nhu cầu khám/gây mê khi chụp MRI. |
| `CMRScheduledDate` | Ngày chụp MRI dự kiến | Date | | Bắt buộc | Định dạng dd/mm/yyyy hoặc yyyy-mm-dd khi lưu nội bộ. |
| `DayOfWeek` | Thứ | Text | | | Thứ trong tuần của ngày chụp dự kiến. |
| `CMRCallStatus` | Trạng thái gọi MRI | Enum | Đồng ý / Không đồng ý | Bắt buộc | Trạng thái liên hệ bệnh nhân. |
| `CMRCallStatusNote` | Ghi chú gọi MRI | LongText | | | Ghi chú khi gọi bệnh MRI. |
| `CMRDate` | Ngày chụp thực tế | Date | | | Ngày thực hiện CMR/MRI. |
| `CMRResult` | Kết quả CMR | LongText | | | Kết quả MRI rút gọn. |
| `CMRNote` | Ghi chú CMR | LongText | | | Ghi chú khác. |
| `ConcludedResult` | Kết luận MRI | LongText | | | Kết luận kết quả MRI. |
| `PDFResult` | File PDF kết quả | Text | | | Đường dẫn/file kết quả PDF. |
| `NextPlan` | Kế hoạch tiếp theo | Text | | | Hướng xử trí sau MRI. |
| `UpdateTime` | Thời gian cập nhật | DateTime | | | Thời điểm cập nhật record CMR. |

### 7. Bảng Source (Cấu hình nguồn và danh mục)
*   Chứa các danh mục thiết lập, các cột phụ thuộc vào cấu hình người dùng. Hệ thống sẽ tự động quét hết các cột vào mảng.
*   `DiagnosisID`: Danh mục mã chẩn đoán dùng chung cho `Consult.DiagnosisID`, `CathLab.PostDiagnosisID` và `CMR.CMRDiagnosisID`. Không hard-code danh sách DiagnosisID mới trong component; nếu user thêm mã mới thì lưu vào cột này.

### 8. Bảng RolePreset (Vai trò mẫu phân quyền)

| Tên Cột | Tên hiển thị | Type | Giá trị | Yêu cầu | Giải thích |
| :--- | :--- | :--- | :--- | :--- | :--- |
| `RolePresetID` | Mã preset | Text | slug | Bắt buộc | Khóa chính, ví dụ `bs-hoi-chan`. |
| `RolePresetLabel` | Tên vai trò | Text | | Bắt buộc | Hiển thị trên UI. |
| `RolePresetDescription` | Mô tả | LongText | | | Giải thích ngắn vai trò. |
| `Permissions` | Module được phép | Text | Mã module, cách nhau dấu phẩy | Bắt buộc | Ví dụ `home,workspace,patients,consult-list`. |
| `SortOrder` | Thứ tự hiển thị | Number | | | Số nhỏ hiển thị trước. |
| `IsSystem` | Preset hệ thống | Boolean | true/false | | `admin-khoa`, `tuy-chinh` không được xóa qua UI. |

* Sửa ma trận trên tab **Ma trận vai trò mẫu** (Module 6) hoặc sheet **RolePreset** — không cần deploy code.
