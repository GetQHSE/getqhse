/**
 * Internal-context collection questionnaire (step 1, "contexte interne").
 *
 * Keys are stable identifiers persisted in ContextInternalInput
 * (unique on [projectId, questionKey]). Labels are stored alongside answers
 * so a later methodology change never breaks traceability of existing rows.
 * Ported from the foundation's internal-context-questions.ts.
 */

export interface InternalContextQuestion {
  sectionKey: string;
  questionKey: string;
  label: string;
}

export interface InternalContextSection {
  key: string;
  title: string;
  helper: string;
  questions: InternalContextQuestion[];
}

export const INTERNAL_CONTEXT_SECTIONS: InternalContextSection[] = [
  {
    key: "culture_valeurs",
    title: "Culture et valeurs",
    helper: "Aidez GetQhse à comprendre le fonctionnement humain de votre organisation.",
    questions: [
      {
        sectionKey: "culture_valeurs",
        questionKey: "cv_climat_social",
        label: "Comment décririez-vous le climat social au sein de votre organisation ?",
      },
      {
        sectionKey: "culture_valeurs",
        questionKey: "cv_reaction_changement",
        label: "Comment vos équipes réagissent-elles généralement au changement ?",
      },
      {
        sectionKey: "culture_valeurs",
        questionKey: "cv_valeurs",
        label:
          "Quelles valeurs influencent réellement les comportements et les décisions au quotidien ?",
      },
    ],
  },
  {
    key: "ressources_competences",
    title: "Ressources et compétences",
    helper:
      "Décrivez les forces et les éventuelles limites des ressources nécessaires à votre activité.",
    questions: [
      {
        sectionKey: "ressources_competences",
        questionKey: "rc_expertise",
        label:
          "Comment évaluez-vous le niveau d'expertise et de maîtrise des savoir-faire de vos équipes ?",
      },
      {
        sectionKey: "ressources_competences",
        questionKey: "rc_competences_manquantes",
        label:
          "Disposez-vous des compétences nécessaires pour atteindre vos objectifs actuels ? Si non, lesquelles manquent ?",
      },
      {
        sectionKey: "ressources_competences",
        questionKey: "rc_equipements",
        label:
          "Vos équipements, outils, logiciels et autres ressources sont-ils adaptés et suffisamment disponibles ?",
      },
      {
        sectionKey: "ressources_competences",
        questionKey: "rc_ressources_critiques",
        label: "Existe-t-il aujourd'hui des ressources critiques, limitées ou vieillissantes ?",
      },
    ],
  },
  {
    key: "gouvernance_processus",
    title: "Gouvernance et processus",
    helper: "Aidez GetQhse à comprendre comment l'organisation fonctionne et prend ses décisions.",
    questions: [
      {
        sectionKey: "gouvernance_processus",
        questionKey: "gp_efficacite",
        label: "Comment évaluez-vous l'efficacité de votre organisation interne ?",
      },
      {
        sectionKey: "gouvernance_processus",
        questionKey: "gp_communication",
        label:
          "La communication et la circulation de l'information entre les équipes sont-elles efficaces ?",
      },
      {
        sectionKey: "gouvernance_processus",
        questionKey: "gp_decisions",
        label: "Comment les décisions importantes sont-elles prises dans l'organisation ?",
      },
      {
        sectionKey: "gouvernance_processus",
        questionKey: "gp_processus",
        label:
          "Existe-t-il des processus internes que vous considérez comme particulièrement efficaces ou, au contraire, fragiles ?",
      },
    ],
  },
];
