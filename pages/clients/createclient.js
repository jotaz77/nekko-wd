
document.addEventListener('DOMContentLoaded', async () => {
  const form = document.getElementById('clientForm');
  const saveButton = document.getElementById('saveClientButton');
  const saveButtonText = document.getElementById('saveClientButtonText');
  const messageBox = document.getElementById('clientFormMessage');

  const fields = {
    name: document.getElementById('clientName'),
    document: document.getElementById('clientDocument'),
    email: document.getElementById('clientEmail'),
    phone: document.getElementById('clientPhone'),
    whatsapp: document.getElementById('clientWhatsapp'),
    zipCode: document.getElementById('clientZipCode'),
    street: document.getElementById('clientStreet'),
    number: document.getElementById('clientNumber'),
    complement: document.getElementById('clientComplement'),
    neighborhood: document.getElementById('clientNeighborhood'),
    city: document.getElementById('clientCity'),
    state: document.getElementById('clientState'),
    notes: document.getElementById('clientNotes')
  };

  let context = null;
  let isSaving = false;

  function showMessage(message, type = 'error') {
    messageBox.textContent = message;
    messageBox.classList.remove(
      'hidden',
      'border-red-500/30',
      'bg-red-500/10',
      'text-red-300',
      'border-green-500/30',
      'bg-green-500/10',
      'text-green-300'
    );

    if (type === 'success') {
      messageBox.classList.add(
        'border-green-500/30',
        'bg-green-500/10',
        'text-green-300'
      );
    } else {
      messageBox.classList.add(
        'border-red-500/30',
        'bg-red-500/10',
        'text-red-300'
      );
    }
  }

  function hideMessage() {
    messageBox.textContent = '';
    messageBox.classList.add('hidden');
  }

  function setSaving(saving) {
    isSaving = saving;
    saveButton.disabled = saving;

    if (saving) {
      saveButtonText.textContent = 'Salvando...';
    } else {
      saveButtonText.textContent = 'Salvar cliente';
    }
  }

  function valueOf(field) {
    return field.value.trim();
  }

  function getAddress() {
    return {
      zip_code: valueOf(fields.zipCode),
      street: valueOf(fields.street),
      number: valueOf(fields.number),
      complement: valueOf(fields.complement),
      neighborhood: valueOf(fields.neighborhood),
      city: valueOf(fields.city),
      state: valueOf(fields.state).toUpperCase()
    };
  }

  function getAddressForDatabase() {
    const address = getAddress();

    const hasAddress = Object.values(address).some(value => value !== '');

    return hasAddress ? address : null;
  }

  function validateForm() {
    const name = valueOf(fields.name);

    if (!name) {
      fields.name.focus();
      showMessage('Informe o nome do cliente ou a razão social.');
      return false;
    }

    const email = valueOf(fields.email);

    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      fields.email.focus();
      showMessage('Informe um endereço de e-mail válido.');
      return false;
    }

    const state = valueOf(fields.state);

    if (state && state.length !== 2) {
      fields.state.focus();
      showMessage('O estado deve ser informado com duas letras, por exemplo: SP.');
      return false;
    }

    return true;
  }

  async function initialize() {
    try {
      if (!window.NekkoBootstrap || typeof window.NekkoBootstrap.init !== 'function') {
        throw new Error('O módulo de inicialização do NEKKO não foi carregado.');
      }

      const result = await window.NekkoBootstrap.init();

      if (!result || result.status !== 'ready') {
        if (result?.status === 'unauthenticated') {
          window.location.href = '../login/login.html';
          return;
        }

        if (result?.status === 'no_company') {
          showMessage('Sua conta ainda não está vinculada a uma empresa.');
          form.querySelectorAll('input, textarea, button[type="submit"]').forEach(element => {
            element.disabled = true;
          });
          return;
        }

        if (result?.status === 'no_store') {
          showMessage('Nenhuma filial ativa foi encontrada. Selecione ou cadastre uma filial antes de continuar.');
          form.querySelectorAll('input, textarea, button[type="submit"]').forEach(element => {
            element.disabled = true;
          });
          return;
        }

        throw new Error('Não foi possível inicializar o contexto da empresa e da filial.');
      }

      context = result;

      if (!window.supabaseClient && !window.supabase) {
        throw new Error('A conexão com o Supabase não foi encontrada.');
      }
    } catch (error) {
      console.error('Erro ao inicializar cadastro de cliente:', error);
      showMessage(error.message || 'Não foi possível preparar o cadastro de cliente.');
    }
  }

  async function saveClient() {
    if (isSaving) return;

    hideMessage();

    if (!validateForm()) return;

    if (!context) {
      showMessage('O sistema ainda está carregando os dados da empresa. Aguarde e tente novamente.');
      return;
    }

    const supabase =
      window.supabaseClient ||
      window.supabase;

    if (!supabase || typeof supabase.from !== 'function') {
      showMessage('A conexão com o banco de dados não está disponível.');
      return;
    }

    const clientData = {
      company_id: context.company_id,
      store_id: context.active_store_id,
      name: valueOf(fields.name),
      document: valueOf(fields.document) || null,
      phone: valueOf(fields.phone) || null,
      whatsapp: valueOf(fields.whatsapp) || null,
      email: valueOf(fields.email) || null,
      address: getAddressForDatabase(),
      notes: valueOf(fields.notes) || null
    };

    if (!clientData.company_id || !clientData.store_id) {
      showMessage('Não foi possível identificar a empresa ou a filial ativa.');
      return;
    }

    setSaving(true);

    try {
      const { data: authData, error: authError } = await supabase.auth.getUser();

      if (authError) throw authError;

      const user = authData?.user;

      if (!user) {
        window.location.href = '../login/login.html';
        return;
      }

      clientData.created_by = user.id;

      const { error } = await supabase
        .from('clients')
        .insert([clientData]);

      if (error) {
        console.error('Erro do Supabase ao salvar cliente:', error);

        if (error.code === '23505') {
          throw new Error('Já existe um registro com esses dados. Verifique se o cliente já está cadastrado.');
        }

        if (error.code === '42501' || error.code === '403') {
          throw new Error('O banco de dados bloqueou o cadastro. Verifique as permissões e políticas RLS da tabela clients.');
        }

        throw new Error(error.message || 'O banco de dados não conseguiu salvar o cliente.');
      }

      showMessage('Cliente cadastrado com sucesso! Redirecionando...', 'success');

      saveButtonText.textContent = 'Cadastro concluído';

      window.setTimeout(() => {
        window.location.href = 'clients.html';
      }, 1000);
    } catch (error) {
      console.error('Erro ao cadastrar cliente:', error);
      showMessage(error.message || 'Ocorreu um erro ao cadastrar o cliente.');
    } finally {
      setSaving(false);
    }
  }

  form.addEventListener('submit', async event => {
    event.preventDefault();
    await saveClient();
  });

  Object.values(fields).forEach(field => {
    field.addEventListener('input', hideMessage);
  });

  await initialize();
});
