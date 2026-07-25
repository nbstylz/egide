import { useEffect } from 'react';

/** Toast de succès (coin bas-droit, disparaît après 4 s). */
export function Toast({ message, onDone }: { message: string; onDone: () => void }) {
  useEffect(() => {
    const timer = setTimeout(onDone, 4000);
    return () => clearTimeout(timer);
  }, [onDone]);

  return <div className="toast">✓ {message}</div>;
}
