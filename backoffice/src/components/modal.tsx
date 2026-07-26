import { useEffect, useRef } from 'react';

type Props = {
  title: string;
  onClose: () => void;
  /** Empêche la fermeture (Échap, clic sur le fond) pendant une écriture en base. */
  locked?: boolean;
  children: React.ReactNode;
};

/** Modale maison : overlay, Échap pour fermer, focus initial dedans. */
export function Modal({ title, onClose, locked = false, children }: Props) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape' && !locked) onClose();
    }
    document.addEventListener('keydown', onKeyDown);
    // Focus sur le premier élément focusable de la modale.
    const focusable = ref.current?.querySelector<HTMLElement>('input, button');
    focusable?.focus();
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose, locked]);

  return (
    <div
      className="modal-overlay"
      onClick={() => {
        if (!locked) onClose();
      }}>
      <div
        className="modal"
        role="dialog"
        aria-labelledby="modal-title"
        ref={ref}
        onClick={(event) => event.stopPropagation()}>
        <h2 id="modal-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
