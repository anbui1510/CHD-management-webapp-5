import React, { useCallback, useRef, useState } from 'react';
import { AlertTriangle, Save, Info } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogMedia,
  AlertDialogTitle,
} from './ui/alert-dialog';

const ICONS = {
  danger: AlertTriangle,
  primary: Save,
  info: Info,
};

const MEDIA_CLASS = {
  danger:
    'bg-destructive/10 text-destructive dark:bg-destructive/20 dark:text-destructive',
  primary: 'bg-emerald-500/15 text-emerald-600 dark:text-emerald-400',
  info: 'bg-muted text-muted-foreground',
};

/** Primary CTA: brand emerald (legacy action-btn), not Nova black — structure from an_ui AlertDialog. */
const PRIMARY_ACTION_CLASS =
  'bg-[var(--accent-emerald,#10b981)] text-white hover:bg-[#059669] focus-visible:border-emerald-600/40 focus-visible:ring-emerald-500/30';

/**
 * Confirm UI theo AlertDialog base-nova từ anbui1510/an_ui (fork shadcn/ui).
 * Controlled open — portal sẵn trong AlertDialogContent.
 */
export function ConfirmDialog({
  title,
  message,
  confirmText = 'Đồng ý',
  cancelText = 'Hủy',
  variant = 'primary', // 'primary' | 'danger' | 'info'
  alertOnly = false,
  onConfirm,
  onCancel,
}) {
  const Icon = ICONS[variant] || Info;
  const settled = useRef(false);

  const settle = useCallback(
    (ok) => {
      if (settled.current) return;
      settled.current = true;
      if (ok) onConfirm?.();
      else onCancel?.();
    },
    [onConfirm, onCancel]
  );

  return (
    <AlertDialog
      open
      onOpenChange={(next) => {
        if (!next) settle(alertOnly);
      }}
    >
      <AlertDialogContent size="sm">
        <AlertDialogHeader>
          <AlertDialogMedia className={MEDIA_CLASS[variant] || MEDIA_CLASS.info}>
            <Icon />
          </AlertDialogMedia>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          {message ? (
            <AlertDialogDescription>{message}</AlertDialogDescription>
          ) : (
            <AlertDialogDescription className="sr-only">
              {title}
            </AlertDialogDescription>
          )}
        </AlertDialogHeader>
        <AlertDialogFooter>
          {!alertOnly && (
            <AlertDialogCancel onClick={() => settle(false)}>
              {cancelText}
            </AlertDialogCancel>
          )}
          <AlertDialogAction
            variant={variant === 'danger' ? 'destructive' : 'default'}
            className={variant === 'danger' ? undefined : PRIMARY_ACTION_CLASS}
            autoFocus
            onClick={() => settle(true)}
          >
            {alertOnly ? 'Đã hiểu' : confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}

/**
 * Hook trả về [confirm, dialogElement].
 * confirm(options) => Promise<boolean>; render dialogElement ở cuối component.
 */
export function useConfirm() {
  const [state, setState] = useState(null);

  const confirm = useCallback((options) => {
    return new Promise((resolve) => {
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result) => {
    setState((prev) => {
      prev?.resolve(result);
      return null;
    });
  }, []);

  const handleConfirm = useCallback(() => close(true), [close]);
  const handleCancel = useCallback(() => close(false), [close]);

  const dialog = state ? (
    <ConfirmDialog
      {...state}
      onConfirm={handleConfirm}
      onCancel={handleCancel}
    />
  ) : null;

  return [confirm, dialog];
}
