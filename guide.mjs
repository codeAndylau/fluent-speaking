const pages=[
 ['01','今日学习','#home','每天从这里进入','接着未完成的课往下学，查看表达本待复习数量。','选一个今天能完成的任务；词汇与口语不必同一天全部做。'],
 ['02','入门诊断','#diagnostic','第一次使用时','先听、再借助文字理解，最后实际开口，观察自己卡在哪里。','听不清先练声音；看懂说不出就把时间放在主动回忆。'],
 ['03','学习路径','#path','系统练口语','12 周、72 个学习日。主题练习 → 跨课复习 → 新任务周测。','进入一课依次听、理解、说、回顾；每周留一次真实问答。'],
 ['04','词汇练习','#vocabulary','把认识的词变成能用的词','从具体场景理解一个词义，听自然句，再撤掉答案回忆并换场合表达。','先复习到期词，再加少量新词；卡住时逐步看提示。'],
 ['05','故事听说','#stories','在连续语境中再次遇词','24 章双语有声书。整章听意思，逐句核对，跟读、复述和角色练习。','先用自己的话说发生了什么，再回看原文；收藏真正想用的表达。'],
 ['06','表达本','#phrases','隔天把表达叫回来','收藏课程、故事和词汇中的表达。先看场景回忆，再展开英文。','如实标记是否需要提示，让下一次复习安排更符合实际。'],
 ['07','学习方法','#method','想知道为什么这样练','理解听辨、语块、提取和间隔练习的设计依据与适用范围。','用换题和延迟回忆检验自己，别把看过或自评当作已掌握。'],
 ['08','记录备份','#progress','换设备／清理浏览器前','将课程、故事、词汇及收藏导出为 JSON，再到另一浏览器恢复。','定期保存文件。网站不自动跨设备同步，录音不包含在备份中。'],
 ['09','设置','#settings','调整学习环境','切换明暗、配色皮肤和中英文。英文模式覆盖界面、课程提示和练习内容。','偏好保存在当前浏览器；切换语言前先保存未提交的输入和临时录音。']
];
export function guideHTML(){return `<section class="guide-intro"><div class="eyebrow">YOUR LEARNING COMPASS</div><h1>先看懂这张地图，<br>再走好今天的一小步。</h1><p>一条口语主线，两条练习支线。所有内容最终都回到：<strong>听得懂，想得起，说得出。</strong></p><div class="guide-links"><a class="primary" href="#diagnostic">第一次来 · 找到起点</a><a class="secondary" href="#home">已经开始 · 继续学习</a></div></section>
 <nav class="guide-jump" aria-label="攻略目录"><a href="#guide/map">学习地图</a><a href="#guide/pages">页面说明</a><a href="#guide/routine">每天怎么练</a><a href="#guide/help">使用小贴士</a></nav>
 <section id="guide-map" class="guide-section"><div class="section-heading"><h2>整个学习库，如何连起来</h2><span>点击卡片可直接进入</span></div><div class="learning-map" aria-label="口语主线与词汇故事支线"><div class="map-main"><a href="#home"><small>每天的起点</small><b>今日学习</b></a><span aria-hidden="true">→</span><a href="#diagnostic"><small>第一次先定位</small><b>入门诊断</b></a><span aria-hidden="true">→</span><a href="#path"><small>12 周系统练习</small><b>听 → 理解 → 说 → 回顾</b></a></div><div class="map-branches"><a href="#vocabulary"><small>需要更牢的词汇记忆时</small><b>词汇场景练习</b><p>理解词义 · 听句子 · 隐去答案 · 换情景说</p></a><a href="#stories"><small>需要更多真实语境时</small><b>故事听说</b><p>整章听读 · 逐句跟读 · 复述与角色练习</p></a></div><div class="map-return"><span aria-hidden="true">↓</span><a href="#phrases"><b>收藏到表达本 → 隔天主动回忆 → 回到真实交流</b><small>忘了就给一点提示，再隔一段时间尝试</small></a></div></div></section>
 <section id="guide-pages" class="guide-section"><div class="section-heading"><h2>每个页面，负责一件事</h2></div><div class="guide-pages">${pages.map(([n,name,href,when,what,next])=>`<article class="white-card guide-page"><span class="guide-number">${n}</span><div><a href="${href}"><h3>${name} ↗</h3></a><small>${when}</small><p>${what}</p><details><summary>做完以后怎么继续</summary><p>${next}</p></details></div></article>`).join('')}</div></section>
 <section id="guide-routine" class="guide-section"><div class="section-heading"><h2>按今天的时间，选一条路</h2></div><div class="routine-grid"><article class="white-card"><span class="eyebrow">10–15 分钟</span><h3>记住并用出几个词</h3><ol><li>3 分钟：先回忆到期项目。</li><li>3 分钟：看懂新情景，听懂短句。</li><li>4 分钟：撤掉答案，尝试提取。</li><li>2 分钟：换成自己的情况说一句。</li></ol><a class="primary" href="#vocabulary">开始词汇练习</a></article><article class="white-card"><span class="eyebrow">约 30 分钟</span><h3>完成一个口语任务</h3><ol><li>约 7 分钟：先听信息，再核对。</li><li>约 15 分钟：从句架到独立开口。</li><li>约 8 分钟：回听、自评和复习。</li></ol><p>计时是练习建议，不是必须看完的录播时长。</p><a class="secondary" href="#path">选择一课</a></article><article class="white-card"><span class="eyebrow">今天有些累</span><h3>只把旧表达叫回来</h3><p>少学一点也可以。先复习几个到期项目，不必一次清空所有待复习内容。</p><a class="secondary" href="#phrases">打开表达本</a></article></div></section>
 <section id="guide-help" class="guide-section white-card guide-help"><h2>顺手使用的小攻略</h2>${[
 ['听不懂时怎么办？','先听大意，再展开中文或原文核对。随后收起文字重新听，别把“看懂”记成“听懂”。'],
 ['回忆不出来怎么办？','先用意思提示，再用首音或句架提示，最后再看参考。看到答案后要隔开几个项目再试；有提示的成功不会算无提示提取。'],
 ['必须打字或开麦吗？','可以先口头尝试，再核对目标表达；自动核对只检查输入的目标词／搭配。自由口语不自动评分。录音回听可选，不开启麦克风也能练。'],
 ['需要在 12 周内学完 7000 词吗？','不需要。7000 词库是长期练习资源，12 周课程是另一条口语主线。已认识的词先做提取检查；新词少量学、隔天复习，不把背完词表当作开口的前提。'],
 ['基础和进阶意味着什么？','词频反映语料中的出现次数，不直接等于你的难度或CEFR等级。词条页会展示来源、排序与分级依据；可选择学习组或生活场景，按需要练习。'],
 ['如何切换主题？','打开右上角“设置”，可选浅色、深色或跟随系统，也能切换配色皮肤和界面语言。偏好保存在当前浏览器。'],
 ['如何保住学习记录？','从页首或页脚进入“学习记录备份”。导出后妥善保存，换设备再导入；不同网址、浏览器之间不会自动同步。'],
 ['练完能达到什么水平？','课程提供练习与过程记录，不承诺固定CEFR等级。看新问题能否听懂、隔天能否想起，以及真实对话能否继续，才是更有用的检验。']
 ].map(([q,a])=>`<details><summary>${q}</summary><p>${a}</p></details>`).join('')}</section>`}
