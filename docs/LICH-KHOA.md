# Lịch khoa (Module 7)

## Kết nối Sheet riêng

1. Tạo Spreadsheet mới (không dùng Sheet y tế CHD).
2. Deploy Apps Script từ `src/data/lichKhoaAppsScriptCode.ts` (Execute as Me, Anyone).
3. Trong app CHD → Workspace → **7. Quản lý lịch làm việc** → **Virtual Google Sheets**.
4. Dán Web App URL, API Key, Spreadsheet ID → Lưu & kết nối.
5. Mở thẻ **Xếp lịch** để làm việc; danh sách bác sĩ lấy từ CHD Staff.

## Env (tuỳ chọn)

```
LICHKHOA_SCRIPT_URL=
LICHKHOA_SCRIPT_SECRET=
LICHKHOA_SPREADSHEET_ID=
```

Hoặc file `data/lichkhoa_sync_config.json` (xem `data/lichkhoa_sync_config.example.json`).
