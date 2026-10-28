(() => {
  'use strict';

  const $ = id => document.getElementById(id);
  const statusLabels = {
    QUOTE: 'Orçamento', PENDING: 'Pendente', IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluído', DELIVERED: 'Entregue', CANCELLED: 'Cancelado'
  };
  const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
  const dateFormat = new Intl.DateTimeFormat('pt-BR');
  let context = null;

  function text(id, value, fallback = '—') {
    const element = $(id);
    if (element) element.textContent = value == null || value === '' ? fallback : String(value);
  }

  function message(value, isError = false) {
    const element = $('pageMessage');
    element.textContent = value;
    element.className = 'rounded-xl border p-4 text-sm ' + (isError
      ? 'border-red-900 bg-red-950/40 text-red-300'
      : 'border-[#F28A3D]/30 bg-[#2c1a10]/40 text-[#f4b183]');
    element.classList.remove('hidden');
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function displayDate(value) {
    if (!value) return '—';
    const date = new Date(`${value}`.length === 10 ? `${value}T12:00:00` : value);
    return Number.isNaN(date.getTime()) ? '—' : dateFormat.format(date);
  }

  function cm(value) {
    if (value == null || value === '') return '—';
    const n = Number(value);
    return Number.isFinite(n) ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(n)} cm` : '—';
  }

  function scopeProject(query) {
    if (context?.active_store_id) return query.eq('store_id', context.active_store_id);
    return query.eq('store_id', '00000000-0000-0000-0000-000000000000');
  }

  function renderItems(items, project) {
    const container = $('itemsList');
    if (!items.length) {
      $('itemsFallback').classList.remove('hidden');
      return;
    }
    container.innerHTML = items.map((item, index) => {
      const width = item.width_cm ?? (item.width_mm == null ? null : Number(item.width_mm) / 10);
      const length = item.length_cm ?? (item.length_mm == null ? null : Number(item.length_mm) / 10);
      const height = item.height_cm ?? (item.height_mm == null ? null : Number(item.height_mm) / 10);
      const thickness = item.thickness_cm ?? (item.material_thickness_mm == null ? null : Number(item.material_thickness_mm) / 10);
      const material = item.material_type ?? item.material ?? '';
      const color = item.material_color ?? item.color ?? '';
      const value = Number(item.service_value ?? item.serviceValue ?? 0) || 0;
      const area = Number(width) > 0 && Number(length) > 0 ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(width) * Number(length) / 10000)} m²` : '—';
      return `<article class="rounded-xl border border-[#292929] bg-[#0c0c0c] p-4 sm:p-5">
        <div class="flex flex-wrap items-start justify-between gap-3"><div><p class="label">Serviço ${index + 1}</p><h4 class="mt-1 text-lg font-bold">${esc(item.name || (index === 0 ? project.service_name || project.title : '') || `Serviço ${index + 1}`)}</h4></div><p class="text-lg font-bold text-[#F28A3D]">${money.format(value)}</p></div>
        <div class="mt-4 grid grid-cols-2 gap-4 sm:grid-cols-4">
          <div><p class="label">Largura</p><p class="value mt-1">${cm(width)}</p></div><div><p class="label">Comprimento</p><p class="value mt-1">${cm(length)}</p></div><div><p class="label">Altura</p><p class="value mt-1">${cm(height)}</p></div><div><p class="label">Espessura</p><p class="value mt-1">${cm(thickness)}</p></div>
          <div><p class="label">Área</p><p class="value mt-1">${area}</p></div><div><p class="label">Material</p><p class="value mt-1">${esc(material || '—')}</p></div><div><p class="label">Cor / acabamento</p><p class="value mt-1">${esc(color || '—')}</p></div>
        </div>
      </article>`;
    }).join('');
  }

  function drawSketch(sketchData) {
    const canvas = $('sketchPreview');
    const strokes = Array.isArray(sketchData?.strokes) ? sketchData.strokes : [];
    const hasPoints = strokes.some(stroke => Array.isArray(stroke.points) && stroke.points.length);
    if (!hasPoints) {
      $('sketchCaption').textContent = 'Nenhum desenho salvo neste projeto.';
      canvas.height = 360;
      canvas.width = Math.max(320, Math.round(canvas.clientWidth || 900));
      const ctx = canvas.getContext('2d');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      return;
    }
    $('sketchCaption').textContent = 'Desenho salvo no projeto.';
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.round(rect.width * ratio));
    canvas.height = Math.round((rect.height || 360) * ratio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    for (const stroke of strokes) {
      if (!Array.isArray(stroke.points) || !stroke.points.length) continue;
      ctx.save();
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = stroke.tool === 'eraser' ? 'destination-out' : 'source-over';
      ctx.strokeStyle = stroke.tool === 'eraser' ? '#000' : (stroke.color || '#202020');
      ctx.lineWidth = (Number(stroke.width) || 3) * ratio;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      if (stroke.points.length === 1) ctx.lineTo(stroke.points[0].x * canvas.width + .5, stroke.points[0].y * canvas.height + .5);
      else stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * canvas.width, point.y * canvas.height));
      ctx.stroke(); ctx.restore();
    }
  }

  async function loadDetails(id) {
    const { data: project, error: projectError } = await scopeProject(window.supabaseClient
      .from('woodworking_projects')
      .select('id, project_number, client_id, title, service_name, environment_type, status, width_mm, length_mm, height_mm, area_m2, material_type, material_color, material_thickness_mm, estimated_value, final_value, materials_cost, deadline, description, notes, sketch_data, created_at'))
      .eq('id', id)
      .eq('company_id', context.company_id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error('Projeto não encontrado ou você não tem permissão para visualizá-lo.');

    $('editButton').href = `createproject.html?id=${encodeURIComponent(project.id)}`;
    $('editButtonBottom').href = `createproject.html?id=${encodeURIComponent(project.id)}`;
    text('projectNumber', project.project_number ? `#${project.project_number}` : '');
    text('projectTitle', project.title || project.service_name || 'Projeto sem título');
    text('projectSubtitle', [project.service_name, project.environment_type].filter(Boolean).join(' · '));
    const status = $('projectStatus');
    status.textContent = statusLabels[project.status] || project.status || 'Pendente';
    status.className = `badge ${esc(project.status || 'PENDING')}`;
    text('environment', project.environment_type);
    text('deadline', displayDate(project.deadline));
    text('createdAt', displayDate(project.created_at));
    text('description', project.description);
    text('notes', project.notes);
    const materialsCost = Number(project.materials_cost || 0);

    let { data: rows, error: itemsError } = await window.supabaseClient
      .from('woodworking_project_items')
      .select('id, sort_order, name, width_cm, length_cm, height_cm, material_type, material_color, thickness_cm, service_value')
      .eq('project_id', project.id)
      .eq('company_id', context.company_id)
      .order('sort_order', { ascending: true });
    if (itemsError) throw itemsError;
    if (!rows?.length) {
      rows = [{
        name: project.service_name || project.title,
        width_mm: project.width_mm, length_mm: project.length_mm, height_mm: project.height_mm,
        material_type: project.material_type, material_color: project.material_color,
        material_thickness_mm: project.material_thickness_mm,
        service_value: project.final_value ?? project.estimated_value ?? 0
      }];
    }
    const serviceTotal = rows.reduce((sum, item) => sum + (Number(item.service_value) || 0), 0);
    text('servicesTotal', money.format(serviceTotal));
    text('materialsTotal', money.format(materialsCost));
    text('netTotal', money.format(serviceTotal - materialsCost));
    renderItems(rows, project);

    if (project.client_id) {
      const { data: client, error: clientError } = await window.supabaseClient
        .from('clients')
        .select('id, name, document, phone, address')
        .eq('id', project.client_id)
        .eq('company_id', context.company_id)
        .eq('store_id', context.active_store_id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (client) {
        const address = client.address && typeof client.address === 'object' ? client.address : {};
        text('clientName', client.name);
        text('clientDocument', client.document);
        text('clientPhone', client.phone);
        text('clientZip', address.zip_code);
        text('clientStreet', address.street);
        text('clientNumber', address.number);
        text('clientComplement', address.complement);
        text('clientNeighborhood', address.neighborhood);
        text('clientCityState', [address.city, address.state].filter(Boolean).join(' / '));
      } else {
        text('clientName', 'Cliente não encontrado nesta loja');
      }
    } else {
      text('clientName', 'Nenhum cliente vinculado');
    }

    drawSketch(project.sketch_data);
    $('detailsContent').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

  async function init() {
    try {
      if (!window.supabaseClient || !window.NekkoBootstrap) throw new Error('Os componentes do sistema não foram carregados. Atualize a página.');
      const { data: sessionData, error: sessionError } = await window.supabaseClient.auth.getSession();
      if (sessionError) throw sessionError;
      if (!sessionData.session) { window.location.replace('../login/login.html'); return; }
      const result = await window.NekkoBootstrap.init();
      if (!result || result.status !== 'ready') {
        if (result?.status === 'no_store') window.location.replace('../onboarding/stores.html');
        else if (result?.status === 'no_company') window.location.replace('../onboarding/company.html');
        else if (result?.status === 'unauthenticated') window.location.replace('../login/login.html');
        else message('Não foi possível identificar a empresa e a loja ativa.', true);
        return;
      }
      context = result;
      const id = new URLSearchParams(window.location.search).get('id');
      if (!id) throw new Error('O identificador do projeto não foi informado na URL. Abra os detalhes pelo botão Ver na listagem.');
      await loadDetails(id);
    } catch (error) {
      console.error('[NEKKO WD] Erro ao carregar detalhes do projeto:', error);
      message(error?.message || 'Não foi possível carregar os detalhes do projeto.', true);
    }
  }

  window.addEventListener('resize', () => {
    // Mantém o desenho nítido quando a orientação ou a largura da página muda.
    if (window.__nekkoProjectSketchData) drawSketch(window.__nekkoProjectSketchData);
  });
  const originalDrawSketch = drawSketch;
  // Guarda os dados para redesenhar o canvas em resize.
  drawSketch = function(data) { window.__nekkoProjectSketchData = data; originalDrawSketch(data); };
  init();
})();
