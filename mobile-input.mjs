const textFields = [
 "textarea:not(:disabled):not([readonly])",
 "input:not([type])",
 ...['text','search','url','tel','email','password','number'].map(type=>`input[type="${type}"]`)
].join(',');

export function installMobileInput({window,document}) {
 const viewport=window.visualViewport;
 if(!viewport)return ()=>{};
 const {dataset}=document.documentElement;
 let frame=null;

 function update() {
  frame=null;
  const field=document.activeElement;
  const editable=field&&!field.disabled&&!field.readOnly&&
   (field.isContentEditable||field.matches(textFields));
  const viewportBottom=viewport.offsetTop+viewport.height;
  const keyboardOpen=editable&&window.innerWidth<=760&&
   Math.abs(viewport.scale-1)<0.05&&window.innerHeight-viewportBottom>150;
  if(!keyboardOpen){
   delete dataset.keyboard;
   return;
  }
  dataset.keyboard='open';
  const bounds=field.getBoundingClientRect();
  if(bounds.top<viewport.offsetTop||bounds.bottom>viewportBottom){
   field.scrollIntoView({block:'nearest',inline:'nearest'});
  }
 }

 function scheduleUpdate() {
  if(frame===null)frame=window.requestAnimationFrame(update);
 }

 const listeners=[
  [viewport,'resize'],[viewport,'scroll'],[window,'resize'],
  [document,'focusin'],[document,'focusout']
 ];
 for(const [target,event] of listeners)target.addEventListener(event,scheduleUpdate);
 scheduleUpdate();
 return ()=>{
  for(const [target,event] of listeners)target.removeEventListener(event,scheduleUpdate);
  if(frame!==null)window.cancelAnimationFrame(frame);
  delete dataset.keyboard;
 };
}
