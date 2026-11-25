export function selectTodayLesson(lessons,memory){
 const ordinary=lessons.filter(l=>!['assessment','diagnostic'].includes(l.type));
 const unfinished=ordinary.filter(l=>!memory.lessons?.[l.id]?.practiceDone&&!memory.lessons?.[l.id]?.completed);
 const resumed=unfinished.filter(l=>Number.isFinite(memory.lessons?.[l.id]?.practiceUpdatedAt)).sort((a,b)=>memory.lessons[b.id].practiceUpdatedAt-memory.lessons[a.id].practiceUpdatedAt);
 return resumed[0]||unfinished[0]||ordinary[0];
}
export function todayHTML({lessons,memory,esc,due=0}){
 const l=selectTodayLesson(lessons,memory);
 if(!l)return '<h1>今天</h1><a class="primary" href="#library">打开内容库</a>';
 const started=!!memory.lessons?.[l.id],sample=l.dialogue?.[0]?.en||l.englishTitle;
 return `<section class="light-today"><p class="eyebrow">A LITTLE ENGLISH, EVERY DAY</p><h1>今天，从这句话开始。</h1><p class="light-caption">约 10–15 分钟，想多练时再继续。</p><article class="today-practice"><span class="pill">日常口语</span><h2>${esc(l.englishTitle)}</h2><blockquote lang="en">${esc(sample)}</blockquote><p>${esc(l.goal)}</p><a class="primary" href="#lesson/${encodeURIComponent(l.id)}/practice">${started?'继续这段练习':'开始听与说'} →</a><small>听对话，换着说；进度自动保存。</small></article>${due?'<a class="light-review" href="#phrases">收藏的表达可以复习了 →</a>':''}<a class="source-link" href="#library">想换个内容？去内容库 →</a></section>`;
}
export function libraryHTML({esc}){
 const cards=[['#path','口语场景','从一句问候，到安排、点餐和表达意见。','72 个学习日'],['#vocabulary','单词与搭配','在句子里理解，隔几个词再回想。','7,000 词'],['#stories','故事听读','连续听一章，点一句重听，想练时再跟读。','24 章有声故事']];
 return `<section class="page-intro"><div class="eyebrow">FIND SOMETHING TO SAY</div><h1>内容库</h1><p>选你现在想听、想说的内容。</p></section><div class="light-library">${cards.map(([href,title,desc,count])=>`<a class="white-card library-card" href="${href}"><span class="eyebrow">${esc(count)}</span><h2>${esc(title)}</h2><p>${esc(desc)}</p><span class="library-arrow" aria-hidden="true">↗</span></a>`).join('')}</div><section class="light-extras"><h2>按需要使用</h2><a class="source-link" href="#vocabulary/dictionary">查单词、短语与词频来源 →</a><a class="source-link" href="#diagnostic">入门诊断（可选） →</a><a class="source-link" href="#conversation">Nuance 外部对话练习 →</a><a class="source-link" href="#guide">使用攻略 →</a></section>`;
}
export function meHTML({memory,esc}){
 const entries=Object.values(memory.lessons||{}),practiced=entries.filter(e=>e.practiceDone||e.completed).length;
 return `<section class="page-intro"><div class="eyebrow">YOUR LEARNING SPACE</div><h1>我的</h1><p>已练过 ${practiced} 段课程。随时可以回来再练。</p></section><section class="white-card light-account"><a href="#phrases"><strong>收藏与复习</strong><span>把想用的表达留在这里 →</span></a><a href="#progress"><strong>记录备份</strong><span>导出或恢复学习记录 →</span></a><a href="#settings"><strong>设置</strong><span>主题、皮肤与中英文 →</span></a><a href="#diagnostic"><strong>入门诊断（可选）</strong><span>找到你的听说起点 →</span></a><a href="#guide"><strong>使用攻略</strong><span>需要帮助时再看 →</span></a></section><p class="light-caption">练过记录与测验成绩分别保存，口语自评不自动换算等级。</p>`;
}
