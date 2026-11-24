const scenarios = {
  introduction: 'Let’s practice a first meeting. Ask me to introduce myself, then ask about one interest.',
  coffee: 'Pretend you work at a coffee shop. Greet me and help me order a drink.',
  directions: 'Pretend I’m visiting your city. Help me ask for directions to the nearest train station.',
};

const copy = {
  zh: {
    title: '英语对话练习',
    intro: '这是 Nuance Labs 的外部练习入口。选择一个场景，复制开场白，打开 Nuance 后粘贴或读出开场白。',
    scene: '练习场景',
    introduction: '自我介绍',
    coffee: '在咖啡店点单',
    directions: '问路',
    prompt: '英文开场白',
    copy: '复制开场白',
    open: '打开 Nuance（新标签页）',
    copied: '已复制开场白。',
    manual: '请选中开场白并手动复制。',
    availability: 'Nuance 目前面向 18 岁及以上用户，提供英语对话，且仅在部分地区开放；官方公布的开放地区目前不含中国大陆。可用性及费用以 Nuance 官方页面为准。Fluent 不会自动发送学习记录或录音。',
    source: '查看 Nuance 官方使用说明',
  },
  en: {
    title: 'English conversation practice',
    intro: 'Use this external practice link to Nuance Labs. Pick a scenario, copy the starter, then paste it or say it aloud in Nuance.',
    scene: 'Practice scenario',
    introduction: 'Introduce yourself',
    coffee: 'Order a coffee',
    directions: 'Ask for directions',
    prompt: 'English conversation starter',
    copy: 'Copy starter',
    open: 'Open Nuance (new tab)',
    copied: 'Starter copied.',
    manual: 'Select the starter and copy it manually.',
    availability: 'Nuance currently offers English conversations to adults aged 18 and over in selected regions; mainland China is not currently on the official availability list. Check Nuance for availability and pricing. Fluent does not automatically send learning records or recordings.',
    source: 'Read the official Nuance practice information',
  },
};

export function renderConversation(app, language = 'zh') {
  const t = language === 'en' ? copy.en : copy.zh;
  app.innerHTML = `
    <section class="white-card learning-guide" aria-labelledby="conversation-title">
      <h1 id="conversation-title">${t.title}</h1>
      <p>${t.intro}</p>
      <label class="rating-row" for="conversation-scene">
        ${t.scene}
        <select id="conversation-scene">
          ${Object.keys(scenarios).map(key => `<option value="${key}">${t[key]}</option>`).join('')}
        </select>
      </label>
      <label class="note-label" for="conversation-prompt">
        ${t.prompt}
        <textarea id="conversation-prompt" lang="en" rows="6" readonly></textarea>
      </label>
      <div class="storage-actions">
        <button type="button" class="secondary" id="conversation-copy">${t.copy}</button>
        <a class="primary" href="https://app.nuancelabs.ai/try" target="_blank" rel="noopener noreferrer">${t.open}</a>
      </div>
      <p id="conversation-feedback" role="status"></p>
      <div class="details-card">
        <p>${t.availability}</p>
        <a class="source-link" href="https://www.nuancelabs.ai/research/meet-emma-the-first-nuplex-persona" target="_blank" rel="noopener noreferrer">${t.source}</a>
      </div>
    </section>
  `;

  const picker = app.querySelector('#conversation-scene');
  const prompt = app.querySelector('#conversation-prompt');
  const feedback = app.querySelector('#conversation-feedback');

  function updatePrompt() {
    const scenario = scenarios[picker.value] ?? scenarios.introduction;
    prompt.value = `Hi! I’m an adult learning English. ${scenario} Please use simple English and ask one question at a time. When we finish, give me one natural phrase I can use next time.`;
    feedback.textContent = '';
  }

  picker.onchange = updatePrompt;
  updatePrompt();

  app.querySelector('#conversation-copy').onclick = async () => {
    const selectedPrompt = prompt.value;
    let message;
    try {
      await app.ownerDocument.defaultView.navigator.clipboard.writeText(selectedPrompt);
      message = t.copied;
    } catch {
      message = t.manual;
    }

    if (prompt.value === selectedPrompt) feedback.textContent = message;
  };
}
