const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function validComic(data,id){
 const positive=n=>Number.isInteger(n)&&n>0;
 return data?.chapterId===id&&data.image===`chapter-${String(id).padStart(2,'0')}.png`&&typeof data.title==='string'&&positive(data.imageWidth)&&positive(data.imageHeight)&&Array.isArray(data.panels)&&data.panels.length===8&&data.panels.every((p,i)=>{
  const c=p.crop;
  return p.number===i+1&&['sceneZh','sceneEn','promptZh','promptEn','sampleZh','sampleEn'].every(k=>typeof p[k]==='string')&&Array.isArray(p.keywords)&&p.keywords.every(k=>typeof k==='string')&&c&&Number.isInteger(c.x)&&c.x>=0&&Number.isInteger(c.y)&&c.y>=0&&positive(c.width)&&positive(c.height)&&c.x+c.width<=data.imageWidth&&c.y+c.height<=data.imageHeight;
 });
}
export function comicMarkup(data,{language='zh',panel=0,zoom=false}={}){
 const en=language==='en',t=(zh,enText)=>en?enText:zh,p=data.panels[panel],url=`stories/comics/${data.image}`;
 // Each panel uses the measured artwork bounds, including unequal row heights.
 const crop=p.crop;
 return `<div class="comic-intro"><h2>${t('看图，讲出这个故事','Look and retell the story')}</h2><p>${t('先看画面，用自己的英语讲。卡住时再展开提示。','Use your own English. Open hints only when you need them.')}</p></div><div class="story-controls"><button type="button" class="secondary" data-comic="whole" aria-pressed="${!zoom}">${t('整页漫画','Whole comic')}</button><button type="button" class="secondary" data-comic="zoom" aria-pressed="${zoom}">${t('逐格放大','One panel')}</button><a class="quiet" href="${url}" target="_blank" rel="noopener">${t('打开原图','Open image')} ↗</a></div>${zoom?`<div class="comic-crop" style="aspect-ratio:${crop.width}/${crop.height}"><img class="comic-panel-image" src="${url}" alt="${esc(en?p.sceneEn:p.sceneZh)}" style="width:${data.imageWidth/crop.width*100}%;left:${-crop.x/crop.width*100}%;top:${-crop.y/crop.height*100}%"></div>`:`<img class="comic-whole" src="${url}" alt="${esc(data.title)} · ${t('八格故事漫画','Eight-panel story comic')}" loading="lazy">`}<div data-comic-image-error role="alert" hidden><p>${t('漫画图片未能加载，请重试或打开原图。','The comic image could not load. Retry or open the image.')}</p><button class="secondary" type="button" data-comic="retry">${t('重试图片','Retry image')}</button> <a class="quiet" href="${url}" target="_blank" rel="noopener">${t('打开原图','Open image')} ↗</a></div><div class="comic-pager"><button class="secondary" type="button" data-comic="prev" ${panel===0?'disabled':''}>${t('上一格','Previous')}</button><strong>${t('第 ','Panel ')}${panel+1} / 8${t(' 格','')}</strong><button class="secondary" type="button" data-comic="next" ${panel===7?'disabled':''}>${t('下一格','Next')}</button></div><div class="comic-dots" aria-label="${t('选择漫画格','Choose a panel')}">${data.panels.map((_,i)=>`<button class="secondary" type="button" data-comic="panel" data-panel="${i}" aria-pressed="${i===panel}">${i+1}</button>`).join('')}</div><details class="comic-hint"><summary>${t('需要一点提示','Need a hint?')}</summary><p>${esc(en?p.promptEn:p.promptZh)}</p><p lang="en">${p.keywords.map(esc).join(' · ')}</p></details><details class="comic-hint"><summary>${t('说完后看参考表达','Check an example after speaking')}</summary><p lang="en">${esc(p.sampleEn)}</p>${en?'':`<p>${esc(p.sampleZh)}</p>`}</details>`;
}
export function mountComic(root,data,language){
 let panel=0,zoom=false,retry=0;
 const draw=()=>{
  root.innerHTML=comicMarkup(data,{language,panel,zoom});
  const img=root.querySelector('img'),error=root.querySelector('[data-comic-image-error]');
  error.hidden=true;
  img.onerror=()=>{error.hidden=false;};
  img.onload=()=>{error.hidden=true;};
  if(retry)img.src=`stories/comics/${data.image}?retry=${retry}`;
  if(img.complete&&img.naturalWidth===0)error.hidden=false;
 };
 root.onclick=event=>{
  const b=event.target.closest?.('[data-comic]');if(!b)return;
  const action=b.dataset.comic;
  if(action==='retry'){retry=Date.now();draw();return;}
  if(action==='whole')zoom=false;
  if(action==='zoom')zoom=true;
  if(action==='next'){panel=Math.min(7,panel+1);zoom=true;}
  if(action==='prev'){panel=Math.max(0,panel-1);zoom=true;}
  if(action==='panel'){panel=Number(b.dataset.panel);zoom=true;}
  draw();
 };
 draw();return ()=>{root.onclick=null;const img=root.querySelector('img');if(img){img.onload=null;img.onerror=null;}};
}
