import { sanitizeForLlm } from './ai-policy';

/**
 * Keep only a reusable support lesson, not the customer's transcript.
 * Deliberately never connects to Meta or sends the conversation to an LLM.
 */
export function sanitizeClientLearningText(raw: string, max = 1200) {
  return sanitizeForLlm(raw.slice(0, 5000))
    .replace(/https?:\/\/[^\s]+/gi, '[LINK_REMOVIDO]')
    .replace(/\b[\w.+-]+@[\w.-]+\.[a-z]{2,}\b/gi, '[EMAIL_REMOVIDO]')
    .replace(/\b(?:\+?55[\s-]?)?(?:\(?\d{2}\)?[\s-]?)?9?\d{4}[\s-]?\d{4}\b/g, '[TELEFONE_REMOVIDO]')
    .replace(/\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g, '[CPF_REMOVIDO]')
    .replace(/\b\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}\b/g, '[CNPJ_REMOVIDO]')
    .trim().slice(0, max);
}

export function prepareClientLesson(situation: unknown, solution: unknown) {
  if (typeof situation !== 'string' || typeof solution !== 'string' ||
      situation.length > 3000 || solution.length > 3000) {
    throw new Error('CLIENT_LESSON_INVALID');
  }
  const problem = sanitizeClientLearningText(situation, 700);
  const successfulResolution = sanitizeClientLearningText(solution, 1200);
  if (problem.length < 12 || successfulResolution.length < 12) {
    throw new Error('CLIENT_LESSON_TOO_SHORT');
  }
  return { problem, successfulResolution };
}
