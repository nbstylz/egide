import { useCallback, useEffect, useRef, useState } from 'react';

import { supabase } from '../lib/supabase';
import type { Pairing } from './use-rounds';

export type Draft = { a: string; b: string };

/** Au-delà, c'est presque sûrement une faute de frappe : on refuse la saisie. */
const MaxScore = 100;
/** Au-delà, on avertit sans bloquer : certains formats montent plus haut. */
export const UsualMaxScore = 20;

/** Ne garde que des chiffres, dans une borne raisonnable. */
export function sanitizeScore(text: string): string {
  const digits = text.replace(/[^0-9]/g, '').slice(0, 3);
  if (digits === '') return '';
  return Number(digits) > MaxScore ? digits.slice(0, -1) : digits;
}

export type Verdict =
  | { kind: 'none' }
  | { kind: 'draw' }
  | { kind: 'win'; winner: 'a' | 'b'; pseudo: string }
  | { kind: 'missing'; side: 'a' | 'b'; pseudo: string }
  | { kind: 'unusual' };

/** Ce que disent les deux champs, avant même l'enregistrement. */
export function verdictFor(pairing: Pairing, draft: Draft, showMissing: boolean): Verdict {
  const hasA = draft.a !== '';
  const hasB = draft.b !== '';

  if (!hasA && !hasB) return { kind: 'none' };
  if (hasA !== hasB) {
    if (!showMissing) return { kind: 'none' };
    return hasA
      ? { kind: 'missing', side: 'b', pseudo: pairing.player_b?.pseudo ?? 'l’adversaire' }
      : { kind: 'missing', side: 'a', pseudo: pairing.player_a?.pseudo ?? 'le joueur' };
  }

  const a = Number(draft.a);
  const b = Number(draft.b);
  if (a > UsualMaxScore || b > UsualMaxScore) return { kind: 'unusual' };
  if (a === b) return { kind: 'draw' };
  return a > b
    ? { kind: 'win', winner: 'a', pseudo: pairing.player_a?.pseudo ?? '' }
    : { kind: 'win', winner: 'b', pseudo: pairing.player_b?.pseudo ?? '' };
}

type Options = {
  pairings: Pairing[];
  editable: boolean;
  onSaved: (pairing: Pairing, previous: Draft, next: Draft, wasFilled: boolean) => void;
  onFailed: (pairing: Pairing, retry: () => void) => void;
};

/**
 * Saisie des scores : brouillons locaux, enregistrement quand une ligne
 * complète perd le focus, et navigation au clavier entre les tables.
 */
export function useScoreEntry({ pairings, editable, onSaved, onFailed }: Options) {
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  /**
   * Valeurs confirmées par le serveur. C'est cet état, et non un rechargement
   * de la liste, qui met à jour les compteurs : recharger à chaque saisie
   * ferait clignoter le tableau et perdrait le focus au clavier.
   */
  const [saved, setSaved] = useState<Record<string, Draft>>({});
  const [busyIds, setBusyIds] = useState<Set<string>>(new Set());
  const [failedIds, setFailedIds] = useState<Set<string>>(new Set());
  /** Lignes dont on a quitté le focus : on peut alors signaler un champ manquant. */
  const [touchedIds, setTouchedIds] = useState<Set<string>>(new Set());

  /** Dernières valeurs confirmées côté serveur, pour détecter les changements. */
  const savedRef = useRef<Record<string, Draft>>({});
  const inputRefs = useRef<Map<string, HTMLInputElement>>(new Map());
  const draftsRef = useRef<Record<string, Draft>>({});
  draftsRef.current = drafts;

  useEffect(() => {
    const next: Record<string, Draft> = {};
    for (const pairing of pairings) {
      next[pairing.id] = {
        a: pairing.score_a === null ? '' : String(pairing.score_a),
        b: pairing.score_b === null ? '' : String(pairing.score_b),
      };
    }
    setDrafts(next);
    setSaved(JSON.parse(JSON.stringify(next)));
    savedRef.current = JSON.parse(JSON.stringify(next));
  }, [pairings]);

  const registerInput = useCallback((key: string, element: HTMLInputElement | null) => {
    if (element) inputRefs.current.set(key, element);
    else inputRefs.current.delete(key);
  }, []);

  const setField = useCallback((pairingId: string, side: 'a' | 'b', value: string) => {
    setDrafts((current) => ({
      ...current,
      [pairingId]: { ...current[pairingId], [side]: sanitizeScore(value) },
    }));
  }, []);

  /** Enregistre une ligne si elle est complète et a changé. */
  const commit = useCallback(
    async (pairing: Pairing) => {
      if (!supabase || !editable) return;
      const draft = draftsRef.current[pairing.id];
      const saved = savedRef.current[pairing.id];
      if (!draft) return;

      const complete = draft.a !== '' && draft.b !== '';
      if (!complete) return;
      if (saved && saved.a === draft.a && saved.b === draft.b) return;

      const previous: Draft = saved ?? { a: '', b: '' };
      const wasFilled = previous.a !== '' && previous.b !== '';

      setBusyIds((current) => new Set(current).add(pairing.id));
      setFailedIds((current) => {
        const copy = new Set(current);
        copy.delete(pairing.id);
        return copy;
      });

      const { error } = await supabase.rpc('set_pairing_score', {
        p_pairing_id: pairing.id,
        p_score_a: Number(draft.a),
        p_score_b: Number(draft.b),
      });

      setBusyIds((current) => {
        const copy = new Set(current);
        copy.delete(pairing.id);
        return copy;
      });

      if (error) {
        // Retour aux valeurs confirmées : mieux vaut un champ vide qu'un
        // score que l'organisateur croit enregistré.
        setDrafts((current) => ({ ...current, [pairing.id]: { ...previous } }));
        setFailedIds((current) => new Set(current).add(pairing.id));
        setTimeout(() => {
          setFailedIds((current) => {
            const copy = new Set(current);
            copy.delete(pairing.id);
            return copy;
          });
        }, 4000);
        onFailed(pairing, () => {
          setDrafts((current) => ({ ...current, [pairing.id]: { ...draft } }));
          commit(pairing);
        });
        return;
      }

      savedRef.current[pairing.id] = { ...draft };
      setSaved((current) => ({ ...current, [pairing.id]: { ...draft } }));
      onSaved(pairing, previous, draft, wasFilled);
    },
    [editable, onSaved, onFailed]
  );

  /** Réécrit un score connu (sert au « Annuler » d'une correction). */
  const restore = useCallback(
    async (pairing: Pairing, value: Draft) => {
      if (!supabase) return;
      setDrafts((current) => ({ ...current, [pairing.id]: { ...value } }));
      const { error } = await supabase.rpc('set_pairing_score', {
        p_pairing_id: pairing.id,
        p_score_a: value.a === '' ? null : Number(value.a),
        p_score_b: value.b === '' ? null : Number(value.b),
      });
      if (!error) {
        savedRef.current[pairing.id] = { ...value };
        setSaved((current) => ({ ...current, [pairing.id]: { ...value } }));
      }
    },
    []
  );

  /** Enregistre toutes les lignes complètes en attente (changement de ronde, départ). */
  const flush = useCallback(async () => {
    for (const pairing of pairings) {
      await commit(pairing);
    }
  }, [pairings, commit]);

  const markTouched = useCallback((pairingId: string) => {
    setTouchedIds((current) => new Set(current).add(pairingId));
  }, []);

  const focusField = useCallback((pairingId: string, side: 'a' | 'b') => {
    const input = inputRefs.current.get(`${pairingId}-${side}`);
    input?.focus();
    input?.select();
  }, []);

  /** Prévient si une saisie complète n'a pas encore été confirmée. */
  useEffect(() => {
    function onBeforeUnload(event: BeforeUnloadEvent) {
      const pending = Object.entries(draftsRef.current).some(([id, draft]) => {
        const saved = savedRef.current[id];
        const complete = draft.a !== '' && draft.b !== '';
        return complete && saved && (saved.a !== draft.a || saved.b !== draft.b);
      });
      if (pending) event.preventDefault();
    }
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, []);

  return {
    drafts,
    saved,
    busyIds,
    failedIds,
    touchedIds,
    setField,
    commit,
    restore,
    flush,
    markTouched,
    focusField,
    registerInput,
  };
}
