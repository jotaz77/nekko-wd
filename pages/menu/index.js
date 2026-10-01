(() => {
  'use strict';

  const supabase = window.supabaseClient;

  const $ = (id) => document.getElementById(id);

  const pageTitles = {
    dashboard: {
      title: 'Visão geral',
      subtitle: 'Acompanhe os indicadores da sua marcenaria.'
    },
    projects: {
      title: 'Projetos e serviços',
      subtitle: 'Organize os projetos e acompanhe sua produção.'
    },
    clients: {
      title: 'Clientes',
      subtitle: 'Consulte e organize seus clientes.'
    },
    budgets: {
      title: 'Orçamentos',
      subtitle: 'Gerencie propostas e valores dos projetos.'
    },
    materials: {
      title: 'Materiais e estoque',
      subtitle: 'Controle os materiais utilizados na produção.'
    },
    finance: {
      title: 'Financeiro',
      subtitle: 'Acompanhe as entradas e saídas da empresa.'
    },
    reports: {
      title: 'Relatórios',
      subtitle: 'Consulte os indicadores da operação.'
    },
    stores: {
      title: 'Unidades',
      subtitle: 'Consulte as unidades da sua empresa.'
    },
    settings: {
      title: 'Configurações',
      subtitle: 'Gerencie as informações da sua empresa.'
    }
  };

  let currentUser = null;
  let activeCompany = null;
  let activeStore = null;
  let activeMembership = null;

  function showMessage(text, type = 'error') {
    const element = $('pageMessage');

    if (!element) return;

    element.textContent = text;
    element.className = 'mb-5 rounded-xl border p-4 text-sm';

    if (type === 'success') {
      element.classList.add(
        'border-green-500/30',
        'bg-green-500/10',
        'text-green-400'
      );
    } else {
      element.classList.add(
        'border-red-500/30',
        'bg-red-500/10',
        'text-red-400'
      );
    }
  }

  function hideMessage() {
    const element = $('pageMessage');

    if (!element) return;

    element.textContent = '';
    element.className = 'mb-5 hidden rounded-xl border p-4 text-sm';
  }

  function formatCurrency(value) {
    return Number(value || 0).toLocaleString('pt-BR', {
      style: 'currency',
      currency: 'BRL'
    });
  }

  function formatDate(value) {
    if (!value) return '—';

    const date = new Date(value);

    if (Number.isNaN(date.getTime())) return '—';

    return date.toLocaleDateString('pt-BR');
  }

  function setText(id, value) {
    const element = $(id);

    if (element) {
      element.textContent = value ?? '—';
    }
  }

  function getDisplayName(user) {
    const metadata = user?.user_metadata || {};

    return (
      metadata.full_name ||
      metadata.name ||
      user?.email?.split('@')[0] ||
      'Usuário'
    );
  }

  function getFirstName(name) {
    return String(name || '').trim().split(/\s+/)[0] || 'bem-vindo';
  }

  function updateHeader() {
    const name = getDisplayName(currentUser);
    const companyName = activeCompany?.name || 'Sua marcenaria';

    setText('sidebarUserName', name);
    setText('sidebarCompanyName', companyName);
    setText('welcomeName', getFirstName(name));
    setText('headerCompanyName', companyName);

    // O cabeçalho mostra somente o nome da marcenaria, sem a unidade.
    const storeSubtitle = $('headerStoreName');
    if (storeSubtitle) {
      storeSubtitle.textContent = '';
      storeSubtitle.classList.add('hidden');
    }
  }

  async function loadContext() {
    const result = await window.NekkoBootstrap.init();

    if (!result || result.status !== 'ready') {
      if (result?.status === 'no_company') {
        window.location.replace('../onboarding/company.html');
        return false;
      }

      if (result?.status === 'no_store') {
        window.location.replace('../onboarding/stores.html');
        return false;
      }

      throw new Error(
        'Não foi possível inicializar o ambiente da empresa.'
      );
    }

    currentUser = await window.NekkoAuth.getCurrentUser();

    if (!currentUser) {
      window.location.replace('../login/login.html');
      return false;
    }

    const context = window.NekkoStorage?.getContext?.() || {};

    activeMembership = context.membership || result.membership || null;
    activeCompany = context.company || result.company || null;
    activeStore = context.activeStore || result.activeStore || null;

    // Recupera os dados diretamente caso o bootstrap não os devolva
    // na mesma estrutura usada pelo armazenamento de contexto.
    if (!activeMembership) {
      const { data, error } = await supabase
        .from('company_members')
        .select('id, company_id, user_id, store_id, role, is_active')
        .eq('user_id', currentUser.id)
        .eq('is_active', true)
        .limit(1)
        .maybeSingle();

      if (error) throw error;

      activeMembership = data;
    }

    if (!activeMembership?.company_id) {
      window.location.replace('../onboarding/company.html');
      return false;
    }

    if (!activeCompany) {
      const { data, error } = await supabase
        .from('companies')
        .select('id, name')
        .eq('id', activeMembership.company_id)
        .maybeSingle();

      if (error) throw error;

      activeCompany = data;
    }

    if (!activeStore) {
      let storeQuery = supabase
        .from('stores')
        .select('id, company_id, name')
        .eq('company_id', activeMembership.company_id)
        .eq('is_active', true)
        .limit(1);

      if (activeMembership.store_id) {
        storeQuery = supabase
          .from('stores')
          .select('id, company_id, name')
          .eq('company_id', activeMembership.company_id)
          .eq('id', activeMembership.store_id)
          .eq('is_active', true)
          .limit(1);
      }

      const { data, error } = await storeQuery;

      if (error) throw error;

      activeStore = data?.[0] || null;
    }

    if (!activeStore) {
      window.location.replace('../onboarding/stores.html');
      return false;
    }

    updateHeader();
    return true;
  }

  function getScopedQuery(table, columns = '*') {
    let query = supabase
      .from(table)
      .select(columns)
      .eq('company_id', activeMembership.company_id);

    if (activeStore?.id) {
      query = query.eq('store_id', activeStore.id);
    }

    return query;
  }

  async function loadCounts() {
    const companyId = activeMembership.company_id;
    const storeId = activeStore.id;

    const [projectsResult, clientsResult, budgetsResult, materialsResult] =
      await Promise.all([
        supabase
          .from('woodworking_projects')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('store_id', storeId)
          .eq('status', 'OPEN'),

        supabase
          .from('clients')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('store_id', storeId),

        supabase
          .from('budgets')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('store_id', storeId),

        supabase
          .from('materials')
          .select('id', { count: 'exact', head: true })
          .eq('company_id', companyId)
          .eq('store_id', storeId)
          .eq('is_active', true)
      ]);

    const results = [
      projectsResult,
      clientsResult,
      budgetsResult,
      materialsResult
    ];

    const failed = results.find((result) => result.error);

    if (failed) throw failed.error;

    setText('activeProjectsCount', projectsResult.count ?? 0);
    setText('clientsCount', clientsResult.count ?? 0);
    setText('budgetsCount', budgetsResult.count ?? 0);
    setText('materialsCount', materialsResult.count ?? 0);
  }

  async function loadFinance() {
    const { data, error } = await getScopedQuery(
      'financial_transactions',
      'amount, transaction_type, status'
    );

    if (error) throw error;

    let income = 0;
    let expenses = 0;

    for (const transaction of data || []) {
      // O painel considera apenas lançamentos efetivamente pagos.
      if (transaction.status !== 'PAID') continue;

      const amount = Number(transaction.amount || 0);

      if (transaction.transaction_type === 'INCOME') {
        income += amount;
      } else if (transaction.transaction_type === 'EXPENSE') {
        expenses += amount;
      }
    }

    setText('financialIncome', formatCurrency(income));
    setText('financialExpenses', formatCurrency(expenses));
  }

  function getStatusLabel(status) {
    const labels = {
      QUOTE: 'Orçamento',
      OPEN: 'Aberto',
      PENDING: 'Pendente',
      IN_PROGRESS: 'Em andamento',
      COMPLETED: 'Concluído',
      DELIVERED: 'Entregue',
      CANCELLED: 'Cancelado'
    };

    return labels[status] || status || 'Sem status';
  }

  function getStatusClass(status) {
    const classes = {
      QUOTE: 'bg-purple-500/10 text-purple-400',
      PENDING: 'bg-yellow-500/10 text-yellow-400',
      IN_PROGRESS: 'bg-blue-500/10 text-blue-400',
      COMPLETED: 'bg-green-500/10 text-green-400',
      DELIVERED: 'bg-green-500/10 text-green-400',
      CANCELLED: 'bg-red-500/10 text-red-400'
    };

    return classes[status] || 'bg-white/5 text-neutral-400';
  }

  function renderRecentProjects(projects) {
    const container = $('recentProjects');

    if (!container) return;

    if (!projects?.length) {
      container.innerHTML = `
        <div class="p-10 text-center">
          <div class="mx-auto mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-white/5 text-neutral-500">
            <i data-lucide="folder-open" class="h-6 w-6"></i>
          </div>
          <p class="text-sm font-medium text-neutral-300">
            Nenhum projeto cadastrado
          </p>
          <p class="mt-1 text-xs text-neutral-500">
            Seus novos projetos aparecerão aqui.
          </p>
        </div>
      `;

      if (window.lucide) window.lucide.createIcons();
      return;
    }

    const rows = projects.map((project) => `
      <tr class="border-b border-nekko-border/70 last:border-0">
        <td class="px-5 py-4">
          <p class="font-medium text-neutral-200">
            ${escapeHTML(project.title || 'Projeto sem título')}
          </p>
          <p class="mt-1 text-xs text-neutral-500">
            ${project.project_number != null
              ? `Projeto #${escapeHTML(String(project.project_number))}`
              : 'Projeto'}
          </p>
        </td>
        <td class="px-5 py-4">
          <span class="inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${getStatusClass(project.status)}">
            ${escapeHTML(getStatusLabel(project.status))}
          </span>
        </td>
        <td class="whitespace-nowrap px-5 py-4 text-sm text-neutral-400">
          ${formatDate(project.created_at)}
        </td>
      </tr>
    `).join('');

    container.innerHTML = `
      <table class="w-full min-w-[520px] text-left">
        <thead>
          <tr class="border-b border-nekko-border text-xs uppercase tracking-wider text-neutral-500">
            <th class="px-5 py-4 font-medium">Projeto</th>
            <th class="px-5 py-4 font-medium">Status</th>
            <th class="px-5 py-4 font-medium">Cadastro</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    `;
  }

  function escapeHTML(value) {
    return String(value).replace(/[&<>"']/g, (character) => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[character]);
  }

  async function loadRecentProjects() {
    const { data, error } = await supabase
      .from('woodworking_projects')
      .select('id, project_number, title, status, created_at')
      .eq('company_id', activeMembership.company_id)
      .eq('store_id', activeStore.id)
      .order('created_at', { ascending: false })
      .limit(5);

    if (error) throw error;

    renderRecentProjects(data || []);
  }

  async function loadDashboard() {
    hideMessage();

    try {
      await Promise.all([
        loadCounts(),
        loadFinance()
      ]);
    } catch (error) {
      console.error('[NEKKO WOOD] Erro ao carregar o painel:', error);
      showMessage(
        'Não foi possível carregar todos os indicadores. Verifique as permissões RLS do Supabase e tente atualizar a página.'
      );
    }
  }

  function navigate(page) {
    const details = pageTitles[page];

    if (!details) return;

    document.querySelectorAll('[data-page]').forEach((button) => {
      button.classList.toggle(
        'active',
        button.dataset.page === page &&
        button.classList.contains('sidebar-link')
      );
    });

    setText('pageTitle', details.title);
    setText('pageSubtitle', details.subtitle);

    $('sidebar')?.classList.remove('open');
    $('mobileOverlay')?.classList.remove('open');

    if (page === 'dashboard') {
      loadDashboard();
      return;
    }

    // Os módulos serão conectados às respectivas telas nas próximas etapas.
    showMessage(
      `A área "${details.title}" está sendo preparada. A navegação será conectada quando o módulo estiver pronto.`,
      'success'
    );
  }

  function setupNavigation() {
    document.querySelectorAll('[data-page]').forEach((button) => {
      button.addEventListener('click', () => {
        navigate(button.dataset.page);
      });
    });
  }

  async function logout() {
    const button = $('logoutButton');

    if (button) button.disabled = true;

    try {
      const { error } = await supabase.auth.signOut();

      if (error) throw error;

      window.NekkoStorage?.clear?.();

      window.location.replace('../login/login.html');
    } catch (error) {
      console.error('[NEKKO WOOD] Erro ao sair:', error);

      showMessage(
        'Não foi possível encerrar a sessão. Tente novamente.'
      );

      if (button) button.disabled = false;
    }
  }

  async function init() {
    if (!supabase || !window.NekkoBootstrap || !window.NekkoAuth) {
      showMessage(
        'Os componentes do sistema não foram carregados. Atualize a página.'
      );
      return;
    }

    setupNavigation();

    $('logoutButton')?.addEventListener('click', logout);

    try {
      const ready = await loadContext();

      if (!ready) return;

      await loadDashboard();
    } catch (error) {
      console.error('[NEKKO WOOD] Erro ao inicializar o painel:', error);

      showMessage(
        'Não foi possível inicializar o painel. Verifique sua conexão e as permissões de acesso.'
      );
    }
  }

  init();
})();
