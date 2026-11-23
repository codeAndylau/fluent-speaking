import {reviewPhrase} from './state.mjs';

export const EXTERNAL_NOTEBOOK_KEY = 'fluent-external-notebook-v1';

const sourceTypes = ['stories', 'vocabulary'];

function readEntry(entry) {
  if (!entry || !sourceTypes.includes(entry.source)) return null;
  const {id, en, zh, example, chapterId, lineIndex, source, review} = entry;
  if (![id, en, zh].every(value => typeof value === 'string' && value.trim())) return null;
  return {
    id, en, zh, source,
    example: typeof example === 'string' ? example : '',
    chapterId: typeof chapterId === 'string' || Number.isSafeInteger(chapterId) ? String(chapterId) : '',
    lineIndex: Number.isInteger(lineIndex) ? lineIndex : null,
    review: review && Number.isInteger(review.count) && review.count >= 0 &&
      /^\d{4}-\d{2}-\d{2}$/.test(review.due) ? review : null
  };
}

export function restoreExternalNotebook(entries) {
  const notebook = new Map();
  for (const rawEntry of Array.isArray(entries) ? entries : []) {
    const entry = readEntry(rawEntry);
    if (entry) notebook.set(externalPhraseKey(entry.source, entry.id), entry);
  }
  return notebook;
}

export function externalPhraseKey(source, id) {
  return `${source}:${id}`;
}

export function toggleExternalPhrase(notebook, source, phrase) {
  const entry = readEntry({...phrase, source, review: null});
  if (!entry) return null;
  const key = externalPhraseKey(source, entry.id);
  if (notebook.delete(key)) return false;
  notebook.set(key, entry);
  return true;
}

export function reviewExternalPhrase(notebook, key, success, date) {
  const entry = notebook.get(key);
  if (!entry) return false;
  const review = reviewPhrase({reviews: {phrase: entry.review}}, 'phrase', success, date).reviews.phrase;
  notebook.set(key, {...entry, review});
  return true;
}

export function externalPhraseURL(entry) {
  if (entry.source === 'vocabulary') return '#vocabulary/phrases';
  return /^[a-z0-9][a-z0-9-]*$/i.test(entry.chapterId) ? `#story/${entry.chapterId}` : '#stories';
}
