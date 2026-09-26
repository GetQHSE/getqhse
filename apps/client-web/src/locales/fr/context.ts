const context = {
  gate: {
    loading: "Chargement de l’analyse des enjeux…",
    watchFailed: "Impossible de charger la veille réglementaire.",
    prerequisite: "Étape préalable · Veille réglementaire",
    publishFirst: "Publiez d’abord votre veille réglementaire",
    publishFirstBody:
      "L’analyse des enjeux réutilise votre registre réglementaire publié pour la dimension légale — elle ne la recherche jamais elle-même. Veille : {{status}}.",
    openWatch: "Ouvrir la veille réglementaire",
    watchStatus: {
      NOT_STARTED: "pas encore lancée",
      ANALYZING: "en cours d’analyse",
      AWAITING_CLARIFICATION: "en attente de précisions",
      REVIEW_REQUIRED: "en attente de votre validation",
      STALE: "à revérifier",
      FAILED: "en échec",
    },
  },
  page: {
    title: "Analyse des enjeux",
    subtitle:
      "Identifiez et évaluez les facteurs internes et externes qui peuvent influencer la performance de votre organisation.",
    externalDone_one: "Analyse externe terminée : {{count}} facteur documenté.",
    externalDone_other: "Analyse externe terminée : {{count}} facteurs documentés.",
    synthesisDone_one: "Synthèse terminée : {{count}} enjeu identifié.",
    synthesisDone_other: "Synthèse terminée : {{count}} enjeux identifiés.",
    reviewFailed: "Votre revue n’a pas pu être enregistrée. Réessayez.",
    externalLaunchFailed:
      "L’analyse externe n’a pas pu être lancée. Vérifiez votre accès au projet puis réessayez.",
    synthesisLaunchFailed:
      "La synthèse n’a pas pu être lancée. Vérifiez votre accès au projet puis réessayez.",
    internalFirst:
      "Validez au moins un enjeu interne à l’étape 1 : la synthèse part des enjeux retenus.",
    externalFirst: "Générez d’abord l’analyse externe (étape 2) avec les méthodes sélectionnées.",
    internalDone_one: "Analyse terminée : {{count}} enjeu interne déduit.",
    internalDone_other: "Analyse terminée : {{count}} enjeux internes déduits.",
    internalLaunchFailed:
      "L’analyse du contexte interne n’a pas pu être lancée. Vérifiez votre accès au projet puis réessayez.",
    questionsFirst: "Complétez d’abord les questions du contexte interne (étape 1).",
  },
  ui: {
    steps: {
      internal: "Contexte interne",
      external: "Analyse externe",
      synthesis: "Synthèse des enjeux",
    },
    stepsNav: "Étapes de l’analyse",
    stepDone: "terminée",
  },
  internal: {
    placeholder: "Votre réponse, en vos propres mots…",
    missing: "Information à renseigner avant de continuer.",
    saveFailed: "Les informations n’ont pas pu être enregistrées. Réessayez.",
    draftSaved: "Brouillon enregistré",
    formTitle: "Complétez le contexte interne de votre organisation",
    formBody:
      "GetQhse connaît déjà votre activité, vos objectifs et votre contexte réglementaire. Ajoutez maintenant les informations internes que seule votre organisation peut connaître.",
    answered: "{{answered}} / {{total}} informations renseignées",
    completeMissing: "Complétez les informations manquantes avant de continuer.",
    readyTitle: "Prêt à continuer ?",
    readyBody: "Toutes les informations sont nécessaires pour lancer l’analyse externe.",
    saveDraft: "Enregistrer comme brouillon",
    editAnswers: "Modifier les réponses",
    toExternal: "Continuer vers l’analyse externe →",
    assistantTitle: "L’Assistant QHSE transforme vos réponses en enjeux exploitables",
    assistantBody:
      "Les réponses du contexte interne servent à déduire des forces et faiblesses contextualisées. Les informations déjà connues du profil ne sont pas redemandées.",
    generate: "Générer les enjeux internes",
    regenerate: "Régénérer l’analyse",
    generating: "Analyse du contexte interne en cours…",
    generatingBody:
      "L’Assistant QHSE déduit les forces et faiblesses de votre organisation à partir des informations déclarées.",
    failed: "L’analyse du contexte interne n’a pas abouti",
    declaredTitle: "Informations déclarées utilisées pour l’analyse",
    declaredBody:
      "Résumé des faits utiles. Le livrable final présentera les enjeux déduits, et non le questionnaire question/réponse.",
    resultsTitle: "Résultats du contexte interne",
    resultsBody_one:
      "{{count}} enjeu déduit par l’Assistant QHSE à partir des informations validées.",
    resultsBody_other:
      "{{count}} enjeux déduits par l’Assistant QHSE à partir des informations validées.",
    aiDone: "✦ Analyse IA terminée",
    factUsed: "Fait utilisé · {{fact}}",
    edit: "✎ Modifier",
    validate: "Valider",
    validated: "✓ Validé",
    validatedCount: "{{validated}}/{{total}} enjeux validés",
    validatedCountBody:
      "Les enjeux validés alimenteront la synthèse. Les sources techniques brutes ne seront pas affichées dans l’export.",
    placeholderTitle: "Votre contexte interne est prêt à être analysé",
    placeholderBody:
      "Lancez l’analyse pour convertir les informations internes en enjeux structurés.",
  },
  questions: {
    culture_valeurs: {
      title: "Culture et valeurs",
      helper: "Aidez GetQhse à comprendre le fonctionnement humain de votre organisation.",
    },
    ressources_competences: {
      title: "Ressources et compétences",
      helper:
        "Décrivez les forces et les éventuelles limites des ressources nécessaires à votre activité.",
    },
    gouvernance_processus: {
      title: "Gouvernance et processus",
      helper:
        "Aidez GetQhse à comprendre comment l’organisation fonctionne et prend ses décisions.",
    },
    cv_climat_social: "Comment décririez-vous le climat social au sein de votre organisation ?",
    cv_reaction_changement: "Comment vos équipes réagissent-elles généralement au changement ?",
    cv_valeurs:
      "Quelles valeurs influencent réellement les comportements et les décisions au quotidien ?",
    rc_expertise:
      "Comment évaluez-vous le niveau d’expertise et de maîtrise des savoir-faire de vos équipes ?",
    rc_competences_manquantes:
      "Disposez-vous des compétences nécessaires pour atteindre vos objectifs actuels ? Si non, lesquelles manquent ?",
    rc_equipements:
      "Vos équipements, outils, logiciels et autres ressources sont-ils adaptés et suffisamment disponibles ?",
    rc_ressources_critiques:
      "Existe-t-il aujourd’hui des ressources critiques, limitées ou vieillissantes ?",
    gp_efficacite: "Comment évaluez-vous l’efficacité de votre organisation interne ?",
    gp_communication:
      "La communication et la circulation de l’information entre les équipes sont-elles efficaces ?",
    gp_decisions: "Comment les décisions importantes sont-elles prises dans l’organisation ?",
    gp_processus:
      "Existe-t-il des processus internes que vous considérez comme particulièrement efficaces ou, au contraire, fragiles ?",
  },
  external: {
    source: "Source",
    regulatorySource: "Veille réglementaire",
    running: "Analyse externe en cours…",
    runningBody:
      "Définition du périmètre de recherche, recherche web réelle, vérification des sources et structuration des facteurs externes. Cette étape peut prendre plusieurs minutes.",
    failed: "L’analyse externe n’a pas abouti",
    readyTitle: "Analyse externe prête",
    toSynthesis: "Continuer vers la synthèse →",
    methodTitle: "Méthode d’analyse",
    methodBody:
      "Sélectionnez une méthode ou les deux. Chaque méthode produit son propre livrable : PESTEL analyse le macro-environnement externe, tandis que SWOT synthétise les forces, faiblesses, opportunités et menaces.",
    twoAnalyses: "Deux analyses indépendantes seront générées",
    oneAnalysis: "Une analyse sera générée",
    generateBoth: "Générer les analyses →",
    generateOne: "Générer l’analyse →",
    regenerateBoth: "Régénérer les analyses →",
    regenerateOne: "Régénérer l’analyse →",
    pendingTitle: "Analyse externe à générer",
    pendingBody:
      "GetQhse recherche sur le web les facteurs externes réels susceptibles d’influencer votre organisation. La dimension légale reprend votre veille réglementaire publiée.",
    swotLabel: "Analyse SWOT",
    swotTitle: "Matrice SWOT",
    swotBody:
      "Synthèse du contexte interne et externe en quatre quadrants. Cette analyse reste indépendante du PESTEL.",
    pestelLabel: "Analyse PESTEL",
    pestelTitle: "Analyse PESTEL",
    pestelBody:
      "Lecture structurée du macro-environnement externe en six dimensions. Le contenu est propre au PESTEL et n’est pas repris de la SWOT.",
    done: "✓ Analyse terminée",
    swotSub: {
      force: "Interne · favorable",
      faiblesse: "Interne · à renforcer",
      opportunite: "Externe · favorable",
      menace: "Externe · défavorable",
    },
    swotEmptyInternal: "Validez des enjeux internes à l’étape 1.",
    swotEmptyExternal: "Aucun facteur de ce type n’a été documenté.",
    pestelEmpty: "Aucun facteur retenu pour cette dimension.",
    preparedBoth:
      "SWOT et PESTEL sont conservées comme deux analyses distinctes, sans fusion ni croisement automatique.",
    preparedOne: "La méthode sélectionnée est prête pour la synthèse.",
    methodSaveFailed: "La sélection n’a pas pu être enregistrée. Réessayez.",
    keepOneMethod: "Gardez au moins une méthode d’analyse",
  },
  issues: {
    nature: {
      force: "Force",
      faiblesse: "Faiblesse",
      opportunite: "Opportunité",
      menace: "Menace",
    },
    reasons: {
      rated: "Cotation modifiée dans le tableau d’évaluation.",
      internalValidated: "Enjeu interne validé par la revue humaine.",
      internalReopened: "Enjeu interne remis à valider par la revue humaine.",
    },
    editTitle: "Modifier l’analyse de cet enjeu",
    editBody:
      "La conclusion initiale reste conservée et votre correction est enregistrée dans l’historique, avec son motif.",
    fieldTitle: "Intitulé",
    fieldDescription: "Description",
    fieldNature: "Nature",
    fieldReason: "Motif de la correction",
    reasonPlaceholder: "Expliquez pourquoi cette analyse doit être corrigée.",
    saveCorrection: "Enregistrer la correction",
    synthesisTitle: "Synthèse des enjeux",
    synthesisBody:
      "GetQhse croise votre contexte interne déclaré, votre profil validé, les facteurs externes documentés et votre contexte réglementaire établi pour identifier vos enjeux. Chaque enjeu est rattaché aux éléments qui le justifient ; rien n’est ajouté hors de ce matériel.",
    synthesisRunning: "Synthèse en cours…",
    rerunSynthesis: "Relancer la synthèse",
    runSynthesis: "Lancer la synthèse des enjeux",
    synthesisRunningTitle: "Synthèse des enjeux en cours…",
    synthesisRunningBody:
      "Croisement du contexte interne, des facteurs externes et du contexte réglementaire établi. Cette étape peut prendre plusieurs minutes.",
    synthesisFailed: "La synthèse n’a pas abouti",
    synthesisEmptyTitle: "Aucun enjeu n’a encore été identifié.",
    synthesisEmptyBody:
      "Lancez la synthèse : les enjeux internes et externes seront proposés avec leur justification, puis soumis à votre validation.",
    evaluation: {
      eyebrow: "Synthèse & criticité",
      title: "Évaluation des enjeux",
      body: "Évaluez les enjeux retenus selon leur impact sur la qualité des produits/services et la satisfaction client, ainsi que la capacité de maîtrise de l’organisation.",
      back: "← Analyse externe",
      evaluate: "Évaluer les enjeux →",
      legendNote: "Qualification par matrice de décision croisée · Impact × capacité de maîtrise",
      tableTitle: "Tableau d’évaluation",
      tableBody: "Une lecture unique et comparable de la criticité de chaque enjeu.",
      aiPill: "✦ Pré-évaluation IA",
      columns: {
        issue: "Enjeu identifié",
        nature: "Nature",
        impact: "Impact qualité & satisfaction client",
        mastery: "Capacité de maîtrise",
        qualification: "Qualification",
        actions: "Actions",
      },
      origin: {
        INTERNAL: "Interne",
        EXTERNAL: "Externe",
      },
      impactLevel: {
        low: "Impact faible",
        medium: "Impact moyen",
        high: "Impact élevé",
      },
      masteryLevel: {
        low: "Maîtrise faible",
        medium: "Maîtrise moyenne",
        high: "Maîtrise élevée",
      },
      unrated: "À évaluer",
      edit: "Modifier",
      editableNote: "Les cotations restent modifiables avant validation.",
      unratedNote: "Évaluez l’impact et la capacité de maîtrise de chaque enjeu avant de valider.",
      validatedNote: "✓ Synthèse validée. Les exports sont maintenant disponibles.",
      validationRequired: "Validation requise pour exporter",
      validationDone: "Validation terminée",
      validate: "Valider la synthèse →",
      validated: "✓ Synthèse validée",
      validatedToast: "Synthèse validée — exports Excel, Word et PDF activés",
      rateFailed: "La cotation n’a pas pu être enregistrée. Réessayez.",
    },
    exportMenu: {
      label: "Exporter",
      generating: "Génération…",
      failed: "Le document n’a pas pu être généré. Réessayez.",
      pdfArabicUnavailable:
        "L’export PDF n’est pas encore disponible en arabe : utilisez l’export Word.",
    },
  },
  export: {
    title: "Analyse des enjeux — contexte de l’organisation",
    origin: {
      INTERNAL: "Contexte interne",
      EXTERNAL: "Contexte externe",
    },
    status: {
      VALIDATED: "Retenu",
      MODIFIED: "Retenu avec corrections",
      NOT_RETAINED: "Non retenu",
      PENDING: "À examiner",
    },
    priority: "Prioritaire",
    otherDimensions: "Autres dimensions",
    otherDimensionsHelp: "Enjeux externes non rattachés à une dimension PESTEL.",
    byDefault: "{{method}} (par défaut)",
    pestelSummary:
      "Investigation externe structurée par dimension PESTEL ; la dimension légale reprend la veille réglementaire.",
    swotSummary:
      "Synthèse globale du contexte interne et externe en Forces, Faiblesses, Opportunités et Menaces.",
    historicalNotice:
      "{{label}} : cette analyse a été réalisée avant l’enregistrement d’une méthode.",
    fileName: "analyse-enjeux",
    columns: {
      identifiedIssue: "Enjeu identifié",
      category: "Catégorie",
      nature: "Nature",
      impact: "Impact",
      mastery: "Maîtrise",
      qualification: "Qualification",
      issue: "Enjeu",
      description: "Description",
      natureCategory: "Nature / catégorie",
      assessment: "Évaluation / statut",
      factor: "Facteur",
      relevance: "Pertinence",
      publishers: "Organismes cités",
    },
    addedByYou: "Ajouté par vous",
    corrected: "Corrigé",
    statusLine: "Statut : {{value}}",
    qualityLine: "Impact qualité : {{value}}",
    customerLine: "Satisfaction client : {{value}}",
    overallLine: "Influence globale : {{value}}",
    qualityShort: "Qualité : {{value}}",
    customerShort: "Client : {{value}}",
    overallShort: "Globale : {{value}}",
    standard: "Référentiel : {{value}}",
    method: "Méthode d’analyse : {{method}} — {{summary}}",
    methodShort: "Méthode : {{method}}",
    dates: "Date de l’analyse : {{analysis}}   |   Document généré le {{generated}}",
    analysisDate: "Date de l’analyse : {{value}}",
    standardGenerated: "Référentiel : {{standard}}   |   Document généré le {{generated}}",
    summaryLine:
      "Enjeux : {{issues}}   |   Retenus : {{retained}}   |   Non retenus : {{notRetained}}   |   À examiner : {{pending}}   |   Corrigés : {{corrected}}   |   Ajoutés manuellement : {{manual}}",
    summaryIssues:
      "Enjeux : {{issues}}   |   Retenus : {{retained}}   |   Non retenus : {{notRetained}}   |   À examiner : {{pending}}",
    summaryOther:
      "Corrigés : {{corrected}}   |   Ajoutés manuellement : {{manual}}   |   Facteurs externes : {{factors}}",
    factorsDocumented: "Facteurs externes documentés : {{count}}",
    sectionInternal: "1. Contexte interne — enjeux retenus",
    noInternal: "Aucun enjeu interne identifié.",
    sectionExternal: "2. Analyse externe",
    noFactors: "Aucun facteur externe documenté.",
    relevanceLine: "Pertinence : {{value}}",
    publishersLine: "Organismes cités : {{value}}",
    sectionSwot: "{{index}}. Analyse SWOT",
    sectionPestel: "{{index}}. Analyse PESTEL",
    sectionSynthesis: "{{index}}. Synthèse des enjeux",
    noIssues: "Aucun enjeu enregistré.",
    page: "Page ",
    manualCategory: "Ajout manuel",
  },
  questionsShort: {
    cv_climat_social: "Climat social",
    cv_reaction_changement: "Changement",
    cv_valeurs: "Valeurs",
    rc_expertise: "Expertise",
    rc_competences_manquantes: "Compétences",
    rc_equipements: "Équipements",
    rc_ressources_critiques: "Ressources critiques",
    gp_efficacite: "Organisation",
    gp_communication: "Communication interne",
    gp_decisions: "Décisions",
    gp_processus: "Processus",
  },
};

export default context;
