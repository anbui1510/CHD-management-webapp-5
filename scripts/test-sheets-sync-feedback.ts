import assert from 'node:assert/strict';
import { buildMutationFeedback } from '../src/utils/sheetsSyncMutation';
import {
  evaluateSheetsSync,
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

console.log('sheets-sync-feedback: ok');
