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
  let sketchDataForResize = null;

  function setText(id, value, fallback = '—') {
    const element = $(id);
    if (element) element.textContent = value == null || value === '' ? fallback : String(value);
  }

  function showError(value) {
    const element = $('pageMessage');
    element.textContent = value;
    element.classList.remove('hidden');
  }

  function esc(value) {
    return String(value ?? '').replace(/[&<>"']/g, char => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    })[char]);
  }

  function displayDate(value) {
    if (!value) return '—';
    const date = new Date(String(value).length === 10 ? `${value}T12:00:00` : value);
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
    if (!items.length) {
      $('itemsFallback').classList.remove('hidden');
      return;
    }
    $('itemsList').innerHTML = items.map((item, index) => {
      const width = item.width_cm ?? (item.width_mm == null ? null : Number(item.width_mm) / 10);
      const length = item.length_cm ?? (item.length_mm == null ? null : Number(item.length_mm) / 10);
      const height = item.height_cm ?? (item.height_mm == null ? null : Number(item.height_mm) / 10);
      const thickness = item.thickness_cm ?? (item.material_thickness_mm == null ? null : Number(item.material_thickness_mm) / 10);
      const material = item.material_type ?? item.material ?? '';
      const color = item.material_color ?? item.color ?? '';
      const value = Number(item.service_value ?? item.serviceValue ?? 0) || 0;
      const area = Number(width) > 0 && Number(length) > 0
        ? `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(Number(width) * Number(length) / 10000)} m²`
        : '—';
      return `<article class="service">
        <div class="flex flex-wrap items-start justify-between gap-2"><div><p class="label">Serviço ${index + 1}</p><h3 class="mt-1 text-base font-extrabold">${esc(item.name || (index === 0 ? project.service_name || project.title : '') || `Serviço ${index + 1}`)}</h3></div><p class="text-base font-extrabold orange">${money.format(value)}</p></div>
        <div class="service-grid">
          <div><p class="label">Largura</p><p class="value mt-1">${cm(width)}</p></div>
          <div><p class="label">Comprimento</p><p class="value mt-1">${cm(length)}</p></div>
          <div><p class="label">Altura</p><p class="value mt-1">${cm(height)}</p></div>
          <div><p class="label">Espessura</p><p class="value mt-1">${cm(thickness)}</p></div>
          <div><p class="label">Área</p><p class="value mt-1">${area}</p></div>
          <div><p class="label">Material</p><p class="value mt-1">${esc(material || '—')}</p></div>
          <div><p class="label">Cor / acabamento</p><p class="value mt-1">${esc(color || '—')}</p></div>
        </div>
      </article>`;
    }).join('');
  }

  function drawSketch(data) {
    const canvas = $('sketchPreview');
    if (!canvas) return;
    const strokes = Array.isArray(data?.strokes) ? data.strokes : [];
    const hasPoints = strokes.some(stroke => Array.isArray(stroke.points) && stroke.points.length);
    const rect = canvas.getBoundingClientRect();
    const ratio = window.devicePixelRatio || 1;
    canvas.width = Math.max(320, Math.round((rect.width || 800) * ratio));
    canvas.height = Math.round((rect.height || 300) * ratio);
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    if (!hasPoints) {
      $('sketchCaption').textContent = 'Nenhum desenho salvo neste projeto.';
      ctx.fillStyle = '#6b7280';
      ctx.font = `${14 * ratio}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.fillText('Nenhum desenho salvo', canvas.width / 2, canvas.height / 2);
      return;
    }
    $('sketchCaption').textContent = 'Desenho salvo no projeto.';
    for (const stroke of strokes) {
      if (!Array.isArray(stroke.points) || !stroke.points.length) continue;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = stroke.color || '#202020';
      ctx.lineWidth = (Number(stroke.width) || 3) * ratio;
      ctx.beginPath();
      ctx.moveTo(stroke.points[0].x * canvas.width, stroke.points[0].y * canvas.height);
      if (stroke.points.length === 1) {
        ctx.lineTo(stroke.points[0].x * canvas.width + .5, stroke.points[0].y * canvas.height + .5);
      } else {
        stroke.points.slice(1).forEach(point => ctx.lineTo(point.x * canvas.width, point.y * canvas.height));
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  async function loadPrint(id) {
    const { data: project, error: projectError } = await scopeProject(window.supabaseClient
      .from('woodworking_projects')
      .select('id, project_number, client_id, title, service_name, environment_type, status, width_mm, length_mm, height_mm, area_m2, material_type, material_color, material_thickness_mm, estimated_value, final_value, materials_cost, deadline, description, notes, sketch_data, created_at'))
      .eq('id', id)
      .eq('company_id', context.company_id)
      .maybeSingle();
    if (projectError) throw projectError;
    if (!project) throw new Error('Projeto não encontrado ou você não tem permissão para imprimi-lo.');

    $('backButton').href = `details.html?id=${encodeURIComponent(project.id)}`;
    setText('projectTitle', project.title || project.service_name || 'Projeto sem título');
    setText('projectSubtitle', [project.service_name, project.environment_type].filter(Boolean).join(' · '), '');
    setText('projectNumber', project.project_number ? `#${project.project_number}` : '—');
    setText('projectStatus', statusLabels[project.status] || project.status || 'Pendente');
    setText('environment', project.environment_type);
    setText('deadline', displayDate(project.deadline));
    setText('createdAt', displayDate(project.created_at));
    setText('description', project.description);
    setText('notes', project.notes);

    let { data: items, error: itemsError } = await window.supabaseClient
      .from('woodworking_project_items')
      .select('id, sort_order, name, width_cm, length_cm, height_cm, material_type, material_color, thickness_cm, service_value')
      .eq('project_id', project.id)
      .eq('company_id', context.company_id)
      .order('sort_order', { ascending: true });
    if (itemsError) throw itemsError;
    if (!items?.length) {
      items = [{
        name: project.service_name || project.title,
        width_mm: project.width_mm,
        length_mm: project.length_mm,
        height_mm: project.height_mm,
        material_type: project.material_type,
        material_color: project.material_color,
        material_thickness_mm: project.material_thickness_mm,
        service_value: project.final_value ?? project.estimated_value ?? 0
      }];
    }
    const servicesTotal = items.reduce((sum, item) => sum + (Number(item.service_value) || 0), 0);
    const materialsTotal = Number(project.materials_cost || 0);
    setText('servicesTotal', money.format(servicesTotal));
    setText('materialsTotal', money.format(materialsTotal));
    setText('netTotal', money.format(servicesTotal - materialsTotal));
    renderItems(items, project);

    if (project.client_id) {
      const clientQuery = window.supabaseClient.from('clients')
        .select('id, name, document, phone, address')
        .eq('id', project.client_id)
        .eq('company_id', context.company_id);
      if (context.active_store_id) clientQuery.eq('store_id', context.active_store_id);
      const { data: client, error: clientError } = await clientQuery.maybeSingle();
      if (clientError) throw clientError;
      if (client) {
        const address = client.address && typeof client.address === 'object' ? client.address : {};
        setText('clientName', client.name);
        setText('clientDocument', client.document);
        setText('clientPhone', client.phone);
        setText('clientZip', address.zip_code);
        setText('clientStreet', address.street);
        setText('clientNumber', address.number);
        setText('clientComplement', address.complement);
        setText('clientNeighborhood', address.neighborhood);
        setText('clientCityState', [address.city, address.state].filter(Boolean).join(' / '));
      } else {
        setText('clientName', 'Cliente não encontrado nesta loja');
      }
    } else {
      setText('clientName', 'Nenhum cliente vinculado');
    }

    sketchDataForResize = project.sketch_data;
    drawSketch(sketchDataForResize);
    $('printContent').classList.remove('hidden');
    if (window.lucide) window.lucide.createIcons();
  }

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
      if (!id) throw new Error('O identificador do projeto não foi informado na URL. Abra a impressão pelo botão Imprimir na lista ou nos detalhes.');
      await loadPrint(id);
    } catch (error) {
      console.error('[NEKKO WD] Erro ao carregar impressão do projeto:', error);
      showError(error?.message || 'Não foi possível carregar o projeto para impressão.');
    }
  }

  const paperWidth = $('paperWidth');
  const pageRule = document.createElement('style');
  pageRule.id = 'dynamicThermalPageSize';
  document.head.appendChild(pageRule);

  function applyPaperWidth() {
    const width = paperWidth?.value === '80' ? '80' : '58';
    document.body.classList.toggle('paper-58', width === '58');
    document.body.classList.toggle('paper-80', width === '80');
    pageRule.textContent = `@page { size: ${width}mm auto; margin: 2mm; }`;
  }

  paperWidth?.addEventListener('change', applyPaperWidth);
  applyPaperWidth();
  $('printButton').addEventListener('click', () => {
    applyPaperWidth();
    window.print();
  });
  window.addEventListener('resize', () => {
    if (sketchDataForResize) drawSketch(sketchDataForResize);
  });
  window.addEventListener('beforeprint', () => {
    if (sketchDataForResize) drawSketch(sketchDataForResize);
  });
  init();
})();
