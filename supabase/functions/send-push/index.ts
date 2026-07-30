// Edge Function « send-push » : l'unique porte de sortie des notifications.
//
// Deux modes :
//  • { test: true } — un utilisateur connecté s'envoie une notification de
//    test sur ses propres appareils (US-6.1, critère 3) ;
//  • { profile_ids, title, body, data } — envoi ciblé, réservé aux appels
//    internes munis de la clé service (déclencheurs des US-6.2 à 6.4).
//
// Les jetons signalés « DeviceNotRegistered » par Expo sont supprimés :
// un appareil réinitialisé ne doit pas être notifié pour toujours.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Payload = {
  test?: boolean;
  profile_ids?: string[];
  title?: string;
  body?: string;
  data?: Record<string, unknown>;
};

const ExpoPushUrl = 'https://exp.host/--/api/v2/push/send';

Deno.serve(async (req: Request) => {
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const admin = createClient(supabaseUrl, serviceKey);

  const authHeader = req.headers.get('Authorization') ?? '';
  const bearer = authHeader.replace(/^Bearer\s+/i, '');
  const isService = bearer === serviceKey;

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'INVALID_JSON' }), { status: 400 });
  }

  let profileIds: string[] = [];
  let title = 'EGIDE';
  let body = '';
  let data: Record<string, unknown> = {};

  if (payload.test) {
    // Test : uniquement vers soi-même, identité tirée du JWT.
    const { data: userData, error } = await admin.auth.getUser(bearer);
    if (error || !userData.user) {
      return new Response(JSON.stringify({ error: 'UNAUTHORIZED' }), { status: 401 });
    }
    profileIds = [userData.user.id];
    title = 'EGIDE — test';
    body = 'Les notifications fonctionnent sur cet appareil.';
  } else {
    // Envoi ciblé : clé service exigée, jamais un JWT utilisateur.
    if (!isService) {
      return new Response(JSON.stringify({ error: 'FORBIDDEN' }), { status: 403 });
    }
    profileIds = payload.profile_ids ?? [];
    title = payload.title ?? 'EGIDE';
    body = payload.body ?? '';
    data = payload.data ?? {};
  }

  if (profileIds.length === 0 || body === '') {
    return new Response(JSON.stringify({ sent: 0 }), { status: 200 });
  }

  const { data: tokens } = await admin
    .from('push_tokens')
    .select('token')
    .in('profile_id', profileIds);

  const list = (tokens ?? []).map((row: { token: string }) => row.token);
  if (list.length === 0) {
    return new Response(JSON.stringify({ sent: 0, reason: 'NO_TOKENS' }), { status: 200 });
  }

  // L'API Expo accepte 100 messages par requête.
  let sent = 0;
  const dead: string[] = [];
  for (let i = 0; i < list.length; i += 100) {
    const batch = list.slice(i, i + 100).map((token) => ({ to: token, title, body, data }));
    const response = await fetch(ExpoPushUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(batch),
    });
    const result = await response.json();
    const tickets = (result.data ?? []) as { status: string; details?: { error?: string } }[];
    tickets.forEach((ticket, index) => {
      if (ticket.status === 'ok') sent += 1;
      else if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[index].to);
    });
  }

  if (dead.length > 0) {
    await admin.from('push_tokens').delete().in('token', dead);
  }

  return new Response(JSON.stringify({ sent, removed: dead.length }), {
    headers: { 'Content-Type': 'application/json' },
  });
});
