import { useLayoutEffect, useRef } from 'react';

export default function Modal({ id, titleId, descriptionId, initialFocus, busy = false, onClose, children, className }) {
  const dialog = useRef(null);
  useLayoutEffect(() => {
    const node = dialog.current;
    node.showModal();
    node.querySelector(`#${initialFocus}`)?.focus();
    return () => { if (node.open) node.close(); };
  }, [initialFocus]);
  return <dialog ref={dialog} id={id} className={className} aria-labelledby={titleId} aria-describedby={descriptionId}
    onCancel={event => { event.preventDefault(); if (!busy) onClose(); }}>
    {children}
  </dialog>;
}
