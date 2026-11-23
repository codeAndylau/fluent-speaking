const object = value => value && typeof value === 'object' && !Array.isArray(value);
const clone = value => JSON.parse(JSON.stringify(value));
const datePattern = /^\d{4}-\d{2}-\d{2}$/;
export function restoreState(current, legacy, lessons) {
  const s = {version:2,saved:[],lessons:{},diagnostic:{},reviews:{},dates:[]};
  const ids = new Set(lessons.map(l => l.id));
  const validPhrase = id => typeof id === 'string' && ids.has(id.split(':')[0]) && /:p[0-2]$/.test(id);
  if (object(current)) {
    if (object(current.lessons)) for (const [id, entry] of Object.entries(current.lessons)) {
      if (ids.has(id) && object(entry)) s.lessons[id] = entry;
    }
    if (Array.isArray(current.saved)) s.saved = [...new Set(current.saved.filter(validPhrase))];
    if (object(current.diagnostic)) s.diagnostic = current.diagnostic;
    if (object(current.reviews)) for (const [id, entry] of Object.entries(current.reviews)) {
      if (validPhrase(id) && object(entry) && datePattern.test(entry.due)) s.reviews[id] = entry;
    }
    if (Array.isArray(current.dates)) s.dates = [...new Set(current.dates.filter(d => typeof d === 'string' && datePattern.test(d)))];
  } else if (object(legacy)) {
    const map = {from:'w01d1:p0',about:'w01d1:p1',again:'w01d1:p2'};
    if (Array.isArray(legacy.saved)) s.saved = [...new Set(legacy.saved.map(id => map[id]).filter(validPhrase))];
    if (Array.isArray(legacy.dates)) s.dates = legacy.dates.filter(d => typeof d === 'string' && datePattern.test(d));
    if (legacy.completed && ids.has('w01d1')) s.lessons.w01d1 = {completed:true,completedDate:s.dates[0],migrated:true};
  }
  return s;
}
export function finishLesson(state,id,report,date) {
  const s = clone(state), previous = s.lessons[id] || {};
  s.lessons[id] = {...previous,...report,completed:true,completedDate:previous.completedDate || date,lastPracticed:date};
  s.dates = [...new Set([...s.dates,date])];
  return s;
}
export function markTranscriptSeen(state,id) {
  const s = clone(state);
  s.lessons[id] = {...s.lessons[id],pendingTextSeen:true};
  return s;
}
export function recordDiagnosticQuiz(state,score,date) {
  const s = clone(state), d = s.diagnostic;
  if (!Number.isInteger(d.listening)) {
    d.listening = score;
    d.date = date;
  } else if (!Number.isInteger(d.reading)) {
    d.reading = score;
  } else {
    d.lastPractice = {score,date};
  }
  return s;
}
export function recordQuiz(state,id,score,total,assisted,date) {
  const s = clone(state), {pendingTextSeen,...entry} = s.lessons[id] || {};
  const attempt = {score,total,assisted:!!(assisted || pendingTextSeen),date};
  s.lessons[id] = {...entry,quiz:{first:entry.quiz?.first || attempt,last:attempt,attempts:(entry.quiz?.attempts || 0)+1}};
  return s;
}
export const nextLesson = (s,lessons) => lessons.find(l => !s.lessons[l.id]?.completed) || null;
export const dueReviews = (s,date) => s.saved.filter(id => !s.reviews[id] || s.reviews[id].due <= date);
export function reviewPhrase(state,id,success,date) {
  const s = clone(state), count = success ? (s.reviews[id]?.count || 0)+1 : 0;
  const days = success ? [1,3,7,14,30][Math.min(count-1,4)] : 1;
  const [y,m,d] = date.split('-').map(Number), next = new Date(y,m-1,d+days,12);
  const due = `${next.getFullYear()}-${String(next.getMonth()+1).padStart(2,'0')}-${String(next.getDate()).padStart(2,'0')}`;
  s.reviews[id] = {count,due,last:date,success:!!success};
  return s;
}
export function diagnosticAdvice(d) {
  if (d.reading <= 1) return '先补基础：从第 1 周开始，结合中文理解句意，再把每句拆成短语反复听说。每天新表达控制在 3 个。';
  if (d.listening <= 1 && d.reading >= 2) return '重点练听辨：你借助文字理解得更好。每天先盲听、再对照文本找声音变化，最后关掉文本重听并复述。';
  if ((d.ratings || []).some(n => n < 2)) return '重点练提取与开口：保留三轮输出，从句框到无提示回答，并每周安排一次同伴问答。';
  return '从第 1 周快速验证熟悉场景，把时间放在新条件和追问上；用每周新任务检查能否迁移。';
}
