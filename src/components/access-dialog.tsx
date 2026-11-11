"use client";

import { useId, useRef, type ReactNode } from "react";
import styles from "./access-dialog.module.css";

export function AccessDialog({ label, title, children, navigation = false }: {
  label: string; title: string; children: ReactNode; navigation?: boolean;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  function close() {
    dialog.current?.close();
    trigger.current?.focus();
  }
  return <>
    <button ref={trigger} type="button" className={navigation ? "nav-login" : styles.link}
      aria-haspopup="dialog" onClick={() => dialog.current?.showModal()}>
      {navigation ? <svg viewBox="0 0 24 24" aria-hidden="true" width="24" height="24">
        <path fill="currentColor" d="M9 2h12v20H9v-3h9V5H9zm0 5 5 5-5 5v-3H2v-4h7z" />
      </svg> : null}
      {label}
    </button>
    <dialog ref={dialog} className={styles.dialog} aria-labelledby={titleId}
      onClose={() => trigger.current?.focus()}
      onCancel={(event) => { event.preventDefault(); close(); }}
      onClick={(event) => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right ||
            event.clientY < bounds.top || event.clientY > bounds.bottom) {
          close();
        }
      }}>
      <header className={styles.header}>
        <h2 id={titleId}>{title}</h2>
        <button type="button" aria-label="Cerrar" onClick={close}>×</button>
      </header>
      {children}
    </dialog>
  </>;
}
