
/**
 * NEKKO WD — Cadastro da primeira unidade
 * Registra a unidade vinculada à empresa do usuário autenticado.
 */
(() => {
  'use strict';

  const supabase = window.supabaseClient;

  const form = document.getElementById('storeForm');
  const nameInput = document.getElementById('storeName');
  const codeInput = document.getElementById('storeCode');
  const phoneInput = document.getElementById('storePhone');
  const addressInput = document.getElementById('storeAddress');
  const createButton = document.getElementById('createStoreButton');
  const message = document.getElementById('message');

  if (!supabase || !window.NekkoAuth) {
    showMessage(
      'Não foi possível inicializar o sistema. Recarregue a página.'
    );
    return;
  }

  function showMessage(text, type = 'error') {
    message.textContent = text;
    message.className = 'mb-5 rounded-lg border p-3 text-sm';

    if (type === 'success') {
      message.classList.add(
        'border-green-500/20',
        'bg-green-500/10',
        'text-green-400'
      );
    } else {
      message.classList.add(
        'border-red-500/20',
        'bg-red-500/10',
        'text-red-400'
      );
    }
  }

  function clearMessage() {
    message.textContent = '';
    message.className = 'hidden mb-5 rounded-lg border p-3 text-sm';
  }

  function setLoading(loading) {
    createButton.disabled = loading;

    createButton.textContent = loading
      ? 'Finalizando configuração...'
      : 'Finalizar configuração';

    createButton.classList.toggle('opacity-60', loading);
    createButton.classList.toggle('cursor-not-allowed', loading);
  }

  function getFriendlyError(error) {
    console.error('[NEKKO WD] Erro no cadastro da unidade:', error);

    const text = String(error?.message || '').toLowerCase();

    if (
      text.includes('row-level security') ||
      text.includes('permission denied')
    ) {
      return 'O banco bloqueou esta operação por uma regra de segurança (RLS). Precisamos verificar as permissões do Supabase.';
    }

    if (text.includes('duplicate key')) {
      return 'Já existe um registro com algum desses dados. Confira o código da unidade e tente novamente.';
    }

    if (
      text.includes('failed to fetch') ||
      text.includes('network')
    ) {
      return 'Não foi possível conectar ao Supabase. Verifique sua conexão.';
    }

    return error?.message || 'Não foi possível cadastrar a unidade.';
  }

  async function getActiveMembership(userId) {
    const { data, error } = await supabase
      .from('company_members')
      .select('id, company_id, user_id, role, store_id, is_active')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    return data?.[0] || null;
  }

  async function getExistingStores(companyId) {
    const { data, error } = await supabase
      .from('stores')
      .select('id, name, company_id, is_active')
      .eq('company_id', companyId)
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    return data || [];
  }

  async function initializePage() {
    try {
      const user = await window.NekkoAuth.getCurrentUser();

      if (!user) {
        window.location.replace('../login/login.html');
        return;
      }

      const membership = await getActiveMembership(user.id);

      if (!membership) {
        window.location.replace('company.html');
        return;
      }

      const existingStores = await getExistingStores(
        membership.company_id
      );

      // Evita cadastrar outra unidade ao atualizar ou reabrir a página.
      if (existingStores.length > 0) {
        const result = await window.NekkoBootstrap.init();

        if (result?.status === 'ready') {
          window.location.replace('../menu/index.html');
          return;
        }

        showMessage(
          'Sua empresa já possui uma unidade. Não foi possível concluir o redirecionamento. Recarregue a página.'
        );
      }
    } catch (error) {
      showMessage(getFriendlyError(error));
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const name = nameInput.value.trim();
    const code = codeInput.value.trim();
    const phone = phoneInput.value.trim();
    const address = addressInput.value.trim();

    if (name.length < 2) {
      showMessage('Informe um nome válido para a unidade.');
      nameInput.focus();
      return;
    }

    setLoading(true);

    try {
      const user = await window.NekkoAuth.getCurrentUser();

      if (!user) {
        window.location.replace('../login/login.html');
        return;
      }

      const membership = await getActiveMembership(user.id);

      if (!membership) {
        window.location.replace('company.html');
        return;
      }

      const allowedRoles = ['CEO', 'MANAGER'];

      if (!allowedRoles.includes(membership.role)) {
        showMessage(
          'Seu usuário não tem permissão para cadastrar uma unidade.'
        );
        return;
      }

      // Verifica novamente para reduzir o risco de duplicação.
      const existingStores = await getExistingStores(
        membership.company_id
      );

      if (existingStores.length > 0) {
        const result = await window.NekkoBootstrap.init();

        if (result?.status === 'ready') {
          window.location.replace('../menu/index.html');
          return;
        }

        showMessage(
          'Já existe uma unidade cadastrada. Verifique o acesso antes de continuar.'
        );
        return;
      }

      const storeData = {
        company_id: membership.company_id,
        name,
        code: code || null,
        phone: phone || null,
        address: address ? { full_address: address } : {},
        is_active: true
      };

      const { data: store, error: storeError } = await supabase
        .from('stores')
        .insert(storeData)
        .select('id, company_id, name')
        .single();

      if (storeError) throw storeError;

      showMessage('Unidade cadastrada! Preparando seu ambiente...', 'success');

      // Recarrega o contexto da empresa e seleciona a unidade.
      const result = await window.NekkoBootstrap.init();

      if (result?.status !== 'ready') {
        console.error(
          '[NEKKO WD] Unidade criada, mas a inicialização retornou:',
          result
        );

        showMessage(
          'A unidade foi cadastrada, mas não foi possível preparar o acesso automaticamente. Não envie o formulário novamente; tente entrar novamente pelo login.',
          'error'
        );
        return;
      }

      window.location.replace('../menu/index.html');

    } catch (error) {
      showMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  });

  initializePage();
})();
