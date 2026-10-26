
/** NEKKO WD — Lista e pesquisa de clientes */
(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);
  let context = null;
  let allClients = [];
  let projectCounts = new Map();
  let loading = false;

  function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    }[c]));
  }

  function normalize(value) {
    return String(value ?? '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase()
      .trim();
  }

  function digits(value) {
    return String(value ?? '').replace(/\D/g, '');
  }

  // Normaliza números brasileiros para o formato internacional usado pelo WhatsApp.
  // Ex.: (11) 98765-4321 -> 5511987654321.
  function normalizeBrazilWhatsApp(value) {
    let number = digits(value);
    if (!number) return '';

    // Remove prefixo de discagem internacional, se salvo como 0055...
    if (number.startsWith('00')) number = number.slice(2);

    // DDD + telefone brasileiro sem código do país.
    if (number.length === 10 || number.length === 11) {
      return `55${number}`;
    }

    // Número já contém o código do Brasil: 55 + DDD + telefone.
    if (number.startsWith('55') && (number.length === 12 || number.length === 13)) {
      return number;
    }

    if (number.startsWith('0')) {
      // Prefixo nacional simples: 0 + DDD + telefone.
      if (number.length === 11 || number.length === 12) {
        const localNumber = number.slice(1);
        if (localNumber.length === 10 || localNumber.length === 11) {
          return `55${localNumber}`;
        }
      }

      // Prefixo nacional com código da operadora: 0 + operadora + DDD + telefone.
      if (number.length === 13 || number.length === 14) {
        const localNumber = number.slice(3);
        if (localNumber.length === 10 || localNumber.length === 11) {
          return `55${localNumber}`;
        }
      }
    }

    // Não corta dígitos de números inválidos para evitar contato incorreto.
    return '';
  }

  function showMessage(message) {
    const el = $('clientMessage');
    if (!el) return;

    el.textContent = message;
    el.className = 'mb-4 rounded-xl border border-red-900 bg-red-950/40 p-3 text-sm text-red-300';
    el.classList.remove('hidden');
  }

  function setEmptyState(show, title, description) {
    const el = $('clientEmptyState');
    if (!el) return;

    el.classList.toggle('hidden', !show);

    if (title && $('emptyTitle')) {
      $('emptyTitle').textContent = title;
    }

    if (description && $('emptyDescription')) {
      $('emptyDescription').textContent = description;
    }
  }

  function renderClients(clients) {
    const list = $('clientList');
    const count = $('clientCount');

    if (!list || !count) return;

    count.textContent = loading
      ? 'Carregando clientes...'
      : `${clients.length} ${clients.length === 1 ? 'cliente encontrado' : 'clientes encontrados'}`;

    if (loading) {
      list.innerHTML = '<div class="panel rounded-2xl p-5 text-sm text-gray-400 lg:col-span-2">Carregando clientes...</div>';
      setEmptyState(false);
      return;
    }

    if (!clients.length) {
      list.innerHTML = '';

      const searching = Boolean($('clientSearch')?.value.trim());

      setEmptyState(
        true,
        searching ? 'Nenhum cliente encontrado' : 'Nenhum cliente cadastrado',
        searching
          ? 'Tente outro nome, documento ou telefone.'
          : 'Cadastre seu primeiro cliente para vincular serviços e gerar Ordens de Serviço.'
      );

      return;
    }

    setEmptyState(false);

    list.innerHTML = clients.map(client => {
      const id = encodeURIComponent(client.id);
      const name = String(client.name || 'Cliente sem nome').trim();
      const phone = String(client.whatsapp || client.phone || '').trim() || 'Telefone não informado';
      const doc = String(client.document || '').trim() || 'Documento não informado';
      const email = String(client.email || '').trim();
      const total = projectCounts.get(client.id) || 0;
      const phoneDigits = normalizeBrazilWhatsApp(client.whatsapp || client.phone);
      const whatsapp = phoneDigits ? `https://wa.me/${phoneDigits}` : '';

      return `
        <article class="panel flex min-w-0 flex-col justify-between gap-4 rounded-2xl p-4 transition hover:border-[#454545] sm:p-5" data-client-id="${escapeHTML(client.id)}">
          <div class="flex min-w-0 items-start gap-3">
            <div class="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[#292019] text-[#F28A3D]">
              <i data-lucide="user-round" class="h-5 w-5"></i>
            </div>

            <div class="min-w-0 flex-1">
              <h2 class="break-words text-base font-bold leading-5">${escapeHTML(name)}</h2>
              <p class="mt-1 truncate text-xs text-gray-400">${escapeHTML(doc)}</p>

              <div class="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-gray-400">
                <span class="inline-flex items-center gap-1.5">
                  <i data-lucide="phone" class="h-3.5 w-3.5 text-gray-500"></i>
                  ${escapeHTML(phone)}
                </span>

                ${email ? `
                  <span class="inline-flex items-center gap-1.5 break-all">
                    <i data-lucide="mail" class="h-3.5 w-3.5 shrink-0 text-gray-500"></i>
                    ${escapeHTML(email)}
                  </span>
                ` : ''}
              </div>
            </div>
          </div>

          <div class="flex flex-wrap items-center justify-between gap-3 border-t border-[#292929] pt-3">
            <span class="inline-flex items-center gap-1.5 rounded-lg bg-[#222] px-2.5 py-1.5 text-xs text-gray-300">
              <i data-lucide="clipboard-list" class="h-3.5 w-3.5 text-[#F28A3D]"></i>
              ${total} ${total === 1 ? 'serviço' : 'serviços'}
            </span>

            <div class="flex flex-wrap gap-2">
              <a href="../projects/projects.html?client_id=${id}" class="muted-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold">
                <i data-lucide="folder-open" class="h-3.5 w-3.5"></i>
                Ver projetos
              </a>

              <a href="../projects/createproject.html?client_id=${id}" class="primary inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-bold">
                <i data-lucide="plus" class="h-3.5 w-3.5"></i>
                Novo serviço
              </a>

              ${whatsapp ? `
                <a href="${escapeHTML(whatsapp)}" target="_blank" rel="noopener noreferrer" class="muted-button inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold" aria-label="Abrir WhatsApp de ${escapeHTML(name)}">
                  <i data-lucide="message-circle" class="h-3.5 w-3.5"></i>
                  <span class="sr-only sm:not-sr-only">WhatsApp</span>
                </a>
              ` : ''}
            </div>
          </div>
        </article>
      `;
    }).join('');

    if (window.lucide?.createIcons) {
      window.lucide.createIcons();
    }
  }

  function filterClients() {
    const query = normalize($('clientSearch')?.value || '');
    const qDigits = digits(query);

    const filtered = allClients.filter(client => {
      const fields = [
        client.name,
        client.document,
        client.phone,
        client.whatsapp,
        client.email
      ];

      return !query ||
        fields.some(value => normalize(value).includes(query)) ||
        (qDigits && [
          client.document,
          client.phone,
          client.whatsapp
        ].some(value => digits(value).includes(qDigits)));
    });

    $('clearSearch')?.classList.toggle('hidden', !query);
    renderClients(filtered);
  }

  async function loadClients() {
    const supabase = window.supabaseClient;

    if (!supabase) {
      throw new Error('O Supabase não foi carregado. Confira os scripts da página.');
    }

    loading = true;
    renderClients([]);

    let clientQuery = supabase
      .from('clients')
      .select('id, company_id, store_id, name, document, phone, whatsapp, email, address, notes, created_at')
      .eq('company_id', context.company_id)
      .order('name', { ascending: true });

    if (context.active_store_id) {
      clientQuery = clientQuery.eq('store_id', context.active_store_id);
    }

    const { data: clients, error: clientError } = await clientQuery.limit(1000);

    if (clientError) throw clientError;

    let projectQuery = supabase
      .from('woodworking_projects')
      .select('id, client_id')
      .eq('company_id', context.company_id)
      .not('client_id', 'is', null);

    // Count all projects belonging to this company and linked to a client.
    // Do not filter by active_store_id: existing projects may belong to another store
    // or have no store_id, but still belong to the same client/company.
    const { data: projects, error: projectError } = await projectQuery.limit(5000);

    if (projectError) {
      console.warn(
        '[NEKKO WD] Não foi possível carregar a contagem de serviços:',
        projectError
      );

      projectCounts = new Map();
    } else {
      projectCounts = new Map();

      for (const project of projects || []) {
        if (project.client_id) {
          projectCounts.set(
            project.client_id,
            (projectCounts.get(project.client_id) || 0) + 1
          );
        }
      }
    }

    allClients = clients || [];
    loading = false;
    filterClients();
  }

  async function init() {
    try {
      if (!window.supabaseClient || !window.NekkoBootstrap) {
        throw new Error('Os componentes do sistema não foram carregados. Atualize a página.');
      }

      const { data, error } = await window.supabaseClient.auth.getSession();

      if (error) throw error;

      if (!data.session) {
        window.location.replace('../login/login.html');
        return;
      }

      const result = await window.NekkoBootstrap.init();

      if (!result?.status) {
        throw new Error('Não foi possível identificar a sessão da empresa.');
      }

      if (result.status === 'unauthenticated') {
        window.location.replace('../login/login.html');
        return;
      }

      if (result.status === 'no_company') {
        window.location.replace('../onboarding/company.html');
        return;
      }

      if (result.status === 'no_store') {
        window.location.replace('../onboarding/stores.html');
        return;
      }

      if (result.status !== 'ready' || !result.company_id) {
        throw new Error('Não foi possível carregar a empresa ativa.');
      }

      // O bootstrap retorna company_id e active_store_id diretamente.
      context = result;

      await loadClients();

      console.info('[NEKKO WD] Tela de clientes pronta.');
    } catch (error) {
      loading = false;

      console.error('[NEKKO WD] Erro ao carregar clientes:', error);

      showMessage(
        error?.message ||
        'Não foi possível carregar os clientes. Verifique a conexão e as permissões.'
      );

      renderClients([]);

      if ($('clientCount')) {
        $('clientCount').textContent = 'Falha ao carregar clientes';
      }

      setEmptyState(
        true,
        'Não foi possível carregar os clientes',
        'Atualize a página. Se o problema continuar, confira a conexão com o Supabase e as permissões de acesso.'
      );
    }
  }

  $('clientSearch')?.addEventListener('input', filterClients);

  $('clearSearch')?.addEventListener('click', () => {
    if ($('clientSearch')) {
      $('clientSearch').value = '';
    }

    filterClients();
    $('clientSearch')?.focus();
  });

  init();
})();
