const base = new URL('./vocabulary/', import.meta.url)
let corpus, active = 0, cleanup
const key = 'fluent-vocabulary-v1'
function load() {
  try { return JSON.parse(localStorage.getItem(key)) || {} } catch { return {} }
}
export function vocabularyQueue(words, ratings, group, limit, now = Date.now()) {
  const reviews = words.filter(([word]) => ratings[word]?.due <= now)
  const fresh = words.filter(([word], index) => !ratings[word] && (group < 0 || Math.floor(index / 350) === group))
  return [...reviews, ...fresh.slice(0, limit)]
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
  corpus ??= Promise.all(['words','phrases'].map(async name => {
    const res = await fetch(new URL(name+'.json',base))
    if (!res.ok) throw Error(res.status)
    return res.json()
  })).catch(error => { corpus = null; throw error })
  let words, phrases
  try { [words, phrases] = await corpus } catch (error) {
    if (version===active) throw error
    return
  }
  if (version!==active) return
  const root=document.createElement('section')
  root.className='vocabulary'
  app.replaceChildren(root)
  let state=load(), ratings=Object.assign(Object.create(null),state.words || {}), limit=[5,10,20].includes(state.limit)?state.limit:10
  let tab=String(route).includes('phrase')?'phrases':'words', group=-1, query='', page=0, queue=null, pos=0, flipped=false, detail=null
  let speaking=false
  cleanup=()=>{if(speaking) window.speechSynthesis?.cancel()}
  const due=()=>words.filter(([w])=>ratings[w]?.due<=Date.now())
  const matches=(en,zh)=>en.toLowerCase().includes(query.toLowerCase())||zh.includes(query)
  const button=(action,label,value='')=>'<button type="button" data-act="'+action+'" data-val="'+value+'">'+label+'</button>'
  const status=msg=>{root.querySelector('[role=status]').textContent=msg}
  function persist() {
    try {localStorage.setItem(key,JSON.stringify({limit,words:ratings}));return true} catch {return false}
  }
  function listing() {
    const entries=(tab==='words'?words:phrases).map((entry,i)=>({entry,i})).filter(({entry,i})=>tab==='words'?
      (group<0||Math.floor(i/350)===group)&&matches(entry[0],entry[1]):matches(entry.en,entry.zh))
    const items=entries.slice(page*20,page*20+20).map(({entry:p,i})=>tab==='words'?
      button('detail','<b>'+esc(p[0])+'</b><span>'+esc(p[1].split('\n')[0])+'</span>',i):
      '<article><b>'+esc(p.en)+'</b><p>'+esc(p.zh)+'</p><small>'+esc(p.sources.join(' / '))+'</small>'+button('save',isPhraseSaved?.(p.id)?'取消收藏':'收藏短语',i)+'</article>')
    root.querySelector('.v-results').innerHTML='<p>共 '+entries.length+' 条</p>'+items.join('')+
      '<nav>'+(page?button('prev','上一页'):'')+(page*20+20<entries.length?button('next','下一页'):'')+'</nav>'
  }
  function draw() {
    root.innerHTML='<h1>日常词库</h1><p>基础 3,500 词 · 进阶 3,500 词</p><div class="v-panel"></div><p role="status" aria-live="polite"></p>'
    const panel=root.querySelector('.v-panel')
    if(queue || detail!==null) {
      const study=queue!==null
      if(study && pos>=queue.length) {panel.innerHTML='<h2>本轮完成</h2><p>已完成 '+pos+' 次词卡自评。</p>'+button('back','返回词库');return}
      const [w,zh,phon,part,ex,en]=study?queue[pos]:words[detail]
      const reveal=!study||flipped
      const [firstMeaning, ...otherMeanings] = zh.split('\n')
      panel.innerHTML=button('back','返回词库')+'<p>'+(study?'词卡 '+(pos+1)+' / '+queue.length:'词条')+'</p><h2>'+esc(reveal?w:'回忆对应的英文词')+'</h2><p class="v-definition">'+esc(firstMeaning)+'</p>'+
        (reveal && otherMeanings.length ? '<details><summary>更多词典释义</summary><p class="v-definition">'+esc(otherMeanings.join('\n'))+'</p></details>' : '')+
        (reveal?'<p>'+esc(phon)+' '+esc(part)+'</p>'+button('listen','听词 · 系统语音')+(en?'<details><summary>英文释义</summary><p class="v-definition">'+esc(en)+'</p></details>':'')+(ex?'<blockquote>'+esc(ex[0])+'<p>'+esc(ex[1])+'</p><small>'+esc(ex[2])+'</small></blockquote>':'<p>请用这个词说一句与你今天生活有关的话。</p>'):'')+
        (study?'<label>拼写 <input class="v-answer" autocomplete="off" autocapitalize="none" spellcheck="false"></label>'+button('check','核对拼写')+(flipped?button('again','需复习')+button('known','自评已会'):button('flip','翻卡查看英文')):'')
      return
    }
    panel.innerHTML='<h2>今天的词卡</h2><p>已自评 '+Object.keys(ratings).length+' 词 · 自评已会 '+Object.values(ratings).filter(r=>r.stage>0).length+' 词 · 标记需复习 '+Object.values(ratings).filter(r=>r.stage===0).length+' 词 · 到期复习（所有组） '+due().length+' 词</p><p>每轮先复习所有组的到期词，再学当前组的新词。</p><label>每轮新词 <select class="v-limit">'+[5,10,20].map(v=>'<option '+(v===limit?'selected':'')+'>'+v+'</option>').join('')+'</select></label>'+button('start','开始学习')+'<hr><nav>'+button('words','全部单词')+button('phrases','日常短语')+'</nav>'+
      '<label>中英文搜索 <input class="v-query" type="search" value="'+esc(query)+'"></label>'+
      (tab==='words'?'<label>学习组 <select class="v-group"><option value="-1">全部组</option>'+Array.from({length:20},(_,i)=>'<option value="'+i+'" '+(i===group?'selected':'')+'>'+(i<10?'基础':'进阶')+' · 第 '+(i%10+1)+' 组</option>').join('')+'</select></label>':'')+'<div class="v-results"></div><footer><small>释义与音标来自 <a href="https://github.com/skywind3000/ECDICT">ECDICT</a> · <a href="vocabulary/LICENSE">MIT 许可</a>。a 和 the 的中文教学释义由本站改写。分组按词频与课程用词编排。</small></footer>'
    for(const name of ['words','phrases']) panel.querySelector('[data-act='+name+']').setAttribute('aria-pressed',String(tab===name))
    listing()
  }
  root.oninput=e=>{if(e.target.matches('.v-query')){query=e.target.value.trim();page=0;listing()}}
  root.onchange=e=>{if(e.target.matches('.v-group')){group=Number(e.target.value);page=0;listing()}if(e.target.matches('.v-limit')){limit=Number(e.target.value);if(!persist())status('本机无法保存设置')}}
  root.onclick=e=>{
    const b=e.target.closest('button');if(!b)return
    const a=b.dataset.act,i=Number(b.dataset.val)
    if(a==='listen'){
      if(!window.speechSynthesis || !window.SpeechSynthesisUtterance)return status('此浏览器无法使用系统语音')
      const u=new SpeechSynthesisUtterance((queue?queue[pos]:words[detail])[0]);u.lang='en-US'
      u.onerror=()=>{if(active===version)status('系统语音未播放，请检查设备语音设置')}
      speaking=true;window.speechSynthesis.cancel();window.speechSynthesis.speak(u);return
    }
    if(a==='check') return status(root.querySelector('.v-answer').value.trim().toLowerCase()===queue[pos][0].toLowerCase()?'拼写正确':'拼写未匹配，可以再试一次或翻卡查看。')
    if(a==='save'){const previous=isPhraseSaved?.(phrases[i].id);const saved=onSavePhrase?.(phrases[i]);listing();return status(previous===saved?'收藏状态未变更':saved?'已收藏':'已取消收藏')}
    if(a==='start'){queue=vocabularyQueue(words,ratings,group,limit);pos=0;flipped=false;if(!queue.length){queue=null;return status('当前组暂无新词或到期复习')}}
    if(a==='again'||a==='known'){
      const w=queue[pos][0],stage=a==='again'?0:Math.min(5,(ratings[w]?.stage||0)+1)
      ratings[w]={stage,due:Date.now()+[1,3,7,14,30,60][stage]*86400000}
      const saved=persist();pos++;flipped=false;draw();if(!saved)status('本机无法保存，本轮进度仅在当前页面有效');return
    }
    if(a==='flip')flipped=true
    if(a==='detail')detail=i
    if(a==='back'){queue=null;detail=null}
    if(a==='prev')page--
    if(a==='next')page++
    if(['words','phrases'].includes(a)){tab=a;query='';page=0}
    draw()
  }
  draw()
}
