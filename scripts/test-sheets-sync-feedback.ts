import assert from 'node:assert/strict';
import { buildMutationFeedback } from '../src/utils/sheetsSyncMutation';
import {
  evaluateSheetsSync,
  formatSheetsSyncStatusLabel,
  SHEETS_NOT_UPLOADED_TITLE,
  SHEETS_SUCCESS_MESSAGE
} from '../src/utils/sheetsSyncFeedback';

const fail = buildMutationFeedback(
  { _sheetsSync: { configured: true, ok: false, message: 'proxy 401' } },
  'Đã lưu BN'
);
assert.equal(fail.kind, 'failure');
assert.equal(fail.showOverlay, true);
assert.equal(fail.isWarning, true);
assert.ok(fail.bannerMessage.includes(SHEETS_NOT_UPLOADED_TITLE));
assert.equal(fail.overlayTitle, SHEETS_NOT_UPLOADED_TITLE);

const pending = buildMutationFeedback(
  { _sheetsSync: { configured: true, ok: false, pending: true, message: 'đang đồng bộ' } },
  'Đã lưu BN'
);
assert.equal(pending.kind, 'pending');
assert.equal(pending.isWarning, true);
assert.equal(pending.showOverlay, false);
assert.ok(pending.bannerMessage.includes('đang đồng bộ'));

const ok = buildMutationFeedback(
  { _sheetsSync: { configured: true, ok: true, message: 'ok' } },
  'Đã lưu BN'
);
assert.equal(ok.kind, 'success');
assert.equal(ok.isWarning, false);
assert.ok(ok.bannerMessage.includes(SHEETS_SUCCESS_MESSAGE));

assert.equal(
  evaluateSheetsSync({}).kind,
  'none'
);

const pendingBadge = formatSheetsSyncStatusLabel({
  configured: true,
  lastPullAt: Date.now(),
  lastPullOk: true,
  lastPullMessage: 'ok',
  lastPushAt: Date.now(),
  lastPushOk: true,
  lastPushMessage: 'đang đồng bộ',
  lastPushPending: true
});
assert.equal(pendingBadge.tone, 'warn');
assert.ok(pendingBadge.label.toLowerCase().includes('đang đẩy'));

const errorBadge = formatSheetsSyncStatusLabel({
  configured: true,
  lastPullAt: Date.now(),
  lastPullOk: false,
  lastPullMessage: 'Apps Script trả về HTTP 401',
  lastPushAt: 0,
  lastPushOk: true,
  lastPushMessage: ''
});
assert.equal(errorBadge.tone, 'error');

console.log('sheets-sync-feedback: ok');
