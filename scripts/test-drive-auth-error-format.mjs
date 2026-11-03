import { createRequire } from 'module';

// formatStaffSlideUploadError lives in TS; duplicate the matcher here for a fast smoke check
// mirroring src/consultSlide/uploadDrive.ts (keep in sync).
const DRIVE_AUTH_HELP =
  'Apps Script chưa có quyền Google Drive (cần scope auth/drive).';

function formatStaffSlideUploadError(raw) {
  const msg = String(raw || '');
  if (
    /auth\/drive/i.test(msg) ||
    /DriveApp\.Folder\.createFolder/i.test(msg) ||
    /DriveApp\.createFolder/i.test(msg) ||
    /DriveApp\.Folder\.createFile/i.test(msg) ||
    /不具有呼叫.*DriveApp/i.test(msg) ||
    /無權呼叫.*DriveApp/i.test(msg) ||
    /do not have permission to call.*DriveApp/i.test(msg)
  ) {
    return DRIVE_AUTH_HELP;
  }
  return msg || 'Upload Drive thất bại.';
}

const zh =
  '您無權呼叫 DriveApp.Folder.createFolder。必要權限：https://www.googleapis.com/auth/drive。';
const out = formatStaffSlideUploadError(zh);
if (!out.includes('auth/drive') || !out.includes('Apps Script chưa có quyền')) {
  console.error('expected Vietnamese drive-auth help, got:', out);
  process.exit(1);
}
const passthrough = formatStaffSlideUploadError('Thiếu cấu hình thư mục Drive');
if (passthrough !== 'Thiếu cấu hình thư mục Drive') {
  console.error('unexpected rewrite:', passthrough);
  process.exit(1);
}
console.log('test-drive-auth-error-format: ok');
void createRequire;
