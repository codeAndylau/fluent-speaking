import {todayHTML,libraryHTML,meHTML} from './light-shell.mjs?v=20261125-3';
import {isPracticeLesson,lessonStep,practiceProgress,savePractice} from './light-course.mjs?v=20261125-3';
import {renderConversation} from './conversation.mjs?v=20261125-3';
import {installMobileInput} from './mobile-input.mjs?v=20261125-3';
import {initLanguage} from './i18n.mjs?v=20261125-3';
import {renderSettings} from './settings.mjs?v=20261125-3';
import {guideHTML} from './guide.mjs?v=20261125-3';
import {createThemeController} from './theme.mjs';
import {BACKUP_SECTIONS,createBackup,createSafetySnapshot,parseBackup,restoreBackup} from './learning-backup.mjs?v=20261125-3';
import {EXTERNAL_NOTEBOOK_KEY,restoreExternalNotebook,externalPhraseKey,toggleExternalPhrase,reviewExternalPhrase,externalPhraseURL} from './external-notebook.mjs';
import {icon} from './icons.mjs';
import {restoreState,finishLesson,recordQuiz,nextLesson,dueReviews,reviewPhrase,diagnosticAdvice,recordDiagnosticQuiz,markTranscriptSeen} from './state.mjs';
const $=s=>document.querySelector(s), app=$('#app');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const dateKey=(d=new Date())=>`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
const formatTime=n=>`${Math.floor((Number.isFinite(n)?n:0)/60)}:${String(Math.floor((Number.isFinite(n)?n:0)%60)).padStart(2,'0')}`;
const route=()=>location.hash.slice(1)||'home';
const lessonURL=(id,step)=>`#lesson/${id}/${lessonStep(byId[id],step)}`;
const types={lesson:'主题练习',review:'跨课复习',assessment:'新任务周测',challenge:'综合挑战',diagnostic:'入门诊断'};
const steps=[['listen','先听一听'],['understand','确认听懂'],['speak','轮到你说'],['review','回顾与复习']];
let themeControls,languageControls;
let course,lessons=[],byId={},memory,currentLesson,drafts={},audioRequest=0,segmentEnd=null;
const timelines=new Map(), audio=$('#lesson-audio'),lineAudio=$('#line-audio');
let recording=null,recordUrl=null,recordedAudio=null,toastTimer;
let externalNotebook=new Map(), externalPage=null, pendingBackup=null, backupRead=0;
const externalSections={
 stories:{label:'故事听说',load:()=>import('./stories.mjs?v=20261125-3'),render:'renderStories',stop:'stopStories'},
 vocabulary:{label:'词汇练习',load:()=>import('./vocabulary.mjs?v=20261125-3'),render:'renderVocabulary',stop:'stopVocabulary'}
};
const externalSource=part=>part==='story'||part==='stories'?'stories':part==='vocabulary'?'vocabulary':null;
const isExternalDue=(entry,today)=>!entry.review||entry.review.due<=today;

function commitExternalNotebook(next){
 try{
  localStorage.setItem(EXTERNAL_NOTEBOOK_KEY,JSON.stringify([...next.values()]));
  externalNotebook=next;
  return true;
 }catch{toast('表达本暂时无法保存，本次修改未生效。');return false;}
}

async function renderExternal(source,requestedRoute){
 const section=externalSections[source];
 const host=document.createElement('div');
 const page={host,stop:null};
 externalPage=page;
 app.replaceChildren(host);
 host.innerHTML=`<div class="white-card empty-state" role="status"><p>正在加载${section.label}…</p></div>`;
 const current=()=>externalPage===page&&route()===requestedRoute;
 try{
  const module=await section.load();
  if(!current())return;
  page.stop=module[section.stop];
  host.replaceChildren();
  await module[section.render]({
   app:host,route:requestedRoute,escape:esc,icon,
   isPhraseSaved:id=>externalNotebook.has(externalPhraseKey(source,id)),
   onSavePhrase:phrase=>{
    const key=externalPhraseKey(source,phrase?.id);
    const previous=externalNotebook.has(key);
    if(!current())return previous;
    const next=new Map(externalNotebook);
    const saved=toggleExternalPhrase(next,source,phrase);
    if(saved===null||!commitExternalNotebook(next))return previous;
    toast(saved?'已加入表达本':'已移出表达本');
    return saved;
   }
  });
 }catch(error){
  if(!current())return;
  page.stop?.();
  page.stop=null;
  host.innerHTML=`<div class="white-card empty-state"><h1>${section.label}暂时无法加载</h1><p>请再试一次。</p><button class="primary" data-act="external-retry">重新加载</button></div>`;
  console.error(error);
 }
}

function stopExternal(){
 const page=externalPage;
 externalPage=null;
 page?.host.remove();
 page?.stop?.();
}
function toast(message){$('#toast').textContent=message;$('#toast').classList.add('visible');clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').classList.remove('visible'),3500);}
function readStorage(key){try{return JSON.parse(localStorage.getItem(key)||'null')}catch{return null}}
function persist(){try{localStorage.setItem('fluent-course-v2',JSON.stringify(memory))}catch{toast('学习记录暂时无法保存；当前页面仍可继续练习。')}}
function draft(l){return drafts[l.id] ||= {answers:{},checked:false,textSeen:!!(memory.lessons[l.id]?.pendingTextSeen || memory.lessons[l.id]?.quiz),translation:false,round:0,ratings:[null,null,null],partner:false,spoken:false,note:''};}
function firstQuiz(l){return l.id==='diagnostic'?Number.isInteger(memory.diagnostic.listening):!!memory.lessons[l.id]?.quiz;}
function restricted(l){return ['assessment','diagnostic'].includes(l.type)}
function canSpeak(l){return l.id==='diagnostic'?Number.isInteger(memory.diagnostic.reading):(!restricted(l)||firstQuiz(l));}
function voice(l){return /^w(09|10|11|12)d6$/.test(l.id)?'Ava':'Andrew'}
function go(hash){if(location.hash===`#${hash}`)render();else location.hash=hash;}
function releaseRecording(session){
 clearInterval(session.timer);
 session.stream?.getTracks().forEach(track=>track.stop());
 session.stream=null;
}
function finishRecording(session){
 try{
  if(session.recorder?.state==='recording')session.recorder.stop();
 }finally{releaseRecording(session);}
}
function resetRecordButton(button){
 button.classList.remove('recording');
 button.innerHTML=icon('mic');
 button.setAttribute('aria-label','重新录音');
}
function stopRecording({keepResult=false}={}){
 const session=recording;
 if(!session)return;
 if(!keepResult||!session.recorder)recording=null;
 finishRecording(session);
 if(keepResult&&!session.recorder){
  resetRecordButton(session.button);
  session.status.textContent='已取消录音';
  session.help.textContent='录音不会上传；离开步骤前请下载。也可以用手机录音机完成。';
 }
}
function stopPlayback(){audioRequest++;audio.pause();lineAudio.pause();segmentEnd=null;}
function stopRecordedPlayback(){recordedAudio?.pause();}
function clearRecordedPlayback(){
 if(recordedAudio){
  recordedAudio.pause();
  recordedAudio.removeAttribute('src');
  recordedAudio.load();
  recordedAudio=null;
 }
 if(recordUrl){URL.revokeObjectURL(recordUrl);recordUrl=null;}
}
function prepareDemoPlayback(){
 stopRecordedPlayback();
 stopRecording({keepResult:true});
}
function pauseCourseMedia(){
 stopPlayback();
 stopRecordedPlayback();
 stopRecording({keepResult:true});
}
function cleanup(){stopExternal();stopPlayback();stopRecording();clearRecordedPlayback();}
function getTimeline(id){if(!timelines.has(id)){timelines.set(id,fetch(`audio/course/${id}.json`).then(r=>{if(!r.ok)throw Error('audio metadata');return r.json()}).catch(e=>{timelines.delete(id);throw e}));}return timelines.get(id);}
function setAudio(l){if(audio.dataset.lesson!==l.id){audio.dataset.lesson=l.id;audio.src=`audio/course/${l.id}.mp3`;audio.load();}}
function render(){cleanup();pendingBackup=null;backupRead++;let r=route(),parts=r.split('/');currentLesson=null;
 if(r==='diagnostic'){go('lesson/diagnostic/listen');return;}
 if(parts[0]==='lesson'&&!byId[parts[1]]){if(steps.some(s=>s[0]===parts[1])||parts[1]==='complete'){go(`lesson/w01d1/${parts[1]}`);return;}}
 const source=externalSource(parts[0]);
 const nav=source||(['lesson','week'].includes(parts[0])?'path':parts[0]);document.querySelectorAll('[data-nav]').forEach(a=>{const active=a.dataset.nav===nav;a.classList.toggle('active',active);if(active)a.setAttribute('aria-current','page');else a.removeAttribute('aria-current');});
 $('#breadcrumb').textContent=(source&&externalSections[source].label)||({home:'今天',library:'内容库',me:'我的',path:'学习路径',week:'本周课程',phrases:'我的表达本',method:'怎么学，更有效',progress:'学习记录备份',guide:'学习地图与使用攻略',settings:'设置',conversation:'英语对话练习',lesson:'听说练习'})[parts[0]]||'今日学习';
 if(source)renderExternal(source,r);
 else if(parts[0]==='lesson'){const l=byId[parts[1]];if(l){currentLesson=l;setAudio(l);const step=lessonStep(l,parts[2]);if(step==='practice')renderPractice(l);else renderLesson(l,step)}else renderMissing();}
 else if(parts[0]==='week')renderWeek(Number(parts[1]));else if(r==='library')app.innerHTML=libraryHTML({esc});else if(r==='me')app.innerHTML=meHTML({memory,esc});else if(r==='path')renderPath();else if(r==='phrases')renderPhrases();else if(r==='method')renderMethod();else if(r==='progress')renderProgress();else if(parts[0]==='guide')app.innerHTML=guideHTML();else if(r==='conversation')renderConversation(app,languageControls?.language);else if(r==='settings')renderSettings(app,themeControls,toast);else renderHome();
 window.scrollTo({top:0,behavior:'instant'});
 if(parts[0]==='guide'&&['map','pages','routine','help'].includes(parts[1]))document.getElementById('guide-'+parts[1])?.scrollIntoView();
}
function renderMissing(){app.innerHTML='<div class="white-card empty-state"><h1>这节课暂时找不到</h1><p>请从课程目录选择课程。</p><a class="primary" href="#path">打开课程目录</a></div>';}
function weekCalendar(){const d=new Date(),offset=(d.getDay()+6)%7,monday=new Date(d);monday.setDate(d.getDate()-offset);return (document.documentElement.lang==='en'?['Mon','Tue','Wed','Thu','Fri','Sat','Sun']:['一','二','三','四','五','六','日']).map((name,i)=>{const v=new Date(monday);v.setDate(monday.getDate()+i);const done=memory.dates.includes(dateKey(v));return `<div class="day ${i===offset?'today':''} ${done?'done':''}"><span>${name}</span><b>${done?'✓':v.getDate()}</b></div>`}).join('');}
function weekCount(w){return w.lessons.filter(l=>memory.lessons[l.id]?.completed||practiceProgress(memory,l).done).length;}
function renderHome(){
 const today=dateKey(),due=dueReviews(memory,today).length+[...externalNotebook.values()].filter(entry=>isExternalDue(entry,today)).length;
 app.innerHTML=todayHTML({lessons,memory,esc,due});
}
function renderPath(){app.innerHTML=`<section class="page-intro"><div class="eyebrow">YOUR PATH TO EVERYDAY ENGLISH</div><h1>从一句话，到日常生活。</h1><p>12 周，72 个学习日，包含主题练习、复习和周测。</p></section><div class="route-note">可选 <a class="inline-link" href="#diagnostic">入门诊断</a>。第 4、8、12 周可回看阶段检查。</div><div class="course-grid">${course.weeks.map(w=>`<a class="white-card course-card ${w.week===1?'first':''}" href="#week/${w.week}"><span class="course-num">WEEK ${String(w.week).padStart(2,'0')}</span><h3>${esc(w.title)}</h3><p>${esc(w.description)}</p><small>${weekCount(w)}/6 已练习 · ${[4,8,12].includes(w.week)?'含阶段检查':'打开本周 6 课'}</small></a>`).join('')}</div>`;}
function renderWeek(n){const w=course.weeks.find(w=>w.week===n);if(!w){renderMissing();return;}app.innerHTML=`<a class="back-link" href="#path">${icon('back')}回到 12 周路径</a><section class="page-intro"><div class="eyebrow">WEEK ${String(n).padStart(2,'0')}</div><h1>${esc(w.title)}</h1><p>${esc(w.outcome)}</p></section><div class="route-note">本周 ${weekCount(w)}/6 个学习日已有练习记录。</div><div class="week-lessons">${w.lessons.map(l=>{const entry=memory.lessons[l.id];return `<a class="task-card white-card" href="${lessonURL(l.id)}"><span class="task-icon">${entry?.completed||practiceProgress(memory,l).done?icon('check'):l.day}</span><div><span class="eyebrow">DAY ${l.day} · ${types[l.type]}</span><h3>${esc(l.title)}</h3><p>${esc(l.goal)}</p>${entry?.quiz?`<small>首次理解题 ${esc(entry.quiz.first.score)}/${esc(entry.quiz.first.total)}${entry.quiz.first.assisted?'（看过文本）':'（未看文本）'} · ${entry.completed?'已保存自评':'待口语回顾'}</small>`:''}</div></a>`}).join('')}</div>${[4,8,12].includes(n)?stageReport(n):''}`;}
function stageReport(n){const start=n-3,entries=lessons.filter(l=>l.week>=start&&l.week<=n&&l.type==='assessment');return `<section class="white-card stage-report"><h2>第 ${start}–${n} 周 · 阶段检查</h2><p>新任务周测记录与口语自评分开看；没有同伴反馈的记录，不能当作已验证的互动能力。</p>${entries.map(l=>{const e=memory.lessons[l.id];return `<div class="report-row"><a href="${lessonURL(l.id)}">第 ${l.week} 周周测</a><span>${e?.quiz?`理解题首次 ${esc(e.quiz.first.score)}/3${e.quiz.first.assisted?' · 看过文本':''}`:'尚未答题'} · ${e?.completed?(e.partner?'已做同伴问答':'仅独自练习'):'尚未保存口语自评'}</span></div>`}).join('')}<div class="prompt-box"><h3>隔周再提取</h3><p>不要先点开旧文本。用本阶段第一个主题课的表达，说一段自己的新情况，再检查哪里需要提示。</p><a class="quiet" href="${lessonURL(`w${String(start).padStart(2,'0')}d1`,'review')}">回看第 ${start} 周的复习任务 →</a></div></section>`;}
function recordZone(){return `<div class="record-zone"><button class="record-button" data-act="record" aria-label="开始录音">${icon('mic')}</button><strong id="record-status">点一下，录下你的回答</strong><p id="record-help">录音不会上传；离开步骤前请下载。也可以用手机录音机完成。</p><div id="record-result"></div></div>`;}
function renderPractice(l){
 const progress=practiceProgress(memory,l),entry=memory.lessons[l.id],d=draft(l);
 d.textSeen=true;
 const before=memory;
 if(!entry?.quiz&&!entry?.pendingTextSeen)memory=markTranscriptSeen(memory,l.id);
 memory=savePractice(memory,l,{round:progress.round,touch:true});
 if(memory!==before)persist();
 const next=lessons.slice(lessons.indexOf(l)+1).find(isPracticeLesson);
 app.innerHTML=`<a class="back-link" href="#week/${l.week}">${icon('back')}回到本周课程</a>
 <div class="lesson-heading"><div><h1>${esc(l.title)}</h1><p>${esc(l.englishTitle)} · ${esc(l.goal)}</p></div></div>
 <div class="light-course">
  <section class="white-card lesson-panel"><h2>听对话</h2>${player(l)}${transcript(l)}</section>
  <section class="white-card lesson-panel">
   ${l.phrases.length?`<h2>常用表达</h2>${l.phrases.map((p,i)=>expressionCard(l,p,i)).join('')}`:''}
   <h2>换成你来说</h2>
   <div class="round-buttons">${l.rounds.map((r,i)=>`<button type="button" class="${i===progress.round?'primary':'secondary'}" data-act="practice-round" data-index="${i}" aria-pressed="${i===progress.round}">${i+1}. ${esc(r.title)}</button>`).join('')}</div>
   <div id="practice-round-area">${practiceRound(l,progress.round)}</div>
   <details class="details-card"><summary>录音回听（可选）</summary>${recordZone()}</details>
   <div class="lesson-bottom"><button class="primary" type="button" data-act="practice-done" ${progress.done?'hidden':''}>这段练过了</button><span id="practice-done" role="status">${progress.done?'已记录练习':''}</span><a class="secondary" href="${next?lessonURL(next.id):'#path'}" ${progress.done?'':'hidden'} data-practice-next>${next?'继续下一段':'回到课程目录'}</a></div>
  </section>
 </div>`;
 updatePlayer();
}
function practiceRound(l,index){
 const round=l.rounds[index];
 return `<div class="prompt-box"><p>${esc(round.prompt)}</p><details><summary>需要一点提示</summary><p>${esc(round.hint)}</p></details><details><summary>说完后看参考表达</summary><p lang="en">${esc(round.sample)}</p></details></div>`;
}
function renderLesson(l,step){if(!steps.some(s=>s[0]===step)&&step!=='complete')step='listen';const d=draft(l),lock=['speak','review'].includes(step)&&!canSpeak(l);
 app.innerHTML=`<a class="back-link" href="${l.week?'#week/'+l.week:'#home'}">${icon('back')}${l.week?'回到本周课程':'回到今日学习'}</a><div class="lesson-heading"><div><div class="eyebrow">${l.week?`WEEK ${String(l.week).padStart(2,'0')} / DAY ${l.day}`:'YOUR STARTING POINT'}</div><h1>${esc(l.title)}</h1><p>${esc(l.englishTitle)} · ${esc(l.goal)}</p></div><span class="lesson-level">${types[l.type]} · ${l.minutes} 分钟</span></div><nav class="step-tabs" aria-label="课程步骤">${steps.map(([s,t],i)=>`<a href="${lessonURL(l.id,s)}" class="step-tab ${s===step?'active':''}" ${s===step?'aria-current="step"':''}><b>${i+1}</b>${t}</a>`).join('')}</nav><div class="lesson-grid"><section class="white-card lesson-panel" id="lesson-panel">${lock?`<h2>先完成独立听力尝试</h2><p>${l.id==='diagnostic'?'请先保存听力和阅读辅助后的回答，再进入开口任务。':'先听新对话、提交理解题，再展开示例和表达。'}</p><a class="primary" href="${lessonURL(l.id,'understand')}">去确认听懂</a>`:stepContent(l,step)}</section><aside class="white-card lesson-aside"><h3>今天的小目标</h3><ul class="goal-list">${(restricted(l)&&!firstQuiz(l)?['听出人物的需要与限制','抓住最终确认的信息','提交后再做变化情境下的开口任务']:l.goals).map(g=>`<li>${esc(g)}</li>`).join('')}</ul><div class="aside-line"></div><p class="aside-caption">示范音色：${voice(l)} 美式英语（AI 合成）。<br>录音仅在当前页面内存，不会上传；离开步骤前请下载。</p><div class="aside-line"></div><p class="aside-caption">理解题有参考答案；口语记录来自你的自评和同伴反馈，不自动判定等级。</p></aside></div>`;
 updatePlayer();
}
function transcript(l){const d=draft(l);return `<div class="transcript"><div class="player-actions"><span>点一句，单独听</span><button data-act="translation">${d.translation?'隐藏中文':'显示中文'}</button></div>${l.dialogue.map((v,i)=>`<div class="transcript-line" data-line="${i}"><span class="name">${esc(v.speaker)}</span><div><button class="sentence quiet" data-act="line" data-lesson="${l.id}" data-index="${i}">${esc(v.en)}</button><p class="translation" ${d.translation?'':'hidden'}>${esc(v.zh)}</p></div></div>`).join('')}</div>`;}
function player(l){return `<div class="audio-scene"><div class="speaker-pair">${[...new Set(l.dialogue.map(d=>d.speaker))].slice(0,2).map(s=>`<div class="chat-face">${esc(s[0])}</div>`).join('')}</div><div><h3>${esc(l.englishTitle)}</h3><p>${voice(l)} · 美式 · 合成语音</p></div></div><div class="player"><button type="button" class="play-button" data-act="play" data-playback-icon="play" aria-label="播放对话">${icon('play')}</button><div class="progress-wrap"><input type="range" id="audio-progress" min="0" max="100" step="0.1" value="0" aria-label="音频播放进度"><div class="player-times"><span id="current-time">0:00</span><span id="duration">加载中</span></div></div><button class="speed-button" data-act="speed" aria-label="切换播放速度">${audio.playbackRate}×</button></div><p id="audio-status" class="playback-status" role="status" aria-live="polite">点击播放对话。</p>`;}
function stepContent(l,step){const d=draft(l),diag=l.id==='diagnostic';
 if(step==='listen'){const locked=restricted(l)&&!firstQuiz(l);return `<div class="eyebrow">LISTEN FIRST</div><h2>先听意思，不急着看答案。</h2><p>${diag?'先听两遍，不查词。答完以后，再看文字观察理解是否改善。':restricted(l)?'这是本周的新对话。先听两遍并作答，再查看文本与解析。':'先听两遍，想想他们在做什么，需要解决什么问题。'}</p>${player(l)}<div class="player-actions"><button data-act="transcript" ${locked?'disabled':''} aria-expanded="${!!d.showText}">${icon('text')}${locked?'提交理解题后显示文本':d.showText?'收起对话文本':'需要帮助？展开文本'}</button></div><div id="transcript-area">${d.showText&&!locked?transcript(l):''}</div><div class="lesson-bottom"><span>逐句重听也有帮助，但先抓住整体意思。</span><a class="primary" href="${lessonURL(l.id,'understand')}">听好了，确认一下</a></div>`;}
 if(step==='understand'){const reading=diag&&firstQuiz(l);if(reading&&!d.readingStarted){d.readingStarted=true;d.answers={};d.checked=Number.isInteger(memory.diagnostic.reading);d.textSeen=true;}return `<div class="eyebrow">${reading?'READ AND COMPARE':'CHECK THE MEANING'}</div><h2>${reading?'看过文字后，再核对一次。':'你听懂了哪些信息？'}</h2><p>${reading?'用同一组题观察文字能否帮助理解；这包含重复作答的影响，不能当作标准诊断。':d.textSeen?'你已经看过文本，本次会标记为借助文本作答。':'先选答案，再查看解释。答错也可以继续学习。'}</p>${player(l)}${reading?transcript(l):''}${l.questions.map((q,i)=>`<fieldset class="question-block"><legend>${i+1}. ${esc(q.prompt)}</legend><div class="quiz-options">${q.options.map((o,j)=>`<label class="quiz-option"><input type="radio" name="question-${i}" value="${j}" ${d.answers[i]===j?'checked':''} ${d.checked?'disabled':''}>${esc(o)}</label>`).join('')}</div></fieldset>`).join('')}<div id="quiz-feedback" role="status">${d.checked?quizFeedback(l):''}</div><div class="lesson-bottom"><a class="quiet" href="${lessonURL(l.id,'listen')}">返回听力</a>${d.checked?`<a class="primary" href="${lessonURL(l.id,'speak')}">轮到我开口了</a><button class="secondary" data-act="retry-quiz">再练理解题</button>`:`<button class="primary" data-act="check-quiz">${reading?'保存阅读辅助结果':'提交我的回答'}</button>`}</div>`;}
 if(step==='speak'){return `<div class="eyebrow">MAKE IT YOURS · 约 15 分钟</div><h2>这一次，换成你自己。</h2><p>每轮先说，再看提示。录音回听后，挑一个问题重说一次。</p>${l.phrases.length?`<details class="details-card" ${d.round===0?'open':''}><summary>本课 3 个常用表达</summary>${l.phrases.map((p,i)=>expressionCard(l,p,i)).join('')}</details>`:''}<div id="round-area">${roundContent(l)}</div>${recordZone()}<div class="prompt-box"><h3>听辨与发音 · ${esc(l.pronunciation.focus)}</h3><p>${esc(l.pronunciation.tip)}</p></div><details class="details-card"><summary>检查一个常见表达问题</summary><p class="correction-before">${esc(l.correction.before)}</p><p class="correction-after">${esc(l.correction.after)}</p><p>${esc(l.correction.reason)}</p></details><section class="partner-box"><h3>同伴任务 · 让对方提供新信息</h3><p><strong>你的任务：</strong>${esc(l.partnerTask.roleA)}</p><details><summary>角色 B 信息卡 · 请同伴单独看</summary><p>${esc(l.partnerTask.roleB)}</p></details><p><strong>完成标准：</strong>${esc(l.partnerTask.success)}</p><small>独自练习可以模拟回应，但不能验证临场听懂和互动。</small></section><div class="lesson-bottom"><span>三轮都试过，再保存真实表现。</span><a class="primary" href="${lessonURL(l.id,'review')}">回听与自评</a></div>`;}
 if(step==='review'){const entry=diag?memory.diagnostic:memory.lessons[l.id];return `<div class="eyebrow">NOTICE YOUR PROGRESS</div><h2>记录这一次，你能做到什么。</h2><p>每项选择实际表现。自评不会自动换算为口语分数或 CEFR 等级。</p>${l.rubric.map((r,i)=>`<label class="rating-row"><span>${i+1}. ${esc(r)}</span><select name="rating-${i}" aria-label="目标 ${i+1} 的表现"><option value="">请选择实际表现</option>${['还做不到','需要句子提示','能独立完成，有停顿','能完成并应对一个追问'].map((t,v)=>`<option value="${v}" ${d.ratings[i]===v?'selected':''}>${t}</option>`).join('')}</select></label>`).join('')}<div class="checklist"><label><input type="checkbox" name="spoken" ${d.spoken?'checked':''}>我已经实际开口练过三轮，并回听或自查</label><label><input type="checkbox" name="partner" ${d.partner?'checked':''}>我与同伴完成了信息差问答（独练请不勾选）</label></div><label class="note-label">下次想改进的一点（可选）<textarea name="note" maxlength="500" rows="3" placeholder="例如：没听清时间时，先请求重复">${esc(d.note)}</textarea></label>${entry?.quiz?`<p class="record-summary">理解题首次：${esc(entry.quiz.first.score)}/3${entry.quiz.first.assisted?' · 看过文本':' · 未看文本'}</p>`:''}<div class="prompt-box"><h3>明天，再主动说一次</h3><p>${esc(l.review.prompt)}</p><p><strong>换个情境：</strong>${esc(l.review.transfer)}</p></div>${sourceLinks(l)}${l.phrases.length?`<h3 class="subheading">收藏想复习的表达</h3>${l.phrases.map((p,i)=>expressionCard(l,p,i)).join('')}`:''}<div id="review-feedback" role="status"></div><div class="lesson-bottom"><a class="quiet" href="${lessonURL(l.id,'speak')}">回去再练</a><button class="primary" data-act="complete">保存本次练习</button></div>`;}
 if(diag)return diagnosticResult();
 const entry=memory.lessons[l.id];if(!entry?.completed)return `<h2>先保存你的练习记录</h2><p>完成回顾后，这里会显示本次记录。</p><a class="primary" href="${lessonURL(l.id,'review')}">去回顾</a>`;
 const next=lessons[lessons.findIndex(v=>v.id===l.id)+1];return `<div class="complete-panel"><div class="complete-mark">${icon('check')}</div><div class="eyebrow">ONE SMALL STEP, WELL DONE.</div><h2>本次练习已保存。</h2><p>记录的是练习和自评。明天换个情境，再看看能否独立表达。</p><div class="route-note">${entry.quiz?`理解题首次 ${esc(entry.quiz.first.score)}/3 · `:''}${entry.partner?'已记录同伴问答':'本次为独自练习'}<br>自评：${(entry.ratings||[]).map(v=>['还做不到','需提示','能独立完成','能回应追问'][v]).join(' / ')}</div>${next?`<a class="primary" href="${lessonURL(next.id)}">下一学习日：${esc(next.title)}</a>`:'<a class="primary" href="#path">查看完整学习记录</a>'}<br><a class="quiet" href="#phrases">去表达本复习</a></div>`;
}
function sourceLinks(l){return l.review.sourceIds.length?`<details class="details-card"><summary>本次复习关联 ${l.review.sourceIds.length} 节课 · 先回忆再打开</summary>${l.review.sourceIds.map(id=>`<a class="source-link" href="${lessonURL(id)}">${esc(byId[id]?.title||id)}</a>`).join('')}</details>`:'';}
function roundContent(l){const d=draft(l),r=l.rounds[d.round];return `<div class="prompt-box"><div class="player-actions"><h3>${esc(r.title)}</h3><span>${d.round+1}/3</span></div><p>${esc(r.prompt)}</p><details><summary>需要一点提示</summary><p>${esc(r.hint)}</p></details><details><summary>说完后看参考表达</summary><p lang="en">${esc(r.sample)}</p></details><div class="round-buttons">${l.rounds.map((r,i)=>`<button class="${i===d.round?'primary':'secondary'}" data-act="round" data-index="${i}" aria-pressed="${i===d.round}">第 ${i+1} 轮</button>`).join('')}</div></div>`;}
function quizFeedback(l){const d=draft(l);return `<div class="feedback">${l.questions.map((q,i)=>`<p><strong>${i+1}. ${d.answers[i]===undefined?'参考答案':d.answers[i]===q.answer?'回答正确':'再留意一下'}：${esc(q.options[q.answer])}</strong><br>${esc(q.explanation)}</p>`).join('')}</div>`;}
function checkQuiz(){const l=currentLesson,d=draft(l);if(d.checked)return;if(Object.keys(d.answers).length!==3){toast('请先回答全部 3 题，不确定也可以尝试。');return;}const score=l.questions.reduce((sum,q,i)=>sum+(d.answers[i]===q.answer),0);
 if(l.id==='diagnostic'){const listening=!firstQuiz(l);memory=recordDiagnosticQuiz(memory,score,dateKey());if(listening){d.answers={};d.checked=false;d.showText=true;d.textSeen=true;persist();renderLesson(l,'understand');toast(`已保存听力结果 ${score}/3。现在看文字，再答一次。`);return;}}else memory=recordQuiz(memory,l.id,score,3,d.textSeen,dateKey());
 d.checked=true;persist();renderLesson(l,'understand');toast(`本次理解题 ${score}/3。查看解释，再进入口语练习。`);
}
function diagnosticResult(){const d=memory.diagnostic;if(!d.completed)return `<h2>先完成诊断的三个部分</h2><p>听力、阅读辅助与开口自评都保存后，再查看建议。</p><a class="primary" href="${lessonURL('diagnostic',Number.isInteger(d.reading)?'review':'understand')}">继续诊断</a>`;return `<div class="eyebrow">YOUR STARTING POINT</div><h2>从这里开始，安排练习重点。</h2><div class="diagnostic-scores"><div><b>${esc(d.listening)}/3</b><span>只听声音</span></div><div><b>${esc(d.reading)}/3</b><span>看过文字后</span></div></div><div class="prompt-box"><h3>建议的练习方向</h3><p>${esc(diagnosticAdvice(d))}</p></div><p class="record-summary">口语自评：${(d.ratings||[]).map(n=>['还做不到','需要提示','能独立完成','能应对追问'][n]).join(' / ')}<br>${d.partner?'已做同伴任务':'尚未验证真实互动'}</p><div class="route-note">这是一段短对话的自我观察，题量少且重复作答，不是标准化测评，也不能判定 CEFR 等级。</div><a class="primary" href="${lessonURL('w01d1')}">从第 1 周开始练习</a>`;}
function expressionCard(l,p,i){const id=`${l.id}:p${i}`,saved=memory.saved.includes(id);return `<div class="expression-card"><div><div class="en" lang="en">${esc(p.en)}</div><p>${esc(p.zh)}</p></div><div class="expression-actions"><button class="icon-button" data-act="line" data-lesson="${l.id}" data-index="${p.line}" aria-label="听表达所在示例句：${esc(p.en)}">${icon('volume')}</button><button class="icon-button ${saved?'saved':''}" data-act="save" data-id="${id}" aria-label="${saved?'取消收藏':'收藏'}：${esc(p.en)}" aria-pressed="${saved}">${icon(saved?'check':'bookmark')}</button></div></div>`;}
function renderPhrases(){
 const today=dateKey(),due=new Set(dueReviews(memory,today));
 const cards=memory.saved.map(id=>{
  const [lid,pid]=id.split(':'),l=byId[lid],i=Number(pid.slice(1)),p=l.phrases[i];
  return {due:due.has(id),html:`<article class="white-card recall-card"><span class="eyebrow">${due.has(id)?'今天复习':`下次 ${memory.reviews[id]?.due}`}</span><h3>${esc(p.zh)}</h3><p>不看英文，换成自己的信息说一句。</p><details><summary>说完了，查看参考</summary>${expressionCard(l,p,i)}<p class="example" lang="en">${esc(p.example)}</p><div class="round-buttons"><button class="primary" data-act="recall" data-id="${id}" data-success="yes">独立说出来了</button><button class="secondary" data-act="recall" data-id="${id}" data-success="no">还需要提示</button></div></details><a class="quiet" href="${lessonURL(l.id)}">回到课程：${esc(l.title)}</a></article>`}
 });
 for(const [id,entry] of externalNotebook){
  const isDue=isExternalDue(entry,today),key=esc(id);
  cards.push({due:isDue,html:`<article class="white-card recall-card">
   <span class="eyebrow">${isDue?'今天复习':`下次 ${esc(entry.review.due)}`}</span>
   <h3>${esc(entry.zh)}</h3><p>不看英文，换成自己的信息说一句。</p>
   <details><summary>说完了，查看参考</summary>
    <div class="expression-card"><div class="en" lang="en">${esc(entry.en)}</div></div>
    ${entry.example?`<p class="example" lang="en">${esc(entry.example)}</p>`:''}
    <div class="round-buttons">
     <button class="primary" data-act="external-recall" data-id="${key}" data-success="yes">独立说出来了</button>
     <button class="secondary" data-act="external-recall" data-id="${key}" data-success="no">还需要提示</button>
    </div>
   </details>
   <div class="external-card-actions">
    <a class="quiet" href="${externalPhraseURL(entry)}">${entry.source==='stories'?'回故事听原文':'回词汇练习'}</a>
    <button class="quiet" data-act="external-remove" data-id="${key}">取消收藏</button>
   </div>
  </article>`});
 }
 const dueCount=cards.filter(card=>card.due).length;
 app.innerHTML=`<section class="page-intro"><div class="eyebrow">WORDS YOU CAN ACTUALLY USE</div><h1>属于你的日常表达。</h1><p>先看情境，自己说一句，再展开参考。按实际回忆安排下次复习。</p></section>
 <div class="route-note">已收藏 ${cards.length} 句 · 今天待复习 ${dueCount} 句。成功回忆后按 1、3、7、14、30 天间隔复习；需要提示时回到次日。</div>
 ${cards.length?`<div class="phrase-grid">${cards.sort((a,b)=>Number(b.due)-Number(a.due)).map(card=>card.html).join('')}</div>`:
 `<div class="white-card empty-state">${icon('bookmark')}<h2>从一句对你有用的话开始。</h2><p>在课程、故事或词汇练习中点击收藏，表达就会留在这里。</p><a class="primary" href="${lessonURL('w01d1')}">去练习第一课</a></div>`}`;
}
function saveExpression(id){const [lid,p]=id.split(':');if(!byId[lid]?.phrases[Number(p?.slice(1))])return;const had=memory.saved.includes(id);memory.saved=had?memory.saved.filter(v=>v!==id):[...memory.saved,id];persist();if(route()==='phrases')renderPhrases();else document.querySelectorAll('[data-act="save"]').forEach(b=>{if(b.dataset.id===id){b.classList.toggle('saved',!had);b.setAttribute('aria-pressed',String(!had));b.setAttribute('aria-label',`${had?'收藏':'取消收藏'}：${byId[lid].phrases[Number(p.slice(1))].en}`);b.innerHTML=icon(had?'bookmark':'check');}});toast(had?'已移出表达本':'已加入表达本；复习时先主动回忆。');}
function completeLesson(){const l=currentLesson,d=draft(l),feedback=$('#review-feedback');if(!d.spoken||d.ratings.some(n=>n===null)||!firstQuiz(l)){feedback.innerHTML='<div class="feedback warning">请先完成理解题、三轮开口练习，并为三项目标选择实际表现。还做不到也可以如实记录。</div>';return;}
 const report={ratings:d.ratings,partner:d.partner,note:d.note};if(l.id==='diagnostic'){memory.diagnostic={...memory.diagnostic,...report,completed:true,date:dateKey()};}else{memory=finishLesson(memory,l.id,report,dateKey());for(let i=0;i<l.phrases.length;i++){const id=`${l.id}:p${i}`;if(memory.saved.includes(id)&&!memory.reviews[id])memory=reviewPhrase(memory,id,false,dateKey());}}
 persist();go(`lesson/${l.id}/complete`);
}
function updatePlayer(){
 const b=$('[data-act="play"]'),active=!audio.paused&&!audio.ended;
 const busy=active&&audio.readyState<3;
 if(b){
  const name=active?'pause':'play';
  // Progress events must not replace the SVG between pointer-down and pointer-up.
  if(b.dataset.playbackIcon!==name){
   b.innerHTML=icon(name);b.dataset.playbackIcon=name;
   b.setAttribute('aria-label',active?'暂停对话':'播放对话');
  }
  if(b.dataset.playbackBusy!==String(busy)){
   b.dataset.playbackBusy=String(busy);b.setAttribute('aria-busy',String(busy));
  }
 }
 const status=$('#audio-status');
 if(status){
  const state=audio.error?'error':audio.ended?'ended':busy?'loading':active?'playing':audio.currentTime>0?'paused':'idle';
  if(status.dataset.playbackState!==state){
   status.dataset.playbackState=state;
   status.textContent={idle:'点击播放对话。',loading:'正在加载音频，再点一次可取消。',playing:'正在播放，再点一次可暂停。',paused:'已暂停，点击继续播放。',ended:'播放结束，点击可重新播放。',error:'音频暂时无法播放，请刷新后重试。'}[state];
  }
 }
 const progress=$('#audio-progress');
 if(progress){progress.value=audio.duration?audio.currentTime/audio.duration*100:0;$('#current-time').textContent=formatTime(audio.currentTime);$('#duration').textContent=Number.isFinite(audio.duration)?formatTime(audio.duration):'加载中';}
}
async function playFull(){
 prepareDemoPlayback();lineAudio.pause();segmentEnd=null;
 const token=++audioRequest;
 if(!audio.paused){audio.pause();updatePlayer();return;}
 try{
  if(audio.ended)audio.currentTime=0;
  const pending=audio.play();updatePlayer();await pending;
 }catch{if(token===audioRequest){audio.pause();toast('音频暂时无法播放，请刷新后重试。')}}
 if(token===audioRequest)updatePlayer();
}
async function playLine(id,index){prepareDemoPlayback();stopPlayback();const token=audioRequest;try{const meta=await getTimeline(id);if(token!==audioRequest)return;const line=meta.lines[index];if(!line)throw Error();lineAudio.src=`audio/course/${id}.mp3`;lineAudio.playbackRate=audio.playbackRate;lineAudio.currentTime=line.start;segmentEnd=line.end;await lineAudio.play();}catch{if(token===audioRequest)toast('这句音频暂时无法播放，请重试。')}}
async function toggleRecording(){
 if(recording){stopRecording({keepResult:true});return;}
 const button=$('[data-act="record"]'),status=$('#record-status'),help=$('#record-help');
 if(window.isSecureContext===false){
  status.textContent='需要安全连接才能使用麦克风';
  help.textContent='请通过 HTTPS 打开课程，或使用手机录音机。';
  return;
 }
 if(!navigator.mediaDevices?.getUserMedia||!window.MediaRecorder){
  status.textContent='当前浏览器暂不支持页面录音';
  help.textContent='可以用手机录音机完成，课程其他部分仍可正常学习。';
  return;
 }
 stopPlayback();
 stopRecordedPlayback();
 const session={button,status,help,stream:null,recorder:null,timer:null};
 const ownRoute=route(),lessonId=currentLesson.id;
 const isCurrent=()=>recording===session&&route()===ownRoute;
 recording=session;
 button.disabled=false;
 button.innerHTML=icon('stop');
 button.setAttribute('aria-label','取消录音');
 status.textContent='请允许使用麦克风';
 help.textContent='再次点击可取消录音请求。';
 try{
  session.stream=await navigator.mediaDevices.getUserMedia({audio:true});
  if(!isCurrent()){releaseRecording(session);return;}
  const mimeType=['audio/mp4','audio/webm'].find(type=>MediaRecorder.isTypeSupported?.(type));
  const localRecorder=new MediaRecorder(session.stream,mimeType?{mimeType}:undefined);
  session.recorder=localRecorder;
  const chunks=[];
  localRecorder.ondataavailable=event=>{if(event.data.size)chunks.push(event.data);};
  localRecorder.onstop=()=>{
   releaseRecording(session);
   if(!isCurrent())return;
   recording=null;
   resetRecordButton(button);
   if(!chunks.length){
    status.textContent='没有录到声音，请再试一次';
    help.textContent='请检查麦克风，再重新录音。';
    return;
   }
   const blob=new Blob(chunks,{type:localRecorder.mimeType||chunks[0].type||mimeType||'audio/webm'});
   recordUrl=URL.createObjectURL(blob);
   const ext=blob.type.includes('mp4')?'m4a':blob.type.includes('ogg')?'ogg':'webm';
   status.textContent='回听一次，挑一个地方再试';
   $('#record-result').innerHTML=`<audio controls src="${recordUrl}"></audio><a href="${recordUrl}" download="fluent-${lessonId}.${ext}">下载这次录音</a>`;
   recordedAudio=$('#record-result audio');
   const playback=recordedAudio;
   playback.addEventListener('play',()=>{
    if(playback!==recordedAudio||playback.paused)return;
    if(recording)playback.pause();
    else stopPlayback();
   });
   help.textContent='按本课目标检查表达是否清楚；此处不自动评分。';
  };
  localRecorder.onerror=()=>{
   if(!isCurrent()){releaseRecording(session);return;}
   stopRecording();
   resetRecordButton(button);
   status.textContent='录音出现问题，请重试';
   help.textContent='请检查麦克风，再重新录音。';
  };
  // Permission can resolve after the learner starts another audio source.
  stopPlayback();
  localRecorder.start();
  clearRecordedPlayback();
  const start=Date.now();
  button.classList.add('recording');
  button.setAttribute('aria-label','停止录音');
  $('#record-result').innerHTML='';
  status.textContent='正在录音 · 0:00';
  help.textContent='说完后点击停止，最长录制 2 分钟。';
  session.timer=setInterval(()=>{
   if(!isCurrent())return;
   const seconds=(Date.now()-start)/1000;
   status.textContent=`正在录音 · ${formatTime(seconds)}`;
   if(seconds>=120)finishRecording(session);
  },300);
 }catch(error){
  releaseRecording(session);
  if(!isCurrent())return;
  recording=null;
  resetRecordButton(button);
  switch(error.name){
   case 'NotAllowedError':
   case 'SecurityError':
    status.textContent='麦克风权限尚未开启';
    help.textContent='可在浏览器设置中开启麦克风后重试，或使用手机录音机。';
    break;
   case 'NotFoundError':
    status.textContent='没有找到麦克风';
    help.textContent='连接或启用麦克风后重试，或使用手机录音机。';
    break;
   case 'NotReadableError':
    status.textContent='麦克风可能被占用或无法读取';
    help.textContent='关闭其他正在使用麦克风的应用后重试。';
    break;
   default:
    status.textContent='暂时无法使用麦克风';
    help.textContent='请检查麦克风，再重新录音。';
  }
 }
}

document.addEventListener('click',event=>{const b=event.target.closest('[data-act]');if(!b)return;const act=b.dataset.act,l=currentLesson,d=l?draft(l):null;
 if(act==='backup-export'){exportLearning();return;}
 if(act==='backup-restore'){applyLearningBackup();return;}
 if(act==='external-retry'&&b.closest('.empty-state')){render();return;}
 if(externalSource(route().split('/')[0]))return;
 if(route()==='phrases'&&(act==='external-recall'||act==='external-remove')){
  const next=new Map(externalNotebook);
  const changed=act==='external-recall'?reviewExternalPhrase(next,b.dataset.id,b.dataset.success==='yes',dateKey()):next.delete(b.dataset.id);
  if(changed&&commitExternalNotebook(next)){
   toast(act==='external-recall'?'已安排下一次复习。':'已移出表达本');
   renderPhrases();
  }
  return;
 }
 if(act==='play')playFull();else if(act==='line')playLine(b.dataset.lesson,Number(b.dataset.index));else if(act==='speed'){const rates=[1,.85,1.15];audio.playbackRate=rates[(rates.indexOf(audio.playbackRate)+1)%rates.length];b.textContent=`${audio.playbackRate}×`;}
 else if(act==='transcript'){if(restricted(l)&&!firstQuiz(l))return;d.showText=!d.showText;if(d.showText){d.textSeen=true;if(l.id!=='diagnostic'){memory=markTranscriptSeen(memory,l.id);persist();}}$('#transcript-area').innerHTML=d.showText?transcript(l):'';b.textContent=d.showText?'收起对话文本':'需要帮助？展开文本';b.setAttribute('aria-expanded',String(d.showText));}
 else if(act==='translation'){d.translation=!d.translation;document.querySelectorAll('.translation').forEach(el=>el.hidden=!d.translation);b.textContent=d.translation?'隐藏中文':'显示中文';}
 else if(act==='save')saveExpression(b.dataset.id);else if(act==='check-quiz')checkQuiz();else if(act==='retry-quiz'){d.answers={};d.checked=false;d.textSeen=true;renderLesson(l,'understand');}
 else if(act==='practice-round'&&isPracticeLesson(l)&&$('#practice-round-area')){
  const round=Number(b.dataset.index);
  memory=savePractice(memory,l,{round});persist();
  const progress=practiceProgress(memory,l);
  $('#practice-round-area').innerHTML=practiceRound(l,progress.round);
  app.querySelectorAll('[data-act="practice-round"]').forEach(button=>{
   const selected=Number(button.dataset.index)===progress.round;
   button.classList.toggle('primary',selected);button.classList.toggle('secondary',!selected);
   button.setAttribute('aria-pressed',String(selected));
  });
 }else if(act==='practice-done'&&isPracticeLesson(l)&&$('#practice-done')){
  memory=savePractice(memory,l,{done:true});persist();
  b.hidden=true;
  $('#practice-done').textContent='已记录练习';
  const next=$('[data-practice-next]');next.hidden=false;next.focus();
 }
 else if(act==='round'){d.round=Number(b.dataset.index);$('#round-area').innerHTML=roundContent(l);const expressions=$('.details-card');if(expressions)expressions.open=false;}
 else if(act==='record')toggleRecording();else if(act==='complete')completeLesson();else if(act==='recall'){memory=reviewPhrase(memory,b.dataset.id,b.dataset.success==='yes',dateKey());persist();renderPhrases();toast('已安排下一次复习。');}
});
document.addEventListener('change',event=>{if(!currentLesson)return;const d=draft(currentLesson),t=event.target;if(t.name?.startsWith('question-'))d.answers[Number(t.name.split('-')[1])]=Number(t.value);if(t.name?.startsWith('rating-'))d.ratings[Number(t.name.split('-')[1])]=t.value===''?null:Number(t.value);if(t.name==='spoken')d.spoken=t.checked;if(t.name==='partner')d.partner=t.checked;});
document.addEventListener('input',event=>{if(event.target.id==='audio-progress'&&Number.isFinite(audio.duration))audio.currentTime=audio.duration*Number(event.target.value)/100;if(event.target.name==='note'&&currentLesson)draft(currentLesson).note=event.target.value;});
['timeupdate','loadedmetadata','play','pause','ended','waiting','playing','error','emptied'].forEach(type=>audio.addEventListener(type,updatePlayer));
lineAudio.addEventListener('timeupdate',()=>{if(segmentEnd!==null&&lineAudio.currentTime>=segmentEnd){lineAudio.pause();segmentEnd=null;}});
document.addEventListener('visibilitychange',()=>{if(document.hidden)pauseCourseMedia();});
window.addEventListener('hashchange',()=>{if(course)render()});window.addEventListener('pagehide',cleanup);window.addEventListener('pageshow',event=>{if(event.persisted&&course)render();});
async function start(){try{installMobileInput({window,document});languageControls=await initLanguage({document,storage:{getItem:key=>localStorage.getItem(key)},notify:toast});themeControls=createThemeController({root:document.documentElement,media:window.matchMedia('(prefers-color-scheme: dark)'),storage:{getItem:key=>localStorage.getItem(key),setItem:(key,value)=>localStorage.setItem(key,value)},notify:toast});const r=await fetch('course.json');if(!r.ok)throw Error('course');course=await r.json();lessons=course.weeks.flatMap(w=>w.lessons.map(l=>({...l,week:w.week})));byId=Object.fromEntries([...lessons,course.diagnostic].map(l=>[l.id,l]));externalNotebook=restoreExternalNotebook(readStorage(EXTERNAL_NOTEBOOK_KEY));memory=restoreState(readStorage('fluent-course-v2'),readStorage('fluent-preview-v1'),lessons);persist();document.querySelectorAll('[data-icon]').forEach(el=>el.outerHTML=icon(el.dataset.icon));render();}catch(err){
 const english=document.documentElement.lang==='en';
 if(english&&!languageControls){document.title='Fluent · Connection needed';document.querySelectorAll('.sidebar,.topbar,footer,#module-dialog').forEach(el=>el.style.display='none');document.querySelector('.app-shell').style.marginLeft='0'}
 app.innerHTML=english?'<div class="white-card empty-state"><h1>Learning content could not load</h1><p>Please check your connection and try again. Your saved learning records are preserved.</p><button class="primary" onclick="location.reload()">Try again</button></div>':'<div class="white-card empty-state"><h1>课程暂时没有加载成功</h1><p>请检查网络后重试；也可以在系统浏览器打开本站。刷新不会主动清除已保存的学习记录。</p><button class="primary" onclick="location.reload()">重新加载</button></div>';console.error(err);}}
function renderMethod(){app.innerHTML=`<section class="page-intro"><div class="eyebrow">LESS PRESSURE. MORE CONVERSATION.</div><h1>把“知道”，慢慢变成“会用”。</h1><p>这里的每一步练习，都为下一次真实的对话做准备。</p></section><section class="white-card learning-guide"><h2>让单词留在记忆里的练法</h2><ol><li><strong>先弄懂：</strong>只学当前情景中的一个意思，听自然短句，把声音与用途联系起来。</li><li><strong>再想起：</strong>撤掉英文，从场景试着说。卡住时看一点提示；看答案后隔几个项目再试。</li><li><strong>换着用：</strong>换成自己的食物、地点或安排，明天用另一道题再回忆。</li></ol><p>每天词汇练习约 10–15 分钟；到期复习多时少加新词。听懂、无提示想起与开口自评分别记录。词条可查询不代表全部词义已经完成场景教学。</p><div class="storage-actions"><a class="primary" href="#vocabulary">开始场景记忆</a><a class="secondary" href="#stories">在故事中再遇见</a><a class="quiet" href="#phrases">复习收藏表达</a></div></section><div class="method-grid">${[
 ['headphones','先听意思，再看文本','先判断发生了什么，再定位没听懂的地方。核对文本后重新听，让声音与意思对应起来。','听力过程指导研究','https://onlinelibrary.wiley.com/doi/10.1111/j.1467-9922.2009.00559.x'],
 ['chat','把表达，放进自己的生活','学会一句话后，换成自己的城市、职业或兴趣。再换个问题，试试能不能接得上。','语块教学研究','https://files.eric.ed.gov/fulltext/EJ1174049.pdf'],
 ['repeat','隔一天，再主动说一次','复习时先不看答案，尝试说出来。忘了就给自己一点提示，再试。重复练习不必都挤在一天。','间隔练习元分析','https://onlinelibrary.wiley.com/doi/abs/10.1111/lang.12479'],
 ['sun','说清楚，比像谁更重要','以对方能理解、交流能继续为目标。保留自己的声音，同时练习会影响理解的发音和表达。','CEFR 语音能力说明','https://www.coe.int/en/web/common-european-framework-reference-languages/phonological-competence']
].map(m=>`<article class="white-card method-card">${icon(m[0])}<h3>${m[1]}</h3><p>${m[2]}</p><a href="${m[4]}" target="_blank" rel="noopener noreferrer">${m[3]}</a></article>`).join('')}</div><div class="route-note" style="margin-top:25px">这是一套 12 周听说练习课程。研究为练习设计提供依据，具体课程效果仍需要通过试学和新任务测评验证。理解题按答案记录；口语使用自评与同伴核验，不生成自动发音分数。</div>`;}

function downloadBackup(file) {
 const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'}));
 const link=document.createElement('a');link.href=url;link.download=`fluent-${file.format==='fluent-learning-raw-snapshot'?'raw-snapshot':'learning'}-${dateKey()}.json`;
 document.body.append(link);link.click();link.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
function exportLearning() {
 try {downloadBackup(createBackup(localStorage));toast('学习记录文件已准备下载，请保存好。');}
 catch(error){toast(error.message||'暂时无法导出，请检查浏览器存储权限。');}
}
function renderProgress() {
 app.innerHTML=`<section class="page-intro"><div class="eyebrow">KEEP YOUR LEARNING</div><h1>把练习记录，带在身边。</h1><p>课程、故事、词汇和表达本保存在当前浏览器。换设备或清理浏览器前，可以导出一份备份。</p></section>
 <div class="method-grid"><section class="white-card method-card"><h2>保存一份备份</h2><p>导出课程进度、词汇回忆记录、个人线索和收藏的表达。文件不包含录音；不上传到服务器。</p><button class="primary" data-act="backup-export">导出学习记录</button></section>
 <section class="white-card method-card"><h2>在这里继续学习</h2><p>选择此前导出的 JSON 文件，先查看包含哪些记录。恢复会替换文件中对应模块的当前记录，其余模块保留。</p><label class="backup-file">选择学习记录文件<input id="backup-file" type="file" accept=".json,application/json"></label><div id="backup-preview" role="status" aria-live="polite"></div></section></div>
 <div class="route-note learning-route">不同设备、不同浏览器与不同网址的记录不会自动同步。请保留备份文件；恢复前也会下载当前记录的原始快照；快照保留损坏数据供排查，不可直接作为备份导入。</div>`;
}
async function previewLearningBackup(input) {
 const file=input.files?.[0],token=++backupRead;pendingBackup=null;
 const preview=$('#backup-preview');if(!preview||!file)return;
 preview.textContent='正在检查备份…';
 try {
  if(file.size>5_000_000)throw Error('请选择小于 5 MB 的学习记录文件。');
  const parsed=parseBackup(await file.text());
  if(token!==backupRead||route()!=='progress')return;
  pendingBackup=parsed;
  preview.innerHTML=`<p><strong>可恢复 ${Object.keys(parsed.records).length} 类记录</strong></p><ul>${Object.keys(parsed.records).map(key=>`<li>${esc(BACKUP_SECTIONS[key])}</li>`).join('')}</ul><button class="secondary" data-act="backup-restore">保存原始快照并恢复此文件</button>`;
 }catch(error){if(token===backupRead&&route()==='progress')preview.textContent=error.message||'无法读取这个文件。';}
}
function applyLearningBackup() {
 if(!pendingBackup||route()!=='progress')return;
 try {
  downloadBackup(createSafetySnapshot(localStorage));
  restoreBackup(localStorage,pendingBackup);pendingBackup=null;
  $('#backup-preview').innerHTML='<p>恢复成功。重新打开页面后继续学习。</p><a class="primary" href="'+esc(location.pathname)+'#home">打开学习首页</a>';
  // A full reload releases module caches and reads the restored records consistently.
  setTimeout(()=>location.reload(),800);
 }catch(error){toast(error.message||'暂时无法恢复，当前记录未改动。');}
}
document.addEventListener('change',event=>{if(event.target.id==='backup-file')previewLearningBackup(event.target);});

start();
