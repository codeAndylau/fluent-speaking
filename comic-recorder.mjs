export function mountComicRecorder(root,{english=false,beforeRecord=()=>{},media=globalThis.navigator?.mediaDevices,Recorder=globalThis.MediaRecorder,urls=globalThis.URL,page=globalThis.document}={}) {
 const t=(zh,en)=>english?en:zh;
 root.innerHTML=`<details class="comic-recording"><summary>${t('录下我的复述（可选）','Record my retelling (optional)')}</summary><p>${t('录音只保留在当前页，不会上传。离开故事前请下载保存。','Recording stays on this page and is never uploaded. Download it before leaving the story.')}</p><button type="button" class="secondary" data-record>${t('开始录音','Start recording')}</button><p data-record-status role="status"></p><audio controls hidden aria-label="${t('我的复述录音','My retelling recording')}"></audio><a class="quiet" data-record-download hidden>${t('下载录音','Download recording')}</a></details>`;
 const button=root.querySelector('[data-record]'),status=root.querySelector('[data-record-status]'),replay=root.querySelector('audio'),download=root.querySelector('[data-record-download]');
 let phase='idle',turn=0,recorder=null,stream=null,clip=null,timer=null,disposed=false;
 function message(zh,en){status.textContent=t(zh,en);}
 function label(){button.disabled=phase==='finishing';button.textContent=phase==='requesting'?t('取消麦克风请求','Cancel microphone request'):phase==='recording'?t('停止录音','Stop recording'):phase==='finishing'?t('正在保存…','Saving…'):t('开始录音','Start recording');}
 function release(){clearTimeout(timer);timer=null;stream?.getTracks().forEach(track=>track.stop());stream=null;}
 function stop(){replay.pause();if(phase==='requesting'){turn++;phase='idle';message('已取消麦克风请求。','Microphone request cancelled.');label();}else if(recorder?.state==='recording'){phase='finishing';label();recorder.stop();release();}}
 function clearClip(){replay.pause();replay.removeAttribute('src');replay.load();replay.hidden=true;download.hidden=true;download.removeAttribute('href');if(clip)urls.revokeObjectURL(clip);clip=null;}
 async function start(){
  if(phase!=='idle'){stop();return;}
  if(!media?.getUserMedia||!Recorder){message('当前浏览器无法录音，可以直接开口复述。','Recording is unavailable in this browser. You can still retell aloud.');return;}
  beforeRecord();replay.pause();const token=++turn;phase='requesting';label();message('请允许使用麦克风，也可以取消。','Allow microphone access, or cancel.');
  try{
   const acquired=await media.getUserMedia({audio:true});
   if(disposed||token!==turn){acquired.getTracks().forEach(track=>track.stop());return;}
   stream=acquired;const mime=['audio/mp4','audio/webm','audio/ogg'].find(type=>Recorder.isTypeSupported?.(type));
   const current=new Recorder(stream,mime?{mimeType:mime}:undefined),parts=[];recorder=current;
   current.ondataavailable=e=>{if(e.data?.size)parts.push(e.data);};
   current.onstop=()=>{
    if(disposed||token!==turn)return;release();recorder=null;phase='idle';label();
    if(!parts.length){message('没有录到声音，请再试一次。','No audio was recorded. Please try again.');return;}
    clearClip();const blob=new Blob(parts,{type:current.mimeType||parts[0].type||mime||'audio/webm'});clip=urls.createObjectURL(blob);replay.src=clip;replay.hidden=false;download.href=clip;download.download='fluent-retelling.'+(blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm');download.hidden=false;
    message('回听一次，挑一个地方再说清楚。离开前可下载。','Listen back and improve one part. Download before leaving.');
   };
   current.onerror=()=>{if(token===turn){turn++;release();try{if(current.state==='recording')current.stop();}catch{}recorder=null;phase='idle';label();message('录音失败，请检查麦克风后重试。','Recording failed. Check the microphone and try again.');}};
   current.start();phase='recording';label();message('正在录音，最长 3 分钟。','Recording, up to 3 minutes.');timer=setTimeout(stop,180000);
  }catch(error){if(token!==turn||disposed)return;release();recorder=null;phase='idle';label();message(error.name==='NotAllowedError'?'麦克风权限未开启，请在浏览器设置中允许后重试。':'未能使用麦克风，可以直接开口练习。',error.name==='NotAllowedError'?'Microphone access is blocked. Allow it in browser settings and retry.':'Could not use the microphone. You can still practice aloud.');}
 }
 button.onclick=start;replay.onplay=()=>{if(phase!=='idle'){replay.pause();return;}beforeRecord();};
 const visibility=()=>{if(page.hidden)stop();};page?.addEventListener?.('visibilitychange',visibility);
 return {stop,dispose(){disposed=true;turn++;clearTimeout(timer);if(recorder){recorder.onstop=null;recorder.onerror=null;if(recorder.state==='recording')recorder.stop();}release();clearClip();button.onclick=null;replay.onplay=null;page?.removeEventListener?.('visibilitychange',visibility);}};
}
