import {frequencyNotes} from './frequency-notes.mjs'
import {curriculumScenes} from './curriculum.mjs'
import {sceneMemory,recordRecall} from './vocabulary-memory.mjs?v=20261124-5'
const base = new URL('./vocabulary/', import.meta.url)
let corpus, active = 0, cleanup
const key = 'fluent-vocabulary-v1'
function load() {
  try {
    const raw=JSON.parse(localStorage.getItem(key))
    if(!raw||typeof raw!=='object'||Array.isArray(raw))return {}
    const map=(value,valid)=>Object.fromEntries(Object.entries(value||{}).filter(([,v])=>valid(v)))
    return {...raw,words:map(raw.words,r=>r&&Number.isFinite(r.due)&&Number.isInteger(r.stage)),
      notes:map(raw.notes,v=>typeof v==='string'),recalls:map(raw.recalls,r=>r&&Number.isFinite(r.due)&&Number.isInteger(r.level))}
  } catch {return {}}
}
export function saveLookupRecall(recalls,word,matched,hints,persist){
  const previous=recalls[word]
  recalls[word]=recordRecall(previous,matched,hints)
  if(persist())return true
  if(previous===undefined)delete recalls[word]
  else recalls[word]=previous
  return false
}
export function vocabularyQueue(words, ratings, group, limit, now = Date.now()) {
  const reviews = words.filter(([word]) => ratings[word]?.due <= now)
  const fresh = words.filter(([word], index) => !ratings[word] && (group < 0 || Math.floor(index / 350) === group))
  return [...reviews.slice(0,5), ...fresh.slice(0, Math.min(limit,10-Math.min(5,reviews.length)))]
}
export function stopVocabulary() {
  active++
  cleanup?.()
  cleanup = null
}
export async function renderVocabulary({app, route, escape: esc, isPhraseSaved, onSavePhrase}) {
  stopVocabulary()
  const version = active
  app.innerHTML = '<p>正在加载词库…</p>'
  corpus ??= Promise.all(['words','phrases','scenes','sources','frequency','rankings','curriculum'].map(async name => {
    const res = await fetch(new URL(name+'.json?v=20261124-5',base))
    if (!res.ok) throw Error(res.status)
    return res.json()
  })).catch(error => { corpus = null; throw error })
  let words, phrases, scenes, sources, frequency, rankings, curriculum
  try { [words, phrases, scenes, sources, frequency, rankings, curriculum] = await corpus } catch (error) {
    if (version===active) throw error
    return
  }
  if (version!==active) return
  const english=document.documentElement.lang==='en'
  const teaching=new Map(curriculum.map(u=>[u.word,u]))
  const meaning=p=>english?(teaching.get(p[0])?.senseEn||p[5]||p[0]):(teaching.get(p[0])?.sense||p[4]?.[3]||p[1].split('\n')[0])
  scenes=[...curriculumScenes(curriculum,english?'en':'zh'),...scenes]
  const root=document.createElement('section')
  root.className='vocabulary'
  app.replaceChildren(root)
  let state=load(), ratings=Object.assign(Object.create(null),state.words || {}), limit=[5,10,20].includes(state.limit)?state.limit:10
  let tab=String(route).includes('phrase')?'phrases':'words', group=-1, query='', page=0, queue=null, pos=0, flipped=false, detail=null
  limit=Math.min(10,limit)
  const notes=Object.assign(Object.create(null),state.notes||{})
  const recalls=Object.assign(Object.create(null),state.recalls||{})
  let hints=0
  cleanup=()=>{memory.dispose()}
  const due=()=>words.filter(([w])=>Math.min(ratings[w]?.due??Infinity,recalls[w]?.due??Infinity)<=Date.now())
  const matches=(en,zh)=>en.toLowerCase().includes(query.toLowerCase())||zh.includes(query)
  const button=(action,label,value='')=>'<button type="button" data-act="'+action+'" data-val="'+value+'">'+label+'</button>'
  const status=msg=>{root.querySelector('[role=status]').textContent=msg}
  const memory=sceneMemory(root,scenes,esc,draw,status,new Set(words.map(w=>w[0])))
  function persist() {
    try {localStorage.setItem(key,JSON.stringify({...state,limit,words:ratings,notes,recalls}));return true} catch {return false}
  }
  const linkSource=source=>sources[source]?'<a href="'+esc(sources[source])+'">'+esc(source)+'</a>':esc(source)
  function listing() {
    const entries=(tab==='words'?words:phrases).map((entry,i)=>({entry,i})).filter(({entry,i})=>tab==='words'?
      (group<0||Math.floor(i/350)===group)&&matches(entry[0],meaning(entry)+' '+entry[1]+' '+(teaching.get(entry[0])?.sense||'')):matches(entry.en,entry.zh))
    const items=entries.slice(page*20,page*20+20).map(({entry:p,i})=>tab==='words'?
      button('detail','<b>'+esc(teaching.get(p[0])?.displayWord||p[0])+'</b><span>'+esc(meaning(p))+'</span>',i):
      '<article><b>'+esc(p.en)+'</b><p>'+esc(english?p.en:p.zh)+'</p><small>'+p.sources.map(linkSource).join(' / ')+'</small>'+button('save',isPhraseSaved?.(p.id)?'取消收藏':'收藏短语',i)+'</article>')
    root.querySelector('.v-results').innerHTML='<p>共 '+entries.length+' 条</p>'+items.join('')+
      '<nav>'+(page?button('prev','上一页'):'')+(page*20+20<entries.length?button('next','下一页'):'')+'</nav>'
  }
  function draw() {
    root.innerHTML='<h1>日常词库</h1><button data-memory="home">回到生活场景</button><p>基础 3,500 词 · 进阶 3,500 词。按 SUBTLEX-US 字幕词形频次降序排列；这不是 CEFR 等级。</p>'+frequencyNotes(rankings,english)+'<div class="v-panel"></div><p role="status" aria-live="polite"></p>'
    const panel=root.querySelector('.v-panel')
    if(queue || detail!==null) {
      const study=queue!==null
      if(study && pos>=queue.length) {panel.innerHTML='<h2>本轮完成</h2><p>已完成 '+pos+' 次词卡自评。</p>'+button('back','返回词库');return}
      const [w,zh,phon,part,ex,en]=study?queue[pos]:words[detail]
      const related=scenes.map((sc,index)=>({sc,index})).filter(({sc})=>sc.items.some(item=>item.word===w))
      const reveal=!study||flipped
      const [firstMeaning, ...otherMeanings] = (english?en:zh).split('\n')
      const unit=teaching.get(w), rank=rankings.words.find(r=>r.word===w)
      const personalCue=study&&!reveal&&notes[w]
      let cue=personalCue||meaning(study?queue[pos]:words[detail])||firstMeaning
      if(study&&!reveal)cue=cue.replace(new RegExp('\\b'+w+'\\b','gi'),'____')
      const rankInfo=english?`Position ${rank.rank} / 7000 · SUBTLEX-US: ${rank.count} occurrences, ${rank.perMillion.toFixed(2)} per million words, across ${rank.contexts} / 8388 subtitle samples. These are word-form counts, not counts for this particular meaning.`:`词表内顺序 ${rank.rank} / 7000 · SUBTLEX-US 原始出现次数 ${rank.count} · 每百万词 ${rank.perMillion.toFixed(2)} · 出现于 ${rank.contexts} / 8388 个字幕样本。频次针对词形，不能代表此处义项的单独频率。`
      panel.innerHTML=button('back','返回词库')+'<p>'+(study?'词卡 '+(pos+1)+' / '+queue.length:'词条')+'</p><h2>'+esc(reveal?(unit?.displayWord||w):'回忆对应的英文词')+'</h2><p class="v-definition"'+(personalCue?' translate="no"':'')+'>'+esc(cue)+'</p>'+
        (reveal && !unit && otherMeanings.length ? '<details><summary>更多词典释义</summary><p class="v-definition">'+esc(english?en:(ex?.[3]?zh:otherMeanings.join('\n')))+'</p></details>' : '')+
        (reveal?'<p>'+esc(unit?.phonetic||phon)+' '+esc(unit?'':(english?rank.dominantPOS:part))+'</p>'+button('listen','听词 · 系统语音')+(!unit&&en?'<details><summary>英文释义</summary><p class="v-definition">'+esc(en)+'</p></details>':'')+(unit?'<blockquote><small>当前学习场景</small><p>'+esc(unit.en)+'</p><p>'+esc(english?unit.senseEn:unit.zh)+'</p></blockquote>':'')+(ex?(unit?'<details><summary>课程中的其他用例（义项可能不同）</summary>':'')+'<blockquote><small>原文用例 · '+(ex[3]?'已标注本句义项':'按词形匹配，义项待核对')+'</small><p>'+esc(ex[0])+'</p>'+'<p>'+esc(ex[1])+'</p><small>'+linkSource(ex[2])+'</small></blockquote>'+(unit?'</details>':''):unit?'':'<p>请用这个词说一句与你今天生活有关的话。</p>'):'')+
        (!study?related.map(({sc,index})=>button('scene','练习场景 · '+esc(sc.title),index)).join(''):'')+
        (!study?'<details><summary>这个词怎样编入词库？</summary><p>'+esc(rankInfo)+'<a href="'+esc(rankings.sourceURL)+'" target="_blank" rel="noopener">核对原始来源</a></p></details><label>我的记忆线索 <input class="v-note" placeholder="例如：昨天在酒店前台用过" value="'+esc(notes[w]||'')+'"></label>'+button('note','保存线索')+button('personal','练习这个词'):'')+
        (study&&!reveal?button('hint','逐步提示'):'')+
        (study?'<label>拼写 <input class="v-answer" autocomplete="off" autocapitalize="none" spellcheck="false"></label>'+button('check','核对拼写')+(flipped?button('again','需复习')+button('known','自评已会'):button('flip','翻卡查看英文')):'')
      return
    }
    panel.innerHTML='<h2>今天的词卡</h2><p>已自评 '+words.filter(([w])=>ratings[w]).length+' 词 · 自评已会 '+words.filter(([w])=>ratings[w]?.stage>0).length+' 词 · 标记需复习 '+words.filter(([w])=>ratings[w]?.stage===0).length+' 词 · 到期复习（所有组） '+due().length+' 词</p><p>每轮最多复习 5 个到期词，总量最多 10 个。</p><label>新词上限 <select class="v-limit">'+[5,10].map(v=>'<option '+(v===limit?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+button('start','开始学习')+'<hr><nav>'+button('words','全部单词')+button('phrases','日常短语')+'</nav>'+
      '<label>中英文搜索 <input class="v-query" type="search" value="'+esc(query)+'"></label>'+
      (tab==='words'?'<label>学习组 <select class="v-group"><option value="-1">全部组</option>'+Array.from({length:20},(_,i)=>'<option value="'+i+'" '+(i===group?'selected':'')+'>'+(i<10?'基础':'进阶')+' · 第 '+(i%10+1)+' 组</option>').join('')+'</select></label>':'')+'<div class="v-results"></div><footer><small>词典数据来自 <a href="https://github.com/skywind3000/ECDICT">ECDICT</a> · <a href="vocabulary/LICENSE">MIT 许可</a>。当前场景释义和双语例句由本站编写，每词先学一个义项。排序依据 SUBTLEX-US；先按出现次数，再按样本覆盖数，最后按字母顺序破同分。前后各 3500 是学习分段，不是权威等级边界。</small></footer>'
    for(const name of ['words','phrases']) panel.querySelector('[data-act='+name+']').setAttribute('aria-pressed',String(tab===name))
    listing()
  }
  root.oninput=e=>{if(e.target.matches('.v-query')){query=e.target.value.trim();page=0;listing()}}
  root.onchange=e=>{if(e.target.matches('.v-group')){group=Number(e.target.value);page=0;listing()}if(e.target.matches('.v-limit')){limit=Number(e.target.value);if(!persist())status('本机无法保存设置')}}
  root.onclick=e=>{
    const b=e.target.closest('button');if(!b)return
    if(b.dataset.memory){memory.click(b.dataset.memory);return}
    const a=b.dataset.act,i=Number(b.dataset.val)
    if(a==='scene'){const target=words[detail]?.[0];detail=null;memory.home(i,target);return}
    if(a==='listen'){
      if(!window.speechSynthesis || !window.SpeechSynthesisUtterance)return status('此浏览器无法使用系统语音')
      const u=new SpeechSynthesisUtterance((queue?queue[pos]:words[detail])[0]);u.lang='en-US'
      u.onerror=()=>{if(active===version)status('系统语音未播放，请检查设备语音设置')}
      window.speechSynthesis.cancel();window.speechSynthesis.speak(u);return
    }
    if(a==='note'){const w=words[detail][0],old=notes[w];notes[w]=root.querySelector('.v-note').value.trim();if(persist())return status('线索已保存');if(old===undefined)delete notes[w];else notes[w]=old;return status('本机无法保存线索')}
    if(a==='personal'){queue=[words[detail]];detail=null;pos=0;flipped=false;hints=0;draw();return}
    if(a==='hint'){hints++;const [w,zh,phon]=queue[pos];return status(hints===1?meaning(queue[pos]):'首字母 '+w[0]+' · '+phon)}
    if(a==='check'){
      const w=queue[pos][0],typed=root.querySelector('.v-answer').value.trim()
      if(!typed)return status('先输入你想起的词。')
      if(flipped)return status(typed.toLowerCase()===w.toLowerCase()?'对照拼写正确':'与参考拼写不同')
      const matched=typed.toLowerCase()===w.toLowerCase()
      const saved=saveLookupRecall(recalls,w,matched,hints,persist);flipped=true;draw()
      return status((matched?'提取正确。':'已显示参考拼写。')+(saved?'':'本机无法保存。'))
    }
    if(a==='save'){const previous=isPhraseSaved?.(phrases[i].id);const saved=onSavePhrase?.(phrases[i]);listing();return status(previous===saved?'收藏状态未变更':saved?'已收藏':'已取消收藏')}
    if(a==='start'){hints=0;const scheduling=Object.assign(Object.create(null),ratings)
      for(const [w,recall] of Object.entries(recalls))scheduling[w]={due:Math.min(recall.due,ratings[w]?.due??Infinity)}
      queue=vocabularyQueue(words,scheduling,group,limit);pos=0;flipped=false;if(!queue.length){queue=null;return status('当前组暂无新词或到期复习')}}
    if(a==='again'||a==='known'){
      const w=queue[pos][0],stage=a==='again'?0:Math.min(5,(ratings[w]?.stage||0)+1)
      ratings[w]={stage,due:Date.now()+[1,3,7,14,30,60][stage]*86400000}
      const saved=persist();if(!saved)ratings=Object.assign(Object.create(null),load().words||{});pos++;hints=0;flipped=false;draw();if(!saved)status('本机无法保存，本轮进度仅在当前页面有效');return
    }
    if(a==='flip'){const w=queue[pos][0];const saved=saveLookupRecall(recalls,w,false,3,persist);flipped=true;draw();if(!saved)status('本机无法保存');return}
    if(a==='detail')detail=i
    if(a==='back'){queue=null;detail=null}
    if(a==='prev')page--
    if(a==='next')page++
    if(['words','phrases'].includes(a)){tab=a;query='';page=0}
    draw()
  }
  if(String(route).includes('phrase')||String(route).includes('dictionary'))draw()
  else memory.home()
}
