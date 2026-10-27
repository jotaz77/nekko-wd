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
    return String(value || '').replace(/\D/g, '');
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

    setClientField('clientDocument', client?.document || '');
    setClientField('clientName', client?.name || '');
    setClientField('clientPhone', client?.phone || '');
    setClientField('clientWhatsapp', client?.whatsapp || '');
    setClientField('clientEmail', client?.email || '');
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
      throw new Error('Informe o CPF ou RG do cliente.');
    }
    if (documentDigits.length < 7) {
      throw new Error('Confira o CPF ou RG informado.');
    }
    if (!name) {
      throw new Error('Informe o nome completo do cliente.');
    }

    return {
      company_id: ctx.company_id,
      store_id: ctx.active_store_id,
      name,
      document: documentValue,
      phone: $('clientPhone')?.value.trim() || null,
      whatsapp: $('clientWhatsapp')?.value.trim() || null,
      email: $('clientEmail')?.value.trim() || null,
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
    if (!digits || digits.length < 7) return null;
    if (!ctx?.company_id || !ctx?.active_store_id) {
      throw new Error('Não foi possível identificar a empresa e a loja ativa.');
    }

    const { data, error } = await window.supabaseClient
      .from('clients')
      .select('id, company_id, store_id, name, document, email, phone, whatsapp, address')
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
    if (digits.length < 7) {
      clientRecordId = null;
      clientLookupDocument = '';
      setClientRecordState('Informe CPF ou RG');
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
        clientRecordId = null;
        setClientField('clientId', '');
        setClientField('clientName', '');
        setClientField('clientPhone', '');
        setClientField('clientWhatsapp', '');
        setClientField('clientEmail', '');
        setClientField('clientZipCode', '');
        setClientField('clientStreet', '');
        setClientField('clientNumber', '');
        setClientField('clientComplement', '');
        setClientField('clientNeighborhood', '');
        setClientField('clientCity', '');
        setClientField('clientState', '');
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
      throw new Error('Esse CPF/RG já está cadastrado nesta loja. Os dados foram carregados; confira e salve novamente para atualizar o cliente.');
    }

    if (targetId) {
      const { data, error } = await window.supabaseClient
        .from('clients')
        .update({
          name: payload.name,
          phone: payload.phone,
          whatsapp: payload.whatsapp,
          email: payload.email,
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
    const fields = [
      ['width', 'largura'],
      ['length', 'comprimento'],
      ['height', 'altura'],
      ['area', 'área'],
      ['thickness', 'espessura'],
      ['estimated', 'valor estimado'],
      ['final', 'valor final']
    ];

    for (const [id, label] of fields) {
      const value = $(id)?.value;

      if (
        value !== '' &&
        (!Number.isFinite(Number(value)) || Number(value) < 0)
      ) {
        showMessage(
          `Verifique o campo ${label}: informe um número igual ou maior que zero.`
        );
        $(id)?.focus();
        return false;
      }
    }

    return true;
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

  function calculateArea() {
    const width = num($('width')?.value);
    const length = num($('length')?.value);

    if (!width || !length || width <= 0 || length <= 0) {
      if ($('area')) $('area').value = '';
      return;
    }

    $('area').value = ((width * length) / 10000).toFixed(2);
  }

  function buildPayload() {
    return {
      company_id: ctx.company_id,
      store_id: ctx.active_store_id,
      client_id: $('clientId').value || null,

      title: $('title').value.trim(),
      service_name: $('service').value.trim() || null,
      environment_type: $('environment').value || null,

      status: $('status').value || 'PENDING',

      width_mm: cmToMm($('width').value),
      length_mm: cmToMm($('length').value),
      height_mm: cmToMm($('height').value),
      area_m2: num($('area').value),

      material_type: $('material').value || null,
      material_color: $('color').value.trim() || null,
      material_thickness_mm: cmToMm($('thickness').value),

      estimated_value: num($('estimated').value) ?? 0,
      final_value: num($('final').value),

      deadline: $('deadline').value || null,

      description: $('description').value.trim() || null,
      notes: $('notes').value.trim() || null,

      sketch_data: {
        version: 1,
        strokes: JSON.parse(JSON.stringify(strokes))
      }
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
        throw new Error(
          'Nenhum projeto foi salvo. Verifique as permissões do Supabase.'
        );
      }

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
          : 'Salvar projeto';
      }
    }
  }

  async function loadProject(id) {
    let query = window.supabaseClient
      .from('woodworking_projects')
      .select(
        'id, client_id, title, service_name, environment_type, status, width_mm, length_mm, height_mm, area_m2, material_type, material_color, material_thickness_mm, estimated_value, final_value, deadline, description, notes, sketch_data'
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
        .select('id, company_id, store_id, name, document, email, phone, whatsapp, address')
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
      clientId: 'client_id',
      title: 'title',
      service: 'service_name',
      environment: 'environment_type',
      status: 'status',
      deadline: 'deadline',
      width: 'width_mm',
      length: 'length_mm',
      height: 'height_mm',
      area: 'area_m2',
      material: 'material_type',
      color: 'material_color',
      thickness: 'material_thickness_mm',
      estimated: 'estimated_value',
      final: 'final_value',
      description: 'description',
      notes: 'notes'
    };

    for (const [elementId, property] of Object.entries(fields)) {
      const element = $(elementId);

      if (!element) continue;

      const value = data[property];

      if (
        elementId === 'width' ||
        elementId === 'length' ||
        elementId === 'height' ||
        elementId === 'thickness'
      ) {
        element.value = value == null ? '' : Number(value) / 10;
      } else {
        element.value = value ?? '';
      }
    }

    calculateArea();
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
      const currentDigits = normalizeDocument($('clientDocument').value);
      if (clientLookupDocument && currentDigits !== clientLookupDocument) {
        clientRecordId = null;
        $('clientId').value = '';
        for (const id of [
          'clientName', 'clientPhone', 'clientWhatsapp', 'clientEmail',
          'clientZipCode', 'clientStreet', 'clientNumber', 'clientComplement',
          'clientNeighborhood', 'clientCity', 'clientState'
        ]) {
          setClientField(id, '');
        }
        setClientRecordState('Documento alterado — consulte novamente');
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

    $('width')?.addEventListener('input', calculateArea);
    $('length')?.addEventListener('input', calculateArea);

    $('calcArea')?.addEventListener('click', calculateArea);

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
