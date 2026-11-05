import { createPortal } from 'react-dom';

/** Render modals on document.body so mobile overflow parents cannot trap them. */
export function ModalPortal({ children }) {
  if (typeof document === 'undefined') return null;
  return createPortal(children, document.body);
}
