import React, { useState } from 'react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getSpreadsheetId, getSpreadsheetUrl } from './sheetStorage';

export function SheetConnectionSettings({ readOnly, busy, onSave }) {
  const [value, setValue] = useState(() => getSpreadsheetUrl() || getSpreadsheetId());
  const [error, setError] = useState('');
  const sheetId = getSpreadsheetId();

  const submit = (event) => {
    event.preventDefault();
    setError('');
    if (readOnly) return;
    const trimmed = String(value || '').trim();
    if (!trimmed) {
      setError('Nhập link Google Sheet hoặc ID sổ.');
      return;
    }
    onSave?.(trimmed).catch((e) => {
      setError(e?.message || 'Không lưu được kết nối sổ.');
    });
  };

  return (
    <form className="account-card space-y-3" onSubmit={submit}>
      <div>
        <h3>Sổ lịch Google Sheet</h3>
        <p className="form-hint">
          Một Spreadsheet / khoa. Lịch và nhân sự đồng bộ qua tab trên Sheet; quyền theo <strong>NhanSu</strong>.
        </p>
      </div>
      {sheetId && (
        <p className="form-hint">
          ID đang dùng: <code>{sheetId}</code>
        </p>
      )}
      <div className="grid gap-2">
        <Label htmlFor="settings-sheet-url">Link Google Sheet</Label>
        <Input
          id="settings-sheet-url"
          value={value}
          readOnly={readOnly}
          disabled={busy}
          onChange={(e) => setValue(e.target.value)}
          placeholder="https://docs.google.com/spreadsheets/d/..."
        />
        {readOnly && (
          <p className="form-hint">Chỉ quản trị khoa được đổi sổ. Liên hệ TK nếu cần chuyển file lưu trữ.</p>
        )}
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
      {!readOnly && (
        <Button type="submit" disabled={busy}>
          Lưu kết nối sổ
        </Button>
      )}
    </form>
  );
}
