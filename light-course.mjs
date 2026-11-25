export function isPracticeLesson(lesson) {
  return ['lesson', 'review', 'challenge'].includes(lesson?.type);
}

export function lessonStep(lesson, requested) {
  if (requested && requested !== 'practice') return requested;
  return isPracticeLesson(lesson) ? 'practice' : 'listen';
}

function validRound(lesson, round) {
  return Number.isInteger(round) && round >= 0 && round < lesson.rounds.length;
}

export function practiceProgress(state, lesson) {
  const entry = isPracticeLesson(lesson) ? state.lessons[lesson.id] : undefined;
  return {
    round: validRound(lesson, entry?.practiceRound) ? entry.practiceRound : 0,
    done: entry?.practiceDone === true
  };
}

export function savePractice(state, lesson, {round, done, touch = false} = {}) {
  if (!isPracticeLesson(lesson) || (round !== undefined && !validRound(lesson, round))) return state;
  const previous = state.lessons[lesson.id];
  const progress = practiceProgress(state, lesson);
  const practiceRound = round ?? progress.round;
  const practiceDone = progress.done || done === true;
  if (!touch && previous?.practiceRound === practiceRound && progress.done === practiceDone) return state;
  return {
    ...state,
    lessons: {
      ...state.lessons,
      [lesson.id]: {...previous, practiceRound, practiceUpdatedAt: Date.now(), ...(practiceDone ? {practiceDone} : {})}
    }
  };
}
