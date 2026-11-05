# Lịch khoa (Module 7)

Module gắn **Khoa Tim mạch**. Spreadsheet mặc định:

`https://docs.google.com/spreadsheets/d/1auPmK3BcgDbHJcVut5SzEMLjQ_VH9wi8ZM6pS5LZ1Lc/edit`

Tab **Task** + **NhanSu** trên Sheet là nguồn bền: sửa task/nhân sự lịch → app ghi Sheet; sau deploy app kéo lại từ Sheet (không cần nhập JSON mỗi lần).

## Kết nối / deploy bridge

1. Deploy Apps Script từ `src/data/lichKhoaAppsScriptCode.ts` (Execute as Me, Anyone) — **Deploy → New version** khi Code.gs đổi.
2. Virtual Google Sheets lịch khoa: URL script + API Key + Spreadsheet ID (mặc định Tim mạch ở trên).
3. Admin CHD mở **Quản lý task** lần đầu: nếu tab Task trống, app tự đẩy danh mục seed Tim mạch lên Sheet.

## Env (tuỳ chọn)

```
LICHKHOA_SCRIPT_URL=
LICHKHOA_SCRIPT_SECRET=
LICHKHOA_SPREADSHEET_ID=1auPmK3BcgDbHJcVut5SzEMLjQ_VH9wi8ZM6pS5LZ1Lc
```

Hoặc file `data/lichkhoa_sync_config.json` (xem `data/lichkhoa_sync_config.example.json`).
