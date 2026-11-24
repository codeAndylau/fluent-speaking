export const BACKUP_SECTIONS = Object.freeze({
 'fluent-course-v2':'课程与诊断',
 'fluent-preview-v1':'首版课程记录',
 'fluent-stories-v1':'故事听读与练习',
 'fluent-vocabulary-v1':'词库自评与个人线索',
 'fluent-vocabulary-senses-v2':'场景词义与复习',
 'fluent-external-notebook-v1':'故事与词汇表达本'
});
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const text=value=>typeof value==='string';
const boolean=value=>typeof value==='boolean';
const integer=value=>Number.isSafeInteger(value)&&value>=0;
const timestamp=value=>Number.isFinite(value)&&value>=0&&value<=8.64e15;
const date=value=>text(value)&&/^\d{4}-\d{2}-\d{2}$/.test(value)&&!Number.isNaN(Date.parse(value))&&new Date(value).toISOString().slice(0,10)===value;
const arrayOf=valid=>value=>Array.isArray(value)&&value.every(valid);
const mapOf=valid=>value=>object(value)&&Object.values(value).every(valid);
const fields=(value,schema)=>object(value)&&Object.entries(schema).every(([key,valid])=>!Object.hasOwn(value,key)||valid(value[key]));
const phrase=value=>text(value)&&/^w(0[1-9]|1[0-2])d[1-6]:p[0-2]$/.test(value);
const ratings=arrayOf(value=>integer(value)&&value<=3);
const review=value=>fields(value,{count:integer,due:date,last:date,success:boolean})&&integer(value.count)&&date(value.due);
const attempt=value=>fields(value,{score:integer,total:integer,assisted:boolean,date})&&integer(value.score)&&integer(value.total)&&value.total>0&&value.score<=value.total;
const quiz=value=>fields(value,{first:attempt,last:attempt,attempts:integer})&&attempt(value.first);
const lesson=value=>fields(value,{completed:boolean,completedDate:date,lastPracticed:date,migrated:boolean,pendingTextSeen:boolean,ratings,partner:boolean,note:text,quiz});
const diagnostic=value=>fields(value,{completed:boolean,listening:v=>integer(v)&&v<=3,reading:v=>integer(v)&&v<=3,ratings,partner:boolean,note:text,date,lastPractice:v=>fields(v,{score:n=>integer(n)&&n<=3,date})});
const recall=value=>fields(value,{
 level:v=>integer(v)&&v<=4,due:timestamp,lastRecall:timestamp,hints:integer,matched:boolean,
 independent:integer,delayed:integer,listening:boolean,listeningAttempts:integer,listeningCorrect:integer,spoken:boolean
});
function validSection(key,value) {
 switch(key) {
  case 'fluent-course-v2':return fields(value,{version:v=>v===2,saved:arrayOf(phrase),lessons:mapOf(lesson),diagnostic,reviews:mapOf(review),dates:arrayOf(date)});
  case 'fluent-preview-v1':return fields(value,{saved:arrayOf(v=>['from','about','again'].includes(v)),completed:boolean,dates:arrayOf(date)});
  case 'fluent-stories-v1':return object(value)&&Object.entries(value).every(([id,entry])=>id==='last'?integer(entry)&&entry>=1&&entry<=24:/^([1-9]|1[0-9]|2[0-4])$/.test(id)&&fields(entry,{time:timestamp,listened:boolean,practiced:boolean}));
  case 'fluent-vocabulary-v1':return fields(value,{limit:v=>[5,10,20].includes(v),words:mapOf(v=>fields(v,{stage:n=>integer(n)&&n<=5,due:timestamp})&&integer(v.stage)&&timestamp(v.due)),notes:mapOf(text),recalls:mapOf(recall)});
  case 'fluent-vocabulary-senses-v2':return mapOf(recall)(value);
  case 'fluent-external-notebook-v1':return arrayOf(entry=>fields(entry,{
   id:text,en:text,zh:text,example:text,source:v=>['stories','vocabulary'].includes(v),
   chapterId:v=>text(v)||integer(v),lineIndex:v=>v===null||integer(v),review:v=>v===null||review(v)
  })&&['stories','vocabulary'].includes(entry.source)&&[entry.id,entry.en,entry.zh].every(v=>text(v)&&v.trim()))(value);
  default:return false;
 }
}
function safe(value,depth=0) {
 if(depth>40)throw Error('备份中的记录层级过多。');
 if(value&&typeof value==='object') for(const [key,child] of Object.entries(value)) {
  if(key==='__proto__')throw Error('备份包含无法使用的字段。');
  safe(child,depth+1);
 }
}
export function parseBackup(text) {
 if(typeof text!=='string'||text.length>5_000_000)throw Error('请选择小于 5 MB 的学习记录文件。');
 let file;try{file=JSON.parse(text)}catch{throw Error('文件不是有效的学习记录 JSON。')}
 if(file?.format!=='fluent-learning-backup'||file.version!==1||!object(file.records)||!Object.keys(file.records).length)throw Error('这不是可恢复的 Fluent 学习记录文件。');
 for(const [key,raw] of Object.entries(file.records)) {
  if(!Object.hasOwn(BACKUP_SECTIONS,key)||typeof raw!=='string')throw Error('备份包含不支持的数据。');
  let value;try{value=JSON.parse(raw)}catch{throw Error('备份中的记录已损坏。')}
  safe(value);
  if(!validSection(key,value))throw Error('备份中的记录格式不正确。');
 }
 return {format:file.format,version:1,createdAt:typeof file.createdAt==='string'?file.createdAt:'',records:file.records};
}
// A raw snapshot deliberately preserves damaged values; it is not an importable backup.
export function createSafetySnapshot(storage) {
 const records={};
 for(const key of Object.keys(BACKUP_SECTIONS)) {
  const value=storage.getItem(key);
  if(value!==null)records[key]=value;
 }
 return {format:'fluent-learning-raw-snapshot',version:1,createdAt:new Date().toISOString(),records};
}
export function createBackup(storage) {
 const snapshot=createSafetySnapshot(storage);
 return parseBackup(JSON.stringify({...snapshot,format:'fluent-learning-backup'}));
}
export function restoreBackup(storage,input) {
 const file=parseBackup(JSON.stringify(input));
 const before=new Map(Object.keys(file.records).map(key=>[key,storage.getItem(key)])),written=[];
 try {
  for(const [key,value] of Object.entries(file.records)) {
   storage.setItem(key,value);written.push(key);
  }
 }catch {
  let rollbackFailed=false;
  for(const key of written.reverse())try {
   const value=before.get(key);if(value===null)storage.removeItem(key);else storage.setItem(key,value);
  }catch {rollbackFailed=true}
  throw Error(rollbackFailed?'恢复未完成，部分记录无法还原。请保留原备份文件。':'空间不足或浏览器禁止保存，未恢复；原记录已保留。');
 }
 return Object.keys(file.records).length;
}
