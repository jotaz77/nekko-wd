const form=document.querySelector('#projectForm');
const feedback=document.querySelector('#feedback');
const width=form.elements.width,length=form.elements.length,area=document.querySelector('#area');
function calc(){const a=Number(width.value||0)*Number(length.value||0);area.value=a?a.toFixed(2)+' m²':''}
width.addEventListener('input',calc);length.addEventListener('input',calc);
form.addEventListener('submit',async e=>{e.preventDefault();feedback.textContent='Salvando...';
try{const context=Storage.getContext();if(!context?.company?.id)throw new Error('Contexto da empresa não encontrado.');
const data=Object.fromEntries(new FormData(form).entries());
data.company_id=context.company.id;data.store_id=context.store?.id||null;data.area_m2=Number(width.value||0)*Number(length.value||0)||null;data.estimated_value=data.estimated_value?Number(data.estimated_value):null;
const {error}=await supabaseClient.from('woodworking_projects').insert(data);if(error)throw error;
feedback.textContent='Projeto salvo com sucesso!';form.reset();area.value='';setTimeout(()=>location.href='./index.html',700)}catch(err){console.error(err);feedback.textContent=err.message||'Não foi possível salvar o projeto.'}});
