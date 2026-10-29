const $=selector=>document.querySelector(selector);
const API_BASE=(window.SEYCHAS_API_BASE||'https://seychas-world-news.pages.dev').replace(/\/$/,'');
const loginView=$('#login-view');
const panelView=$('#panel-view');
const loginForm=$('#login-form');
const storyForm=$('#story-form');
const fields=['region','title','description','source','time','url','image','alt','body'];
let credentials={};
try{credentials=JSON.parse(sessionStorage.getItem('seychas-admin-token')||'{}')}catch{}
let token=credentials.password||'';
let loginEmail=credentials.email||'';
let stories=[];
const escapeHTML=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

async function api(method='GET',body,id){
  const url=API_BASE+'/api/admin/news'+(id?'?id='+encodeURIComponent(id):'');
  const response=await fetch(url,{method,headers:{'authorization':'Bearer '+token,'x-admin-email':loginEmail,'content-type':'application/json'},...(body?{body:JSON.stringify(body)}:{})});
  const data=await response.json().catch(()=>({error:'Сервер вернул некорректный ответ.'}));
  if(!response.ok)throw new Error(data.error||'Не удалось выполнить запрос.');
  return data;
}

function showMessage(target,text){$(target).textContent=text||''}
function setLoggedIn(value){loginView.hidden=value;panelView.hidden=!value}
function resetForm(){storyForm.reset();$('#story-id').value='';$('#time').value='Только что';$('#form-heading').textContent='Добавить новость';$('#save-button').innerHTML='Опубликовать <span>→</span>';showMessage('#form-message','')}
function renderStories(){
  $('#story-count').textContent=`Новости · ${stories.length}`;
  $('#stories-list').innerHTML=stories.length?stories.map(item=>`<article class="story-row"><div class="story-info"><div class="story-meta">${escapeHTML(item.region)} · ${escapeHTML(item.source)} · ${escapeHTML(item.time)}</div><h3>${escapeHTML(item.title)}</h3><p>${escapeHTML(item.description)}</p></div><div class="story-actions"><button class="small-button" type="button" data-edit="${escapeHTML(item.id)}">Изменить</button><button class="small-button" type="button" data-delete="${escapeHTML(item.id)}">Удалить</button></div></article>`).join(''):'<p class="empty-list">В базе пока нет новостей. Добавьте первую в форме слева.</p>';
}
async function loadStories(){
  showMessage('#form-message','Загружаю новости…');
  const result=await api();
  stories=result.stories||[];
  renderStories();
  showMessage('#form-message','');
}
function fillForm(story){
  $('#story-id').value=story.id;
  fields.forEach(key=>{const field=$(`[name="${key}"]`);if(field)field.value=story[key]||''});
  $('#form-heading').textContent='Изменить новость';
  $('#save-button').innerHTML='Сохранить изменения <span>→</span>';
  showMessage('#form-message','');
  storyForm.scrollIntoView({behavior:'smooth',block:'start'});
}

async function signIn(email,password){
  loginEmail=email;
  token=password;
  try{
    const result=await api();
    stories=result.stories||[];
    sessionStorage.setItem('seychas-admin-token',JSON.stringify({email:loginEmail,password:token}));
    showMessage('#login-message','');
    renderStories();
    setLoggedIn(true);
  }catch(error){token='';loginEmail='';showMessage('#login-message',error.message)}
}

loginForm.addEventListener('submit',event=>{event.preventDefault();signIn($('#admin-email').value.trim(),$('#admin-password').value)});
storyForm.addEventListener('submit',async event=>{
  event.preventDefault();
  const id=$('#story-id').value;
  const data=Object.fromEntries(fields.map(key=>[key,$(`[name="${key}"]`).value.trim()]));
  try{
    await api(id?'PUT':'POST',{...data,...(id?{id}:{})});
    resetForm();
    await loadStories();
    showMessage('#form-message',id?'Изменения сохранены.':'Новость опубликована.');
  }catch(error){showMessage('#form-message',error.message)}
});

$('#stories-list').addEventListener('click',async event=>{
  const edit=event.target.closest('[data-edit]');
  if(edit){const story=stories.find(item=>String(item.id)===edit.dataset.edit);if(story)fillForm(story);return}
  const remove=event.target.closest('[data-delete]');
  if(!remove)return;
  const story=stories.find(item=>String(item.id)===remove.dataset.delete);
  if(!story||!window.confirm(`Удалить новость «${story.title}»?`))return;
  try{await api('DELETE',null,story.id);await loadStories()}catch(error){showMessage('#form-message',error.message)}
});

$('#reset-button').addEventListener('click',resetForm);
$('#refresh-button').addEventListener('click',()=>loadStories().catch(error=>showMessage('#form-message',error.message)));
$('#logout-button').addEventListener('click',()=>{token='';loginEmail='';sessionStorage.removeItem('seychas-admin-token');setLoggedIn(false);$('#admin-email').value='';$('#admin-password').value=''});

if(token&&loginEmail){signIn(loginEmail,token)}
