import fs from "node:fs/promises";
import { SpreadsheetFile, Workbook } from "@oai/artifact-tool";

const outputDir = new URL("./", import.meta.url).pathname;

const sections = {
  IDENTITY_ACTIVITY: "Identité et activité",
  SCOPE_GEOGRAPHY: "Périmètre et géographie",
  OPERATIONS_RESOURCES: "Opérations et ressources",
  EXTERNAL_CONTEXT: "Contexte externe",
  INTERESTED_PARTIES: "Parties intéressées",
  STRATEGY_OBJECTIVES: "Stratégie et objectifs",
};

const rows = [
  {
    section: "IDENTITY_ACTIVITY",
    key: "project.name",
    question: "Quel est le nom de votre entreprise ?",
    answer: "Notre entreprise s’appelle Atlas Industrie.",
    value: "Atlas Industrie",
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "project.logoUrl",
    question: "Souhaitez-vous ajouter le logo de votre entreprise ?",
    answer:
      "Oui. Le logo est disponible à l’adresse https://example.com/logo-atlas-industrie.png. Cette URL est un exemple à remplacer par notre véritable fichier.",
    value: "https://example.com/logo-atlas-industrie.png",
    optional: true,
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "organization.mission",
    question: "Quelle est la mission principale de votre entreprise ?",
    answer:
      "Notre mission est de concevoir, fabriquer et livrer des équipements métalliques industriels fiables, conformes aux exigences de nos clients et adaptés au marché marocain.",
    value:
      "Concevoir, fabriquer et livrer des équipements métalliques industriels fiables, conformes aux exigences de nos clients et adaptés au marché marocain.",
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "organization.offerings",
    question: "Quels produits ou services proposez-vous ?",
    answer:
      "Nous proposons des armoires métalliques industrielles, des châssis mécano-soudés sur mesure et des prestations de découpe, pliage, soudage et peinture. Nous assurons également l’installation et la maintenance ponctuelle chez le client.",
    value: [
      {
        name: "Armoires métalliques industrielles",
        type: "PRODUCT",
        range: "Standard et sur mesure",
        description: "Armoires destinées aux sites industriels et techniques.",
      },
      {
        name: "Châssis mécano-soudés",
        type: "PRODUCT",
        range: "Sur mesure",
        description: "Châssis fabriqués selon les plans et exigences du client.",
      },
      {
        name: "Découpe, pliage, soudage et peinture",
        type: "SERVICE",
        description: "Prestations de transformation et de finition de pièces métalliques.",
      },
      {
        name: "Installation et maintenance",
        type: "SERVICE",
        description: "Interventions ponctuelles sur les équipements livrés.",
      },
    ],
    critical: true,
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "organization.offeringRanges",
    question: "Avez-vous plusieurs gammes de produits ou services ?",
    answer:
      "Oui. Nous distinguons trois gammes : produits standards, fabrication sur mesure et services d’installation ou de maintenance.",
    value: {
      hasMultiple: true,
      ranges: ["Produits standards", "Fabrication sur mesure", "Installation et maintenance"],
    },
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "market.primaryCustomerSegments",
    question: "À qui vendez-vous principalement ?",
    answer:
      "Nous vendons principalement à des entreprises industrielles marocaines, des intégrateurs techniques, des entreprises de construction et quelques distributeurs professionnels.",
    value: [
      "Entreprises industrielles marocaines",
      "Intégrateurs techniques",
      "Entreprises de construction",
      "Distributeurs professionnels",
    ],
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "organization.employeeCount",
    question: "Combien de salariés compte approximativement votre entreprise ?",
    answer: "Notre entreprise compte actuellement environ 85 salariés.",
    value: 85,
    critical: true,
  },
  {
    section: "IDENTITY_ACTIVITY",
    key: "operations.keyProcesses",
    question:
      "Quels sont les processus ou étapes clés nécessaires à la réalisation de vos produits ou services ?",
    answer:
      "Nos processus clés sont la revue de la demande client, l’étude technique et la préparation des plans, les achats et la réception des matières, la planification, la découpe et le pliage, le soudage et l’assemblage, le traitement de surface et la peinture, le contrôle qualité final, puis l’emballage, la livraison et le service après-vente.",
    value: [
      { name: "Revue de la demande client", classification: "CORE", sequence: 1 },
      { name: "Étude technique et préparation", classification: "CORE", sequence: 2 },
      { name: "Achats et réception", classification: "SUPPORT", sequence: 3 },
      { name: "Planification de la production", classification: "MANAGEMENT", sequence: 4 },
      { name: "Découpe, pliage et usinage", classification: "CORE", sequence: 5 },
      { name: "Soudage et assemblage", classification: "CORE", sequence: 6 },
      { name: "Traitement de surface et peinture", classification: "CORE", sequence: 7 },
      { name: "Contrôle qualité final", classification: "CORE", sequence: 8 },
      { name: "Emballage et livraison", classification: "CORE", sequence: 9 },
      { name: "Service après-vente", classification: "CORE", sequence: 10 },
    ],
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "scope.certificationScope",
    question: "Quel périmètre souhaitez-vous couvrir par la certification ISO 9001 ?",
    answer:
      "Le périmètre souhaité couvre la conception, la fabrication et la livraison d’équipements métalliques industriels, ainsi que les services associés d’installation et de maintenance, réalisés depuis notre site de Casablanca.",
    value:
      "Conception, fabrication et livraison d’équipements métalliques industriels, ainsi que les services associés d’installation et de maintenance, réalisés depuis le site de Casablanca.",
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "operations.externalProviders",
    question: "Utilisez-vous des sous-traitants ou fournisseurs externes pour certaines activités ?",
    answer:
      "Oui. Nous utilisons des fournisseurs d’acier et de peinture, ainsi qu’un sous-traitant pour la galvanisation. La galvanisation est considérée comme critique car elle influence directement la conformité et la durabilité du produit.",
    value: {
      usesExternalProviders: true,
      providers: [
        {
          name: "Fournisseur acier homologué",
          category: "SUPPLIER",
          suppliedProductOrService: "Tôles, profilés et consommables métalliques",
          critical: true,
        },
        {
          name: "Fournisseur peinture homologué",
          category: "SUPPLIER",
          suppliedProductOrService: "Peintures industrielles et produits de traitement",
          critical: true,
        },
        {
          name: "Sous-traitant galvanisation",
          category: "SUBCONTRACTOR",
          suppliedProductOrService: "Galvanisation à chaud",
          outsourcedProcess: "Traitement de surface",
          critical: true,
        },
      ],
    },
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "organization.afterSalesServices",
    question: "Proposez-vous des services après-vente ou de maintenance ?",
    answer:
      "Oui. Nous proposons l’assistance à l’installation, le traitement des réclamations, le remplacement de pièces et des interventions de maintenance préventive ou corrective selon le contrat client.",
    value: {
      hasAfterSalesServices: true,
      services: [
        { name: "Assistance à l’installation", description: "Support lors de la mise en service." },
        {
          name: "Maintenance préventive et corrective",
          description: "Interventions planifiées ou à la suite d’une panne.",
        },
        {
          name: "Traitement des réclamations",
          description: "Analyse, réparation ou remplacement selon le cas.",
        },
      ],
    },
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "scope.operatingReach",
    question: "Vos activités sont-elles locales, nationales ou internationales ?",
    answer:
      "Nos activités sont principalement nationales : nous livrons des clients dans plusieurs régions du Maroc.",
    value: "NATIONAL",
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "scope.operatingCountries",
    question: "Dans quels pays exercez-vous vos activités ?",
    answer: "Nous exerçons actuellement nos activités uniquement au Maroc.",
    value: ["MA"],
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "organization.primarySector",
    question: "Quel est votre secteur d’activité principal ?",
    answer:
      "Notre secteur principal est la fabrication de structures et d’équipements métalliques pour l’industrie.",
    value: {
      label: "Fabrication de structures et d’équipements métalliques",
      code: "INDUSTRIE_METALLIQUE",
    },
    critical: true,
  },
  {
    section: "SCOPE_GEOGRAPHY",
    key: "regulatory.implementedFrameworks",
    question: "Avez-vous déjà mis en place des normes ou réglementations particulières ?",
    answer:
      "Nous appliquons déjà certaines procédures internes de contrôle qualité et de sécurité au travail. La démarche ISO 9001 est en cours de planification. Les exigences légales applicables doivent encore être inventoriées et vérifiées par le responsable QHSE.",
    value: {
      hasImplementedFrameworks: true,
      frameworks: [
        {
          type: "STANDARD",
          reference: "ISO 9001",
          name: "Système de management de la qualité",
          status: "PLANNED",
          scope: "Ensemble du périmètre de certification prévu",
        },
        {
          type: "OTHER",
          name: "Procédures internes de contrôle qualité et de sécurité",
          status: "PARTIAL",
          scope: "Production et contrôle final",
        },
      ],
    },
    critical: true,
  },
  {
    section: "OPERATIONS_RESOURCES",
    key: "operations.orderToDeliveryFlow",
    question: "Comment se déroule une commande, de la demande du client jusqu’à la livraison ?",
    answer:
      "Le commercial enregistre la demande et vérifie les exigences. Le bureau d’études réalise la revue technique et prépare l’offre. Après acceptation, la commande est confirmée dans l’ERP, les matières sont approvisionnées, puis la production est planifiée. Les pièces sont fabriquées, contrôlées à chaque étape et soumises à un contrôle final. Après libération par la qualité, elles sont emballées, expédiées et accompagnées des documents convenus. Le commercial confirme ensuite la réception et recueille le retour du client.",
    value:
      "Le commercial enregistre la demande et vérifie les exigences. Le bureau d’études réalise la revue technique et prépare l’offre. Après acceptation, la commande est confirmée dans l’ERP, les matières sont approvisionnées, puis la production est planifiée. Les pièces sont fabriquées, contrôlées à chaque étape et soumises à un contrôle final. Après libération par la qualité, elles sont emballées, expédiées et accompagnées des documents convenus. Le commercial confirme ensuite la réception et recueille le retour du client.",
  },
  {
    section: "OPERATIONS_RESOURCES",
    key: "resources.keyResources",
    question: "Quelles sont les ressources clés qui vous permettent de fonctionner ?",
    answer:
      "Nos ressources clés sont les opérateurs et techniciens qualifiés, le bureau d’études, les machines de découpe et de pliage, les postes de soudage, la cabine de peinture, les moyens de contrôle, l’ERP de production, le bâtiment industriel et nos fournisseurs critiques.",
    value: [
      { category: "HUMAN", name: "Opérateurs et techniciens qualifiés", critical: true },
      { category: "HUMAN", name: "Bureau d’études", critical: true },
      { category: "EQUIPMENT", name: "Machines de découpe et de pliage", critical: true },
      { category: "EQUIPMENT", name: "Postes de soudage", critical: true },
      { category: "EQUIPMENT", name: "Cabine de peinture", critical: true },
      { category: "EQUIPMENT", name: "Moyens de contrôle", critical: true },
      { category: "SOFTWARE", name: "ERP de production", critical: true },
      { category: "INFRASTRUCTURE", name: "Bâtiment industriel de Casablanca", critical: true },
      { category: "SUPPLIER", name: "Fournisseurs de matières critiques", critical: true },
    ],
  },
  {
    section: "OPERATIONS_RESOURCES",
    key: "resources.criticalCompetencies",
    question: "Quelles compétences sont indispensables dans votre activité ?",
    answer:
      "Les compétences indispensables sont la lecture de plans, la conception mécanique, le réglage des machines, le soudage qualifié, l’application de peinture industrielle, le contrôle dimensionnel, la planification de production, la maintenance et la maîtrise des exigences qualité et sécurité.",
    value: [
      "Lecture de plans",
      "Conception mécanique",
      "Réglage des machines",
      "Soudage qualifié",
      "Peinture industrielle",
      "Contrôle dimensionnel",
      "Planification de production",
      "Maintenance",
      "Maîtrise des exigences qualité et sécurité",
    ],
  },
  {
    section: "OPERATIONS_RESOURCES",
    key: "operations.majorDifficulties",
    question: "Avez-vous déjà rencontré des difficultés majeures dans votre fonctionnement ?",
    answer:
      "Oui. Nos principales difficultés sont les retards d’approvisionnement en acier, les variations de charge de production, les reprises liées à des plans clients incomplets et le suivi encore insuffisant de certains indicateurs.",
    value: {
      has: true,
      items: [
        "Retards d’approvisionnement en acier",
        "Variations de charge de production",
        "Reprises liées à des plans clients incomplets",
        "Suivi insuffisant de certains indicateurs",
      ],
    },
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "context.externalFactors",
    question: "Quels facteurs externes peuvent affecter votre activité ?",
    answer:
      "Les principaux facteurs externes sont l’évolution des exigences légales, la fluctuation du prix et de la disponibilité de l’acier, la pression concurrentielle, l’évolution des technologies de fabrication, les exigences environnementales, la disponibilité de main-d’œuvre qualifiée et les attentes croissantes des clients en matière de délais et de traçabilité.",
    value: [
      { category: "LEGAL", description: "Évolution des exigences légales applicables." },
      { category: "ECONOMIC", description: "Fluctuation du prix et de la disponibilité de l’acier." },
      { category: "COMPETITION", description: "Pression sur les prix et les délais." },
      { category: "TECHNOLOGY", description: "Évolution des technologies de fabrication." },
      { category: "ENVIRONMENT", description: "Exigences liées aux déchets, émissions et produits chimiques." },
      { category: "SOCIAL", description: "Disponibilité de main-d’œuvre qualifiée." },
      { category: "OTHER", description: "Attentes croissantes en matière de délais et de traçabilité." },
    ],
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "regulatory.knownRequirements",
    question:
      "Connaissez-vous des exigences légales ou normatives spécifiques que vous devez respecter ?",
    answer:
      "Nous avons identifié de manière préliminaire les exigences relatives au droit du travail, à la santé et à la sécurité, aux équipements et machines, à la gestion des déchets et produits chimiques, à la protection des données et aux exigences contractuelles de nos clients. Cette liste est indicative et doit être vérifiée dans la veille réglementaire par le responsable QHSE.",
    value: {
      hasKnownRequirements: true,
      requirements: [
        { name: "Exigences applicables du droit du travail et de la sécurité au travail" },
        { name: "Exigences applicables aux équipements et machines" },
        { name: "Exigences de gestion des déchets et produits chimiques" },
        { name: "Exigences applicables à la protection des données personnelles" },
        { name: "Exigences contractuelles et spécifications des clients" },
      ],
    },
    critical: true,
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "context.sectorChallenges",
    question: "Quels sont les défis actuels de votre secteur d’activité ?",
    answer:
      "Les défis du secteur sont la volatilité du prix des matières premières, les délais d’approvisionnement, la concurrence par les prix, le recrutement de soudeurs qualifiés, la modernisation des équipements et le renforcement des exigences de qualité, de sécurité et de traçabilité.",
    value: [
      "Volatilité du prix des matières premières",
      "Délais d’approvisionnement",
      "Concurrence par les prix",
      "Recrutement de soudeurs qualifiés",
      "Modernisation des équipements",
      "Renforcement des exigences de qualité, sécurité et traçabilité",
    ],
  },
  {
    section: "INTERESTED_PARTIES",
    key: "stakeholders.customerNeeds",
    question: "Qui sont vos clients types et que recherchent-ils principalement ?",
    answer:
      "Nos clients industriels recherchent des produits conformes aux plans, robustes et traçables, livrés dans les délais. Les intégrateurs techniques veulent de la flexibilité, une réponse rapide aux modifications et une documentation complète. Les entreprises de construction attendent surtout la fiabilité des délais, la coordination sur chantier et la disponibilité du service après-vente.",
    value: [
      {
        customerType: "Entreprises industrielles",
        needs: ["Conformité aux plans", "Robustesse", "Traçabilité", "Respect des délais"],
      },
      {
        customerType: "Intégrateurs techniques",
        needs: ["Flexibilité", "Réactivité aux modifications", "Documentation complète"],
      },
      {
        customerType: "Entreprises de construction",
        needs: ["Fiabilité des délais", "Coordination sur chantier", "Service après-vente"],
      },
    ],
    critical: true,
  },
  {
    section: "INTERESTED_PARTIES",
    key: "stakeholders.otherParties",
    question: "Quels sont vos autres interlocuteurs ou parties intéressées importants ?",
    answer:
      "Nos autres parties intéressées importantes sont les salariés, les fournisseurs de matières, les sous-traitants, les autorités compétentes, les propriétaires, la banque, les partenaires techniques et le voisinage du site.",
    value: [
      { category: "EMPLOYEE", name: "Salariés" },
      { category: "SUPPLIER", name: "Fournisseurs de matières" },
      { category: "SUBCONTRACTOR", name: "Sous-traitants de traitement de surface" },
      { category: "AUTHORITY", name: "Autorités compétentes" },
      { category: "OWNER", name: "Propriétaires et direction" },
      { category: "BANK", name: "Partenaires bancaires" },
      { category: "PARTNER", name: "Partenaires techniques" },
      { category: "COMMUNITY", name: "Voisinage du site" },
    ],
    critical: true,
  },
  {
    section: "INTERESTED_PARTIES",
    key: "stakeholders.expectations",
    question: "Qu’attendent ces parties intéressées de votre entreprise ?",
    answer:
      "Les salariés attendent un environnement de travail sûr, stable et formateur. Les fournisseurs et sous-traitants attendent des commandes claires et des paiements dans les délais. Les autorités attendent le respect des obligations applicables. La direction attend la rentabilité, la maîtrise des risques et la satisfaction client. La banque attend une gestion financière fiable, tandis que le voisinage attend la maîtrise des nuisances.",
    value: [
      { party: "Salariés", expectations: ["Sécurité", "Stabilité", "Formation", "Communication"] },
      { party: "Fournisseurs et sous-traitants", expectations: ["Commandes claires", "Paiement dans les délais", "Prévisions fiables"] },
      { party: "Autorités compétentes", expectations: ["Respect des obligations applicables", "Coopération lors des contrôles"] },
      { party: "Direction et propriétaires", expectations: ["Rentabilité", "Maîtrise des risques", "Satisfaction client"] },
      { party: "Banque", expectations: ["Gestion financière fiable", "Respect des engagements"] },
      { party: "Voisinage", expectations: ["Maîtrise du bruit", "Propreté", "Prévention des nuisances"] },
    ],
  },
  {
    section: "STRATEGY_OBJECTIVES",
    key: "strategy.annualObjectives",
    question: "Quels sont les trois ou quatre principaux objectifs de votre entreprise cette année ?",
    answer:
      "Nos objectifs 2026 sont de réduire les retards de livraison à moins de 8 %, diminuer les reprises internes de 20 %, atteindre au moins 90 % de satisfaction client et terminer la mise en place du système ISO 9001 avant la fin de l’année.",
    value: [
      { description: "Réduire les retards de livraison", target: "Moins de 8 %", dueDate: "2026-12-31", owner: "Responsable production" },
      { description: "Réduire les reprises internes", target: "Réduction de 20 %", dueDate: "2026-12-31", owner: "Responsable qualité" },
      { description: "Améliorer la satisfaction client", target: "Au moins 90 %", dueDate: "2026-12-31", owner: "Responsable commercial" },
      { description: "Mettre en place le système ISO 9001", target: "Système prêt pour audit", dueDate: "2026-12-31", owner: "Responsable QHSE" },
    ],
  },
  {
    section: "STRATEGY_OBJECTIVES",
    key: "strategy.values",
    question: "Quelles valeurs guident vos décisions ?",
    answer:
      "Nos décisions sont guidées par la qualité, la sécurité, l’intégrité, le respect des engagements, l’esprit d’équipe, l’amélioration continue et l’orientation client.",
    value: [
      "Qualité",
      "Sécurité",
      "Intégrité",
      "Respect des engagements",
      "Esprit d’équipe",
      "Amélioration continue",
      "Orientation client",
    ],
  },
  {
    section: "STRATEGY_OBJECTIVES",
    key: "strategy.differentiators",
    question: "Qu’est-ce qui vous différencie de vos concurrents ?",
    answer:
      "Nous nous différencions par notre capacité de fabrication sur mesure, la proximité avec les clients marocains, des délais de réponse courts, la maîtrise en interne de plusieurs opérations, la flexibilité pour les petites séries et un accompagnement technique avant et après livraison.",
    value: [
      "Fabrication sur mesure",
      "Proximité avec les clients marocains",
      "Délais de réponse courts",
      "Maîtrise de plusieurs opérations en interne",
      "Flexibilité pour les petites séries",
      "Accompagnement technique avant et après livraison",
    ],
  },
  {
    section: "STRATEGY_OBJECTIVES",
    key: "strategy.iso9001Motivation",
    question: "Pourquoi souhaitez-vous vous engager dans une démarche ISO 9001 ?",
    answer:
      "Nous voulons structurer nos processus, clarifier les responsabilités, réduire les erreurs et les retards, mieux maîtriser nos fournisseurs, améliorer la satisfaction client et répondre aux exigences de clients industriels qui privilégient des fournisseurs certifiés.",
    value:
      "Structurer nos processus, clarifier les responsabilités, réduire les erreurs et les retards, mieux maîtriser nos fournisseurs, améliorer la satisfaction client et répondre aux exigences de clients industriels qui privilégient des fournisseurs certifiés.",
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "context.marketChallenges",
    question: "Quels sont les principaux défis que vous rencontrez dans votre marché ?",
    answer:
      "Nos principaux défis de marché sont la pression sur les prix, les demandes urgentes, les changements tardifs de spécifications, les importations à bas coût, la hausse du prix des matières et la difficulté à maintenir des délais courts pendant les périodes de forte charge.",
    value: [
      "Pression sur les prix",
      "Demandes urgentes",
      "Changements tardifs de spécifications",
      "Importations à bas coût",
      "Hausse du prix des matières",
      "Maintien de délais courts en période de forte charge",
    ],
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "context.growthOpportunities",
    question: "Quelles opportunités de croissance identifiez-vous ?",
    answer:
      "Nous identifions des opportunités dans les équipements pour les énergies renouvelables, les contrats de maintenance, la digitalisation du suivi client, le développement de produits standards, l’accès à de nouveaux donneurs d’ordre grâce à la certification ISO 9001 et, à moyen terme, l’export vers l’Afrique de l’Ouest.",
    value: [
      "Équipements pour les énergies renouvelables",
      "Contrats de maintenance",
      "Digitalisation du suivi client",
      "Développement de produits standards",
      "Accès à de nouveaux donneurs d’ordre grâce à ISO 9001",
      "Export vers l’Afrique de l’Ouest à moyen terme",
    ],
  },
  {
    section: "EXTERNAL_CONTEXT",
    key: "regulatory.criticalRisks",
    question: "Quels risques juridiques ou réglementaires jugez-vous critiques ?",
    answer:
      "Nous considérons comme critiques les risques liés aux accidents du travail, à la non-conformité des machines et installations, au stockage ou à l’utilisation de produits chimiques, à la gestion des déchets, au non-respect des obligations sociales, à la protection des données personnelles et à la livraison d’un produit non conforme à une exigence contractuelle ou réglementaire. Cette liste doit être confirmée par la veille réglementaire.",
    value: [
      "Accidents du travail et manquements aux obligations de sécurité",
      "Non-conformité des machines et installations",
      "Stockage ou utilisation inadéquate de produits chimiques",
      "Gestion non conforme des déchets",
      "Non-respect des obligations sociales",
      "Atteinte à la protection des données personnelles",
      "Livraison d’un produit non conforme aux exigences applicables",
    ],
    critical: true,
  },
  {
    section: "OPERATIONS_RESOURCES",
    key: "operations.recurrentIssues",
    question: "Avez-vous des incidents ou non-conformités récurrents dans vos processus ?",
    answer:
      "Oui. Nous rencontrons des écarts dimensionnels après pliage, des défauts de peinture, des retards liés aux matières et des reprises dues à des informations techniques incomplètes. Les écarts dimensionnels apparaissent environ deux à trois fois par mois et peuvent provoquer des reprises et des retards. Les défauts de peinture sont moins fréquents mais peuvent entraîner le rebut ou une nouvelle finition.",
    value: {
      hasRecurrentIssues: true,
      issues: [
        { description: "Écarts dimensionnels après pliage", frequency: "Deux à trois fois par mois", impact: "Reprises et retards de livraison" },
        { description: "Défauts de peinture", frequency: "Environ une fois par mois", impact: "Nouvelle finition ou rebut" },
        { description: "Retards liés aux matières", frequency: "Variable selon les fournisseurs", impact: "Décalage du planning de production" },
        { description: "Informations techniques incomplètes", frequency: "Plusieurs dossiers par trimestre", impact: "Clarifications, reprises et temps perdu" },
      ],
    },
  },
];

if (rows.length !== 33) throw new Error(`Expected 33 profile answers, received ${rows.length}`);

const workbook = Workbook.create();
const copySheet = workbook.worksheets.add("Réponses à copier");
const jsonSheet = workbook.worksheets.add("Valeurs JSON");

for (const sheet of [copySheet, jsonSheet]) {
  sheet.showGridLines = false;
}

copySheet.mergeCells("A1:E1");
copySheet.getRange("A1").values = [["Profil projet · réponses prêtes à copier"]];
copySheet.mergeCells("A2:E2");
copySheet.getRange("A2").values = [[
  "Exemple fictif pour Atlas Industrie — remplacez les informations par vos données réelles, surtout les éléments réglementaires et le lien du logo.",
]];
copySheet.getRange("A4:E4").values = [[
  "N°",
  "Section",
  "Question",
  "Réponse à copier-coller",
  "Critique pour la veille",
]];
copySheet.getRange(`A5:E${rows.length + 4}`).values = rows.map((row, index) => [
  index + 1,
  sections[row.section],
  row.question,
  row.answer,
  row.critical ? "Oui" : "Non",
]);

copySheet.getRange("A1:E1").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
};
copySheet.getRange("A2:E2").format = {
  fill: "#F5F3FF",
  font: { color: "#5B21B6", italic: true, size: 10 },
  verticalAlignment: "center",
  wrapText: true,
};
copySheet.getRange("A4:E4").format = {
  fill: "#6D28D9",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
  wrapText: true,
  borders: { preset: "outside", style: "thin", color: "#5B21B6" },
};
copySheet.getRange(`A5:E${rows.length + 4}`).format = {
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
    bottom: { style: "thin", color: "#D1D5DB" },
  },
};
copySheet.getRange(`A5:A${rows.length + 4}`).format = {
  horizontalAlignment: "center",
  font: { bold: true, color: "#6D28D9" },
};
copySheet.getRange(`E5:E${rows.length + 4}`).format = {
  horizontalAlignment: "center",
  font: { bold: true, color: "#374151" },
};
copySheet.getRange("A1:E1").format.rowHeightPx = 44;
copySheet.getRange("A2:E2").format.rowHeightPx = 44;
copySheet.getRange("A4:E4").format.rowHeightPx = 36;
copySheet.getRange(`A5:E${rows.length + 4}`).format.rowHeightPx = 90;
copySheet.getRange(`A5:A${rows.length + 4}`).format.columnWidthPx = 48;
copySheet.getRange(`B5:B${rows.length + 4}`).format.columnWidthPx = 170;
copySheet.getRange(`C5:C${rows.length + 4}`).format.columnWidthPx = 390;
copySheet.getRange(`D5:D${rows.length + 4}`).format.columnWidthPx = 610;
copySheet.getRange(`E5:E${rows.length + 4}`).format.columnWidthPx = 110;
copySheet.freezePanes.freezeRows(4);

const sectionColors = {
  IDENTITY_ACTIVITY: "#EDE9FE",
  SCOPE_GEOGRAPHY: "#DBEAFE",
  OPERATIONS_RESOURCES: "#DCFCE7",
  EXTERNAL_CONTEXT: "#FEF3C7",
  INTERESTED_PARTIES: "#FCE7F3",
  STRATEGY_OBJECTIVES: "#E0E7FF",
};
rows.forEach((row, index) => {
  const rowNumber = index + 5;
  copySheet.getRange(`B${rowNumber}`).format.fill = sectionColors[row.section];
  if (row.critical) copySheet.getRange(`E${rowNumber}`).format.fill = "#DBEAFE";
});

jsonSheet.mergeCells("A1:C1");
jsonSheet.getRange("A1").values = [["Valeurs structurées compatibles avec le profil"]];
jsonSheet.mergeCells("A2:C2");
jsonSheet.getRange("A2").values = [[
  "La colonne JSON reprend exactement la structure attendue par chaque champ. Les valeurs restent des exemples à adapter avant utilisation.",
]];
jsonSheet.getRange("A4:C4").values = [["N°", "Clé du champ", "Valeur JSON à copier"]];
jsonSheet.getRange(`A5:C${rows.length + 4}`).values = rows.map((row, index) => [
  index + 1,
  row.key,
  JSON.stringify(row.value),
]);
jsonSheet.getRange("A1:C1").format = {
  fill: "#111827",
  font: { bold: true, color: "#FFFFFF", size: 18 },
  verticalAlignment: "center",
};
jsonSheet.getRange("A2:C2").format = {
  fill: "#EFF6FF",
  font: { color: "#1D4ED8", italic: true, size: 10 },
  verticalAlignment: "center",
  wrapText: true,
};
jsonSheet.getRange("A4:C4").format = {
  fill: "#2563EB",
  font: { bold: true, color: "#FFFFFF" },
  verticalAlignment: "center",
};
jsonSheet.getRange(`A5:C${rows.length + 4}`).format = {
  font: { color: "#1F2937", size: 10 },
  verticalAlignment: "top",
  wrapText: true,
  borders: {
    insideHorizontal: { style: "thin", color: "#E5E7EB" },
    bottom: { style: "thin", color: "#D1D5DB" },
  },
};
jsonSheet.getRange(`A5:A${rows.length + 4}`).format = {
  horizontalAlignment: "center",
  font: { bold: true, color: "#2563EB" },
};
jsonSheet.getRange(`B5:B${rows.length + 4}`).format.font = {
  bold: true,
  color: "#334155",
  name: "Courier New",
  size: 9,
};
jsonSheet.getRange("A1:C1").format.rowHeightPx = 44;
jsonSheet.getRange("A2:C2").format.rowHeightPx = 40;
jsonSheet.getRange("A4:C4").format.rowHeightPx = 34;
jsonSheet.getRange(`A5:C${rows.length + 4}`).format.rowHeightPx = 82;
jsonSheet.getRange(`A5:A${rows.length + 4}`).format.columnWidthPx = 48;
jsonSheet.getRange(`B5:B${rows.length + 4}`).format.columnWidthPx = 270;
jsonSheet.getRange(`C5:C${rows.length + 4}`).format.columnWidthPx = 900;
jsonSheet.freezePanes.freezeRows(4);

const copyInspect = await workbook.inspect({
  kind: "table",
  range: `Réponses à copier!A1:E${rows.length + 4}`,
  include: "values,formulas",
  tableMaxRows: 8,
  tableMaxCols: 5,
  maxChars: 5000,
});
console.log(copyInspect.ndjson);

const errors = await workbook.inspect({
  kind: "match",
  searchTerm: "#REF!|#DIV/0!|#VALUE!|#NAME\\?|#N/A",
  options: { useRegex: true, maxResults: 100 },
  summary: "final formula error scan",
});
console.log(errors.ndjson);

for (const sheetName of ["Réponses à copier", "Valeurs JSON"]) {
  const preview = await workbook.render({
    sheetName,
    autoCrop: "all",
    scale: 0.7,
    format: "png",
  });
  const filename = sheetName === "Réponses à copier" ? "preview-copy.png" : "preview-json.png";
  await fs.writeFile(`${outputDir}${filename}`, new Uint8Array(await preview.arrayBuffer()));
}

const output = await SpreadsheetFile.exportXlsx(workbook);
await output.save(`${outputDir}reponses-profil-projet.xlsx`);
console.log(`Saved ${rows.length} answers to ${outputDir}reponses-profil-projet.xlsx`);
