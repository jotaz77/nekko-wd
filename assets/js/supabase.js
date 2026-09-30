// NEKKO WD — Inicialização do Supabase

(() => {
  'use strict';

  if (!window.NEKKO_CONFIG) {
    throw new Error(
      '[NEKKO WD] Configuração não encontrada. Carregue config.js primeiro.'
    );
  }

  if (!window.supabase || typeof window.supabase.createClient !== 'function') {
    throw new Error(
      '[NEKKO WD] Biblioteca Supabase não encontrada. Carregue o CDN primeiro.'
    );
  }

  if (window.supabaseClient) {
    console.warn('[NEKKO WD] Cliente Supabase já inicializado.');
    return;
  }

  const { SUPABASE_URL, SUPABASE_ANON_KEY } = window.NEKKO_CONFIG;

  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error(
      '[NEKKO WD] URL ou chave pública do Supabase não configurada.'
    );
  }

  window.supabaseClient = window.supabase.createClient(
    SUPABASE_URL,
    SUPABASE_ANON_KEY,
    {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true
      }
    }
  );

  console.info('[NEKKO WD] Cliente Supabase inicializado.');
})();
