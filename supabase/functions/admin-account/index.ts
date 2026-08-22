// Edge Function « admin-account » : désactive ou réactive un compte (US-12.4).
//
// Pourquoi une fonction Edge alors que tout le reste vit dans Postgres ?
// Parce que couper l'accès à un compte relève de Supabase Auth, pas de nos
// tables : c'est `auth.users.banned_until`, que seule l'API admin écrit, et
// elle exige la clé service — qui ne doit jamais atteindre un navigateur.
//
// Les règles, elles, restent en base. Cette fonction ne décide rien : elle
// demande d'abord à `admin_assert_can_disable()` si le geste est permis, et
// se contente d'exécuter. Un contournement de l'interface ne contourne donc
// aucune règle.
//
// Déroulé : autoriser (base) → bannir (Auth) → consigner (base). Dans cet
// ordre, un échec du bannissement ne laisse jamais une trace mensongère au
// journal.

import { createClient } from 'jsr:@supabase/supabase-js@2';

type Payload = {
  profile_id?: string;
  disabled?: boolean;
  reason?: string;
};

// Le back office est un navigateur : sans ces en-têtes, le prévol CORS
// échoue avant même d'atteindre la fonction.
const CorsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(bodyValue: unknown, status = 200): Response {
  return new Response(JSON.stringify(bodyValue), {
    status,
    headers: { ...CorsHeaders, 'Content-Type': 'application/json' },
  });
}

/** Cent ans : Supabase n'a pas de bannissement « définitif », seulement une durée. */
const ForeverBan = '876000h';

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: CorsHeaders });
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const bearer = (req.headers.get('Authorization') ?? '').replace(/^Bearer\s+/i, '');

  let payload: Payload;
  try {
    payload = await req.json();
  } catch {
    return json({ error: 'Requête illisible.' }, 400);
  }

  const profileId = payload.profile_id;
  const disabled = payload.disabled === true;
  const reason = (payload.reason ?? '').trim();
  if (!profileId) {
    return json({ error: 'Compte non précisé.' }, 400);
  }

  // Client agissant AU NOM de l'appelant : c'est ce qui fait que `auth.uid()`
  // répond en base, donc que `is_admin()` et les garde-fous s'appliquent à
  // lui et non à la clé service.
  const asUser = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: `Bearer ${bearer}` } },
  });

  // 1. La base autorise-t-elle ce geste ? (admin, motif, ni soi-même ni un
  //    autre administrateur). Ses messages sont rédigés pour être affichés.
  const { error: refusal } = await asUser.rpc('admin_assert_can_disable', {
    p_profile_id: profileId,
    p_reason: reason,
  });
  if (refusal) {
    return json({ error: refusal.message }, 403);
  }

  // 2. Le bannissement lui-même.
  const admin = createClient(supabaseUrl, serviceKey);
  const { error: banError } = await admin.auth.admin.updateUserById(profileId, {
    ban_duration: disabled ? ForeverBan : 'none',
  });
  if (banError) {
    return json({ error: `Supabase Auth a refusé : ${banError.message}` }, 502);
  }

  // 3. Le journal, une fois seulement que la mesure est réelle.
  const { error: logError } = await asUser.rpc('admin_log_account_ban', {
    p_profile_id: profileId,
    p_disabled: disabled,
    p_reason: reason,
  });

  return json({
    ok: true,
    disabled,
    // La mesure a eu lieu ; le dire même si la trace a échoué vaut mieux
    // que de laisser croire à un échec complet.
    logged: !logError,
  });
});
