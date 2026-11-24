const storageKey='fluent-vocabulary-senses-v2'
const sessionKey='fluent-vocabulary-session-v1'
const localDay=time=>new Date(time).toDateString()
export function recordRecall(previous={},matched,hints,now=Date.now(),exposed=false){
  const independent=matched && !hints
  const later=!exposed && previous.lastRecall!=null && localDay(previous.lastRecall)!==localDay(now)
  const level=independent?Math.min(4,(previous.level||0)+(later||!previous.level?1:0)):0
  const due=new Date(now)
  due.setDate(due.getDate()+[1,1,3,7,14][level])
  return {...previous,level,due:due.getTime(),lastRecall:now,hints,matched,
    independent:(previous.independent||0)+Number(independent),
    delayed:(previous.delayed||0)+Number(later && independent)}
}
export function reviewQueue(items,records,now=Date.now()){
  return items.filter(x=>records[x.key]?.due<=now).sort((a,b)=>records[a.key].due-records[b.key].due).slice(0,4)
}
const normalize=s=>s.toLowerCase().replace(/[’‘]/g,"'").replace(/[^a-z0-9' ]/g,' ').trim().replace(/ +/g,' ')
export function sceneMemory(root,scenes,esc,dictionary,notify,wordSet=new Set()){
  let records={}
  try{
    const data=JSON.parse(localStorage.getItem(storageKey))
    if(data && typeof data==='object' && !Array.isArray(data)){
      records=Object.fromEntries(Object.entries(data).filter(([,r])=>r && typeof r==='object' &&
        !Array.isArray(r) && (r.due===undefined||Number.isFinite(r.due)) &&
        (r.level===undefined||Number.isInteger(r.level)&&r.level>=0&&r.level<=4)))
    }
  }catch{}
  const all=scenes.flatMap(scene=>scene.items.map((x,i)=>({...x,key:x.key||scene.id+'/'+i,scene})))
  const byKey=new Map(all.map(item=>[item.key,item]))
  const btn=(action,label)=>'<button type="button" data-memory="'+action+'">'+esc(label)+'</button>'
  let tasks=[],position=0,hints=0,feedback=null,chosen=0,session=false,focusWord=null
  let audio=null, heard=false, recording=null, microphone=null, clip=null, attempt=0, audioTurn=0
  function releaseMicrophone(){
    attempt++
    if(recording?.state==='recording'){recording.onstop=null;recording.stop()}
    microphone?.getTracks().forEach(track=>track.stop())
    recording=null;microphone=null
    if(clip){URL.revokeObjectURL(clip);clip=null}
  }
  async function record(){
    if(recording?.state==='recording'){recording.stop();return}
    if(!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder)return notify('当前浏览器无法录音，可以直接开口练习。')
    releaseMicrophone()
    const current=attempt
    try{
      const stream=await navigator.mediaDevices.getUserMedia({audio:true})
      if(attempt!==current||!root.isConnected){stream.getTracks().forEach(t=>t.stop());return}
      microphone=stream
      const parts=[]
      recording=new MediaRecorder(stream)
      recording.ondataavailable=e=>{if(e.data.size)parts.push(e.data)}
      recording.onstop=()=>{
        stream.getTracks().forEach(t=>t.stop())
        if(attempt!==current)return
        clip=URL.createObjectURL(new Blob(parts,{type:recording.mimeType}))
        const output=root.querySelector('.memory-playback')
        output.src=clip;output.hidden=false
        root.querySelector('[data-memory=record]').textContent='重新录音'
      }
      recording.start()
      root.querySelector('[data-memory=record]').textContent='停止并回听'
    }catch{if(attempt===current){releaseMicrophone();notify('未能使用麦克风，可以直接开口练习。')}}
  }
  function audioState(message,busy=false){
    const label=root.querySelector('.memory-audio-status')
    if(label)label.textContent=message
    const control=root.querySelector('[data-memory=stop-audio]')
    if(control)control.hidden=!busy
  }
  function clearSnapshot(){try{sessionStorage.removeItem(sessionKey)}catch{}}
  function snapshot(){
    if(!session||position>=tasks.length)return
    const input=feedback===null&&['recall','review','retry'].includes(tasks[position].type)?root.querySelector('.memory-answer')?.value||'':''
    try{sessionStorage.setItem(sessionKey,JSON.stringify({version:1,at:Date.now(),group:scenes[chosen].id,
      tasks:tasks.map(t=>({key:t.item.key,type:t.type})),position,hints,feedback,input:input.slice(0,2000),exposed:[...exposed]}))}catch{}
  }
  function pending(){
    try{
      const d=JSON.parse(sessionStorage.getItem(sessionKey))
      if(!d||d.version!==1||!Number.isFinite(d.at)||Math.abs(Date.now()-d.at)>86400000||!scenes.some(s=>s.id===d.group)||
        !Array.isArray(d.tasks)||!d.tasks.length||d.tasks.length>60||!d.tasks.every(t=>t&&byKey.has(t.key)&&['learn','sound','recall','review','retry','transfer'].includes(t.type))||
        !Number.isInteger(d.position)||d.position<0||d.position>=d.tasks.length||!Number.isInteger(d.hints)||d.hints<0||d.hints>3||
        !(d.feedback===null||typeof d.feedback==='string'&&d.feedback.length<200)||typeof d.input!=='string'||d.input.length>2000||
        !Array.isArray(d.exposed)||d.exposed.length>60||!d.exposed.every(k=>byKey.has(k)))return null
      return d
    }catch{return null}
  }
  function stop(){
    snapshot();releaseMicrophone();audioTurn++
    if(audio){for(const event of ['onended','onerror','ontimeupdate','onloadedmetadata','onplaying','onwaiting','onstalled'])audio[event]=null;audio.pause();audio=null}
    window.speechSynthesis?.cancel()
  }
  function save(item,updates){
    const next={...records,[item.key]:{...records[item.key],...updates}}
    try{localStorage.setItem(storageKey,JSON.stringify(next));records=next;return true}catch{return false}
  }
  function home(index,word=null){
    focusWord=word;
    session=false
    const due=reviewQueue(all,records)
    const next=scenes.findIndex(s=>all.some(x=>x.scene===s&&!records[x.key]?.lastRecall))
    const saved=pending()
    chosen=Number.isInteger(index)?index:saved?scenes.findIndex(s=>s.id===saved.group):next<0?0:next
    root.innerHTML='<h1>今天能说的一件小事</h1><p>约 10–15 分钟，先回想，再听、再说。每轮最多复习 4 项。已认识的词可先做提取检查，每轮最多 10 项。</p><label>学习组与生活场景 <select class="memory-scene">'+scenes.map((s,i)=>'<option value="'+i+'" '+(i===chosen?'selected':'')+'>'+esc(s.title)+'</option>').join('')+'</select></label>'+(saved?'<div class="memory-resume"><p>本轮进度已暂存，可在切换语言后继续。</p>'+btn('resume','继续未完成的练习')+'</div>':'')+'<p class="scene-context">'+(focusWord?esc(focusWord)+' · ':'')+esc(scenes[chosen].context)+'</p>'+btn('start','开始场景练习')+btn('placement','先测已认识的词')+(due.length?btn('review','只复习到期内容'):'')+btn('dictionary','找词与短语')+'<p>'+scenes.length+' 个练习组 · '+all.length+' 个词义与搭配，涉及词库中 '+new Set(all.map(x=>x.word).filter(w=>wordSet.has(w))).size+' 个不同词 · 7,000 个词典条目均可自行练习</p><p>有跨日无提示提取记录 '+Object.values(records).filter(r=>r.delayed>0).length+' 项 · 最近一次听辨正确 '+Object.values(records).filter(r=>r.listening===true).length+' 项 · 自报已开口 '+Object.values(records).filter(r=>r.spoken).length+' 项</p><p role="status"></p>'
    root.querySelector('select').onchange=e=>{chosen=Number(e.target.value);focusWord=null;root.querySelector('.scene-context').textContent=scenes[chosen].context}
  }
  const exposed=new Set()
  function begin(only,placement=false){
    exposed.clear()
    const due=focusWord&&!only?[]:reviewQueue(all,records)
    const selected=only?[]:all.filter(x=>x.scene===scenes[chosen]&&(!focusWord||x.word===focusWord)&&!due.some(d=>d.key===x.key))
    const known=focusWord?selected.filter(x=>records[x.key]?.lastRecall!=null).slice(0,4-due.length):[]
    const reviews=[...due,...known]
    const fresh=selected.filter(x=>records[x.key]?.lastRecall==null).slice(0,reviews.length>2?2:4)
    tasks=reviews.map(item=>({item,type:'review'}))
    for(const type of ['learn','sound','recall','transfer'])for(const item of fresh)tasks.push({item,type})
    if(placement)tasks=all.filter(x=>x.scene===scenes[chosen]&&(!focusWord||x.word===focusWord)&&!records[x.key]?.lastRecall).slice(0,10).map(item=>({item,type:'recall'}))
    stop();heard=false;session=true;position=0;hints=0;feedback=null;draw()
  }
  function draw(){
    if(position>=tasks.length){clearSnapshot();session=false;const related=scenes[chosen].related
      root.innerHTML='<h1>本轮完成</h1><p>下次回来可以继续练习到期的词义和搭配。</p>'+(related?'<p><a href="'+esc(related.href)+'">延伸课程 · '+esc(related.title)+'</a></p>':'')+btn('home','回到场景');return}
    const {item:x,type}=tasks[position]
    if(type==='learn'||type==='sound'||feedback!==null)exposed.add(x.key)
    const playback='<div class="memory-audio">'+btn('sentence',type==='learn'?'听整句':'播放情境句')+btn('slow','慢速听句')+'<button type="button" data-memory="stop-audio" hidden>停止播放</button><p class="memory-audio-status" role="status" aria-live="polite">点击播放，听完后再继续。</p></div>'
    let html='<h1>'+esc(x.scene.title)+'</h1>'+(x.topic?'<p class="eyebrow">'+esc(x.topic)+'</p>':'')+'<p>第 '+(position+1)+' / '+tasks.length+' 步</p>'
    if(type==='learn')html+='<h2>'+esc(x.phrase)+'</h2><p>'+esc(x.meaning)+'</p><blockquote>'+esc(x.sentence)+'</blockquote><details><summary>查看整句中文</summary><p>'+esc(x.sentenceZh||x.scene.context)+'</p></details>'+playback+'<div class="memory-secondary">'+btn('word','听词')+btn('phrase','听搭配')+'</div><div class="memory-actions">'+btn('next','继续')+btn('familiar','认识这项，稍后直接提取')+'</div>'
    else if(type==='sound'){
      const peers=all.filter(y=>y.scene===x.scene && y.meaning!==x.meaning)
      const other=peers[all.indexOf(x)%peers.length]||all.find(y=>y.meaning!==x.meaning)
      const choices=[x.meaning,other.meaning]
      if(all.indexOf(x)%2)choices.reverse()
      html+='<h2>听这句话，判断说话人的意思</h2>'+playback+'<div class="memory-choices">'+choices.map(c=>btn(c===x.meaning?'right':'wrong',c)).join('')+'</div>'+btn('skip','无法播放，跳过听辨')
    }else if(type==='transfer')html+='<h2>换个场合，自己说一句</h2><p>'+esc(x.transfer)+'</p>'+btn('record','录音回听（可选）')+'<audio class="memory-playback" controls hidden></audio>'+btn('spoken','我已开口（自评）')+btn('skip','跳过')
    else html+='<h2>你会怎么说？</h2><p>'+esc(type==='review'?x.transfer:x.cue)+'</p><label>'+esc(x.answerLabel||'写下目标搭配')+' <input class="memory-answer" autocomplete="off" autocapitalize="none" spellcheck="false" enterkeyhint="done"></label>'+btn('check','核对目标表达')+btn('hint','给我一点提示')+btn('reveal','看参考表达')+'<p class="memory-hint"></p>'
    if(feedback!==null)html='<h1>练习反馈</h1><p>'+esc(feedback)+'</p><blockquote>'+esc(x.phrase)+'</blockquote>'+btn('next','继续')
    root.innerHTML='<article class="memory-card">'+html+'</article><p role="status" aria-live="polite"></p>'+btn('home','结束本轮')
    if(feedback===null&&['recall','review','retry'].includes(type)){
      const input=root.querySelector('.memory-answer')
      input.value='';input.oninput=snapshot
      root.querySelector('.memory-hint').textContent=hints===0?'':hints===1?x.meaning:x.phrase.split(' ').map(w=>w[0]+'…').join(' ')
      input.onkeydown=e=>{if(e.key==='Enter'&&!e.isComposing){e.preventDefault();click('check')}}
    }
    snapshot()
  }
  function click(action){
    if(action==='home'){stop();session=false;clearSnapshot();home();return}
    if(action==='resume'){
      const d=pending();if(!d){home();return}
      stop();chosen=scenes.findIndex(s=>s.id===d.group);tasks=d.tasks.map(t=>({item:byKey.get(t.key),type:t.type}));position=d.position;hints=d.hints;feedback=d.feedback
      exposed.clear();d.exposed.forEach(k=>exposed.add(k));session=true;heard=false;draw()
      if(feedback===null&&['recall','review','retry'].includes(tasks[position].type))root.querySelector('.memory-answer').value=d.input
      snapshot();return
    }
    if(action==='stop-audio'){stop();audioState('已停止。可以重新播放。');return}
    if(action==='dictionary'){stop();dictionary();return}
    if(action==='start'||action==='review'||action==='placement'){begin(action==='review',action==='placement');return}
    if(!session||!tasks[position])return
    const {item:x,type}=tasks[position]
    if(['word','phrase','sentence','slow'].includes(action)){
      const speed=action==='slow'?.8:1;if(action==='slow')action='sentence'
      stop()
      if(action==='sentence'){
        const player=new Audio(new URL(x.audio?.file?'./vocabulary/'+x.audio.file:'./vocabulary/audio/'+x.key.replace('/','-')+'.mp3',import.meta.url))
        audio=player;player.playbackRate=speed;player.preload='auto'
        const turn=audioTurn,valid=()=>audio===player&&audioTurn===turn&&root.isConnected!==false
        const failed=()=>{if(valid()){player.pause();audio=null;audioState('音频未能播放，请重试，或跳过听辨。');notify('整句音频未播放，可以重试或跳过听辨。')}}
        const finish=()=>{if(valid()){player.pause();heard=true;audioState('播放完成，可以重听或继续。')}}
        const seek=()=>{if(valid()&&x.audio){try{player.currentTime=x.audio.start}catch{failed();return false}}return true}
        audioState('正在加载音频…',true)
        player.onloadedmetadata=seek
        player.onplaying=()=>{if(valid())audioState(speed<1?'正在慢速播放…':'正在播放…',true)}
        player.onwaiting=player.onstalled=()=>{if(valid())audioState('音频缓冲中…',true)}
        player.onended=()=>{if(!x.audio||player.currentTime>=x.audio.end-.1)finish();else failed()}
        if(x.audio){if(player.readyState!==0&&!seek())return;player.ontimeupdate=()=>{if(valid()&&player.currentTime>=x.audio.end)finish()}}
        player.onerror=failed
        player.play().catch(failed)
        return
      }
      if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return notify('系统语音不可用，可以阅读文字或跳过听辨。')
      const u=new SpeechSynthesisUtterance(x[action]);u.lang='en-US';const step=position,turn=audioTurn
      const valid=()=>audioTurn===turn&&root.isConnected!==false&&session&&position===step
      audioState('正在加载音频…',true)
      u.onstart=()=>{if(valid())audioState('正在播放…',true)}
      u.onend=()=>{if(valid())audioState('播放完成，可以重听或继续。')}
      u.onerror=()=>{if(valid()){audioState('音频未能播放，请重试，或跳过听辨。');notify('语音未播放，可以重试或跳过。')}}
      window.speechSynthesis.cancel();window.speechSynthesis.speak(u);return
    }
    if(action==='record'){record();return}
    if(action==='hint'){hints=Math.min(2,hints+1);root.querySelector('.memory-hint').textContent=hints===1?x.meaning:x.phrase.split(' ').map(w=>w[0]+'…').join(' ');snapshot();return}
    let saved=true
    if(action==='familiar'){tasks=tasks.filter((t,i)=>i<=position||t.item!==x||t.type!=='sound');action='next'}
    if(action==='next'||action==='skip'){stop();heard=false;position++;feedback=null;hints=0}
    else if(action==='right'||action==='wrong'){
      if(!heard)return notify('请先听完整句，再选择意思。')
      stop();const correct=action==='right'
      saved=save(x,{listening:correct,listeningAttempts:(records[x.key]?.listeningAttempts||0)+1,listeningCorrect:(records[x.key]?.listeningCorrect||0)+Number(correct)});feedback=correct?'听辨选择正确。':'再听时，留意这个搭配表达的意思。'
    }else if(action==='spoken'){stop();saved=save(x,{spoken:true});feedback='已记录你的开口自评。'}
    else if(action==='check'||action==='reveal'){
      const typed=root.querySelector('.memory-answer').value
      if(action==='check'&&!typed.trim())return notify('先输入表达，也可以查看参考。')
      const matched=action==='check'&&(' '+normalize(typed)+' ').includes(' '+normalize(x.answer)+' ')
      saved=save(x,recordRecall(records[x.key],matched,action==='reveal'?3:hints,Date.now(),exposed.has(x.key)))
      feedback=matched?'匹配目标表达。':'本次未提取出指定搭配，其他说法也可能传达同样意思。'
      if(!matched && type!=='retry')tasks.push({item:x,type:'retry'})
    }
    draw();if(!saved)notify('本机无法保存，这次练习结果未写入记录。')
  }
  const onVisibility=()=>{if(globalThis.document?.hidden&&session){stop();audioState('已暂停播放。回到页面后可重新播放。')}}
  globalThis.document?.addEventListener?.('visibilitychange',onVisibility)
  const dispose=()=>{stop();globalThis.document?.removeEventListener?.('visibilitychange',onVisibility)}
  return {home,click,stop,dispose}
}
