'use client';

import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './ConfirmDialog.module.css';

export interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  /** Styles the confirm button as destructive (red) instead of primary. */
  danger?: boolean;
  /**
   * If set, Confirm stays disabled until the user types this exact phrase —
   * the in-dialog replacement for a second window.prompt() double-check
   * (e.g. Settings' "type CLEAR to confirm" wipe).
   */
  requirePhrase?: string;
}

type ConfirmState = ConfirmOptions & { resolve: (value: boolean) => void };

const ConfirmContext = createContext<(options: ConfirmOptions) => Promise<boolean>>(
  async () => false
);

/** In-app replacement for `window.confirm` — returns a Promise<boolean> exactly like the browser API did. */
export function useConfirm() {
  return useContext(ConfirmContext);
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<ConfirmState | null>(null);
  const [typedPhrase, setTypedPhrase] = useState('');
  const cancelBtnRef = useRef<HTMLButtonElement>(null);
  const phraseInputRef = useRef<HTMLInputElement>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise<boolean>(resolve => {
      setTypedPhrase('');
      setState({ ...options, resolve });
    });
  }, []);

  const close = useCallback((result: boolean) => {
    setState(current => {
      current?.resolve(result);
      return null;
    });
  }, []);

  // Default focus goes to Cancel — a destructive action shouldn't be one
  // stray Enter-press away from firing — unless a typed phrase is required,
  // in which case the input is the obviously right place to start typing.
  useEffect(() => {
    if (!state) return;
    if (state.requirePhrase) phraseInputRef.current?.focus();
    else cancelBtnRef.current?.focus();
  }, [state]);

  const phraseSatisfied = !state?.requirePhrase || typedPhrase === state.requirePhrase;

  return (
    <ConfirmContext.Provider value={confirm}>
      {children}
      {state && (
        <>
          <div className="overlay" onClick={() => close(false)} />
          <div
            className={styles.dialog}
            role="alertdialog"
            aria-modal="true"
            aria-labelledby="confirm-dialog-title"
            onKeyDown={e => {
              if (e.key === 'Escape') { e.stopPropagation(); close(false); }
              else if (e.key === 'Enter' && phraseSatisfied) { e.preventDefault(); close(true); }
            }}
          >
            {state.danger && (
              <div className={styles.iconBadge}>
                <AlertTriangle size={20} />
              </div>
            )}
            <h3 id="confirm-dialog-title" className={styles.title}>{state.title}</h3>
            {state.message && <p className={styles.message}>{state.message}</p>}

            {state.requirePhrase && (
              <div className={styles.phraseField}>
                <label htmlFor="confirm-phrase-input" className={styles.phraseLabel}>
                  Type <strong>{state.requirePhrase}</strong> to confirm
                </label>
                <input
                  id="confirm-phrase-input"
                  ref={phraseInputRef}
                  className={styles.phraseInput}
                  value={typedPhrase}
                  onChange={e => setTypedPhrase(e.target.value)}
                  placeholder={state.requirePhrase}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>
            )}

            <div className={styles.actions}>
              <button
                ref={cancelBtnRef}
                type="button"
                className="btn btn-secondary"
                onClick={() => close(false)}
                id="btn-confirm-dialog-cancel"
              >
                {state.cancelLabel ?? 'Cancel'}
              </button>
              <button
                type="button"
                className={`btn ${state.danger ? 'btn-danger' : 'btn-primary'}`}
                onClick={() => close(true)}
                disabled={!phraseSatisfied}
                id="btn-confirm-dialog-confirm"
              >
                {state.confirmLabel ?? 'Confirm'}
              </button>
            </div>
          </div>
        </>
      )}
    </ConfirmContext.Provider>
  );
}
