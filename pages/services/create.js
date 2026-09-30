
const form = document.querySelector('#projectForm');
const feedback = document.querySelector('#feedback');
const submitButton = form.querySelector('[type="submit"]');

const width = form.elements.width;
const length = form.elements.length;
const area = document.querySelector('#area');

function calculateArea() {
  const w = Number(width.value || 0);
  const l = Number(length.value || 0);

  area.value = w > 0 && l > 0
    ? `${(w * l).toFixed(2)} m²`
    : '';
}

width.addEventListener('input', calculateArea);
length.addEventListener('input', calculateArea);

function toNumber(value) {
  if (value === '' || value == null) return null;

  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function metersToMillimeters(value) {
  const meters = toNumber(value);
  return meters === null ? null : Math.round(meters * 1000);
}

function showFeedback(message, isError = false) {
  feedback.textContent = message;
  feedback.classList.toggle('text-red-400', isError);
  feedback.classList.toggle('text-green-400', !isError);
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();

  if (submitButton.disabled) return;

  submitButton.disabled = true;
  submitButton.textContent = 'Salvando...';
  showFeedback('Salvando cliente e projeto...');

  try {
    const context = Storage.getContext();

    if (!context?.company?.id) {
      throw new Error('Empresa não encontrada. Selecione uma empresa antes de continuar.');
    }

    const { data: authResult, error: authError } =
      await supabaseClient.auth.getUser();

    if (authError) throw authError;

    const user = authResult?.user;

    if (!user) {
      throw new Error('Sua sessão expirou. Entre novamente.');
    }

    const formData = Object.fromEntries(
      new FormData(form).entries()
    );

    const companyId = context.company.id;
    const storeId = context.store?.id || null;

    // 1. Preparar os dados do cliente.
    const document = formData.customer_document.trim();
    const phone = formData.customer_phone.trim();
    const whatsapp = formData.customer_whatsapp.trim();
    const addressText = formData.customer_address.trim();

    const clientPayload = {
      company_id: companyId,
      store_id: storeId,
      name: formData.customer_name.trim(),
      document: document || null,
      phone: phone || null,
      whatsapp: whatsapp || null,
      address: addressText
        ? { full_address: addressText }
        : {},
      created_by: user.id,
    };

    // 2. Procurar um cliente existente para evitar duplicação.
    let clientQuery = supabaseClient
      .from('clients')
      .select('id')
      .eq('company_id', companyId);

    if (document) {
      clientQuery = clientQuery.eq('document', document);
    } else if (phone) {
      clientQuery = clientQuery.eq('phone', phone);
    } else {
      clientQuery = null;
    }

    let clientId = null;

    if (clientQuery) {
      if (storeId) {
        clientQuery = clientQuery.eq('store_id', storeId);
      }

      const { data: existingClient, error } =
        await clientQuery.maybeSingle();

      if (error) throw error;

      clientId = existingClient?.id || null;
    }

    // 3. Criar o cliente quando ainda não existir.
    if (!clientId) {
      const { data: newClient, error } = await supabaseClient
        .from('clients')
        .insert(clientPayload)
        .select('id')
        .single();

      if (error) throw error;

      clientId = newClient.id;
    }

    // 4. Preparar o projeto com os nomes reais das colunas.
    const projectPayload = {
      company_id: companyId,
      store_id: storeId,
      client_id: clientId,

      title: formData.project_name.trim(),
      service_name: formData.service_name.trim(),
      environment_type: formData.environment_type || null,

      // O formulário recebe metros; o banco armazena milímetros.
      width_mm: metersToMillimeters(formData.width),
      length_mm: metersToMillimeters(formData.length),
      height_mm: metersToMillimeters(formData.height),

      area_m2: (
        toNumber(formData.width) > 0 &&
        toNumber(formData.length) > 0
      )
        ? toNumber(formData.width) * toNumber(formData.length)
        : null,

      material_type: formData.material_type || null,
      material_color: formData.material_color.trim() || null,
      material_thickness_mm: toNumber(
        formData.material_thickness
      ),

      estimated_value: toNumber(formData.estimated_value) ?? 0,
      deadline: formData.estimated_deadline || null,

      description: formData.description.trim() || null,
      notes: formData.notes.trim() || null,
      created_by: user.id,
    };

    // 5. Salvar o projeto.
    const { error: projectError } = await supabaseClient
      .from('woodworking_projects')
      .insert(projectPayload);

    if (projectError) throw projectError;

    showFeedback('Projeto cadastrado com sucesso!');

    form.reset();
    area.value = '';

    window.location.href = './index.html';

  } catch (error) {
    console.error('Erro ao cadastrar projeto:', error);

    showFeedback(
      error.message || 'Não foi possível cadastrar o projeto.',
      true
    );
  } finally {
    submitButton.disabled = false;
    submitButton.textContent = 'Salvar projeto';
  }
});
