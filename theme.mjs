export const resolveTheme=(choice,systemDark)=>choice==='dark'||(choice!=='light'&&systemDark)?'dark':'light';
export function createThemeController({root,select=null,media,storage,notify=()=>{}}){
 let choice='system';try{const saved=storage.getItem('fluent-theme');if(['light','dark','system'].includes(saved))choice=saved}catch{}
 const apply=()=>{root.dataset.theme=resolveTheme(choice,media.matches);root.style.colorScheme=root.dataset.theme;if(select)select.value=choice};
 const choose=value=>{choice=['light','dark','system'].includes(value)?value:'system';apply();try{storage.setItem('fluent-theme',choice)}catch{notify('主题已切换，但浏览器无法保存偏好。')}};
 const bind=control=>{select=control;select.value=choice;select.addEventListener('change',()=>choose(select.value))};
 if(select)bind(select);apply();media.addEventListener('change',apply);
 return {bind,choose,getChoice:()=>choice};
}
export function setSkin(root,storage,skin){
 const value=['sage','ocean','sand'].includes(skin)?skin:'sage';root.dataset.skin=value;
 try{storage.setItem('fluent-skin',value);return true}catch{return false}
}
