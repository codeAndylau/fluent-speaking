const asset = name => new URL(`./stories/${name}`, import.meta.url);
const storageKey = 'fluent-stories-v1';
let session;
let indexRequest;
let continueTo;

const isChapterId = id => Number.isInteger(id) && id >= 1 && id <= 24;
const isRecord = value => value !== null && typeof value === 'object' && !Array.isArray(value);

export function loadProgress() {
  const progress = {};
  try {
    const raw = JSON.parse(localStorage.getItem(storageKey));
    if (!isRecord(raw)) return progress;
    if (isChapterId(raw.last)) progress.last = raw.last;
    for (let id = 1; id <= 24; id++) {
      const record = raw[id];
      if (!isRecord(record)) continue;
      const clean = {};
      if (Number.isFinite(record.time) && record.time >= 0) clean.time = record.time;
      if (typeof record.listened === 'boolean') clean.listened = record.listened;
      if (typeof record.practiced === 'boolean') clean.practiced = record.practiced;
      progress[id] = clean;
    }
  } catch {
    return progress;
  }
  return progress;
}

export function saveProgress(chapterId, update) {
  if (!isChapterId(chapterId)) return false;
  const progress = loadProgress();
  progress[chapterId] = {...progress[chapterId], ...update};
  progress.last = chapterId;
  try {
    localStorage.setItem(storageKey, JSON.stringify(progress));
    return true;
  } catch {
    return false;
  }
}

async function fetchData(name, signal) {
  const response = await fetch(asset(name), {signal});
  if (!response.ok) throw new Error('故事资源加载失败');
  return response.json();
}

export function stopStories() {
  session?.dispose?.();
  session?.controller.abort();
  session = undefined;
}

const timeLabel = t => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;

export async function renderStories(options) {
  const {app, route, escape: esc, icon, onSavePhrase, isPhraseSaved} = options;
  stopStories();
  const current = {controller: new AbortController()};
  session = current;
  const {signal} = current.controller;
  const path = (typeof route === 'function' ? route() : route).replace(/^#/, '');
  const chapterId = Number(path.split('/')[1]);
  const autoplay = continueTo === chapterId;
  continueTo = undefined;
  app.innerHTML = '<p class="route-note" role="status">正在加载故事……</p>';
  try {
    indexRequest ??= fetchData('index.json').catch(error => {
      indexRequest = undefined;
      throw error;
    });
    const index = await indexRequest;
    if (signal.aborted) return;
    const progress = loadProgress();
    if (path === 'stories') {
      const lastChapter = index.find(chapter => chapter.id === progress.last);
      app.innerHTML = `<section class="page-intro"><h1>故事听说</h1>
        <p><span lang="en">A Place at the Table</span> · 24 章英文有声书与开口练习</p>
        ${lastChapter ? `<a class="primary" href="#story/${lastChapter.id}">继续第 ${lastChapter.id} 章</a>` : ''}
        </section><div class="course-grid">${index.map(chapter => `
          <a class="white-card course-card" href="#story/${chapter.id}">
            <span class="course-num">第 ${chapter.id} 章 · ${esc(chapter.level)}</span>
            <h3 lang="en">${esc(chapter.title)}</h3><p>${esc(chapter.focus)}</p>
            <small>${timeLabel(chapter.duration)} · ${progress[chapter.id]?.practiced ? '已记录练习' : progress[chapter.id]?.listened ? '已听完' : progress[chapter.id]?.time > 0 ? '已开始' : '听读与练习'}</small>
          </a>`).join('')}</div>`;
      return;
    }
    const entry = index.find(chapter => chapter.id === chapterId);
    if (!entry) {
      app.innerHTML = '<a class="back-link" href="#stories">返回故事目录</a><p>找不到该章节。</p>';
      return;
    }
    const chapter = await fetchData(entry.data, signal);
    if (signal.aborted) return;
    renderChapter({app, esc, icon, onSavePhrase, isPhraseSaved, entry, chapter, current,
      progress: progress[chapterId] || {}, autoplay, next: index[index.indexOf(entry) + 1]});
  } catch {
    if (signal.aborted) return;
    app.innerHTML = '<p class="route-note" role="alert">故事加载失败，请重试。</p><button class="secondary">重新加载</button> <a class="quiet" href="#stories">返回目录</a>';
    app.querySelector('button').addEventListener('click', () => renderStories(options), {signal});
  }
}

function practiceMarkup({practice: p}, esc, chapterId, isPhraseSaved) {
  return `<p>先说出自己的答案，再查看参考。第一轮允许停顿；第二轮只改一两个重点。</p>
    <section><h2>把这些表达说出口</h2>${p.phrases.map((item, i) => {
      const saved = Boolean(isPhraseSaved?.(`story:${chapterId}:p${i}`));
      return `<div class="story-phrase"><div><strong lang="en">${esc(item.en)}</strong><br>${esc(item.zh)}</div>
        <button class="secondary" data-story-save="${i}" aria-pressed="${saved}">${saved ? '已收藏' : '收藏'}</button></div>`;
    }).join('')}</section>
    <section><h2>一个语言重点</h2><p>${esc(p.grammar)}</p><p>${esc(p.pronunciation)}</p></section>
    <section><h2>理解之后，开口回答</h2>${p.questions.map(item => `<div class="story-question">
      <p lang="en">${esc(item.q)}</p><details><summary>查看参考答案</summary><p lang="en">${esc(item.a)}</p></details>
    </div>`).join('')}</section>
    <section><h2>轮到你说</h2><p>${esc(p.roleplay.context)}</p>${p.roleplay.turns.map(item => `
      <div class="story-question"><blockquote lang="en">${esc(item.line)}</blockquote><p>你的任务：${esc(item.cue)}</p></div>`).join('')}</section>
    <section><h2>换个场景，继续用</h2><p>${esc(p.transfer)}</p></section>
    <section><h2>合上原文，再讲一次</h2><p>${esc(p.retell)}</p></section>`;
}

function storyMarkup(chapter, esc) {
  let cursor = 0;
  return chapter.story.split(/\n\s*\n/).map(paragraph => {
    const start = chapter.story.indexOf(paragraph, cursor);
    const end = start + paragraph.length;
    cursor = end;
    let offset = start;
    const parts = chapter.sentences.map((line, index) => ({line, index}))
      .filter(({line}) => line.charStart >= start && line.charEnd <= end)
      .map(({line, index}) => {
        const space = esc(chapter.story.slice(offset, line.charStart));
        offset = line.charEnd;
        return `${space}<span class="story-line"><button type="button" data-story-line="${index}" aria-pressed="false">
          <span class="story-en" lang="en">${esc(chapter.story.slice(line.charStart, line.charEnd))}</span><span class="story-zh" lang="zh">${esc(chapter.translations[line.id])}</span>
        </button></span>`;
      }).join('');
    return `<p>${parts}${esc(chapter.story.slice(offset, end))}</p>`;
  }).join('');
}

function renderChapter({app, esc, icon, onSavePhrase, isPhraseSaved, entry, chapter, current, progress, autoplay, next}) {
  const {signal} = current.controller;
  const id = chapter.id;
  app.innerHTML = `<article class="story-reader">
    <a class="back-link" href="#stories">${icon('back')}故事目录</a>
    <section class="page-intro"><span class="eyebrow">第 ${id} 章 · ${esc(chapter.level)}</span>
      <h1 lang="en">${esc(chapter.title)}</h1><p>${esc(chapter.focus)}</p></section>
    <section class="white-card story-player" aria-label="故事播放器">
      <audio controls preload="none" aria-label="章节音频"></audio>
      <div class="story-controls">
        <button class="secondary" data-story-play="chapter">连续听全书</button>
        <button class="secondary" data-story-play="sentence" disabled>播放选句</button>
        <button class="secondary" data-story-play="loop" disabled aria-pressed="false">跟读循环</button>
      </div>
      <p class="story-status" role="status"></p>
    </section>
    <div class="story-controls story-tabs" aria-label="章节内容">
      <button class="secondary" data-story-tab="read" aria-pressed="true">听读</button>
      <button class="secondary" data-story-tab="practice" aria-pressed="false">口语练习</button>
    </div>
    <section class="white-card story-body" data-story-panel="read">
      <label class="story-language">阅读语言 <select>
        <option value="en">英文原文</option><option value="both">英中双语</option><option value="zh">中文翻译</option>
      </select></label>
      <div class="story-prose" data-language="en">${storyMarkup(chapter, esc)}</div>
    </section>
    <section class="white-card story-practice" data-story-panel="practice" hidden>
      ${practiceMarkup(chapter, esc, id, isPhraseSaved)}
      <button class="primary" data-story-done aria-pressed="${Boolean(progress.practiced)}">${progress.practiced ? '已记录口语练习' : '记录口语练习完成'}</button>
      <p class="story-status" data-story-practice-status role="status"></p>
    </section>
    <nav class="story-controls story-navigation" aria-label="相邻章节">
      ${id > 1 ? `<a class="secondary" href="#story/${id - 1}">上一章</a>` : ''}
      ${next ? `<a class="secondary" href="#story/${next.id}">下一章 · ${esc(next.title)}</a>` : ''}
    </nav></article>`;

  const find = selector => app.querySelector(selector);
  const listen = (target, event, handler) => target.addEventListener(event, handler, {signal});
  const audio = find('audio');
  const status = find('.story-status');
  const sentenceButton = find('[data-story-play="sentence"]');
  const loopButton = find('[data-story-play="loop"]');
  const lines = Array.from(app.querySelectorAll('[data-story-line]'));
  const sentenceRanges = chapter.sentences.map(line => ({
    start: Math.max(0, line.start - entry.start),
    end: Math.min(entry.duration, line.end - entry.start)
  }));
  const resume = progress.time > 0 && progress.time < entry.duration - 0.4 ? progress.time : 0;
  let selected = -1;
  let active = -1;
  let range = null;
  let continuous = autoplay;
  let seekTo = autoplay ? 0 : resume;
  let touched = false;
  let savedAt = 0;

  const savePosition = () => {
    if (touched && Number.isFinite(audio.currentTime)) {
      saveProgress(id, {time: audio.currentTime});
    }
  };
  current.dispose = () => {
    savePosition();
    audio.pause();
    audio.removeAttribute('src');
    audio.load();
  };

  function highlight(index) {
    if (index === active) return;
    lines[active]?.classList.remove('story-playing');
    lines[index]?.classList.add('story-playing');
    active = index;
  }

  function selectLine(index) {
    lines[selected]?.setAttribute('aria-pressed', 'false');
    selected = index;
    lines[index].setAttribute('aria-pressed', 'true');
    sentenceButton.disabled = false;
    loopButton.disabled = false;
    if (range?.loops) clearRange();
    status.textContent = `已选第 ${index + 1} 句`;
  }

  function clearRange() {
    range = null;
    loopButton.setAttribute('aria-pressed', 'false');
  }

  function checkPlayback() {
    if (audio.seeking || audio.paused) return;
    if (range && audio.currentTime >= range.end) {
      if (range.loops) audio.currentTime = range.start;
      else {
        audio.pause();
        clearRange();
      }
    }
    highlight(sentenceRanges.findIndex(line => audio.currentTime >= line.start && audio.currentTime < line.end));
    if (Date.now() - savedAt >= 2000) {
      savedAt = Date.now();
      savePosition();
    }
  }

  const timer = setInterval(checkPlayback, 45);
  signal.addEventListener('abort', () => clearInterval(timer), {once: true});
  listen(audio, 'loadedmetadata', () => {
    if (seekTo > 0) audio.currentTime = Math.min(seekTo, audio.duration);
    seekTo = 0;
  });
  listen(audio, 'play', () => { touched = true; });
  listen(audio, 'pause', savePosition);
  listen(audio, 'ended', () => {
    if (range) {
      if (range.loops) play(range.start);
      else clearRange();
      return;
    }
    saveProgress(id, {time: 0, listened: true});
    touched = false;
    status.textContent = '本章已播放完毕';
    if (continuous && next) {
      continueTo = next.id;
      location.hash = `story/${next.id}`;
    }
  });
  listen(audio, 'error', () => { status.textContent = '音频加载失败，请重新播放。'; });
  const pauseWhenHidden = () => { audio.pause(); savePosition(); };
  listen(window, 'pagehide', pauseWhenHidden);
  listen(document, 'visibilitychange', () => { if (document.hidden) pauseWhenHidden(); });
  audio.src = asset(entry.audio).href;

  function play(start) {
    if (audio.error) audio.load();
    if (Number.isFinite(start)) {
      if (audio.readyState >= 1) audio.currentTime = start;
      else seekTo = start;
    }
    audio.play().catch(() => {
      if (!signal.aborted) status.textContent = '请点击播放器继续收听。';
    });
  }

  lines.forEach((button, index) => listen(button, 'click', () => selectLine(index)));
  listen(find('select'), 'change', event => { find('.story-prose').dataset.language = event.target.value; });

  listen(find('[data-story-play="chapter"]'), 'click', () => {
    clearRange();
    continuous = true;
    status.textContent = '本章结束后自动播放下一章。';
    play();
  });
  listen(sentenceButton, 'click', () => {
    continuous = false;
    clearRange();
    range = sentenceRanges[selected];
    play(range.start);
  });
  listen(loopButton, 'click', () => {
    if (range?.loops) {
      clearRange();
      audio.pause();
      return;
    }
    continuous = false;
    range = {...sentenceRanges[selected], loops: true};
    loopButton.setAttribute('aria-pressed', 'true');
    play(range.start);
  });
  for (const button of app.querySelectorAll('[data-story-tab]')) {
    listen(button, 'click', () => {
      const tab = button.dataset.storyTab;
      app.querySelectorAll('[data-story-tab]').forEach(item => item.setAttribute('aria-pressed', String(item === button)));
      app.querySelectorAll('[data-story-panel]').forEach(panel => { panel.hidden = panel.dataset.storyPanel !== tab; });
    });
  }
  for (const button of app.querySelectorAll('[data-story-save]')) {
    listen(button, 'click', () => {
      const i = Number(button.dataset.storySave);
      const phrase = chapter.practice.phrases[i];
      const normalize = value => value.toLowerCase().replace(/[’‘]/g, "'");
      const lineIndex = chapter.sentences.findIndex(line => normalize(line.text).includes(normalize(phrase.en)));
      const phraseId = `story:${id}:p${i}`;
      onSavePhrase({
        id: phraseId, ...phrase, chapterId: id, lineIndex,
        example: chapter.sentences[lineIndex]?.text || phrase.en
      });
      const saved = isPhraseSaved ? Boolean(isPhraseSaved(phraseId)) : button.getAttribute('aria-pressed') !== 'true';
      button.setAttribute('aria-pressed', String(saved));
      button.textContent = saved ? '已收藏' : '收藏';
    });
  }
  listen(find('[data-story-done]'), 'click', event => {
    const practiceStatus = find('[data-story-practice-status]');
    if (!saveProgress(id, {practiced: true})) {
      practiceStatus.textContent = '当前设备未能保存练习记录，请重试。';
      return;
    }
    practiceStatus.textContent = '';
    event.currentTarget.textContent = '已记录口语练习';
    event.currentTarget.setAttribute('aria-pressed', 'true');
  });
  if (autoplay) play(0);
}
