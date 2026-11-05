import React from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '../../components/ui/dialog';
import { Button } from '../../components/ui/button';

export function BootstrapKhoaDialog({
  open,
  onOpenChange,
  staffCount = 0,
  taskCount = 0,
  tenantLabel = '',
  busy = false,
  onConfirm,
}) {
  const hasLocalData = staffCount > 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Thiết lập khoa mới</DialogTitle>
          <DialogDescription>
            Google Sheet của {tenantLabel || 'khoa'} chưa có nhân sự (
            <strong>NhanSu</strong> trống). Bạn (
            <strong>admin</strong>) sẽ được ghi vào Sheet cùng dữ liệu hiện trên app.
          </DialogDescription>
        </DialogHeader>
        <ul className="text-sm text-muted-foreground list-disc pl-5 space-y-1 py-2">
          <li>
            Nhân sự trên app: <strong>{staffCount}</strong>
            {hasLocalData ? ' (sẽ đẩy lên Sheet)' : ' — thêm BS sau trong Quản lý BS'}
          </li>
          <li>
            Task mẫu: <strong>{taskCount}</strong>
          </li>
          <li>Sau thiết lập, sửa trên app hoặc Sheet sẽ đồng bộ (kéo Sheet khi quay lại tab / nút Đồng bộ).</li>
        </ul>
        <DialogFooter>
          <Button type="button" variant="outline" disabled={busy} onClick={() => onOpenChange?.(false)}>
            Để sau
          </Button>
          <Button type="button" disabled={busy} onClick={onConfirm}>
            {busy ? 'Đang ghi Sheet…' : 'Thiết lập & đồng bộ'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
