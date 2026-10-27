lucide.createIcons();
        (() => {
            'use strict';
            const $ = id => document.getElementById(id), labels = {QUOTE: 'Orçamento', PENDING: 'Pendente', IN_PROGRESS: 'Em andamento', COMPLETED: 'Concluído', DELIVERED: 'Entregue', CANCELLED: 'Cancelado'}, money = new Intl.NumberFormat('pt-BR', {style: 'currency', currency: 'BRL'});
            let user = null, ctx = null, projects = [], clients = [], editId = null, busy = false, strokes = [], activeStroke = null, tool = 'pen', ctx2d = null, resizeObserver = null;
            const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({'&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'}[c]));
            const num = v => v === '' || v == null ? null : (Number.isFinite(Number(v)) ? Number(v) : null);
            function message(el, text, ok = false) {el.textContent = text; el.className = 'rounded-xl border p-3 text-sm ' + (ok ? 'border-green-900 bg-green-950/40 text-green-300' : 'border-red-900 bg-red-950/40 text-red-300');}
            function hide(el) {el.classList.add('hidden'); el.textContent = '';}
            function scope(q) { return q; } // A listagem mostra os registros da empresa, independentemente da filial ativa.
            function draw() {const c = $('sketchCanvas'); if (!ctx2d || !c) return; ctx2d.clearRect(0, 0, c.width, c.height); for (const s of strokes) {if (!s.points?.length) continue; ctx2d.save(); ctx2d.lineCap = 'round'; ctx2d.lineJoin = 'round'; ctx2d.globalCompositeOperation = s.tool === 'eraser' ? 'destination-out' : 'source-over'; ctx2d.strokeStyle = s.tool === 'eraser' ? '#000' : (s.color || '#202020'); ctx2d.lineWidth = (Number(s.width) || 3) * (devicePixelRatio || 1); ctx2d.beginPath(); ctx2d.moveTo(s.points[0].x * c.width, s.points[0].y * c.height); if (s.points.length === 1) ctx2d.lineTo(s.points[0].x * c.width + .5, s.points[0].y * c.height + .5); else s.points.slice(1).forEach(p => ctx2d.lineTo(p.x * c.width, p.y * c.height)); ctx2d.stroke(); ctx2d.restore();} }
            function resize() {const c = $('sketchCanvas'), r = c.getBoundingClientRect(); if (!r.width || !r.height) return; const w = Math.round(r.width * (devicePixelRatio || 1)), h = Math.round(r.height * (devicePixelRatio || 1)); if (c.width === w && c.height === h && ctx2d) return; c.width = w; c.height = h; ctx2d = c.getContext('2d'); draw();}
            function sketchLoad(p) {strokes = Array.isArray(p?.sketch_data?.strokes) ? JSON.parse(JSON.stringify(p.sketch_data.strokes)) : []; activeStroke = null; $('sketchState').textContent = strokes.length ? 'Desenho carregado' : 'Nenhum desenho salvo'; draw();}
            function dirty() {$('sketchState').textContent = 'Desenho alterado — salve o projeto';}
            function initCanvas() {
                const c = $('sketchCanvas'); c.addEventListener('pointerdown', e => {if (busy || !ctx) return; e.preventDefault(); const r = c.getBoundingClientRect(); activeStroke = {tool: document.querySelector('[data-tool].active')?.dataset.tool || 'pen', color: $('colorPicker').value, width: Number($('strokeWidth').value) || 3, points: [{x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))}]}; strokes.push(activeStroke); c.setPointerCapture(e.pointerId); dirty(); draw();}); c.addEventListener('pointermove', e => {if (!activeStroke) return; const r = c.getBoundingClientRect(); activeStroke.points.push({x: Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)), y: Math.max(0, Math.min(1, (e.clientY - r.top) / r.height))}); draw();});['pointerup', 'pointercancel', 'lostpointercapture'].forEach(ev => c.addEventListener(ev, () => {activeStroke = null;}));
                document.querySelectorAll('[data-tool]').forEach(b => b.onclick = () => {tool = b.dataset.tool; document.querySelectorAll('[data-tool]').forEach(x => x.classList.toggle('active', x === b));});
                document.querySelectorAll('[data-tool]').forEach(b => b.addEventListener('click', () => {tool = b.dataset.tool;/* selected tool is read below */}));
                $('undo').onclick = () => {if (strokes.length) {strokes.pop(); dirty(); draw();} }; $('clear').onclick = () => {if (strokes.length && confirm('Apagar todo o desenho deste projeto?')) {strokes = []; activeStroke = null; dirty(); draw();} }; $('strokeWidth').oninput = () => $('widthValue').textContent = $('strokeWidth').value;
                const originalDown = c.onpointerdown; c.addEventListener('pointerdown', () => { }); resizeObserver = new ResizeObserver(resize); resizeObserver.observe(c); resize();
            }
            async function loadClients() {let q = scope(window.supabaseClient.from('clients').select('id,company_id,store_id,name,document,phone,whatsapp,email,address').eq('company_id', ctx.company_id).order('name')); const {data, error} = await q.limit(500); if (error) throw error; clients = data || []; $('clientId').innerHTML = '<option value="">Sem cliente vinculado</option>' + clients.map(c => `<option value="${esc(c.id)}">${esc(c.name)}</option>`).join('');}
            async function loadProjects() {let q = scope(window.supabaseClient.from('woodworking_projects').select('id,project_number,client_id,title,service_name,environment_type,status,width_mm,length_mm,height_mm,area_m2,material_type,material_color,material_thickness_mm,estimated_value,final_value,deadline,description,notes,sketch_data,created_at').eq('company_id', ctx.company_id).order('created_at', {ascending: false})); const {data, error} = await q.limit(500); if (error) throw error; projects = data || []; stats(); render();}
            function stats() {$('total').textContent = projects.length; $('progress').textContent = projects.filter(p => p.status === 'IN_PROGRESS').length; $('pending').textContent = projects.filter(p => p.status === 'PENDING').length; $('revenue').textContent = money.format(projects.filter(p => p.status !== 'CANCELLED').reduce((s, p) => s + Number(p.estimated_value || 0), 0));}
            function clientName(id) {return clients.find(c => c.id === id)?.name || 'Cliente não vinculado';}
            function render() {
                const term = $('search').value.trim().toLocaleLowerCase('pt-BR');
                const filter = $('filter').value;
                const rows = projects.filter(p =>
                    (!filter || p.status === filter) &&
                    (!term || [p.title, p.service_name, clientName(p.client_id), p.project_number]
                        .some(v => String(v || '').toLocaleLowerCase('pt-BR').includes(term)))
                );
                $('empty').classList.toggle('hidden', rows.length > 0);
                $('list').innerHTML = rows.map(p => {
                    const client = clients.find(c => c.id === p.client_id);
                    const clientPhone = String(client?.whatsapp || client?.phone || '').replace(/\D/g, '');
                    let whatsappDigits = clientPhone;
                    if (whatsappDigits.startsWith('0')) whatsappDigits = whatsappDigits.replace(/^0+/, '');
                    if (whatsappDigits && !whatsappDigits.startsWith('55')) whatsappDigits = '55' + whatsappDigits;
                    const whatsappMessage = `Olá ${client?.name || 'tudo bem'}! Estou entrando em contato sobre o projeto "${p.title}". No momento, o status dele está como "${labels[p.status] || p.status}". Se precisar de alguma informação, fico à disposição!`;
                    const whatsappUrl = whatsappDigits ? `https://wa.me/${whatsappDigits}?text=${encodeURIComponent(whatsappMessage)}` : '';
                    const statusLabel = labels[p.status] || p.status || 'Sem status';
                    return `<article class="panel group min-w-0 rounded-2xl border border-[#292929] p-4 transition duration-200 hover:border-[#4a382b] hover:shadow-lg hover:shadow-black/20 sm:p-5">
                      <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0 flex-1">
                          <p class="text-[11px] font-semibold uppercase tracking-[.14em] text-gray-500">Projeto ${esc(p.project_number ? '#' + p.project_number : '')}</p>
                          <h3 class="mt-1 break-words text-base font-bold leading-snug text-white sm:text-lg">${esc(p.title)}</h3>
                          <p class="mt-1 text-sm text-gray-400">${esc(clientName(p.client_id))}</p>
                        </div>
                        <button type="button" class="badge ${esc(p.status)} shrink-0 cursor-pointer border border-white/10 transition hover:brightness-125 focus:outline-none focus:ring-2 focus:ring-[#F28A3D]" data-status-toggle="${esc(p.id)}" title="Clique para alterar o status" aria-label="Status ${esc(statusLabel)}. Clique para alterar">${esc(statusLabel)} <span aria-hidden="true">⌄</span></button>
                      </div>
                      <div class="mt-4 grid grid-cols-2 gap-x-4 gap-y-3 border-y border-[#292929] py-3">
                        <div class="min-w-0"><p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Ambiente / serviço</p><p class="mt-1 break-words text-sm text-gray-200">${esc(p.environment_type || p.service_name || 'Não informado')}</p></div>
                        <div class="min-w-0"><p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Valor</p><p class="mt-1 text-sm font-bold text-[#F28A3D]">${esc(money.format(p.final_value ?? p.estimated_value ?? 0))}</p></div>
                        <div class="min-w-0"><p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Prazo</p><p class="mt-1 text-sm text-gray-200">${esc(p.deadline ? String(p.deadline).split('-').reverse().join('/') : 'Não definido')}</p></div>
                        <div class="min-w-0"><p class="text-[11px] font-medium uppercase tracking-wide text-gray-500">Área</p><p class="mt-1 text-sm text-gray-200">${p.area_m2 == null ? 'Não informada' : esc(p.area_m2) + ' m²'}</p></div>
                      </div>
                      ${p.material_type || p.material_color ? `<p class="mt-3 text-xs text-gray-400">${esc([p.material_type, p.material_color, p.material_thickness_mm ? `${p.material_thickness_mm} mm` : null].filter(Boolean).join(' · '))}</p>` : ''}
                      ${p.sketch_data?.strokes?.length ? '<p class="mt-3 text-xs text-[#F28A3D]">✎ Desenho salvo</p>' : ''}
                      ${p.description ? `<p class="mt-3 line-clamp-2 text-sm leading-5 text-gray-400">${esc(p.description)}</p>` : ''}
                      <div class="mt-4 flex flex-wrap items-center gap-2 border-t border-[#292929] pt-3">
                        <a href="details.html?id=${encodeURIComponent(p.id)}" class="inline-flex items-center gap-1.5 rounded-lg border border-[#F28A3D]/40 bg-[#2c1a10]/60 px-3 py-2 text-xs font-semibold text-[#F28A3D] transition hover:bg-[#2c1a10]" aria-label="Ver detalhes do projeto ${esc(p.title)}"><i data-lucide="eye" class="h-3.5 w-3.5"></i>Ver</a>
                        <button type="button" class="inline-flex items-center gap-1.5 rounded-lg border border-[#343434] px-3 py-2 text-xs font-semibold text-gray-200 transition hover:border-[#F28A3D]/60 hover:bg-[#2c1a10]" data-edit="${esc(p.id)}"><i data-lucide="pencil" class="h-3.5 w-3.5"></i>Editar</button>
                        <a href="print.html?id=${encodeURIComponent(p.id)}" class="inline-flex items-center gap-1.5 rounded-lg border border-[#F28A3D]/40 bg-[#2c1a10]/60 px-3 py-2 text-xs font-semibold text-[#F28A3D] transition hover:bg-[#2c1a10]"><i data-lucide="printer" class="h-3.5 w-3.5"></i>Imprimir OS</a>
                        ${whatsappUrl ? `<a href="${esc(whatsappUrl)}" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-1.5 rounded-lg border border-emerald-900/70 bg-emerald-950/30 px-3 py-2 text-xs font-semibold text-emerald-300 transition hover:bg-emerald-900/50"><i data-lucide="message-circle" class="h-3.5 w-3.5"></i>WhatsApp</a>` : `<button type="button" disabled title="Cadastre um telefone ou WhatsApp para este cliente" class="inline-flex cursor-not-allowed items-center gap-1.5 rounded-lg border border-[#292929] px-3 py-2 text-xs font-semibold text-gray-600"><i data-lucide="message-circle" class="h-3.5 w-3.5"></i>Sem telefone</button>`}
                        <button type="button" class="ml-auto inline-flex items-center gap-1.5 rounded-lg border border-red-950 px-3 py-2 text-xs font-semibold text-red-300 transition hover:border-red-800 hover:bg-red-950/40" data-delete="${esc(p.id)}"><i data-lucide="trash-2" class="h-3.5 w-3.5"></i>Excluir</button>
                      </div>
                    </article>`;
                }).join('');
                lucide.createIcons();
            }
            function setClientFields(client) {
                const address = client?.address && typeof client.address === 'object' ? client.address : {};
                const fields = {
                    clientDocument: client?.document || '', clientName: client?.name || '',
                    clientPhone: client?.phone || '', clientWhatsapp: client?.whatsapp || '',
                    clientEmail: client?.email || '', clientZipCode: address.zip_code || '',
                    clientStreet: address.street || '', clientNumber: address.number || '',
                    clientComplement: address.complement || '', clientNeighborhood: address.neighborhood || '',
                    clientCity: address.city || '', clientState: address.state || ''
                };
                for (const [id, value] of Object.entries(fields)) if ($(id)) $(id).value = value;
                if ($('editClientMessage')) $('editClientMessage').textContent = client ? 'Dados do cliente carregados. As alterações serão salvas junto com o projeto.' : 'Preencha os dados do cliente para vinculá-lo a este projeto.';
            }
            function openForm(p = null) {
                editId = p?.id || null;
                $('form').reset(); hide($('formMessage'));
                $('formTitle').textContent = p ? 'Editar projeto' : 'Novo projeto';
                $('save').textContent = p ? 'Salvar alterações' : 'Salvar projeto';
                const clientSection = $('editClientSection');
                if (clientSection) clientSection.classList.toggle('hidden', !p);
                if (p) {
                    const map = {clientId: 'client_id', title: 'title', service: 'service_name', environment: 'environment_type', status: 'status', deadline: 'deadline', area: 'area_m2', material: 'material_type', color: 'material_color', estimated: 'estimated_value', final: 'final_value', description: 'description', notes: 'notes'};
                    for (const [id, key] of Object.entries(map)) $(id).value = p[key] ?? '';
                    // O banco mantém as dimensões em milímetros; a nova tela trabalha em centímetros.
                    for (const id of ['width', 'length', 'height', 'thickness']) {
                        const key = {width: 'width_mm', length: 'length_mm', height: 'height_mm', thickness: 'material_thickness_mm'}[id];
                        $(id).value = p[key] == null ? '' : Number(p[key]) / 10;
                    }
                    setClientFields(clients.find(c => c.id === p.client_id) || null);
                } else {
                    setClientFields(null);
                }
                sketchLoad(p); $('formSection').classList.remove('hidden'); requestAnimationFrame(resize); $('formSection').scrollIntoView({behavior: 'smooth'});
            }
            function closeForm() {if ($('sketchState').textContent.includes('alterado') && !confirm('O desenho não foi salvo. Fechar mesmo assim?')) return; $('formSection').classList.add('hidden'); $('form').reset(); if ($('editClientSection')) $('editClientSection').classList.add('hidden'); editId = null; sketchLoad(null);}
            const normalizeDocument = value => String(value || '').replace(/\D/g, '');
            async function saveEditedClient() {
                if (!$('clientDocument') || !$('clientName')) return $('clientId').value || null;
                const documentValue = $('clientDocument').value.trim();
                const name = $('clientName').value.trim();
                const digits = normalizeDocument(documentValue);
                const anyClientData = [documentValue, name, $('clientPhone').value, $('clientWhatsapp').value, $('clientEmail').value,
                    $('clientZipCode').value, $('clientStreet').value, $('clientNumber').value, $('clientComplement').value,
                    $('clientNeighborhood').value, $('clientCity').value, $('clientState').value].some(v => String(v || '').trim());
                if (!anyClientData) return $('clientId').value || null;
                if (!digits || digits.length < 7) throw new Error('Informe um CPF ou RG válido para o cliente.');
                if (!name) throw new Error('Informe o nome completo do cliente.');
                if (!ctx.store_id) throw new Error('Não foi possível identificar a loja ativa para salvar o cliente.');
                const address = {
                    zip_code: $('clientZipCode').value.trim() || null,
                    street: $('clientStreet').value.trim() || null,
                    number: $('clientNumber').value.trim() || null,
                    complement: $('clientComplement').value.trim() || null,
                    neighborhood: $('clientNeighborhood').value.trim() || null,
                    city: $('clientCity').value.trim() || null,
                    state: $('clientState').value.trim().toUpperCase() || null
                };
                const payload = {company_id: ctx.company_id, store_id: ctx.store_id, name, document: documentValue,
                    phone: $('clientPhone').value.trim() || null, whatsapp: $('clientWhatsapp').value.trim() || null,
                    email: $('clientEmail').value.trim() || null, address};
                let clientId = $('clientId').value || null;
                let existing = clientId ? clients.find(c => c.id === clientId) : null;
                if (!existing) existing = clients.find(c => c.store_id === ctx.store_id && normalizeDocument(c.document) === digits) || null;
                if (existing) {
                    const {data, error} = await window.supabaseClient.from('clients').update(payload)
                        .eq('id', existing.id).eq('company_id', ctx.company_id).eq('store_id', ctx.store_id).select('id').maybeSingle();
                    if (error) throw error;
                    if (!data) throw new Error('Não foi possível atualizar o cliente nesta loja.');
                    clientId = data.id;
                } else {
                    const {data, error} = await window.supabaseClient.from('clients').insert(payload).select('id').single();
                    if (error) throw error;
                    clientId = data.id;
                }
                return clientId;
            }
            async function save(e) {
                e.preventDefault(); if (busy) return; if (!$('title').value.trim()) {message($('formMessage'), 'Informe o nome do projeto.'); return;} for (const id of ['width', 'length', 'height', 'area', 'thickness', 'estimated', 'final']) if ($(id).value !== '' && (!Number.isFinite(Number($(id).value)) || Number($(id).value) < 0)) {message($('formMessage'), `Verifique o campo ${id}: informe um número igual ou maior que zero.`); return;}
                busy = true; $('save').disabled = true; $('save').textContent = 'Salvando...';
                const payload = {company_id: ctx.company_id, store_id: ctx.store_id || null, client_id: $('clientId').value || null, title: $('title').value.trim(), service_name: $('service').value.trim() || null, environment_type: $('environment').value || null, status: $('status').value, width_mm: num($('width').value) == null ? null : num($('width').value) * 10, length_mm: num($('length').value) == null ? null : num($('length').value) * 10, height_mm: num($('height').value) == null ? null : num($('height').value) * 10, area_m2: num($('area').value), material_type: $('material').value || null, material_color: $('color').value.trim() || null, material_thickness_mm: num($('thickness').value) == null ? null : num($('thickness').value) * 10, estimated_value: num($('estimated').value) ?? 0, final_value: num($('final').value), deadline: $('deadline').value || null, description: $('description').value.trim() || null, notes: $('notes').value.trim() || null, sketch_data: {version: 1, strokes: JSON.parse(JSON.stringify(strokes))}};
                if (!editId) payload.created_by = user.id;
                try { payload.client_id = await saveEditedClient(); let r = editId ? await window.supabaseClient.from('woodworking_projects').update(payload).eq('id', editId).eq('company_id', ctx.company_id).select('id').maybeSingle() : await window.supabaseClient.from('woodworking_projects').insert(payload).select('id').single(); if (r.error) throw r.error; if (!r.data) throw new Error('Nenhum registro foi atualizado. Verifique as permissões do Supabase.'); $('sketchState').textContent = strokes.length ? 'Desenho salvo no projeto' : 'Projeto salvo sem desenho'; message($('formMessage'), editId ? 'Projeto atualizado!' : 'Projeto cadastrado! ', true); await loadProjects(); setTimeout(() => {$('formSection').classList.add('hidden'); editId = null; hide($('formMessage'));}, 650);} catch (err) {console.error(err); message($('formMessage'), err?.message || 'Não foi possível salvar. Verifique a conexão e as políticas RLS.');} finally {busy = false; $('save').disabled = false; $('save').textContent = editId ? 'Salvar alterações' : 'Salvar projeto';}
            }
            let selectedStatusProjectId = null;
            let selectedDeleteProjectId = null;
            function openModal(id) { const el = $(id); el.classList.remove('hidden'); el.classList.add('flex'); document.body.classList.add('overflow-hidden'); lucide.createIcons(); }
            function closeModal(id) { const el = $(id); el.classList.add('hidden'); el.classList.remove('flex'); if ($('statusModal').classList.contains('hidden') && $('deleteModal').classList.contains('hidden')) document.body.classList.remove('overflow-hidden'); }
            function openStatusModal(project) {
                selectedStatusProjectId = project.id;
                $('statusProjectName').textContent = project.title;
                $('statusSelect').value = project.status || 'QUOTE';
                $('statusModalError').classList.add('hidden');
                openModal('statusModal');
            }
            async function saveStatus() {
                if (!selectedStatusProjectId) return;
                const button = $('saveStatusButton');
                button.disabled = true; button.textContent = 'Salvando...';
                try {
                    const { error } = await window.supabaseClient.from('woodworking_projects')
                        .update({ status: $('statusSelect').value })
                        .eq('id', selectedStatusProjectId).eq('company_id', ctx.company_id);
                    if (error) throw error;
                    closeModal('statusModal');
                    selectedStatusProjectId = null;
                    await loadProjects();
                } catch (err) {
                    $('statusModalError').textContent = err?.message || 'Não foi possível atualizar o status.';
                    $('statusModalError').classList.remove('hidden');
                } finally {
                    button.disabled = false; button.textContent = 'Salvar status';
                }
            }
            function openDeleteModal(project) {
                selectedDeleteProjectId = project.id;
                $('deleteProjectName').textContent = project.title;
                $('deleteModalError').classList.add('hidden');
                openModal('deleteModal');
            }
            async function deleteProject() {
                if (!selectedDeleteProjectId) return;
                const button = $('confirmDeleteButton');
                button.disabled = true; button.textContent = 'Excluindo...';
                try {
                    const { error } = await window.supabaseClient.from('woodworking_projects')
                        .delete().eq('id', selectedDeleteProjectId).eq('company_id', ctx.company_id);
                    if (error) throw error;
                    closeModal('deleteModal');
                    selectedDeleteProjectId = null;
                    await loadProjects();
                } catch (err) {
                    $('deleteModalError').textContent = err?.message || 'Não foi possível excluir o projeto.';
                    $('deleteModalError').classList.remove('hidden');
                } finally {
                    button.disabled = false; button.textContent = 'Sim, excluir';
                }
            }
            async function init() {
                try {
                    const { data, error } = await window.supabaseClient.auth.getSession();
                    if (error) throw error;

                    if (!data.session) {
                        window.location.href = '../login/login.html';
                        return;
                    }

                    user = data.session.user;
                    const result = await window.NekkoBootstrap.init();

                    if (!result || result.status !== 'ready') {
                        if (result?.status === 'unauthenticated') {
                            window.location.href = '../login/login.html';
                        } else if (result?.status === 'no_store') {
                            window.location.href = '../onboarding/stores.html';
                        } else {
                            window.location.href = '../onboarding/company.html';
                        }
                        return;
                    }

                    // bootstrap.js retorna company_id e active_store_id diretamente,
                    // não dentro de result.context.
                    ctx = {
                        ...result,
                        store_id: result.active_store_id || null
                    };

                    if (!ctx.company_id) {
                        throw new Error('Empresa ativa não identificada.');
                    }

                    await Promise.all([loadClients(), loadProjects()]);
                } catch (e) {
                    console.error(e);
                    message($('pageMessage'), e.message || 'Erro ao carregar projetos.');
                }
            }
            $('newTop').onclick = () => openForm(); $('newEmpty').onclick = () => openForm(); $('close').onclick = closeForm; $('cancel').onclick = closeForm; $('form').addEventListener('submit', save); $('search').oninput = render; $('filter').onchange = render;
            $('calcArea').onclick = () => {const w = num($('width').value), l = num($('length').value); if (!w || !l) {message($('formMessage'), 'Informe largura e comprimento maiores que zero.'); return;} $('area').value = ((w / 100) * (l / 100)).toFixed(2); hide($('formMessage'));};
            $('clientDocument')?.addEventListener('blur', () => { if (!$('editClientMessage')) return; const digits = normalizeDocument($('clientDocument').value); const found = clients.find(c => c.store_id === ctx?.store_id && normalizeDocument(c.document) === digits); if (found) { $('clientId').value = found.id; setClientFields(found); $('editClientMessage').textContent = 'Cliente localizado nesta loja. Confira os dados antes de salvar.'; } else if (digits.length >= 7) $('editClientMessage').textContent = 'Nenhum cliente com este documento foi encontrado nesta loja; será criado ao salvar.'; });
            $('list').addEventListener('click', e => {
                const editButton = e.target.closest('[data-edit]');
                const statusButton = e.target.closest('[data-status-toggle]');
                const deleteButton = e.target.closest('[data-delete]');
                if (editButton) { const p = projects.find(x => x.id === editButton.dataset.edit); if (p) openForm(p); }
                if (statusButton) { const p = projects.find(x => x.id === statusButton.dataset.statusToggle); if (p) openStatusModal(p); }
                if (deleteButton) { const p = projects.find(x => x.id === deleteButton.dataset.delete); if (p) openDeleteModal(p); }
            });
            $('saveStatusButton').addEventListener('click', saveStatus);
            $('confirmDeleteButton').addEventListener('click', deleteProject);
            document.querySelectorAll('[data-close-modal]').forEach(button => button.addEventListener('click', () => closeModal(button.dataset.closeModal)));
            ['statusModal', 'deleteModal'].forEach(id => $(id).addEventListener('click', e => { if (e.target === $(id)) closeModal(id); }));
            document.addEventListener('keydown', e => { if (e.key === 'Escape') { closeModal('statusModal'); closeModal('deleteModal'); } });
            initCanvasFix(); init();
            function initCanvasFix() {initCanvas(); const c = $('sketchCanvas'); c.addEventListener('pointerdown', () => {tool = document.querySelector('[data-tool].active')?.dataset.tool || 'pen'; if (activeStroke) activeStroke.tool = tool;});}
        })();
