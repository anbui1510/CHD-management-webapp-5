import assert from 'node:assert/strict';
import { AuthRequiredError } from '../src/auth/authErrors';
import { formatAppsScriptHttpError } from '../src/utils/appsScriptRetry';
import { readSheetsProxyText } from '../src/utils/sheetsProxyErrors';

async function expectError(response: Response, predicate: (err: unknown) => void) {
  try {
    await readSheetsProxyText(response);
    throw new Error('expected throw');
  } catch (err) {
    predicate(err);
  }
}

await expectError(
  new Response(JSON.stringify({ error: 'Yêu cầu đăng nhập để truy cập tài nguyên này.' }), { status: 401 }),
  (err) => {
    assert.ok(err instanceof AuthRequiredError || (err instanceof Error && err.name === 'AuthRequiredError'));
    assert.ok(String((err as Error).message).toLowerCase().includes('đăng nhập'));
  }
);

await expectError(
  new Response(JSON.stringify({ error: 'Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Vui lòng đăng nhập lại.' }), { status: 401 }),
  (err) => {
    assert.ok(err instanceof AuthRequiredError || (err instanceof Error && err.name === 'AuthRequiredError'));
  }
);

await expectError(
  new Response('<html>Unauthorized</html>', { status: 401 }),
  (err) => {
    assert.ok(err instanceof Error);
    assert.notEqual(err.name, 'AuthRequiredError');
    assert.equal(err.message, formatAppsScriptHttpError(401));
    assert.ok(err.message.includes('Anyone'));
  }
);

await expectError(
  new Response(JSON.stringify({ error: 'Khóa API không hợp lệ phía Sheets' }), { status: 401 }),
  (err) => {
    assert.ok(err instanceof Error);
    assert.notEqual(err.name, 'AuthRequiredError');
    assert.ok(err.message.includes('Khóa API'));
  }
);

console.log('sheets-proxy-auth: ok');
