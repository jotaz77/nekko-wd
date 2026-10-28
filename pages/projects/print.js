(() => {
  'use strict';
  const $ = id => document.getElementById(id);
  const statusLabels = { QUOTE:'Orçamento', PENDING:'Pendente', IN_PROGRESS:'Em andamento', COMPLETED:'Concluído', DELIVERED:'Entregue', CANCELLED:'Cancelado' };
  const money = new Intl.NumberFormat('pt-BR', { style:'currency', currency:'BRL' });
  const dateFormat = new Intl.DateTimeFormat('pt-BR');
  let context = null;

  function setText(id, value, fallback='—') {
    const el = $(id);
    if (el) el.textContent = value == null || String(value).trim() === '' ? fallback : String(value);
  }
  function showError(message) { $('pageMessage').textContent = message; $('pageMessage').classList.remove('hidden'); }
  function displayDate(value, withTime=false) {
    if (!value) return '—';
    const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
    if (Number.isNaN(date.getTime())) return '—';
    return withTime ? new Intl.DateTimeFormat('pt-BR', {dateStyle:'short', timeStyle:'short'}).format(date) : dateFormat.format(date);
  }
  function addressText(address) {
    if (!address) return '';
    if (typeof address === 'string') return address;
    if (typeof address !== 'object') return '';
    if (address.full_address) return address.full_address;
    const street = [address.street, address.number].filter(Boolean).join(', ');
    const location = [address.neighborhood, [address.city, address.state].filter(Boolean).join('/')].filter(Boolean).join(' · ');
    const extra = [address.complement, address.zip_code ? `CEP ${address.zip_code}` : ''].filter(Boolean).join(' · ');
    return [street, location, extra].filter(Boolean).join(' · ');
  }
  function setOptionalLine(id, value) {
    const el = $(id); if (!el) return;
    el.textContent = value || '';
    el.classList.toggle('hidden', !value);
  }
  function scopeProject(query) {
    return context?.active_store_id ? query.eq('store_id', context.active_store_id) : query.eq('store_id', '00000000-0000-0000-0000-000000000000');
  }
  function renderItems(items, project) {
    const container = $('itemsList');
    if (!items.length) { $('itemsFallback').classList.remove('hidden'); return; }
    container.innerHTML = items.map((item, index) => {
      const width = item.width_cm ?? (item.width_mm == null ? null : Number(item.width_mm)/10);
      const length = item.length_cm ?? (item.length_mm == null ? null : Number(item.length_mm)/10);
      const height = item.height_cm ?? (item.height_mm == null ? null : Number(item.height_mm)/10);
      const thickness = item.thickness_cm ?? (item.material_thickness_mm == null ? null : Number(item.material_thickness_mm)/10);
      const fmtCm = v => v == null || v === '' || !Number.isFinite(Number(v)) ? '' : `${new Intl.NumberFormat('pt-BR',{maximumFractionDigits:2}).format(Number(v))} cm`;
      const dimensions = [['Largura',width],['Comprimento',length],['Altura',height],['Espessura',thickness]].filter(([,v])=>v!=null && v!=='').map(([k,v])=>`${k}: ${fmtCm(v)}`).join(' · ');
      const material = [item.material_type ?? item.material, item.material_color ?? item.color].filter(Boolean).join(' / ');
      const name = item.name || (index === 0 ? project.service_name || project.title : '') || `Serviço ${index+1}`;
      const value = Number(item.service_value ?? item.serviceValue ?? 0) || 0;
      return `<div class="service-item"><div class="service-name-row"><strong>${escapeHtml(name)}</strong><strong>${money.format(value)}</strong></div>${dimensions ? `<p class="small-line">${escapeHtml(dimensions)}</p>` : ''}${material ? `<p class="small-line">Material: ${escapeHtml(material)}</p>` : ''}</div>`;
    }).join('');
  }
  function escapeHtml(value) { return String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  async function loadPrint(id) {
    const supabase = window.supabaseClient;
    const { data: project, error: projectError } = await scopeProject(supabase.from('woodworking_projects')
      .select('id, project_number, client_id, title, service_name, environment_type, status, width_mm, length_mm, height_mm, material_type, material_color, material_thickness_mm, estimated_value, final_value, deadline, description, notes, created_at'))
      .eq('id', id).eq('company_id', context.company_id).maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error('Projeto não encontrado nesta loja ou você não tem permissão para imprimi-lo.');

    // O cabeçalho usa os dados reais da empresa e da unidade ativa, como na nota do NEKKO OS.
    const company = context.company || {};
    const store = context.active_store || {};
    setText('companyName', company.name, 'Empresa não informada');
    setOptionalLine('companyDocument', company.document ? `CNPJ/CPF: ${company.document}` : '');
    setOptionalLine('companyPhone', company.phone ? `Telefone: ${company.phone}` : '');
    setOptionalLine('companyEmail', company.email ? `E-mail: ${company.email}` : '');
    setOptionalLine('companyAddress', addressText(company.address));
    setText('storeName', store.name, 'Loja não informada');
    setOptionalLine('storeAddress', addressText(store.address));
    setOptionalLine('storePhone', store.phone ? `Contato: ${store.phone}` : '');

    $('backButton').href = `details.html?id=${encodeURIComponent(project.id)}`;
    setText('projectNumber', project.project_number ? `#${project.project_number}` : '—');
    setText('createdAt', displayDate(project.created_at, true));
    setText('projectStatus', statusLabels[project.status] || project.status || 'Pendente');
    setText('projectTitle', project.title || project.service_name || 'Projeto sem título');
    setOptionalLine('projectSubtitle', [project.service_name, project.environment_type].filter(Boolean).join(' · '));
    setText('environment', project.environment_type);
    setText('deadline', displayDate(project.deadline));
    setText('description', project.description);
    setText('notes', project.notes);
    $('descriptionBlock').classList.toggle('hidden', !project.description);
    $('notesBlock').classList.toggle('hidden', !project.notes);
    $('projectInfoSection').classList.toggle('hidden', !project.environment_type && !project.deadline && !project.description && !project.notes);

    let { data: items, error: itemsError } = await supabase.from('woodworking_project_items')
      .select('id, sort_order, name, width_cm, length_cm, height_cm, material_type, material_color, thickness_cm, service_value')
      .eq('project_id', project.id).eq('company_id', context.company_id).order('sort_order', {ascending:true});
    if (itemsError) throw itemsError;
    if (!items?.length) items = [{name:project.service_name || project.title, width_mm:project.width_mm, length_mm:project.length_mm, height_mm:project.height_mm, material_type:project.material_type, material_color:project.material_color, material_thickness_mm:project.material_thickness_mm, service_value:project.estimated_value ?? project.final_value ?? 0}];
    // A nota é destinada ao cliente: o total deve ser exatamente a soma dos valores cadastrados nos serviços.
    // Custo de materiais e lucro líquido são dados internos e nunca entram no valor impresso.
    const servicesTotal = items.reduce((sum, item) => sum + (Number(item.service_value) || 0), 0);
    setText('netTotal', money.format(servicesTotal));
    renderItems(items, project);

    if (project.client_id) {
      const query = supabase.from('clients').select('id,name,document,phone,address').eq('id', project.client_id).eq('company_id', context.company_id);
      if (context.active_store_id) query.eq('store_id', context.active_store_id);
      const {data: client, error} = await query.maybeSingle();
      if (error) throw error;
      if (client) {
        setText('clientName', client.name);
        setOptionalLine('clientDocument', client.document ? `CPF: ${client.document}` : '');
        setOptionalLine('clientPhone', client.phone ? `Telefone: ${client.phone}` : '');
        setOptionalLine('clientAddress', addressText(client.address));
      } else setText('clientName', 'Cliente não encontrado nesta loja');
    } else setText('clientName', 'Cliente não vinculado');

    setText('printedAt', `Impresso em ${displayDate(new Date().toISOString(), true)}`);
    $('receipt').classList.remove('hidden');
  }

  const paperWidth = $('paperWidth');
  const pageRule = document.createElement('style'); document.head.appendChild(pageRule);
  function applyPaperWidth() {
    const width = paperWidth?.value === '80' ? '80' : '58';
    document.body.classList.toggle('paper-58', width === '58');
    document.body.classList.toggle('paper-80', width === '80');
    pageRule.textContent = `@page { size: ${width}mm auto; margin: 2mm; }`;
  }
  paperWidth.addEventListener('change', applyPaperWidth);
  applyPaperWidth();
  $('printButton').addEventListener('click', () => { applyPaperWidth(); window.print(); });

  async function init() {
    try {
      if (!window.supabaseClient || !window.NekkoBootstrap) throw new Error('Os componentes do sistema não foram carregados corretamente.');
      const result = await window.NekkoBootstrap.init();
      if (!result || result.status !== 'ready') {
        if (result?.status === 'no_store') window.location.replace('../onboarding/stores.html');
        else if (result?.status === 'no_company') window.location.replace('../onboarding/company.html');
        else if (result?.status === 'unauthenticated') window.location.replace('../login/login.html');
        else showError('Não foi possível identificar a empresa e a loja ativa.');
        return;
      }
      context = result;
      const id = new URLSearchParams(window.location.search).get('id');
      if (!id) throw new Error('O identificador do projeto não foi informado. Abra a nota pelo botão Imprimir nos detalhes do projeto.');
      await loadPrint(id);
    } catch (error) {
      console.error('[NEKKO WD] Erro ao carregar nota do projeto:', error);
      showError(error?.message || 'Não foi possível carregar a nota do projeto.');
    }
  }
  init();
})();
