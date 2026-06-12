# Đồng bộ tự động lên GitHub

Project này có script **commit + push tự động** khi có thay đổi.

> **Lưu ý bảo mật:** Dùng repo **Private**. File `data/staff.json` chứa mật khẩu nhân viên. `data/sync_config.json` không được đẩy lên git (chỉ dùng file mẫu `sync_config.example.json`).

## Bước 1 — Tạo repo trên GitHub

1. Vào https://github.com/new
2. Tên repo: dùng repo sẵn có — https://github.com/anbui1510/CHD-management-webapp-5 (**không** tạo repo mới)
3. Chọn **Private**
4. **Không** tick "Add README" (repo trống)

## Bước 2 — Tạo Personal Access Token

1. GitHub → **Settings** → **Developer settings** → **Personal access tokens**
2. Tạo token với quyền **Contents: Read and write** trên repo
3. Copy token (chỉ hiện một lần)

## Bước 3 — Cấu hình `.env`

```bash
cp .env.example .env
```

Sửa `.env`:

```env
GITHUB_TOKEN="ghp_xxxxxxxx"
GITHUB_REPO="https://github.com/YOUR_USERNAME/chd-management-webapp-5.git"
GITHUB_BRANCH="main"
GITHUB_SYNC_INTERVAL="300"
```

## Bước 4 — Khởi tạo và push lần đầu

```bash
npm run sync:github:init
npm run sync:github
```

## Bước 5 — Tự động đồng bộ liên tục

```bash
npm run sync:github:watch
```

Script sẽ mỗi **5 phút** (hoặc theo `GITHUB_SYNC_INTERVAL`):
- `git add -A`
- commit nếu có thay đổi
- `git push` lên GitHub

Chạy nền (tùy chọn):

```bash
nohup npm run sync:github:watch > /tmp/chd-github-sync.log 2>&1 &
```

## Lệnh tóm tắt

| Lệnh | Mô tả |
|------|--------|
| `npm run sync:github:init` | Khởi tạo git + remote |
| `npm run sync:github` | Đồng bộ một lần |
| `npm run sync:github:watch` | Tự động lặp lại |
