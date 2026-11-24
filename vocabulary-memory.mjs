const storageKey='fluent-vocabulary-senses-v2'
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
  const btn=(action,label)=>'<button type="button" data-memory="'+action+'">'+esc(label)+'</button>'
  let tasks=[],position=0,hints=0,feedback=null,chosen=0,session=false,focusWord=null
  let audio=null, heard=false, recording=null, microphone=null, clip=null, attempt=0
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
  function stop(){
    releaseMicrophone()
    if(audio){audio.onended=null;audio.onerror=null;audio.pause();audio=null}
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
    chosen=Number.isInteger(index)?index:next<0?0:next
    root.innerHTML='<h1>今天能说的一件小事</h1><p>约 10–15 分钟，先回想，再听、再说。每轮最多复习 4 项。已认识的词可先做提取检查，每轮最多 10 项。</p><label>学习组与生活场景 <select class="memory-scene">'+scenes.map((s,i)=>'<option value="'+i+'" '+(i===chosen?'selected':'')+'>'+esc(s.title)+'</option>').join('')+'</select></label><p class="scene-context">'+(focusWord?esc(focusWord)+' · ':'')+esc(scenes[chosen].context)+'</p>'+btn('start','开始场景练习')+btn('placement','先测已认识的词')+(due.length?btn('review','只复习到期内容'):'')+btn('dictionary','找词与短语')+'<p>'+scenes.length+' 个练习组 · '+all.length+' 个词义与搭配，涉及词库中 '+new Set(all.map(x=>x.word).filter(w=>wordSet.has(w))).size+' 个不同词 · 7,000 个词典条目均可自行练习</p><p>有跨日无提示提取记录 '+Object.values(records).filter(r=>r.delayed>0).length+' 项 · 最近一次听辨正确 '+Object.values(records).filter(r=>r.listening===true).length+' 项 · 自报已开口 '+Object.values(records).filter(r=>r.spoken).length+' 项</p><p role="status"></p>'
    root.querySelector('select').onchange=e=>{chosen=Number(e.target.value);focusWord=null;root.querySelector('.scene-context').textContent=scenes[chosen].context}
  }
  const exposed=new Set()
  function begin(only,placement=false){
    exposed.clear()
    const due=reviewQueue(all,records)
    const selected=only?[]:all.filter(x=>x.scene===scenes[chosen]&&(!focusWord||x.word===focusWord)&&!due.some(d=>d.key===x.key))
    const known=selected.filter(x=>records[x.key]).slice(0,4-due.length)
    const reviews=[...due,...known]
    const fresh=selected.filter(x=>!records[x.key]).slice(0,reviews.length>2?2:4)
    tasks=reviews.map(item=>({item,type:'review'}))
    for(const type of ['learn','sound','recall','transfer'])for(const item of fresh)tasks.push({item,type})
    if(placement)tasks=all.filter(x=>x.scene===scenes[chosen]&&(!focusWord||x.word===focusWord)&&!records[x.key]?.lastRecall).slice(0,10).map(item=>({item,type:'recall'}))
    stop();heard=false;session=true;position=0;hints=0;feedback=null;draw()
  }
  function draw(){
    if(position>=tasks.length){const related=scenes[chosen].related
      root.innerHTML='<h1>本轮完成</h1><p>下次回来可以继续练习到期的词义和搭配。</p>'+(related?'<p><a href="'+esc(related.href)+'">延伸课程 · '+esc(related.title)+'</a></p>':'')+btn('home','回到场景');return}
    const {item:x,type}=tasks[position]
    if(type==='learn'||type==='sound'||feedback!==null)exposed.add(x.key)
    let html='<h1>'+esc(x.scene.title)+'</h1>'+(x.topic?'<p class="eyebrow">'+esc(x.topic)+'</p>':'')+'<p>第 '+(position+1)+' / '+tasks.length+' 步</p>'
    if(type==='learn')html+='<h2>'+esc(x.phrase)+'</h2><p>'+esc(x.meaning)+'</p><blockquote>'+esc(x.sentence)+'</blockquote><details><summary>查看整句中文</summary><p>'+esc(x.sentenceZh||x.scene.context)+'</p></details>'+btn('word','听词')+btn('phrase','听搭配')+btn('sentence','听整句')+btn('slow','慢速听句')+btn('next','继续')+btn('familiar','认识这项，稍后直接提取')
    else if(type==='sound'){
      const peers=all.filter(y=>y.scene===x.scene && y.meaning!==x.meaning)
      const other=peers[all.indexOf(x)%peers.length]||all.find(y=>y.meaning!==x.meaning)
      const choices=[x.meaning,other.meaning]
      if(all.indexOf(x)%2)choices.reverse()
      html+='<h2>听这句话，判断说话人的意思</h2>'+btn('sentence','播放情境句')+btn('slow','慢速听句')+choices.map(c=>btn(c===x.meaning?'right':'wrong',c)).join('')+btn('skip','无法播放，跳过听辨')
    }else if(type==='transfer')html+='<h2>换个场合，自己说一句</h2><p>'+esc(x.transfer)+'</p>'+btn('record','录音回听（可选）')+'<audio class="memory-playback" controls hidden></audio>'+btn('spoken','我已开口（自评）')+btn('skip','跳过')
    else html+='<h2>你会怎么说？</h2><p>'+esc(type==='review'?x.transfer:x.cue)+'</p><label>'+esc(x.answerLabel||'写下目标搭配')+' <input class="memory-answer" autocomplete="off"></label>'+btn('check','核对目标表达')+btn('hint','给我一点提示')+btn('reveal','看参考表达')+'<p class="memory-hint"></p>'
    if(feedback!==null)html='<h1>练习反馈</h1><p>'+esc(feedback)+'</p><blockquote>'+esc(x.phrase)+'</blockquote>'+btn('next','继续')
    root.innerHTML='<article class="memory-card">'+html+'</article><p role="status" aria-live="polite"></p>'+btn('home','结束本轮')
  }
  function click(action){
    if(action==='home'){stop();home();return}
    if(action==='dictionary'){stop();dictionary();return}
    if(action==='start'||action==='review'||action==='placement'){begin(action==='review',action==='placement');return}
    if(!session||!tasks[position])return
    const {item:x,type}=tasks[position]
    if(['word','phrase','sentence','slow'].includes(action)){
      const speed=action==='slow'?.8:1;if(action==='slow')action='sentence'
      stop()
      if(action==='sentence'){
        const player=new Audio(new URL(x.audio?.file?'./vocabulary/'+x.audio.file:'./vocabulary/audio/'+x.key.replace('/','-')+'.mp3',import.meta.url))
        audio=player;player.playbackRate=speed
        player.onended=()=>{if(audio===player)heard=true}
        if(x.audio){player.currentTime=x.audio.start;player.ontimeupdate=()=>{if(player.currentTime>=x.audio.end){player.pause();if(audio===player)heard=true}}}
        player.onerror=()=>notify('整句音频未播放，可以重试或跳过听辨。')
        player.play().catch(()=>{if(audio===player)notify('整句音频未播放，可以重试。')})
        return
      }
      if(!window.speechSynthesis||!window.SpeechSynthesisUtterance)return notify('系统语音不可用，可以阅读文字或跳过听辨。')
      const u=new SpeechSynthesisUtterance(x[action]);u.lang='en-US';const step=position
      u.onerror=()=>{if(root.isConnected&&session&&position===step&&root.querySelector('[role=status]'))notify('语音未播放，可以重试或跳过。')}
      window.speechSynthesis.cancel();window.speechSynthesis.speak(u);return
    }
    if(action==='record'){record();return}
    if(action==='hint'){hints=Math.min(2,hints+1);root.querySelector('.memory-hint').textContent=hints===1?x.meaning:x.phrase.split(' ').map(w=>w[0]+'…').join(' ');return}
    let saved=true
    if(action==='familiar'){tasks=tasks.filter((t,i)=>i<=position||t.item!==x||t.type!=='sound');action='next'}
    if(action==='next'||action==='skip'){stop();heard=false;position++;feedback=null;hints=0}
    else if(action==='right'||action==='wrong'){
      if(!heard)return notify('请先听完整句，再选择意思。')
      const correct=action==='right'
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
  return {home,click,stop}
}
