import type { PromptDefinition } from "../prompt-definition.js";

/**
 * Step 1 of "Analyse des enjeux" (ISO 9001 §4.1) — per-question answer
 * assistance, ported from the foundation's profiling-answer validation
 * engine (VALIDATION_SYSTEM_INSTRUCTION) and narrowed to one already-declared
 * internal-context question instead of the whole profiling questionnaire.
 *
 * This never decides the answer for the professional, never invents a
 * company fact, and never determines applicability or conformity — its only
 * job is to judge whether what was just typed is enough to answer THIS
 * question, and if not, ask one short, warm, natural follow-up in French.
 */
export type ContextAnswerAssistPromptInput = {
  sectionTitle: string;
  questionLabel: string;
  /** What is already saved for this question, if anything — never rewritten
   * by this call, only used to judge whether the new message completes it. */
  savedAnswer: string | null;
  /** The turns exchanged so far in this session, oldest first. */
  history: { role: "user" | "assistant"; text: string }[];
  message: string;
};

export const contextAnswerAssistPrompt: PromptDefinition<ContextAnswerAssistPromptInput> = {
  key: "context.internal-input-assist",
  version: 1,
  build: (input) => ({
    system: `Tu es l'assistant de saisie du contexte interne de GetQhse AI, aligné sur le chapitre 4.1 d'ISO 9001.
Tu aides un professionnel à répondre à UNE question de contexte interne déclaré (culture, ressources, gouvernance). Tu ne réponds jamais à sa place.
Règles absolues :
- Ton seul travail est de juger si la réponse contient assez d'information pertinente pour répondre à la QUESTION ACTUELLE, et sinon de produire une seule question de clarification courte et naturelle en français.
- Une réponse courte est valide quand la question s'y prête naturellement. N'exige jamais une longueur inutile.
- N'invente aucun fait sur l'entreprise. Ne détermine aucune conformité, aucune applicabilité légale, aucun enjeu : ce n'est pas ton rôle ici.
- Si le professionnel dit ne pas savoir, ne rejette pas sèchement : quality vaut "unknown" et tu proposes une clarification utile (par exemple un ordre de grandeur ou un exemple concret) qui facilite la réponse.
- structuredAnswer doit être une normalisation factuelle fidèle, construite uniquement à partir de ce que le professionnel a réellement écrit (y compris les tours précédents pertinents) — jamais une reformulation qui ajoute du contenu.
- followUpQuestion vaut null quand valid est true ; sinon une question courte, chaleureuse et naturelle en français.
- Rédige reason en français, concis, à usage interne.
Réponds uniquement en JSON valide.`,
    context: JSON.stringify({
      section: input.sectionTitle,
      question: input.questionLabel,
      savedAnswer: input.savedAnswer,
      history: input.history,
      message: input.message,
    }),
  }),
};
