const topics={communication:['交流','Communication'],people:['人际','People'],home:['居家','Home'],food:['饮食','Food'],shopping:['购物','Shopping'],travel:['出行','Travel'],health:['健康','Health'],work:['工作','Work'],study:['学习','Study'],time:['时间','Time'],feelings:['感受','Feelings'],leisure:['休闲','Leisure'],nature:['自然','Nature'],technology:['科技','Technology'],society:['社会','Society'],ideas:['观点','Ideas']};
// Rank is a corpus frequency position, not a CEFR level. IDs survive reordering.
export function curriculumScenes(units,language='zh',audio={}){
 const en=language==='en',groups=[];
 for(let offset=0;offset<units.length;offset+=350){
  const block=units.slice(offset,offset+350),first=block[0],last=block.at(-1);
  const title=(first.tier==='core'?(en?'Core':'基础'):(en?'Expansion':'进阶'))+' · '+first.rank+'–'+last.rank;
  groups.push({id:'frequency-'+first.rank,title,
   context:en?'Study in descending subtitle frequency. Learn a common meaning in context, retrieve it without the answer, then use it in a new situation.':'按字幕语料中的词形频次从高到低学习。先在情景中理解一个常用义项，隐去答案回忆，再换个场合表达。',
   items:block.map(u=>({key:u.id,word:u.word,topic:topics[u.topic]?.[en?1:0]||'',phrase:u.phrase,meaning:en?u.senseEn:u.sense,sentence:u.en,
    sentenceZh:en?u.senseEn:u.zh,cue:en?(u.en+' ('+u.senseEn+')').replace(new RegExp('\\b'+u.word+'\\b','gi'),'____'):(u.zh+'（目标词义：'+u.sense+'）').replace(new RegExp('\\b'+u.word+'\\b','gi'),'____'),
    transfer:en?u.transferEn.replace(new RegExp('\\b'+u.word+'\\b','gi'),({one:'1',two:'2',three:'3',four:'4',five:'5',six:'6',seven:'7',eight:'8',nine:'9',ten:'10',hundred:'100',thousand:'1000'})[u.word]||'____'):u.transfer.replace(new RegExp('\\b'+u.word+'\\b','gi'),'____'),answer:u.word,answerLabel:en?'Target word':'目标单词',audio:u.audio||audio[u.id],rank:u.rank}))});
 }
 return groups;
}
