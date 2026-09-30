// NEKKO WD — Autenticação
(() => {
  'use strict';

  function getClient() {
    if (!window.supabaseClient) {
      throw new Error(
        '[NEKKO WD] Supabase não inicializado. Verifique a ordem dos scripts.'
      );
    }

    return window.supabaseClient;
  }

  async function signUp({ email, password, fullName, phone = null }) {
    const client = getClient();

    const cleanEmail = String(email || '').trim().toLowerCase();
    const cleanName = String(fullName || '').trim();

    if (!cleanName) {
      throw new Error('Informe seu nome completo.');
    }

    if (!cleanEmail) {
      throw new Error('Informe seu e-mail.');
    }

    if (!password || String(password).length < 8) {
      throw new Error('A senha deve ter pelo menos 8 caracteres.');
    }

    const { data, error } = await client.auth.signUp({
      email: cleanEmail,
      password,
      options: {
        data: {
          full_name: cleanName,
          phone: phone ? String(phone).trim() : null
        }
      }
    });

    if (error) throw error;

    return data;
  }

  async function signIn({ email, password }) {
    const client = getClient();

    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail || !password) {
      throw new Error('Informe seu e-mail e sua senha.');
    }

    const { data, error } = await client.auth.signInWithPassword({
      email: cleanEmail,
      password
    });

    if (error) throw error;

    return data;
  }

  async function signOut() {
    const client = getClient();
    const { error } = await client.auth.signOut();

    if (error) throw error;
  }

  async function getSession() {
    const client = getClient();
    const { data, error } = await client.auth.getSession();

    if (error) throw error;

    return data.session;
  }

  async function getCurrentUser() {
    const client = getClient();
    const { data, error } = await client.auth.getUser();

    if (error) throw error;

    return data.user;
  }

  async function resetPassword(email) {
    const client = getClient();
    const cleanEmail = String(email || '').trim().toLowerCase();

    if (!cleanEmail) {
      throw new Error('Informe seu e-mail.');
    }

    const { error } = await client.auth.resetPasswordForEmail(
      cleanEmail,
      {
        redirectTo: `${window.location.origin}/pages/login/login.html`
      }
    );

    if (error) throw error;
  }

  window.NekkoAuth = Object.freeze({
    signUp,
    signIn,
    signOut,
    getSession,
    getCurrentUser,
    resetPassword
  });
})();
