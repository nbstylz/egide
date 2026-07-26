import { useEffect } from 'react';

type Props = {
  message: string;
  onDone: () => void;
  variant?: 'success' | 'danger';
  /** Action facultative, affichée à droite du message (ex. « Annuler »). */
  action?: { label: string; onPress: () => void };
  /** Durée d'affichage en millisecondes. */
  duration?: number;
};

/** Message de confirmation en bas à droite, avec action d'annulation possible. */
export function Toast({ message, onDone, variant = 'success', action, duration = 4000 }: Props) {
  useEffect(() => {
    const timer = setTimeout(onDone, duration);
    return () => clearTimeout(timer);
  }, [onDone, duration]);

  return (
    <div className={`toast${variant === 'danger' ? ' toast-danger' : ''}`} aria-live="polite">
      <span>
        {variant === 'success' ? '✓ ' : ''}
        {message}
      </span>
      {action ? (
        <button
          className="toast-action"
          onClick={() => {
            action.onPress();
            onDone();
          }}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
