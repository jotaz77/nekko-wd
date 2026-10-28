(() => {
  'use strict';

  const $ = (id) => document.getElementById(id);

  const labels = {
    QUOTE: 'Orçamento',
    PENDING: 'Pendente',
    IN_PROGRESS: 'Em andamento',
    COMPLETED: 'Concluído',
    DELIVERED: 'Entregue',
    CANCELLED: 'Cancelado'
  };

  let user = null;
  let ctx = null;
  let editId = null;
  let busy = false;
  let projectItems = [];
  let nextItemId = 1;

  let strokes = [];
  let activeStroke = null;
  let tool = 'pen';
  let ctx2d = null;
  let resizeObserver = null;

  const num = (value) => {
    if (value === '' || value == null) return null;
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  };

  const cmToMm = (value) => {
    const parsed = num(value);
    return parsed == null ? null : parsed * 10;
  };

  function showMessage(text, ok = false) {
    const el = $('formMessage');
    if (!el) return;

    el.textContent = text;
    el.className =
      'rounded-xl border p-3 text-sm ' +
      (ok
        ? 'border-green-900 bg-green-950/40 text-green-300'
        : 'border-red-900 bg-red-950/40 text-red-300');

    el.classList.remove('hidden');
  }

  function hideMessage() {
    const el = $('formMessage');
    if (!el) return;

    el.classList.add('hidden');
    el.textContent = '';
  }

  function scope(query) {
    // O bootstrap disponibiliza a loja ativa em active_store_id.
    // Sem loja ativa, falhamos de forma segura em vez de consultar outras lojas.
    if (!ctx?.active_store_id) {
      return query.eq('store_id', '00000000-0000-0000-0000-000000000000');
    }

    return query.eq('store_id', ctx.active_store_id);
  }

  let lastCepRequested = '';
  let cepRequestSequence = 0;
  let clientRecordId = null;
  let clientLookupDocument = '';
  let clientLookupSequence = 0;

  function setCepMessage(message, isError = false) {
    const el = $('clientLookupMessage');
    if (!el) return;

    el.textContent = message;
    el.className = 'pb-3 text-xs ' + (isError ? 'text-red-400' : 'text-gray-400');
  }

  function fillAddressFromCep(address) {
    if ($('clientStreet')) $('clientStreet').value = address.logradouro || '';
    if ($('clientNeighborhood')) $('clientNeighborhood').value = address.bairro || '';
    if ($('clientCity')) $('clientCity').value = address.localidade || '';
    if ($('clientState')) $('clientState').value = (address.uf || '').toUpperCase();

    // O ViaCEP não fornece número nem complemento; não sobrescrevemos esses campos.
  }

  async function lookupCep() {
    const field = $('clientZipCode');
    if (!field) return;

    const digits = field.value.replace(/\D/g, '').slice(0, 8);
    field.value = digits.length > 5
      ? digits.slice(0, 5) + '-' + digits.slice(5)
      : digits;

    if (digits.length !== 8) {
      lastCepRequested = '';
      return;
    }

    if (digits === lastCepRequested) return;
    lastCepRequested = digits;
    const requestId = ++cepRequestSequence;
    setCepMessage('Buscando endereço pelo CEP...');

    try {
      const response = await fetch(`https://viacep.com.br/ws/${digits}/json/`);
      if (!response.ok) throw new Error('Não foi possível consultar o CEP.');

      const address = await response.json();
      if (requestId !== cepRequestSequence) return;

      if (address.erro) {
        setCepMessage('CEP não encontrado. Confira os números e tente novamente.', true);
        return;
      }

      fillAddressFromCep(address);
      setCepMessage('Endereço preenchido pelo CEP. Confira o número e o complemento.');
    } catch (error) {
      if (requestId !== cepRequestSequence) return;
      setCepMessage('Não foi possível consultar o CEP agora. Você pode preencher o endereço manualmente.', true);
      console.warn('[NEKKO WD] Falha ao consultar CEP:', error);
    }
  }

  function normalizeDocument(value) {
    return String(value || '').replace(/\D/g, '').slice(0, 11);
  }

  function formatCpf(value) {
    const digits = normalizeDocument(value);
    if (digits.length <= 3) return digits;
    if (digits.length <= 6) return `${digits.slice(0, 3)}.${digits.slice(3)}`;
    if (digits.length <= 9) return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6)}`;
    return `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9, 11)}`;
  }

  function isValidCpf(value) {
    const cpf = normalizeDocument(value);
    if (cpf.length !== 11 || /^([0-9])\1{10}$/.test(cpf)) return false;

    const digits = cpf.split('').map(Number);
    let sum = 0;
    for (let i = 0; i < 9; i++) sum += digits[i] * (10 - i);
    let check = (sum * 10) % 11;
    if (check === 10) check = 0;
    if (check !== digits[9]) return false;

    sum = 0;
    for (let i = 0; i < 10; i++) sum += digits[i] * (11 - i);
    check = (sum * 10) % 11;
    if (check === 10) check = 0;
    return check === digits[10];
  }

  function setClientRecordState(message, isError = false) {
    const el = $('clientRecordState');
    if (!el) return;
    el.textContent = message;
    el.className = 'rounded-full border px-3 py-1 text-xs ' +
      (isError
        ? 'border-red-900 text-red-400'
        : 'border-[#292929] text-gray-400');
  }

  function setClientField(id, value) {
    const field = $(id);
    if (field) field.value = value ?? '';
  }

  function fillClientFields(client) {
    const address = client?.address && typeof client.address === 'object'
      ? client.address
      : {};

    setClientField('clientDocument', formatCpf(client?.document || ''));
    setClientField('clientName', client?.name || '');
    setClientField('clientPhone', client?.phone || '');
    setClientField('clientZipCode', address.zip_code || '');
    setClientField('clientStreet', address.street || '');
    setClientField('clientNumber', address.number || '');
    setClientField('clientComplement', address.complement || '');
    setClientField('clientNeighborhood', address.neighborhood || '');
    setClientField('clientCity', address.city || '');
    setClientField('clientState', address.state || '');
    setClientField('clientId', client?.id || '');
  }

  function buildClientPayload() {
    const documentValue = $('clientDocument')?.value.trim() || '';
    const name = $('clientName')?.value.trim() || '';
    const documentDigits = normalizeDocument(documentValue);

    if (!ctx?.active_store_id) {
      throw new Error('Nenhuma loja ativa foi identificada. Selecione uma loja e tente novamente.');
    }
    if (!documentDigits) {
      throw new Error('Informe o CPF do cliente.');
    }
    if (documentDigits.length !== 11 || !isValidCpf(documentDigits)) {
      throw new Error('Informe um CPF válido com os 11 dígitos corretos.');
    }
    if (!name) {
      throw new Error('Informe o nome completo do cliente.');
    }

    return {
      company_id: ctx.company_id,
      store_id: ctx.active_store_id,
      name,
      document: formatCpf(documentValue),
      phone: $('clientPhone')?.value.trim() || null,
      address: {
        zip_code: $('clientZipCode')?.value.trim() || null,
        street: $('clientStreet')?.value.trim() || null,
        number: $('clientNumber')?.value.trim() || null,
        complement: $('clientComplement')?.value.trim() || null,
        neighborhood: $('clientNeighborhood')?.value.trim() || null,
        city: $('clientCity')?.value.trim() || null,
        state: $('clientState')?.value.trim().toUpperCase() || null
      }
    };
  }

  async function findClientByDocument(documentValue) {
    const digits = normalizeDocument(documentValue);
    if (!isValidCpf(digits)) return null;
    if (!ctx?.company_id || !ctx?.active_store_id) {
      throw new Error('Não foi possível identificar a empresa e a loja ativa.');
    }

    const { data, error } = await window.supabaseClient
      .from('clients')
      .select('id, company_id, store_id, name, document, phone, address')
      .eq('company_id', ctx.company_id)
      .eq('store_id', ctx.active_store_id)
      .limit(500);

    if (error) throw error;
    return (data || []).find((client) => normalizeDocument(client.document) === digits) || null;
  }

  async function lookupClientByDocument() {
    const field = $('clientDocument');
    if (!field) return;

    const documentValue = field.value.trim();
    const digits = normalizeDocument(documentValue);
    if (digits.length < 11) {
      setClientRecordState('Digite o CPF completo');
      return;
    }
    if (!isValidCpf(digits)) {
      clientRecordId = null;
      clientLookupDocument = '';
      setClientRecordState('CPF inválido', true);
      setCepMessage('Confira os números do CPF. A busca será feita automaticamente quando o CPF for válido.', true);
      return;
    }

    const currentState = $('clientRecordState')?.textContent?.trim() || '';
    if (clientLookupDocument === digits &&
        ['Cliente encontrado nesta loja', 'Novo cliente nesta loja', 'Novo cliente cadastrado', 'Cliente vinculado ao projeto'].includes(currentState)) {
      return;
    }

    const requestId = ++clientLookupSequence;
    setClientRecordState('Buscando cliente...');
    setCepMessage('');

    try {
      const client = await findClientByDocument(documentValue);
      if (requestId !== clientLookupSequence) return;

      clientLookupDocument = digits;
      if (client) {
        clientRecordId = client.id;
        fillClientFields(client);
        setClientRecordState('Cliente encontrado nesta loja');
        setCepMessage('Cadastro localizado. Confira ou atualize os dados antes de salvar.');
      } else {
        // Igual ao fluxo do NEKKO OS: uma busca sem resultado não apaga
        // os campos preenchidos manualmente. O usuário pode cadastrar
        // um cliente novo com esse documento na mesma tela.
        clientRecordId = null;
        setClientField('clientId', '');
        setClientRecordState('Novo cliente nesta loja');
        setCepMessage('Nenhum cadastro encontrado nesta loja. Preencha os dados para cadastrar o cliente.');
      }
    } catch (error) {
      console.error('[NEKKO WD] Erro ao buscar cliente:', error);
      setClientRecordState('Falha na busca', true);
      setCepMessage('Não foi possível consultar o cadastro. Verifique a conexão e tente novamente.', true);
    }
  }

  async function saveOrUpdateClient() {
    const payload = buildClientPayload();
    const documentDigits = normalizeDocument(payload.document);

    // Confere novamente no banco para evitar duplicidade se o usuário digitou
    // um documento existente sem ter acionado a busca manualmente.
    const found = await findClientByDocument(payload.document);
    let targetId = clientRecordId;

    if (targetId && clientLookupDocument && clientLookupDocument !== documentDigits) {
      targetId = null;
    }

    if (found && (!targetId || found.id !== targetId)) {
      targetId = found.id;
      clientRecordId = found.id;
      fillClientFields(found);
      throw new Error('Esse CPF já está cadastrado nesta loja. Os dados foram carregados; confira e salve novamente para atualizar o cliente.');
    }

    if (targetId) {
      const { data, error } = await window.supabaseClient
        .from('clients')
        .update({
          name: payload.name,
          phone: payload.phone,
          address: payload.address
        })
        .eq('id', targetId)
        .eq('company_id', ctx.company_id)
        .eq('store_id', ctx.active_store_id)
        .select('id')
        .maybeSingle();

      if (error) throw error;
      if (!data) throw new Error('O cliente não foi atualizado. Verifique as permissões da loja no Supabase.');
      $('clientId').value = data.id;
      return data.id;
    }

    const { data, error } = await window.supabaseClient
      .from('clients')
      .insert({ ...payload, created_by: user.id })
      .select('id')
      .single();

    if (error) throw error;
    if (!data?.id) throw new Error('Não foi possível cadastrar o cliente.');
    clientRecordId = data.id;
    clientLookupDocument = documentDigits;
    $('clientId').value = data.id;
    setClientRecordState('Novo cliente cadastrado');
    return data.id;
  }

  function validateNumberFields() {
    const fields = [['materialsCost', 'custo dos materiais']];
    for (const [id, label] of fields) {
      const value = $(id)?.value;
      if (value !== '' && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
        showMessage(`Verifique o campo ${label}: informe um número igual ou maior que zero.`);
        $(id)?.focus();
        return false;
      }
    }
    for (let index = 0; index < projectItems.length; index++) {
      const item = projectItems[index];
      if (!String(item.name || '').trim()) {
        showMessage(`Informe o nome do serviço ${index + 1}.`);
        document.querySelector(`[data-item-id="${item.localId}"][data-field="name"]`)?.focus();
        return false;
      }
      for (const key of ['width', 'length', 'height', 'thickness', 'serviceValue']) {
        const value = item[key];
        if (value !== '' && value != null && (!Number.isFinite(Number(value)) || Number(value) < 0)) {
          showMessage(`Verifique as medidas e o valor do serviço ${index + 1}.`);
          return false;
        }
      }
    }
    return true;
  }

  const money = (value) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value) || 0);

  function itemArea(item) {
    const width = Number(item.width) || 0;
    const length = Number(item.length) || 0;
    return width > 0 && length > 0 ? ((width * length) / 10000).toFixed(2) : '';
  }

  function calculateTotals() {
    const services = projectItems.reduce((sum, item) => sum + (Number(item.serviceValue) || 0), 0);
    const materials = Number($('materialsCost')?.value) || 0;
    if ($('servicesTotal')) $('servicesTotal').textContent = money(services);
    if ($('materialsTotal')) $('materialsTotal').textContent = money(materials);
    if ($('netRevenue')) $('netRevenue').textContent = money(services - materials);
  }

  function renderProjectItems() {
    const container = $('projectItems');
    if (!container) return;
    const materialOptions = ['', 'MDF', 'MDP', 'Madeira maciça', 'Compensado', 'Outro'];
    container.innerHTML = projectItems.map((item, index) => {
      const field = (key, label, value, type = 'text', extra = '') => `<div><label class="label">${label}</label><input data-item-id="${item.localId}" data-field="${key}" type="${type}" ${type === 'number' ? 'min="0" step="0.01"' : ''} value="${escapeHTML(value ?? '')}" ${extra}></div>`;
      const options = materialOptions.map(value => `<option value="${escapeHTML(value)}" ${item.material === value ? 'selected' : ''}>${value ? escapeHTML(value) : 'Selecione'}</option>`).join('');
      return `<article class="rounded-xl border border-[#292929] bg-[#0c0c0c] p-4" data-project-item="${item.localId}">
        <div class="mb-4 flex items-center justify-between gap-3"><h4 class="font-bold">Serviço ${index + 1}</h4><button type="button" data-remove-item="${item.localId}" class="rounded-lg border border-red-900/70 px-3 py-2 text-xs text-red-300 ${projectItems.length === 1 ? 'hidden' : ''}">Remover</button></div>
        <div class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          ${field('name','Nome do serviço',item.name,'text','maxlength="150" placeholder="Ex.: Porta 1" required')}
          ${field('width','Largura (cm)',item.width,'number')}
          ${field('length','Comprimento (cm)',item.length,'number')}
          ${field('height','Altura (cm)',item.height,'number')}
          <div><label class="label">Área (m²)</label><input readonly value="${itemArea(item)}" data-area-for="${item.localId}"></div>
          <div><label class="label">Material</label><select data-item-id="${item.localId}" data-field="material">${options}</select></div>
          ${field('color','Cor / acabamento',item.color,'text','placeholder="Ex.: Carvalho, branco TX"')}
          ${field('thickness','Espessura (cm)',item.thickness,'number')}
          ${field('serviceValue','Valor do serviço (R$)',item.serviceValue,'number')}
        </div>
      </article>`;
    }).join('');
    $('itemsEmptyState')?.classList.toggle('hidden', projectItems.length > 0);
    if (window.lucide?.createIcons) window.lucide.createIcons();
    calculateTotals();
  }

  function addProjectItem(item = {}) {
    projectItems.push({
      localId: item.localId || `item-${nextItemId++}`,
      id: item.id || null,
      name: item.name || '',
      width: item.width ?? '',
      length: item.length ?? '',
      height: item.height ?? '',
      material: item.material || '',
      color: item.color || '',
      thickness: item.thickness ?? '',
      serviceValue: item.serviceValue ?? 0
    });
    renderProjectItems();
  }

  function readProjectItems() {
    return projectItems.map((item, index) => ({
      company_id: ctx.company_id,
      store_id: ctx.active_store_id,
      sort_order: index + 1,
      name: String(item.name || '').trim(),
      width_cm: num(item.width),
      length_cm: num(item.length),
      height_cm: num(item.height),
      material_type: item.material || null,
      material_color: String(item.color || '').trim() || null,
      thickness_cm: num(item.thickness),
      service_value: Number(item.serviceValue) || 0
    }));
  }

  async function persistProjectItems(projectId) {
    const { error: deleteError } = await window.supabaseClient
      .from('woodworking_project_items').delete().eq('project_id', projectId).eq('company_id', ctx.company_id);
    if (deleteError) throw deleteError;
    const rows = readProjectItems().map(row => ({ ...row, project_id: projectId }));
    if (rows.length) {
      const { error } = await window.supabaseClient.from('woodworking_project_items').insert(rows);
      if (error) throw error;
    }
  }

  function draw() {
    const canvas = $('sketchCanvas');

    if (!canvas || !ctx2d) return;

    ctx2d.clearRect(0, 0, canvas.width, canvas.height);

    const ratio = window.devicePixelRatio || 1;

    for (const stroke of strokes) {
      if (!stroke.points?.length) continue;

      ctx2d.save();
      ctx2d.lineCap = 'round';
      ctx2d.lineJoin = 'round';

      ctx2d.globalCompositeOperation =
        stroke.tool === 'eraser'
          ? 'destination-out'
          : 'source-over';

      ctx2d.strokeStyle =
        stroke.tool === 'eraser'
          ? '#000'
          : stroke.color || '#202020';

      ctx2d.lineWidth = (Number(stroke.width) || 3) * ratio;

      ctx2d.beginPath();

      const first = stroke.points[0];

      ctx2d.moveTo(
        first.x * canvas.width,
        first.y * canvas.height
      );

      if (stroke.points.length === 1) {
        ctx2d.lineTo(
          first.x * canvas.width + 0.5,
          first.y * canvas.height + 0.5
        );
      } else {
        for (const point of stroke.points.slice(1)) {
          ctx2d.lineTo(
            point.x * canvas.width,
            point.y * canvas.height
          );
        }
      }

      ctx2d.stroke();
      ctx2d.restore();
    }
  }

  function resizeCanvas() {
    const canvas = $('sketchCanvas');

    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();

    if (!rect.width || !rect.height) return;

    const ratio = window.devicePixelRatio || 1;
    const width = Math.round(rect.width * ratio);
    const height = Math.round(rect.height * ratio);

    if (
      canvas.width === width &&
      canvas.height === height &&
      ctx2d
    ) {
      return;
    }

    canvas.width = width;
    canvas.height = height;
    ctx2d = canvas.getContext('2d');

    draw();
  }

  function markSketchDirty() {
    const state = $('sketchState');

    if (state) {
      state.textContent = 'Desenho alterado — salve o projeto';
    }
  }

  function loadSketch(sketchData) {
    strokes = Array.isArray(sketchData?.strokes)
      ? JSON.parse(JSON.stringify(sketchData.strokes))
      : [];

    activeStroke = null;

    const state = $('sketchState');

    if (state) {
      state.textContent = strokes.length
        ? 'Desenho carregado'
        : 'Nenhum desenho salvo';
    }

    draw();
  }

  function initCanvas() {
    const canvas = $('sketchCanvas');

    if (!canvas) return;

    canvas.addEventListener('pointerdown', (event) => {
      if (busy || !ctx2d) return;

      event.preventDefault();

      const rect = canvas.getBoundingClientRect();

      activeStroke = {
        tool,
        color: $('colorPicker')?.value || '#202020',
        width: Number($('strokeWidth')?.value) || 3,
        points: [
          {
            x: Math.max(
              0,
              Math.min(1, (event.clientX - rect.left) / rect.width)
            ),
            y: Math.max(
              0,
              Math.min(1, (event.clientY - rect.top) / rect.height)
            )
          }
        ]
      };

      strokes.push(activeStroke);

      canvas.setPointerCapture(event.pointerId);

      markSketchDirty();
      draw();
    });

    canvas.addEventListener('pointermove', (event) => {
      if (!activeStroke) return;

      const rect = canvas.getBoundingClientRect();

      activeStroke.points.push({
        x: Math.max(
          0,
          Math.min(1, (event.clientX - rect.left) / rect.width)
        ),
        y: Math.max(
          0,
          Math.min(1, (event.clientY - rect.top) / rect.height)
        )
      });

      draw();
    });

    for (const eventName of [
      'pointerup',
      'pointercancel',
      'lostpointercapture'
    ]) {
      canvas.addEventListener(eventName, () => {
        activeStroke = null;
      });
    }

    document.querySelectorAll('[data-tool]').forEach((button) => {
      button.addEventListener('click', () => {
        tool = button.dataset.tool || 'pen';

        document.querySelectorAll('[data-tool]').forEach((item) => {
          item.classList.toggle('active', item === button);
        });
      });
    });

    $('undo')?.addEventListener('click', () => {
      if (!strokes.length) return;

      strokes.pop();
      activeStroke = null;

      markSketchDirty();
      draw();
    });

    $('clear')?.addEventListener('click', () => {
      if (!strokes.length) return;

      if (!confirm('Apagar todo o desenho deste projeto?')) return;

      strokes = [];
      activeStroke = null;

      markSketchDirty();
      draw();
    });

    $('strokeWidth')?.addEventListener('input', () => {
      if ($('widthValue')) {
        $('widthValue').textContent = $('strokeWidth').value;
      }
    });

    resizeObserver = new ResizeObserver(resizeCanvas);
    resizeObserver.observe(canvas);

    resizeCanvas();
  }

  async function loadClients() {
    let query = window.supabaseClient
      .from('clients')
      .select('id, name')
      .eq('company_id', ctx.company_id)
      .order('name');

    query = scope(query);

    const { data, error } = await query.limit(500);

    if (error) throw error;

    const clients = data || [];
    const select = $('clientId');

    if (!select) return;

    select.innerHTML =
      '<option value="">Sem cliente vinculado</option>' +
      clients
        .map(
          (client) =>
            `<option value="${client.id}">${escapeHTML(client.name)}</option>`
        )
        .join('');
  }

  function escapeHTML(value) {
    return String(value ?? '').replace(
      /[&<>"']/g,
      (character) =>
        ({
          '&': '&amp;',
          '<': '&lt;',
          '>': '&gt;',
          '"': '&quot;',
          "'": '&#39;'
        })[character]
    );
  }


  function buildPayload() {
    const first = projectItems[0] || {};
    const totalServices = projectItems.reduce((sum, item) => sum + (Number(item.serviceValue) || 0), 0);
    const materialsCost = Number($('materialsCost')?.value) || 0;
    return {
      company_id: ctx.company_id,
      store_id: ctx.active_store_id,
      client_id: $('clientId').value || null,
      title: $('title').value.trim(),
      service_name: $('service').value.trim() || null,
      environment_type: $('environment').value || null,
      status: $('status').value || 'PENDING',
      width_mm: cmToMm(first.width),
      length_mm: cmToMm(first.length),
      height_mm: cmToMm(first.height),
      area_m2: (Number(first.width) > 0 && Number(first.length) > 0) ? (Number(first.width) * Number(first.length)) / 10000 : null,
      material_type: first.material || null,
      material_color: String(first.color || '').trim() || null,
      material_thickness_mm: cmToMm(first.thickness),
      estimated_value: totalServices,
      final_value: null,
      materials_cost: materialsCost,
      deadline: $('deadline').value || null,
      description: $('description').value.trim() || null,
      notes: $('notes').value.trim() || null,
      sketch_data: { version: 1, strokes: JSON.parse(JSON.stringify(strokes)) }
    };
  }

  async function saveProject(event) {
    event.preventDefault();

    if (busy) return;

    hideMessage();

    if (!$('title').value.trim()) {
      showMessage('Informe o nome do projeto.');
      $('title').focus();
      return;
    }

    if (!validateNumberFields()) return;

    busy = true;

    const saveButton = $('save');

    if (saveButton) {
      saveButton.disabled = true;
      saveButton.textContent = editId
        ? 'Salvando alterações...'
        : 'Salvando projeto...';
    }

    try {
      const clientId = await saveOrUpdateClient();
      const payload = buildPayload();
      payload.client_id = clientId;

      let result;
      let savedProjectId = editId;

      if (editId) {
        result = await window.supabaseClient
          .from('woodworking_projects')
          .update(payload)
          .eq('id', editId)
          .eq('company_id', ctx.company_id)
          .select('id')
          .maybeSingle();
      } else {
        payload.created_by = user.id;

        result = await window.supabaseClient
          .from('woodworking_projects')
          .insert(payload)
          .select('id, project_number')
          .single();
      }

      if (result.error) {
        throw result.error;
      }

      if (!result.data) {
        throw new Error('Nenhum projeto foi salvo. Verifique as permissões do Supabase.');
      }
      savedProjectId = result.data.id || savedProjectId;
      await persistProjectItems(savedProjectId);

      if ($('sketchState')) {
        $('sketchState').textContent = strokes.length
          ? 'Desenho salvo no projeto'
          : 'Projeto salvo sem desenho';
      }

      showMessage(
        editId
          ? 'Projeto atualizado com sucesso!'
          : 'Projeto cadastrado com sucesso!',
        true
      );

      setTimeout(() => {
        window.location.href = 'projects.html';
      }, 700);
    } catch (error) {
      console.error('[NEKKO WD] Erro ao salvar projeto:', error);

      showMessage(
        error?.message ||
          'Não foi possível salvar o projeto. Verifique a conexão e as permissões do Supabase.'
      );
    } finally {
      busy = false;

      if (saveButton) {
        saveButton.disabled = false;
        saveButton.textContent = editId
          ? 'Salvar alterações'
          : 'Salvar Projeto!';
      }
    }
  }

  async function loadProject(id) {
    let query = window.supabaseClient
      .from('woodworking_projects')
      .select(
        'id, client_id, title, service_name, environment_type, status, width_mm, length_mm, height_mm, area_m2, material_type, material_color, material_thickness_mm, estimated_value, final_value, materials_cost, deadline, description, notes, sketch_data'
      )
      .eq('id', id)
      .eq('company_id', ctx.company_id);

    query = scope(query);

    const { data, error } = await query.maybeSingle();

    if (error) throw error;

    if (!data) {
      throw new Error('Projeto não encontrado ou sem permissão de acesso.');
    }

    editId = data.id;

    if (data.client_id) {
      const { data: clientData, error: clientError } = await window.supabaseClient
        .from('clients')
        .select('id, company_id, store_id, name, document, phone, address')
        .eq('id', data.client_id)
        .eq('company_id', ctx.company_id)
        .eq('store_id', ctx.active_store_id)
        .maybeSingle();
      if (clientError) throw clientError;
      if (clientData) {
        clientRecordId = clientData.id;
        clientLookupDocument = normalizeDocument(clientData.document);
        fillClientFields(clientData);
        setClientRecordState('Cliente vinculado ao projeto');
      }
    }

    const fields = {
      clientId: 'client_id', title: 'title', service: 'service_name',
      environment: 'environment_type', status: 'status', deadline: 'deadline',
      description: 'description', notes: 'notes', materialsCost: 'materials_cost'
    };
    for (const [elementId, property] of Object.entries(fields)) {
      const element = $(elementId);
      if (element) element.value = data[property] ?? (elementId === 'materialsCost' ? 0 : '');
    }

    const { data: itemRows, error: itemsError } = await window.supabaseClient
      .from('woodworking_project_items')
      .select('id, sort_order, name, width_cm, length_cm, height_cm, material_type, material_color, thickness_cm, service_value')
      .eq('project_id', id).eq('company_id', ctx.company_id).order('sort_order');
    if (itemsError) throw itemsError;
    projectItems = [];
    nextItemId = 1;
    if (itemRows?.length) {
      itemRows.forEach(row => addProjectItem({
        id: row.id, name: row.name, width: row.width_cm, length: row.length_cm,
        height: row.height_cm, material: row.material_type, color: row.material_color,
        thickness: row.thickness_cm, serviceValue: row.service_value
      }));
    } else {
      // Compatibility: show older projects as a single service from legacy columns.
      addProjectItem({
        name: data.service_name || data.title || '',
        width: data.width_mm == null ? '' : Number(data.width_mm) / 10,
        length: data.length_mm == null ? '' : Number(data.length_mm) / 10,
        height: data.height_mm == null ? '' : Number(data.height_mm) / 10,
        material: data.material_type || '', color: data.material_color || '',
        thickness: data.material_thickness_mm == null ? '' : Number(data.material_thickness_mm) / 10,
        serviceValue: data.final_value ?? data.estimated_value ?? 0
      });
    }
    renderProjectItems();
    loadSketch(data.sketch_data);

    if ($('formTitle')) {
      $('formTitle').textContent = 'Editar projeto';
    }

    if ($('save')) {
      $('save').textContent = 'Salvar alterações';
    }

    document.title = 'Editar projeto | NEKKO WD';
  }

  function setupEvents() {
    $('form')?.addEventListener('submit', saveProject);

    $('clientDocument')?.addEventListener('blur', lookupClientByDocument);
    $('clientDocument')?.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault();
        lookupClientByDocument();
      }
    });
    $('clientDocument')?.addEventListener('input', () => {
      const field = $('clientDocument');
      const currentDigits = normalizeDocument(field.value);
      const formatted = formatCpf(currentDigits);
      if (field.value !== formatted) {
        const cursorAtEnd = field.selectionStart === field.value.length;
        field.value = formatted;
        if (cursorAtEnd) field.setSelectionRange(formatted.length, formatted.length);
      }

      // Se o documento mudou depois de localizar um cliente, desvinculamos
      // o registro anterior e limpamos seus dados para evitar mistura de clientes.
      if (clientRecordId && clientLookupDocument && currentDigits !== clientLookupDocument) {
        clientRecordId = null;
        clientLookupDocument = '';
        $('clientId').value = '';
        for (const id of [
          'clientName', 'clientPhone',
          'clientZipCode', 'clientStreet', 'clientNumber', 'clientComplement',
          'clientNeighborhood', 'clientCity', 'clientState'
        ]) {
          setClientField(id, '');
        }
        setClientRecordState('CPF alterado — consultando quando estiver completo');
      }

      if (currentDigits.length === 11) {
        if (isValidCpf(currentDigits)) {
          lookupClientByDocument();
        } else {
          clientLookupDocument = '';
          setClientRecordState('CPF inválido', true);
          setCepMessage('O CPF digitado não é válido. Confira os números.', true);
        }
      } else {
        setClientRecordState('Digite o CPF completo');
        setCepMessage('');
      }
    });

    $('clientZipCode')?.addEventListener('input', () => {
      const digits = $('clientZipCode').value.replace(/\D/g, '').slice(0, 8);
      if (digits.length < 8) {
        lastCepRequested = '';
        cepRequestSequence++;
        $('clientZipCode').value = digits.length > 5
          ? digits.slice(0, 5) + '-' + digits.slice(5)
          : digits;
      } else {
        lookupCep();
      }
    });
    $('clientZipCode')?.addEventListener('blur', lookupCep);

    $('addProjectItem')?.addEventListener('click', () => addProjectItem());
    $('materialsCost')?.addEventListener('input', calculateTotals);
    $('projectItems')?.addEventListener('input', (event) => {
      const input = event.target.closest('[data-item-id][data-field]');
      if (!input) return;
      const item = projectItems.find(entry => entry.localId === input.dataset.itemId);
      if (!item) return;
      item[input.dataset.field] = input.value;
      if (['width', 'length'].includes(input.dataset.field)) {
        const area = document.querySelector(`[data-area-for="${item.localId}"]`);
        if (area) area.value = itemArea(item);
      }
      calculateTotals();
    });
    $('projectItems')?.addEventListener('change', (event) => {
      const input = event.target.closest('[data-item-id][data-field]');
      if (!input) return;
      const item = projectItems.find(entry => entry.localId === input.dataset.itemId);
      if (item) item[input.dataset.field] = input.value;
      calculateTotals();
    });
    $('projectItems')?.addEventListener('click', (event) => {
      const button = event.target.closest('[data-remove-item]');
      if (!button) return;
      projectItems = projectItems.filter(item => item.localId !== button.dataset.removeItem);
      renderProjectItems();
    });

    $('cancel')?.addEventListener('click', () => {
      window.location.href = 'projects.html';
    });

    $('close')?.addEventListener('click', () => {
      window.location.href = 'projects.html';
    });
  }

  async function init() {
    try {
      if (
        !window.supabaseClient ||
        !window.NekkoBootstrap
      ) {
        throw new Error(
          'Os componentes do sistema não foram carregados. Atualize a página.'
        );
      }

      const { data, error } =
        await window.supabaseClient.auth.getSession();

      if (error) throw error;

      if (!data.session) {
        window.location.replace('../login/login.html');
        return;
      }

      user = data.session.user;

      const result = await window.NekkoBootstrap.init();

      if (!result || result.status !== 'ready') {
        if (result?.status === 'no_store') {
          window.location.replace('../onboarding/stores.html');
        } else if (result?.status === 'no_company') {
          window.location.replace('../onboarding/company.html');
        } else if (result?.status === 'unauthenticated') {
          window.location.replace('../login/login.html');
        }

        return;
      }

      // O bootstrap retorna o contexto diretamente no objeto result.
      ctx = result;

      if (!ctx.company_id) {
        throw new Error('Empresa ativa não identificada.');
      }

      await loadClients();

      const params = new URLSearchParams(window.location.search);
      const requestedId = params.get('id');

      if (requestedId) {
        await loadProject(requestedId);
      } else {
        addProjectItem();
      }

      console.info('[NEKKO WD] Tela de criação de projeto pronta.');
    } catch (error) {
      console.error(
        '[NEKKO WD] Erro ao inicializar criação de projeto:',
        error
      );

      showMessage(
        error?.message ||
          'Não foi possível carregar a tela de criação do projeto.'
      );
    }
  }

  setupEvents();
  initCanvas();
  init();
})();
