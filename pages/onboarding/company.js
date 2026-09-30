
/**
 * NEKKO WD — Cadastro da empresa
 * Cria a empresa e vincula o usuário autenticado como CEO.
 */

(() => {
  'use strict';

  const supabase = window.supabaseClient;

  const form = document.getElementById('companyForm');
  const nameInput = document.getElementById('companyName');
  const documentInput = document.getElementById('document');
  const phoneInput = document.getElementById('phone');
  const emailInput = document.getElementById('email');
  const addressInput = document.getElementById('address');
  const continueButton = document.getElementById('continueButton');
  const message = document.getElementById('message');

  if (!supabase || !window.NekkoAuth) {
    showMessage('Não foi possível inicializar o sistema. Recarregue a página.');
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
    continueButton.disabled = loading;
    continueButton.innerHTML = loading
      ? 'Salvando empresa...'
      : 'Continuar <i data-lucide="arrow-right" class="h-4 w-4"></i>';

    if (window.lucide) {
      window.lucide.createIcons();
    }
  }

  function getFriendlyError(error) {
    console.error('[NEKKO WD] Erro no cadastro da empresa:', error);

    const text = String(error?.message || '').toLowerCase();

    if (text.includes('row-level security') || text.includes('permission denied')) {
      return 'O banco bloqueou esta operação por uma regra de segurança (RLS). Precisamos verificar as permissões do Supabase.';
    }

    if (text.includes('duplicate key')) {
      return 'Já existe um registro com esses dados. Atualize a página e tente novamente.';
    }

    if (text.includes('failed to fetch')) {
      return 'Não foi possível conectar ao Supabase. Verifique sua conexão.';
    }

    return error?.message || 'Não foi possível cadastrar a empresa.';
  }

  async function checkExistingCompany(userId) {
    const { data, error } = await supabase
      .from('company_members')
      .select('company_id')
      .eq('user_id', userId)
      .eq('is_active', true)
      .limit(1);

    if (error) throw error;

    return data?.[0] || null;
  }

  async function initializePage() {
    try {
      const user = await window.NekkoAuth.getCurrentUser();

      if (!user) {
        window.location.replace('../login/login.html');
        return;
      }

      const existingMembership = await checkExistingCompany(user.id);

      if (existingMembership) {
        window.location.replace('stores.html');
      }
    } catch (error) {
      showMessage(getFriendlyError(error));
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearMessage();

    const name = nameInput.value.trim();
    const document = documentInput.value.trim();
    const phone = phoneInput.value.trim();
    const email = emailInput.value.trim().toLowerCase();
    const address = addressInput.value.trim();

    if (name.length < 2) {
      showMessage('Informe o nome da sua marcenaria.');
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

      // Evita cadastrar outra empresa caso o usuário já tenha vínculo.
      const existingMembership = await checkExistingCompany(user.id);

      if (existingMembership) {
        window.location.replace('stores.html');
        return;
      }

      // Mantém os dados básicos do usuário na tabela profiles.
      const fullName =
        user.user_metadata?.full_name ||
        user.user_metadata?.name ||
        user.email?.split('@')[0] ||
        '';

      const profileData = {
        id: user.id,
        full_name: fullName,
        phone: user.user_metadata?.phone || null
      };

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert(profileData, { onConflict: 'id' });

      if (profileError) throw profileError;

      // O endereço é armazenado no campo JSONB da tabela companies.
      const companyData = {
        name,
        document: document || null,
        phone: phone || null,
        email: email || null,
        address: address ? { full_address: address } : {},
        owner_user_id: user.id
      };

      const { data: company, error: companyError } = await supabase
        .from('companies')
        .insert(companyData)
        .select('id, name')
        .single();

      if (companyError) throw companyError;

      // Vincula o usuário à empresa como CEO.
      const { error: membershipError } = await supabase
        .from('company_members')
        .insert({
          company_id: company.id,
          user_id: user.id,
          store_id: null,
          role: 'CEO',
          is_active: true
        });

      if (membershipError) {
        console.error(
          '[NEKKO WD] A empresa foi criada, mas o vínculo falhou:',
          membershipError
        );

        showMessage(
          'A empresa foi criada, mas não foi possível concluir seu vínculo de administrador. Não envie o formulário novamente; verifique as permissões do Supabase.',
          'error'
        );

        return;
      }

      showMessage('Empresa cadastrada com sucesso!', 'success');

      window.setTimeout(() => {
        window.location.href = 'stores.html';
      }, 900);

    } catch (error) {
      showMessage(getFriendlyError(error));
    } finally {
      setLoading(false);
    }
  });

  initializePage();
})();
