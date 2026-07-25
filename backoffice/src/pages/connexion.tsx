import { useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';

import { supabase } from '../lib/supabase';

/** Traduit les erreurs d'authentification Supabase les plus courantes. */
function translateAuthError(message: string): string {
  if (message.includes('Invalid login credentials')) {
    return 'Email ou mot de passe incorrect.';
  }
  if (message.includes('Email not confirmed')) {
    return 'Confirme d’abord ton email : un lien t’a été envoyé par mail.';
  }
  return 'Connexion impossible. Vérifiez votre connexion internet et réessayez.';
}

export function ConnexionPage({ sessionExpired }: { sessionExpired?: boolean }) {
  const navigate = useNavigate();
  const location = useLocation();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<{ email?: string; password?: string }>({});
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;

    const nextFieldErrors: typeof fieldErrors = {};
    if (!email.trim()) nextFieldErrors.email = 'Indiquez votre email.';
    if (!password) nextFieldErrors.password = 'Indiquez votre mot de passe.';
    setFieldErrors(nextFieldErrors);
    if (Object.keys(nextFieldErrors).length > 0) return;

    setBusy(true);
    setError(null);
    const { error: authError } = await supabase.auth.signInWithPassword({ email, password });
    setBusy(false);

    if (authError) {
      setError(translateAuthError(authError.message));
    } else {
      // Retour vers la page initialement demandée, sinon la liste.
      const from = (location.state as { from?: string } | null)?.from ?? '/tournois';
      navigate(from, { replace: true });
    }
  }

  return (
    <div className="login-page">
      <div style={{ width: '100%', maxWidth: 400 }}>
        {sessionExpired ? (
          <div className="banner banner-info" style={{ marginBottom: 16 }}>
            Votre session a expiré. Reconnectez-vous.
          </div>
        ) : null}
        <form className="login-card" onSubmit={handleSubmit}>
          <div className="login-logo">EGIDE</div>
          <div className="login-subtitle">Espace organisateur</div>

          <div className="field">
            <label htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              className={`input${fieldErrors.email ? ' input-error' : ''}`}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              disabled={busy}
            />
            {fieldErrors.email ? <div className="field-error">{fieldErrors.email}</div> : null}
          </div>

          <div className="field">
            <label htmlFor="password">Mot de passe</label>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                id="password"
                type={showPassword ? 'text' : 'password'}
                autoComplete="current-password"
                className={`input${fieldErrors.password ? ' input-error' : ''}`}
                style={{ flex: 1 }}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                disabled={busy}
              />
              <button
                type="button"
                className="btn btn-secondary"
                aria-label={showPassword ? 'Masquer le mot de passe' : 'Afficher le mot de passe'}
                onClick={() => setShowPassword((v) => !v)}>
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
            {fieldErrors.password ? (
              <div className="field-error">{fieldErrors.password}</div>
            ) : null}
          </div>

          {error ? <div className="banner banner-danger">{error}</div> : null}

          <button type="submit" className="btn btn-primary btn-block" disabled={busy}>
            {busy ? 'Connexion…' : 'Se connecter'}
          </button>

          <p className="login-note">
            Pas encore de compte ? Créez-le depuis l’application mobile EGIDE, puis
            connectez-vous ici avec les mêmes identifiants.
          </p>
        </form>
      </div>
    </div>
  );
}
