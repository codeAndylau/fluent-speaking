const han = /[\u3400-\u9fff]/;
const attributes = ['aria-label','aria-description','aria-valuetext','title','placeholder','alt'];
const excluded = 'script,style,textarea,code,pre,svg,[contenteditable]:not([contenteditable="false"]),[translate="no"]';
const punctuation = {'，':', ', '。':'. ', '、':', ', '；':'; ', '：':': ', '？':'? ', '！':'! ', '／':' / ', '（':' (', '）':') ', '“':'“', '”':'”'};
const counters = {'轮':'Round','周':'Week','天':'Day','章':'Chapter','课':'Lesson','组':'Group','句':'Sentence','步':'Step','题':'Question'};

export function createTranslator(messages) {
 messages=Object.fromEntries(Object.entries(messages).map(([key,value])=>[key.trim(),value]));
 const lookup = key => Object.hasOwn(messages,key) && typeof messages[key]==='string' ? messages[key] : undefined;
 // Preserve whole instructional phrases even when renderers add a number or title.
 const prefixes=new Map();
 for(const key of Object.keys(messages).filter(k=>han.test(k)).sort((a,b)=>b.length-a.length)){
  if(!prefixes.has(key[0]))prefixes.set(key[0],[]);
  prefixes.get(key[0]).push(key);
 }
 return function translate(input) {
  if (!han.test(input)) return input;
  const value=input.trim(),direct=lookup(value);
  if(direct!==undefined)return input.replace(value,()=>direct);
  const source=value.replace(/已选第\s*(\d+)\s*句/g,'Selected sentence $1')
   .replace(/回看第\s*(\d+)\s*周的复习任务/g,'Review the task from Week $1')
   .replace(/第\s*(\d+(?:[–-]\d+)?)\s*(轮|周|天|章|课|组|句|步|题)/g,(_,n,k)=>counters[k]+' '+n+' ');
  let result='';
  for(let i=0;i<source.length;){
   const key=prefixes.get(source[i])?.find(key=>source.startsWith(key,i));
   if(key){
    const translated=lookup(key);
    if(result && /[a-z0-9]$/i.test(result)&&/^[a-z0-9]/i.test(translated))result+=' ';
    result+=translated;i+=key.length;
    if(/[a-z0-9]$/i.test(translated)&&/^[a-z0-9]/i.test(source.slice(i)))result+=' ';
   }else result+=source[i++];
  }
  if(han.test(result))return input;
  result=result.replace(/[，。、；：？！／（）“”]/g,p=>punctuation[p])
   .replace(/\s+/g,' ').replace(/\s+([,.;:?!%)])/g,'$1').replace(/\(\s+/g,'(').trim();
  return input.replace(value,()=>result);
 };
}

export async function initLanguage({document,storage,notify=()=>{},messages={}}) {
 let language='zh';
 try {if(storage.getItem('fluent-language')==='en')language='en'}catch{}
 document.documentElement.lang=language==='en'?'en':'zh-CN';
 if(language==='zh')return {language,refresh(){},disconnect(){},addMessages(){},getMissing:()=>[]};
 const missing=new Set();
 const dictionaries=await Promise.all(['i18n-ui.json','i18n-content.json'].map(async file=>{
  try {
   const response=await fetch(new URL(file+'?v=20261124-6',import.meta.url));
   if(!response.ok)throw new Error(String(response.status));
   return await response.json();
  }catch{throw new Error('English content could not load: '+file)}
 }));
 const catalog=Object.assign(Object.create(null),...dictionaries,messages);
 let translate=createTranslator(catalog);
 function resolve(value){
  const translated=translate(value);
  if(translated===value && han.test(value))missing.add(value);
  else missing.delete(value);
  return translated;
 }
 function visit(node){
  if(node.nodeType===3){
   if(!node.parentElement||node.parentElement.closest(excluded))return;
   const before=node.data;
   const after=resolve(before);
   if(after!==before)node.data=after;
   return;
  }
  if(node.nodeType!==1||node.closest(excluded))return;
  for(const key of attributes){
   if(!node.hasAttribute(key))continue;
   const before=node.getAttribute(key);
   const after=resolve(before);
   if(before!==after)node.setAttribute(key,after);
  }
  if(/^zh(?:-|$)/i.test(node.getAttribute('lang')||''))node.setAttribute('lang','en');
  if(node.tagName==='OPTION'&&!node.hasAttribute('value')&&han.test(node.textContent))node.value=node.value;
  for(const child of node.childNodes)visit(child);
 }
 const refresh=()=>visit(document.documentElement);
 const observer=new document.defaultView.MutationObserver(records=>{
  for(const record of records){
   if(record.type==='childList'){for(const node of record.addedNodes)visit(node)}
   else visit(record.target);
  }
 });
 refresh();
 observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:attributes});
 return {language,refresh,disconnect:()=>observer.disconnect(),addMessages(extra){Object.assign(catalog,extra);translate=createTranslator(catalog);refresh()},getMissing:()=>Array.from(missing)};
}
