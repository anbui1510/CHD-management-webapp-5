import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import { Label } from '../../components/ui/label';
import { getSpreadsheetUrl, setSpreadsheetConnection } from './sheetStorage';

export function ConnectSheetDialog({ open, onOpenChange, onConnected }) {
  const [value, setValue] = useState(() => getSpreadsheetUrl());
  const [error, setError] = useState('');

  const handleSave = () => {
    setError('');
    try {
      const id = setSpreadsheetConnection(value);
      onConnected?.(id);
      onOpenChange?.(false);
    } catch (e) {
      setError(e.message || 'Không lưu được link Sheet.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kết nối sổ lịch khoa</DialogTitle>
          <DialogDescription>
            Dán link Google Spreadsheet của khoa (admin giữ file). Quyền sửa/xem theo tab <strong>NhanSu</strong>.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-2 py-2">
          <Label htmlFor="sheet-url">Link Google Sheet</Label>
          <Input
            id="sheet-url"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="https://docs.google.com/spreadsheets/d/..."
          />
          {error && <p className="text-sm text-destructive">{error}</p>}
        </div>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange?.(false)}>
            Đóng
          </Button>
          <Button type="button" onClick={handleSave}>
            Lưu kết nối
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
