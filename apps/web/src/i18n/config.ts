/**
 * Locales (ADR 0009).
 *
 * French, English and Arabic ship together, and right-to-left is not a retrofit:
 * `dir` is derived from the locale and every stylesheet rule uses CSS logical
 * properties, so Arabic renders correctly from the first commit.
 *
 * Translations here are machine drafts, pending native review. Legal text is not
 * among them: no legal wording reaches a document template until a human has
 * approved it.
 */

export const LOCALES = ['fr', 'en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'fr';

/** Locales whose script runs right to left. */
const RTL_LOCALES: ReadonlySet<string> = new Set(['ar']);

export function isLocale(value: string): value is Locale {
  return (LOCALES as readonly string[]).includes(value);
}

export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return RTL_LOCALES.has(locale) ? 'rtl' : 'ltr';
}

const messages = {
  fr: {
    appName: 'easyERP',
    tagline: 'La gestion de votre entreprise, dans votre langue.',

    // Navigation
    navDashboard: 'Tableau de bord',
    navPermissions: 'Permissions',
    navSettings: 'Paramètres',
    navSignIn: 'Se connecter',
    navSignOut: 'Se déconnecter',
    navMain: 'Navigation principale',
    navSkipToContent: 'Aller au contenu',

    // Appearance
    appearance: 'Apparence',
    themeLabel: 'Thème',
    themeLight: 'Jour',
    themeDark: 'Nuit',
    themeSystem: 'Système',
    themeToggle: 'Changer de thème',
    themeCurrent: 'Thème actuel : {theme}',

    // Locale
    localeLabel: 'Langue',

    // Status
    statusTitle: 'État du déploiement',
    statusSubtitle: 'Chaque client tourne sur son propre hôte, sa propre base et son propre port.',
    statusOk: 'Opérationnel',
    statusDegraded: 'Dégradé',
    statusDown: 'Injoignable',
    statusChecking: 'Vérification…',
    checkApi: 'API',
    checkDatabase: 'Base de données',
    checkWeb: 'Interface web',
    checkApiHelp: 'API ne répond pas — vérifiez 3002 / pnpm dev',
    checkDatabaseHelp: 'Base non prête — vérifiez docker / pnpm db:up',
    checkWebHelp: 'Interface indisponible',
    checkStatusTitle: 'Services',

    // Dashboard
    dashboardTitle: 'Tableau de bord',
    dashboardGreeting: 'Bonjour',

    // Sales & Documents
    navSalesOrders: 'Commandes de vente',
    navDeliveryNotes: 'Bon de livraison',
    navCustomerInvoices: 'Factures client',
    navCreditNotes: 'Avoirs client',
    // Stock & Catalog
    navItems: 'Articles',
    navParties: 'Parties',
    navStock: 'Stock',
    // Purchasing & Production
    navPurchasing: 'Achats',
    navProduction: 'Production',
    navBoms: 'Nomenclatures',
    // Finance
    navPayments: 'Paiements',

    // Sales Orders
    salesOrdersTitle: 'Commandes de vente',
    salesOrdersDescription: 'Gérez vos commandes clients.',
    salesOrdersBody: 'Créer, éditer et émettre des commandes.',

    // Delivery Notes
    deliveryNotesTitle: 'Bons de livraison',
    deliveryNotesDescription: 'Document d\'expédition.',
    deliveryNotesBody: 'Convertir les réservations en mouvements de stock.',

    // Customer Invoices
    customerInvoicesTitle: 'Factures clients',
    customerInvoicesDescription: 'Documents fiscaux.',
    customerInvoicesBody: 'Facturer les livraisons contre une commande.',

    // Credit Notes
    creditNotesTitle: 'Avoirs clients',
    creditNotesDescription: 'Justificatifs de correction.',
    creditNotesBody: 'Corriger ou annuler une facture émise.',

    // Items
    itemsTitle: 'Articles',
    itemsDescription: 'Catalogue de vente.',
    itemsBody: 'Gérer les articles en stock ou en service.',

    // Parties
    partiesTitle: 'Parties',
    partiesDescription: 'Clients et fournisseurs.',
    partiesBody: 'Gérer les contreparties commerciales.',

    // Stock
    stockTitle: 'Stock',
    stockDescription: 'Journal des mouvements.',
    stockBody: 'Voir le solde, les réservations et l\'historique.',

    // Purchasing
    purchasingTitle: 'Achats',
    purchasingDescription: 'Commandes fournisseurs.',
    purchasingBody: 'Planifier les achats et les réceptions.',

    // Production
    productionTitle: 'Production',
    productionDescription: 'Ordres de fabrication.',
    productionBody: 'Produire des articles avec des nomenclatures.',

    // BOMs
    bomsTitle: 'Nomenclatures',
    bomsDescription: 'Compositions d\'articles.',
    bomsBody: 'Gérer les versions de BOM.',

    // Payments
    paymentsTitle: 'Paiements',
    paymentsDescription: 'Encaissements.',
    paymentsBody: 'Enregistrer les paiements et les affectations.',
    paymentDetails: 'Détails du paiement',
    paymentNumber: 'Numéro',
    paymentDate: 'Date',
    paymentAmount: 'Montant',
    paymentMethod: 'Méthode',
    paymentReference: 'Référence',
    paymentNote: 'Note',
    paymentParty: 'Partie',
    paymentStatus: 'Statut',
    paymentAllocations: 'Affectations',
    paymentAllocationDocument: 'Document',
    paymentAllocationAmount: 'Montant',
    paymentUnallocatedCredit: 'Crédit non alloué',
    paymentCreatedAt: 'Créé le',

    // Settings subpages
    unitsTitle: 'Unités de mesure',
    unitsDescription: 'Unités et fractions.',
    unitsBody: 'Gérer les unités et les produits de fractionnement.',

    numberPatternsTitle: 'Modèles de numérotation',
    numberPatternsDescription: 'Patterns pour chaque type de document.',
    numberPatternsBody: 'Configurer les modèles et le zéro-padding.',

    modulesTitle: 'Modules',
    modulesDescription: 'Activer ou désactiver les modules.',
    modulesBody: 'Masquer ou afficher les modules inutiles.',

    labelsTitle: 'Terminologie',
    labelsDescription: 'Vocabulaire du produit.',
    labelsBody: 'Renommer les concepts affichés.',

    usersTitle: 'Utilisateurs',
    usersDescription: 'Comptes et rôles.',
    usersBody: 'Inviter et gérer les utilisateurs.',

    rolesTitle: 'Rôles',
    rolesDescription: 'Collections de permissions.',
    rolesBody: 'Définir les rôles et les autorisations.',

    // Common UI strings
    customer: 'Client',
    statusIssued: 'Émise',
    date: 'Date',
    amount: 'Montant',
    currency: 'Devise',
    item: 'Article',
    invoiceTitle: 'Facture',
    invoiceDescription: 'Document fiscal émis.',
    invoiceDetails: 'Détails de la facture',
    invoiceNumber: 'Numéro',
    invoiceCustomer: 'Client',
    invoiceStatus: 'Statut',
    invoiceDate: 'Date',
    invoiceSubtotal: 'Sous-total',
    invoiceTax: 'TVA',
    invoiceTotal: 'Total',
    invoiceLines: 'Lignes',
    invoiceArchive: 'Archive',
    invoiceArchiveDescription: 'Version PDF conservée par le serveur.',

    printButton: 'Imprimer',
    downloadButton: 'Télécharger',

    invoice: 'Facture',
    creditNoteStatus: 'Statut de l\'avoir',

    creditNoteTitle: 'Avoir client',
    creditNoteDescription: 'Justificatif de correction.',
    creditNoteDetails: 'Détails de l\'avoir',
    creditNoteNumber: 'Numéro',
    correctedInvoice: 'Facture corrigée',
    creditNoteCustomer: 'Client',
    creditNoteDate: 'Date',
    creditNoteAmount: 'Montant',
    creditNoteLines: 'Lignes',
    creditNoteArchive: 'Archive',
    creditNoteArchiveDescription: 'Version PDF conservée par le serveur.',

    stockItemDescription: 'Position d\'article.',
    stockPosition: 'Position',
    onHand: 'En stock',
    reserved: 'Réservé',
    available: 'Disponible',
    stockReorderNote: 'Recommandation de réapprovisionnement',
    stockReorderLevel: 'Seuil de réapprovisionnement',
    stockLedger: 'Journal de stock',
    stockLedgerDescription: 'Mouvements et entrées.',
    stockHistory: 'Historique',
    openingBalanceEntry: 'Solde d\'ouverture',
    salesOrderEntry: 'Commande de vente',
    'YYYY-MM-DD': 'YYYY-MM-DD',
    source: 'Source',
    openingBalance: 'Solde d\'ouverture',
    quantity: 'Quantité',

    // Settings
    settingsTitle: 'Paramètres',
    settingsDescription: 'Préférences de cette interface et de ce déploiement.',
    settingsAppearance: 'Apparence',
    settingsLanguage: 'Langue',
    settingsBusiness: 'Entreprise',
    settingsBusinessName: 'Raison sociale',
    settingsVatRegime: 'Régime de TVA',
    settingsCurrency: 'Devise',
    settingsLocked: 'verrouillé',
    saved: 'Enregistré',

    // Sign in
    signInTitle: 'Se connecter',
    signInSubtitle: 'easyERP',
    signInIntro: 'Vos ventes, vos achats et votre stock, au même endroit.',
    signInEmail: 'Adresse e-mail',
    signInPassword: 'Mot de passe',
    signInSubmit: 'Se connecter',
    signInWorking: 'Connexion…',
    signInError: 'Identifiants refusés.',
    signInNotice:
      'Aucun compte n\'existe encore : la création d\'utilisateurs arrive avec l\'écran d\'administration.',
    signInBack: 'Retour au tableau de bord',

    // Setup (one-time, ADR 0012)
    setupTitle: 'Premier démarrage',
    setupIntro:
      'Ce déploiement ne contient encore ni entreprise ni utilisateur. Présentez le jeton du serveur, puis créez l\'entreprise et son premier administrateur. Cette page ne s\'ouvrira plus jamais après.',
    setupToken: 'Jeton de premier démarrage',
    setupTokenHelp: 'Valeur de FIRST_SETUP_TOKEN dans l\'environnement de l\'hôte.',
    showToken: 'Afficher le jeton',
    hideToken: 'Masquer le jeton',
    showPassword: 'Afficher le mot de passe',
    hidePassword: 'Masquer le mot de passe',
    setupBusiness: 'Entreprise',
    setupLegalName: 'Raison sociale',
    setupDisplayName: 'Nom affiché',
    setupTaxIdentifier: 'Identifiant fiscal',
    setupCountryCode: 'Pays (ISO, 2 lettres)',
    setupVatRegime: 'Régime de TVA',
    setupVatStandard: 'STANDARD — détail par taux',
    setupVatExempt: 'EXEMPT — mention légale',
    setupCurrency: 'Devise (ISO, 3 lettres)',
    setupPhone: 'Téléphone',
    setupEmail: 'E-mail',
    setupAddress1: 'Adresse (ligne 1)',
    setupAddress2: 'Adresse (ligne 2)',
    setupCity: 'Ville',
    setupPostalCode: 'Code postal',
    setupAdmin: 'Premier administrateur',
    setupAdminName: 'Nom',
    setupAdminEmail: 'Adresse e-mail',
    setupAdminPassword: 'Mot de passe (8 caractères minimum)',
    setupUnits: 'Unités de mesure (au moins une)',
    setupUnitCode: 'Code (p. ex. PCS)',
    setupUnitFraction: 'Fractions autorisées',
    setupAddUnit: 'Ajouter une unité',
    setupRates: 'Taux de taxe (au moins un en STANDARD)',
    setupRateCode: 'Code (p. ex. TVA19)',
    setupRateValue: 'Taux (p. ex. 0.19)',
    setupAddRate: 'Ajouter un taux',
    setupRemove: 'Retirer',
    setupSubmit: 'Créer l\'entreprise',
    setupWorking: 'Création…',
    setupDone: 'Entreprise créée. Connectez-vous avec le compte administrateur.',
    setupClosed: 'Le démarrage est déjà terminé : cette page est fermée.',
    setupBackSignIn: 'Aller à la connexion',

    // Common
    save: 'Enregistrer',
    cancel: 'Annuler',
    close: 'Fermer',
    loading: 'Chargement…',
    retry: 'Réessayer',
    yes: 'Oui',
    no: 'Non',
    newItem: 'Nouvel article',
    addFirstItem: 'Ajouter le premier article',
    formCreate: 'Créer',
    formCreating: 'Création…',
    formActive: 'Actif',
    itemCode: 'Code article',
    itemName: 'Nom',
    itemDescription: 'Description',
    itemTypeLabel: 'Type',
    itemBaseUnit: 'Unité de base',
    itemSaleUnit: 'Unité de vente',
    itemNone: '— Aucune —',
    itemTaxRate: 'Taux de taxe',
    itemFodec: 'Soumis FODEC',
    itemSalePrice: 'Prix de vente',
    itemPurchasePrice: 'Prix d\'achat',
    itemReorderPoint: 'Seuil de réapprovisionnement',
    partyCode: 'Code',
    partyName: 'Nom',
    partyRolesLabel: 'Rôles',
    roleSupplier: 'Fournisseur',
    partyTaxId: 'Identifiant fiscal',
    loadFailed: 'Échec du chargement',
    tryAgainOrContactSupport: 'Réessayer ou contacter le support',
    noItems: 'Aucun article',
    newParty: 'Nouvelle partie',
    addFirstParty: 'Ajouter la première partie',
    noParties: 'Aucune partie',
    party: 'Partie',
    country: 'Pays',
    docNumber: 'Numéro',
    docCounterparty: 'Contrepartie',
    docStatus: 'Statut',
    docTotal: 'Total',
    statusDraft: 'Brouillon',
    statusCancelled: 'Annulée',
    newSalesOrder: 'Nouvelle commande',
    orderAddLine: 'Ajouter une ligne',
    addFirstSalesOrder: 'Ajouter la première commande',
    noSalesOrders: 'Aucune commande',
    newDeliveryNote: 'Nouveau bon de livraison',
    addFirstDeliveryNote: 'Ajouter le premier bon',
    noDeliveryNotes: 'Aucun bon de livraison',
    newCustomerInvoice: 'Nouvelle facture',
    addFirstCustomerInvoice: 'Ajouter la première facture',
    noCustomerInvoices: 'Aucune facture',
    newCreditNote: 'Nouvel avoir',
    addFirstCreditNote: 'Ajouter le premier avoir',
    noCreditNotes: 'Aucun avoir',
    newPayment: 'Nouveau paiement',
    addFirstPayment: 'Ajouter le premier paiement',
    noPayments: 'Aucun paiement',
    newPurchaseOrder: 'Nouvelle commande fournisseur',
    docIssue: 'Émettre',
    prodBomVersion: 'Version de nomenclature',
    prodFinishedItem: 'Article fini',
    bomComponent: 'Composant',
    addFirstPurchaseOrder: 'Ajouter la première commande',
    noPurchaseOrders: 'Aucune commande fournisseur',
    newGoodsReceipt: 'Nouvelle réception',
    linkOrder: 'Commande liée (optionnel)',
    docOutstanding: 'Restant dû',
    addFirstGoodsReceipt: 'Ajouter la première réception',
    noGoodsReceipts: 'Aucune réception',
    newProductionOrder: 'Nouvel ordre de fabrication',
    addFirstProductionOrder: 'Ajouter le premier ordre',
    noProductionOrders: 'Aucun ordre de fabrication',
    newBom: 'Nouvelle nomenclature',
    addFirstBom: 'Ajouter la première nomenclature',
    noBoms: 'Aucune nomenclature',
    stockExportCsv: 'Exporter CSV',
    stockSetOpening: 'Définir le solde',
    stockAdjustAction: 'Ajuster',
    stockReason: 'Motif',
    stockPasswordConfirm: 'Confirmez avec votre mot de passe',
    stockIn: 'Entrée',
    stockOut: 'Sortie',
    newUnit: 'Nouvelle unité',
    addFirstUnit: 'Ajouter la première unité',
    noUnits: 'Aucune unité',
    unitAllowsFraction: 'Autorise fractions',
    unitActive: 'Actif',
    newNumberPattern: 'Nouveau modèle',
    addFirstNumberPattern: 'Ajouter le premier modèle',
    noNumberPatterns: 'Aucun modèle',
    numberPatternPattern: 'Modèle',
    numberPatternPadding: 'Zéro-padding',
    moduleEnabled: 'Activé',
    moduleDisabled: 'Désactivé',
    noModules: 'Aucun module',
    newLabel: 'Nouvelle étiquette',
    addFirstLabel: 'Ajouter la première étiquette',
    noLabels: 'Aucune étiquette',
    labelTypeDocument: 'Document',
    labelTypeTaxRate: 'Taux de taxe',
    labelLocale: 'Langue',
    labelValue: 'Valeur',
    locale: 'Langue',
    newUser: 'Nouvel utilisateur',
    addFirstUser: 'Ajouter le premier utilisateur',
    noUsers: 'Aucun utilisateur',
    userActive: 'Actif',
    userRoles: 'Rôles',
    newRole: 'Nouveau rôle',
    addFirstRole: 'Ajouter le premier rôle',
    noRoles: 'Aucun rôle',
    rolePermissions: 'Permissions',
    permissionsCount: 'permissions',
    roleProtected: 'Protégé',

    // Permissions catalogue
    permissionsSearch: 'Filtrer les permissions…',
    permissionsTotal: '{count} permissions',
    permissionsEmpty: 'Aucune permission ne correspond.',
    permissionsResource: 'Ressource',
    permissionsGrantedBy: 'Accordée par',
  },

  en: {
    appName: 'easyERP',
    tagline: 'Run your business, in your own language.',

    // Navigation
    navDashboard: 'Dashboard',
    navPermissions: 'Permissions',
    navSettings: 'Settings',
    navSignIn: 'Sign in',
    navSignOut: 'Sign out',
    navMain: 'Main navigation',
    navSkipToContent: 'Skip to content',

    // Appearance
    appearance: 'Appearance',
    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    themeToggle: 'Switch theme',
    themeCurrent: 'Current theme: {theme}',

    // Locale
    localeLabel: 'Language',

    // Status
    statusTitle: 'Deployment status',
    statusSubtitle: 'Each client runs on its own host, its own database and its own port.',
    statusOk: 'Operational',
    statusDegraded: 'Degraded',
    statusDown: 'Unreachable',
    statusChecking: 'Checking…',
    checkApi: 'API',
    checkDatabase: 'Database',
    checkWeb: 'Web interface',
    checkApiHelp: 'API not responding — check 3002 / pnpm dev',
    checkDatabaseHelp: 'Database not ready — check docker / pnpm db:up',
    checkWebHelp: 'Web interface unreachable',
    checkStatusTitle: 'Services',

    // Dashboard
    dashboardTitle: 'Dashboard',
    dashboardGreeting: 'Hello',

    // Sales & Documents
    navSalesOrders: 'Sales orders',
    navDeliveryNotes: 'Delivery notes',
    navCustomerInvoices: 'Customer invoices',
    navCreditNotes: 'Credit notes',
    // Stock & Catalog
    navItems: 'Items',
    navParties: 'Parties',
    navStock: 'Stock',
    // Purchasing & Production
    navPurchasing: 'Purchasing',
    navProduction: 'Production',
    navBoms: 'BOMs',
    // Finance
    navPayments: 'Payments',

    // Sales Orders
    salesOrdersTitle: 'Sales orders',
    salesOrdersDescription: 'Manage your customer orders.',
    salesOrdersBody: 'Create, edit and issue orders.',

    // Delivery Notes
    deliveryNotesTitle: 'Delivery notes',
    deliveryNotesDescription: 'Shipping document.',
    deliveryNotesBody: 'Convert reservations to stock movements.',

    // Customer Invoices
    customerInvoicesTitle: 'Customer invoices',
    customerInvoicesDescription: 'Fiscal documents.',
    customerInvoicesBody: 'Invoice deliveries against an order.',

    // Credit Notes
    creditNotesTitle: 'Credit notes',
    creditNotesDescription: 'Correction justifications.',
    creditNotesBody: 'Correct or cancel an issued invoice.',

    // Items
    itemsTitle: 'Items',
    itemsDescription: 'Sales catalog.',
    itemsBody: 'Manage items in stock or as services.',

    // Parties
    partiesTitle: 'Parties',
    partiesDescription: 'Customers and suppliers.',
    partiesBody: 'Manage commercial counterparties.',

    // Stock
    stockTitle: 'Stock',
    stockDescription: 'Stock movements ledger.',
    stockBody: 'View balance, reservations and history.',

    // Purchasing
    purchasingTitle: 'Purchasing',
    purchasingDescription: 'Purchase orders.',
    purchasingBody: 'Plan purchases and receipts.',

    // Production
    productionTitle: 'Production',
    productionDescription: 'Production orders.',
    productionBody: 'Produce items using BOMs.',

    // BOMs
    bomsTitle: 'BOMs',
    bomsDescription: 'Item compositions.',
    bomsBody: 'Manage BOM versions.',

    // Payments
    paymentsTitle: 'Payments',
    paymentsDescription: 'Receipts.',
    paymentsBody: 'Record payments and allocations.',
    paymentDetails: 'Payment details',
    paymentNumber: 'Number',
    paymentDate: 'Date',
    paymentAmount: 'Amount',
    paymentMethod: 'Method',
    paymentReference: 'Reference',
    paymentNote: 'Note',
    paymentParty: 'Party',
    paymentStatus: 'Status',
    paymentAllocations: 'Allocations',
    paymentAllocationDocument: 'Document',
    paymentAllocationAmount: 'Amount',
    paymentUnallocatedCredit: 'Unallocated credit',
    paymentCreatedAt: 'Created at',

    // Settings subpages
    unitsTitle: 'Units of measure',
    unitsDescription: 'Units and fractions.',
    unitsBody: 'Manage units and subdivision products.',

    numberPatternsTitle: 'Number patterns',
    numberPatternsDescription: 'Patterns for each document type.',
    numberPatternsBody: 'Configure patterns and zero-padding.',

    modulesTitle: 'Modules',
    modulesDescription: 'Enable or disable modules.',
    modulesBody: 'Hide or show unused modules.',

    labelsTitle: 'Terminology',
    labelsDescription: 'Product vocabulary.',
    labelsBody: 'Rename displayed concepts.',

    usersTitle: 'Users',
    usersDescription: 'Accounts and roles.',
    usersBody: 'Invite and manage users.',

    rolesTitle: 'Roles',
    rolesDescription: 'Permission collections.',
    rolesBody: 'Define roles and authorizations.',

    // Common UI strings
    customer: 'Customer',
    statusIssued: 'Issued',
    date: 'Date',
    amount: 'Amount',
    currency: 'Currency',
    item: 'Item',
    invoiceTitle: 'Invoice',
    invoiceDescription: 'Issued fiscal document.',
    invoiceDetails: 'Invoice details',
    invoiceNumber: 'Number',
    invoiceCustomer: 'Customer',
    invoiceStatus: 'Status',
    invoiceDate: 'Date',
    invoiceSubtotal: 'Subtotal',
    invoiceTax: 'Tax',
    invoiceTotal: 'Total',
    invoiceLines: 'Lines',
    invoiceArchive: 'Archive',
    invoiceArchiveDescription: 'PDF version kept by the server.',

    printButton: 'Print',
    downloadButton: 'Download',

    invoice: 'Invoice',
    creditNoteStatus: 'Credit note status',

    creditNoteTitle: 'Credit note',
    creditNoteDescription: 'Correction justification.',
    creditNoteDetails: 'Credit note details',
    creditNoteNumber: 'Number',
    correctedInvoice: 'Corrected invoice',
    creditNoteCustomer: 'Customer',
    creditNoteDate: 'Date',
    creditNoteAmount: 'Amount',
    creditNoteLines: 'Lines',
    creditNoteArchive: 'Archive',
    creditNoteArchiveDescription: 'PDF version kept by the server.',

    stockItemDescription: 'Item position.',
    stockPosition: 'Position',
    onHand: 'On hand',
    reserved: 'Reserved',
    available: 'Available',
    stockReorderNote: 'Reorder recommendation',
    stockReorderLevel: 'Reorder level',
    stockLedger: 'Stock ledger',
    stockLedgerDescription: 'Movements and entries.',
    stockHistory: 'History',
    openingBalanceEntry: 'Opening balance',
    salesOrderEntry: 'Sales order',
    'YYYY-MM-DD': 'YYYY-MM-DD',
    source: 'Source',
    openingBalance: 'Opening balance',
    quantity: 'Quantity',

    // Settings
    settingsTitle: 'Settings',
    settingsDescription: 'Preferences for this interface and this deployment.',
    settingsAppearance: 'Appearance',
    settingsLanguage: 'Language',
    settingsBusiness: 'Business',
    settingsBusinessName: 'Registered name',
    settingsVatRegime: 'VAT regime',
    settingsCurrency: 'Currency',
    settingsLocked: 'locked',
    saved: 'Saved',

    // Sign in
    signInTitle: 'Sign in',
    signInSubtitle: 'easyERP',
    signInIntro: 'Your sales, your purchases and your stock, in one place.',
    signInEmail: 'Email address',
    signInPassword: 'Password',
    signInSubmit: 'Sign in',
    signInWorking: 'Signing in…',
    signInError: 'Those credentials were refused.',
    signInNotice: 'No account exists yet: user creation arrives with the administration screen.',
    signInBack: 'Back to the dashboard',

    // Setup (one-time, ADR 0012)
    setupTitle: 'First run',
    setupIntro:
      'This deployment holds no Business and no User yet. Present the host token, then create the Business and its first Administrator. This screen never opens again afterwards.',
    setupToken: 'First-run token',
    setupTokenHelp: 'The FIRST_SETUP_TOKEN value in the host environment.',
    showToken: 'Show token',
    hideToken: 'Hide token',
    showPassword: 'Show password',
    hidePassword: 'Hide password',
    setupBusiness: 'Business',
    setupLegalName: 'Registered name',
    setupDisplayName: 'Display name',
    setupTaxIdentifier: 'Tax identifier',
    setupCountryCode: 'Country (ISO, 2 letters)',
    setupVatRegime: 'VAT regime',
    setupVatStandard: 'STANDARD — breakdown per rate',
    setupVatExempt: 'EXEMPT — legal mention',
    setupCurrency: 'Currency (ISO, 3 letters)',
    setupPhone: 'Phone',
    setupEmail: 'Email',
    setupAddress1: 'Address (line 1)',
    setupAddress2: 'Address (line 2)',
    setupCity: 'City',
    setupPostalCode: 'Postal code',
    setupAdmin: 'First administrator',
    setupAdminName: 'Name',
    setupAdminEmail: 'Email address',
    setupAdminPassword: 'Password (8 characters minimum)',
    setupUnits: 'Units of measure (at least one)',
    setupUnitCode: 'Code (e.g. PCS)',
    setupUnitFraction: 'Fractions allowed',
    setupAddUnit: 'Add a unit',
    setupRates: 'Tax rates (at least one when STANDARD)',
    setupRateCode: 'Code (e.g. VAT19)',
    setupRateValue: 'Rate (e.g. 0.19)',
    setupAddRate: 'Add a rate',
    setupRemove: 'Remove',
    setupSubmit: 'Create the Business',
    setupWorking: 'Creating…',
    setupDone: 'Business created. Sign in with the administrator account.',
    setupClosed: 'Setup already ran: this screen is closed.',
    setupBackSignIn: 'Go to sign-in',

    // Common
    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    loading: 'Loading…',
    retry: 'Retry',
    yes: 'Yes',
    no: 'No',
    newItem: 'New Item',
    addFirstItem: 'Add First Item',
    formCreate: 'Create',
    formCreating: 'Creating…',
    formActive: 'Active',
    itemCode: 'Item code',
    itemName: 'Name',
    itemDescription: 'Description',
    itemTypeLabel: 'Type',
    itemBaseUnit: 'Base unit',
    itemSaleUnit: 'Sale unit',
    itemNone: '— None —',
    itemTaxRate: 'Tax rate',
    itemFodec: 'FODEC-applicable',
    itemSalePrice: 'Sale price',
    itemPurchasePrice: 'Purchase price',
    itemReorderPoint: 'Reorder point',
    partyCode: 'Code',
    partyName: 'Name',
    partyRolesLabel: 'Roles',
    roleSupplier: 'Supplier',
    partyTaxId: 'Tax identifier',
    loadFailed: 'Load Failed',
    tryAgainOrContactSupport: 'Try Again or Contact Support',
    noItems: 'No Items',
    newParty: 'New Party',
    addFirstParty: 'Add First Party',
    noParties: 'No Parties',
    party: 'Party',
    country: 'Country',
    docNumber: 'Number',
    docCounterparty: 'Counterparty',
    docStatus: 'Status',
    docTotal: 'Total',
    statusDraft: 'Draft',
    statusCancelled: 'Cancelled',
    newSalesOrder: 'New sales order',
    orderAddLine: 'Add a line',
    addFirstSalesOrder: 'Add the first order',
    noSalesOrders: 'No sales orders',
    newDeliveryNote: 'New delivery note',
    addFirstDeliveryNote: 'Add the first note',
    noDeliveryNotes: 'No delivery notes',
    newCustomerInvoice: 'New customer invoice',
    addFirstCustomerInvoice: 'Add the first invoice',
    noCustomerInvoices: 'No customer invoices',
    newCreditNote: 'New credit note',
    addFirstCreditNote: 'Add the first credit note',
    noCreditNotes: 'No credit notes',
    newPayment: 'New payment',
    addFirstPayment: 'Add the first payment',
    noPayments: 'No payments',
    newPurchaseOrder: 'New purchase order',
    docIssue: 'Issue',
    prodBomVersion: 'BOM version',
    prodFinishedItem: 'Finished item',
    bomComponent: 'Component',
    addFirstPurchaseOrder: 'Add the first order',
    noPurchaseOrders: 'No purchase orders',
    newGoodsReceipt: 'New goods receipt',
    linkOrder: 'Linked order (optional)',
    docOutstanding: 'Outstanding',
    addFirstGoodsReceipt: 'Add the first receipt',
    noGoodsReceipts: 'No goods receipts',
    newProductionOrder: 'New production order',
    addFirstProductionOrder: 'Add the first order',
    noProductionOrders: 'No production orders',
    newBom: 'New BOM',
    addFirstBom: 'Add the first BOM',
    noBoms: 'No BOMs',
    stockExportCsv: 'Export CSV',
    stockSetOpening: 'Set opening balance',
    stockAdjustAction: 'Adjust',
    stockReason: 'Reason',
    stockPasswordConfirm: 'Confirm with your password',
    stockIn: 'Stock in',
    stockOut: 'Stock out',
    newUnit: 'New Unit',
    addFirstUnit: 'Add First Unit',
    noUnits: 'No Units',
    unitAllowsFraction: 'Allows Fractions',
    unitActive: 'Active',
    newNumberPattern: 'New Pattern',
    addFirstNumberPattern: 'Add First Pattern',
    noNumberPatterns: 'No Patterns',
    numberPatternPattern: 'Pattern',
    numberPatternPadding: 'Zero-Padding',
    moduleEnabled: 'Enabled',
    moduleDisabled: 'Disabled',
    noModules: 'No Modules',
    newLabel: 'New Label',
    addFirstLabel: 'Add First Label',
    noLabels: 'No Labels',
    labelTypeDocument: 'Document',
    labelTypeTaxRate: 'Tax Rate',
    labelLocale: 'Language',
    labelValue: 'Value',
    locale: 'Language',
    newUser: 'New User',
    addFirstUser: 'Add First User',
    noUsers: 'No Users',
    userActive: 'Active',
    userRoles: 'Roles',
    newRole: 'New Role',
    addFirstRole: 'Add First Role',
    noRoles: 'No Roles',
    rolePermissions: 'Permissions',
    permissionsCount: 'permissions',
    roleProtected: 'Protected',

    // Permissions catalogue
    permissionsSearch: 'Filter permissions…',
    permissionsTotal: '{count} permissions',
    permissionsEmpty: 'No permission matches.',
    permissionsResource: 'Resource',
    permissionsGrantedBy: 'Granted by',
  },

  ar: {
    // Machine draft — awaiting native review before release.
    appName: 'easyERP',
    tagline: 'أدر أعمالك بلغتك الخاصة.',

    // Navigation
    navDashboard: 'لوحة القيادة',
    navPermissions: 'الصلاحيات',
    navSettings: 'الإعدادات',
    navSignIn: 'تسجيل الدخول',
    navSignOut: 'تسجيل الخروج',
    navMain: 'التنقل الرئيسي',
    navSkipToContent: 'تخطَّ إلى المحتوى',

    // Appearance
    appearance: 'المظهر',
    themeLabel: 'السمة',
    themeLight: 'نهاري',
    themeDark: 'ليلي',
    themeSystem: 'النظام',
    themeToggle: 'تبديل السمة',
    themeCurrent: 'السمة الحالية: {theme}',

    // Locale
    localeLabel: 'اللغة',

    // Status
    statusTitle: 'حالة النشر',
    statusSubtitle: 'كل عميل يعمل على مضيف خاص به، وقاعدة بيانات خاصة به، ومنفذ خاص به.',
    statusOk: 'يعمل',
    statusDegraded: 'متدهور',
    statusDown: 'غير متاح',
    statusChecking: 'جارٍ التحقق…',
    checkApi: 'الواجهة البرمجية',
    checkDatabase: 'قاعدة البيانات',
    checkWeb: 'واجهة الاستعمال',
    checkApiHelp: 'الواجهة البرمجية لا تستجيب — تحقق من 3002 / pnpm dev',
    checkDatabaseHelp: 'قاعدة البيانات غير جاهزة — تحقق من docker / pnpm db:up',
    checkWebHelp: 'الواجهة غير متاحة',
    checkStatusTitle: 'الخدمات',

    // Dashboard
    dashboardTitle: 'لوحة القيادة',
    dashboardGreeting: 'مرحبًا',

    // Sales & Documents
    navSalesOrders: 'أوامر المبيعات',
    navDeliveryNotes: 'أوراق التسليم',
    navCustomerInvoices: 'الفواتير للعملاء',
    navCreditNotes: 'الشيكات الخصم',
    // Stock & Catalog
    navItems: 'البنود',
    navParties: 'الطرفيات',
    navStock: 'المخزون',
    // Purchasing & Production
    navPurchasing: 'المشتريات',
    navProduction: 'الإنتاج',
    navBoms: 'القوائم',
    // Finance
    navPayments: 'المدفوعات',

    // Sales Orders
    salesOrdersTitle: 'أوامر المبيعات',
    salesOrdersDescription: 'إدارة طلبات العملاء.',
    salesOrdersBody: 'إنشاء، تحرير وإصدار أوامر.',

    // Delivery Notes
    deliveryNotesTitle: 'أوراق التسليم',
    deliveryNotesDescription: 'استمارة شحن.',
    deliveryNotesBody: 'تحويل الحجزات إلى حركات مخزون.',

    // Customer Invoices
    customerInvoicesTitle: 'الفواتير للعملاء',
    customerInvoicesDescription: 'مستندات ضريبية.',
    customerInvoicesBody: 'فاتورة الشحنات مقابل أمر.',

    // Credit Notes
    creditNotesTitle: 'الشيكات الخصم',
    creditNotesDescription: 'تبريرات تصحيح.',
    creditNotesBody: 'تصحيح أو إلغاء فاتورة م發رة.',

    // Items
    itemsTitle: 'البنود',
    itemsDescription: 'كتالوج المبيعات.',
    itemsBody: 'إدارة البنود في المخزون أو كخدمات.',

    // Parties
    partiesTitle: 'الطرفيات',
    partiesDescription: 'العملاء والموردين.',
    partiesBody: 'إدارة المعارض التجارية.',

    // Stock
    stockTitle: 'المخزون',
    stockDescription: 'سجل حركات المخزون.',
    stockBody: 'مراجعة الرصيد والحجزات والتاريخ.',

    // Purchasing
    purchasingTitle: 'المشتريات',
    purchasingDescription: 'أوامر الشراء.',
    purchasingBody: 'تخطيط المشتريات والاستلامات.',

    // Production
    productionTitle: 'الإنتاج',
    productionDescription: 'أوامر الإنتاج.',
    productionBody: 'تصنيع بنود باستخدام القوائم.',

    // BOMs
    bomsTitle: 'القوائم',
    bomsDescription: 'تكوينات البنود.',
    bomsBody: 'إدارة إصدارات القوائم.',

    // Payments
    paymentsTitle: 'المدفوعات',
    paymentsDescription: 'الموارد.',
    paymentsBody: 'تسجيل المدفوعات والتخصيصات.',
    paymentDetails: 'تفاصيل الدفعة',
    paymentNumber: 'الرقم',
    paymentDate: 'التاريخ',
    paymentAmount: 'المبلغ',
    paymentMethod: 'الطريقة',
    paymentReference: 'المرجع',
    paymentNote: 'ملاحظة',
    paymentParty: 'الطرف',
    paymentStatus: 'الحالة',
    paymentAllocations: 'التخصيصات',
    paymentAllocationDocument: 'المستند',
    paymentAllocationAmount: 'المبلغ',
    paymentUnallocatedCredit: 'رصيد غير مخصص',
    paymentCreatedAt: 'تاريخ الإنشاء',

    // Settings subpages
    unitsTitle: 'وحدات القياس',
    unitsDescription: 'وحدات وكسور.',
    unitsBody: 'إدارة الوحدات ونواتج التقسيم.',

    numberPatternsTitle: 'نماذج الترقيم',
    numberPatternsDescription: 'نماذج لكل نوع مستند.',
    numberPatternsBody: 'تكوين النماذج وتصفير العشار.',

    modulesTitle: 'الأقسام',
    modulesDescription: 'تفعيل أو إيقاف الأقسام.',
    modulesBody: 'إخفاء أو إظهار الأقسام غير المستخدمة.',

    labelsTitle: 'المصطلحات',
    labelsDescription: 'مفردات المنتج.',
    labelsBody: 'تسمية المفاهيم المعروضة.',

    usersTitle: 'المستخدمين',
    usersDescription: 'حسابات ودور.',
    usersBody: 'دعوة وإدارة المستخدمين.',

    rolesTitle: 'الدور',
    rolesDescription: 'مجموعات الصلاحيات.',
    rolesBody: 'تعيين الأدوار والأذونات.',

    // Common UI strings
    customer: 'عميل',
    statusIssued: 'مأذون',
    date: 'تاريخ',
    amount: 'مبلغ',
    currency: 'عملة',
    item: 'بند',
    invoiceTitle: 'فاتورة',
    invoiceDescription: 'مستند ضريبي مأذون.',
    invoiceDetails: 'تفاصيل الفاتورة',
    invoiceNumber: 'رقم',
    invoiceCustomer: 'عميل',
    invoiceStatus: 'حالة',
    invoiceDate: 'تاريخ',
    invoiceSubtotal: 'مجموع جزئي',
    invoiceTax: 'ضريبة',
    invoiceTotal: 'مجموع',
    invoiceLines: 'أسطر',
    invoiceArchive: 'الأرشيف',
    invoiceArchiveDescription: 'نسخة PDF تحفظها الخادم.',

    printButton: 'طباعة',
    downloadButton: 'تحميل',

    invoice: 'فاتورة',
    creditNoteStatus: 'حالة شيك الخصم',

    creditNoteTitle: 'شيك الخصم',
    creditNoteDescription: 'تبرير تصحيح.',
    creditNoteDetails: 'تفاصيل شيك الخصم',
    creditNoteNumber: 'رقم',
    correctedInvoice: 'فاتورة تصحيح',
    creditNoteCustomer: 'عميل',
    creditNoteDate: 'تاريخ',
    creditNoteAmount: 'مبلغ',
    creditNoteLines: 'أسطر',
    creditNoteArchive: 'الأرشيف',
    creditNoteArchiveDescription: 'نسخة PDF تحفظها الخادم.',

    stockItemDescription: 'موقع البند.',
    stockPosition: 'موقع',
    onHand: 'يد',
    reserved: 'محجوز',
    available: 'متاح',
    stockReorderNote: 'توصية إعادة الطلب',
    stockReorderLevel: 'مستوى إعادة الطلب',
    stockLedger: 'دفتر المخزون',
    stockLedgerDescription: 'الحركات والدخولات.',
    stockHistory: 'التاريخ',
    openingBalanceEntry: 'الرصيد الافتتاحي',
    salesOrderEntry: 'أمر مبيعات',
    'YYYY-MM-DD': 'سنة-شهر-يوم',
    source: 'المصدر',
    openingBalance: 'الرصيد الافتتاحي',
    quantity: 'الكمية',

    // Settings
    settingsTitle: 'الإعدادات',
    settingsDescription: 'تفضيلات هذه الواجهة وهذا النشر.',
    settingsAppearance: 'المظهر',
    settingsLanguage: 'اللغة',
    settingsBusiness: 'المؤسسة',
    settingsBusinessName: 'التسمية التجارية',
    settingsVatRegime: 'نظام ضريبة القيمة المضافة',
    settingsCurrency: 'العملة',
    settingsLocked: 'مقفل',
    saved: 'تم الحفظ',

    // Sign in
    signInTitle: 'تسجيل الدخول',
    signInSubtitle: 'easyERP',
    signInIntro: 'مبيعاتك ومشترياتك ومخزونك في مكان واحد.',
    signInEmail: 'البريد الإلكتروني',
    signInPassword: 'كلمة المرور',
    signInSubmit: 'دخول',
    signInWorking: 'جارٍ الدخول…',
    signInError: 'رُفضت هذه البيانات.',
    signInNotice: 'لا يوجد حساب بعد: إنشاء المستخدمين يأتي مع شاشة الإدارة.',
    signInBack: 'العودة إلى لوحة القيادة',

    // Setup (one-time, ADR 0012)
    setupTitle: 'التشغيل الأول',
    setupIntro:
      'لا يحتوي هذا النشر بعد على مؤسسة ولا مستخدم. قدِّم رمز المضيف، ثم أنشئ المؤسسة والمدير الأول. لن تُفتح هذه الشاشة مرة أخرى بعد ذلك.',
    setupToken: 'رمز التشغيل الأول',
    setupTokenHelp: 'قيمة FIRST_SETUP_TOKEN في بيئة المضيف.',
    showToken: 'إظهار الرمز',
    hideToken: 'إخفاء الرمز',
    showPassword: 'إظهار كلمة المرور',
    hidePassword: 'إخفاء كلمة المرور',
    setupBusiness: 'المؤسسة',
    setupLegalName: 'التسمية القانونية',
    setupDisplayName: 'الاسم المعروض',
    setupTaxIdentifier: 'المعرف الضريبي',
    setupCountryCode: 'البلد (ISO، حرفان)',
    setupVatRegime: 'نظام ضريبة القيمة المضافة',
    setupVatStandard: 'STANDARD — تفصيل حسب النسبة',
    setupVatExempt: 'EXEMPT — عبارة قانونية',
    setupCurrency: 'العملة (ISO، 3 أحرف)',
    setupPhone: 'الهاتف',
    setupEmail: 'البريد الإلكتروني',
    setupAddress1: 'العنوان (سطر 1)',
    setupAddress2: 'العنوان (سطر 2)',
    setupCity: 'المدينة',
    setupPostalCode: 'الرمز البريدي',
    setupAdmin: 'المدير الأول',
    setupAdminName: 'الاسم',
    setupAdminEmail: 'البريد الإلكتروني',
    setupAdminPassword: 'كلمة المرور (8 أحرف على الأقل)',
    setupUnits: 'وحدات القياس (واحدة على الأقل)',
    setupUnitCode: 'الرمز (مثل PCS)',
    setupUnitFraction: 'الكسور مسموحة',
    setupAddUnit: 'إضافة وحدة',
    setupRates: 'نسب الضريبة (واحدة على الأقل في STANDARD)',
    setupRateCode: 'الرمز (مثل VAT19)',
    setupRateValue: 'النسبة (مثل 0.19)',
    setupAddRate: 'إضافة نسبة',
    setupRemove: 'إزالة',
    setupSubmit: 'إنشاء المؤسسة',
    setupWorking: 'جارٍ الإنشاء…',
    setupDone: 'تم إنشاء المؤسسة. سجِّل الدخول بحساب المدير.',
    setupClosed: 'اكتمل التشغيل الأول: هذه الشاشة مغلقة.',
    setupBackSignIn: 'الذهاب إلى تسجيل الدخول',

    // Common
    save: 'حفظ',
    cancel: 'إلغاء',
    close: 'إغلاق',
    loading: 'جارٍ التحميل…',
    retry: 'إعادة المحاولة',
    yes: 'نعم',
    no: 'لا',
    newItem: ' بند جديد',
    addFirstItem: 'إضافة البند الأول',
    formCreate: 'إنشاء',
    formCreating: 'جارٍ الإنشاء…',
    formActive: 'نشط',
    itemCode: 'رمز البند',
    itemName: 'الاسم',
    itemDescription: 'الوصف',
    itemTypeLabel: 'النوع',
    itemBaseUnit: 'الوحدة الأساسية',
    itemSaleUnit: 'وحدة البيع',
    itemNone: '— لا شيء —',
    itemTaxRate: 'نسبة الضريبة',
    itemFodec: 'خاضع FODEC',
    itemSalePrice: 'سعر البيع',
    itemPurchasePrice: 'سعر الشراء',
    itemReorderPoint: 'مستوى إعادة الطلب',
    partyCode: 'الرمز',
    partyName: 'الاسم',
    partyRolesLabel: 'الأدوار',
    roleSupplier: 'مورّد',
    partyTaxId: 'المعرف الضريبي',
    loadFailed: 'فشل التحميل',
    tryAgainOrContactSupport: 'إعادة المحاولة أو الاتصال بالدعم',
    noItems: 'لا توجد بنود',
    newParty: 'جهة جديدة',
    addFirstParty: 'إضافة الجهة الأولى',
    noParties: 'لا توجد أطراف',
    party: 'جهة',
    country: 'البلد',
    docNumber: 'الرقم',
    docCounterparty: 'الطرف',
    docStatus: 'الحالة',
    docTotal: 'المجموع',
    statusDraft: 'مسودة',
    statusCancelled: 'ملغاة',
    newSalesOrder: 'أمر مبيعات جديد',
    orderAddLine: 'إضافة سطر',
    addFirstSalesOrder: 'إضافة أول أمر',
    noSalesOrders: 'لا توجد أوامر مبيعات',
    newDeliveryNote: 'ورقة تسليم جديدة',
    addFirstDeliveryNote: 'إضافة أول ورقة',
    noDeliveryNotes: 'لا توجد أوراق تسليم',
    newCustomerInvoice: 'فاتورة جديدة',
    addFirstCustomerInvoice: 'إضافة أول فاتورة',
    noCustomerInvoices: 'لا توجد فواتير',
    newCreditNote: 'شيك خصم جديد',
    addFirstCreditNote: 'إضافة أول شيك خصم',
    noCreditNotes: 'لا توجد شيكات خصم',
    newPayment: 'دفعة جديدة',
    addFirstPayment: 'إضافة أول دفعة',
    noPayments: 'لا توجد مدفوعات',
    newPurchaseOrder: 'أمر شراء جديد',
    docIssue: 'إصدار',
    prodBomVersion: 'إصدار القائمة',
    prodFinishedItem: 'البند النهائي',
    bomComponent: 'المكوّن',
    addFirstPurchaseOrder: 'إضافة أول أمر',
    noPurchaseOrders: 'لا توجد أوامر شراء',
    newGoodsReceipt: 'استلام جديد',
    linkOrder: 'أمر مرتبط (اختياري)',
    docOutstanding: 'المتبقي',
    addFirstGoodsReceipt: 'إضافة أول استلام',
    noGoodsReceipts: 'لا توجد استلامات',
    newProductionOrder: 'أمر إنتاج جديد',
    addFirstProductionOrder: 'إضافة أول أمر',
    noProductionOrders: 'لا توجد أوامر إنتاج',
    newBom: 'قائمة جديدة',
    addFirstBom: 'إضافة أول قائمة',
    noBoms: 'لا توجد قوائم',
    stockExportCsv: 'تصدير CSV',
    stockSetOpening: 'تحديد الرصيد الافتتاحي',
    stockAdjustAction: 'تعديل',
    stockReason: 'السبب',
    stockPasswordConfirm: 'أكّد بكلمة المرور',
    stockIn: 'إدخال',
    stockOut: 'إخراج',
    newUnit: 'وحدة جديدة',
    addFirstUnit: 'إضافة أول وحدة',
    noUnits: 'لا توجد وحدات',
    unitAllowsFraction: 'يسمح بالكسور',
    unitActive: 'نشط',
    newNumberPattern: 'نموذج جديد',
    addFirstNumberPattern: 'إضافة أول نموذج',
    noNumberPatterns: 'لا توجد نماذج',
    numberPatternPattern: 'النموذج',
    numberPatternPadding: 'الصفر البادئ',
    moduleEnabled: 'مفعل',
    moduleDisabled: 'معطل',
    noModules: 'لا توجد أقسام',
    newLabel: 'بطاقة جديدة',
    addFirstLabel: 'إضافة أول بطاقة',
    noLabels: 'لا توجد بطاقات',
    labelTypeDocument: 'مستند',
    labelTypeTaxRate: 'نسبة الضريبة',
    labelLocale: 'اللغة',
    labelValue: 'القيمة',
    locale: 'اللغة',
    newUser: 'مستخدم جديد',
    addFirstUser: 'إضافة أول مستخدم',
    noUsers: 'لا توجد مستخدمين',
    userActive: 'نشط',
    userRoles: 'الأدوار',
    newRole: 'دور جديد',
    addFirstRole: 'إضافة أول دور',
    noRoles: 'لا توجد أدوار',
    rolePermissions: 'الصلاحيات',
    permissionsCount: 'صلاحية',
    roleProtected: 'محمي',

    // Permissions catalogue
    permissionsSearch: 'تصفية الصلاحيات…',
    permissionsTotal: '{count} صلاحية',
    permissionsEmpty: 'لا توجد صلاحيات مطابقة.',
    permissionsResource: 'المورد',
    permissionsGrantedBy: 'ممنوحة من قبل',
  },
} as const satisfies Record<Locale, Record<string, string>>;

export type MessageKey = keyof (typeof messages)['en'];

/** Every locale's dictionary, keyed the same way. */
export function messagesFor(locale: Locale): Record<MessageKey, string> {
  return messages[locale];
}

/** Substitute `{name}` placeholders. A missing key is a bug, not a blank space. */
export function format(template: string, values: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (match, key: string) =>
    key in values ? String(values[key]) : match,
  );
}

/** `t('statusOk')` — the message, formatted. */
export type Translator = (key: MessageKey, values?: Record<string, string | number>) => string;

const TRANSLATORS = new Map<Locale, Translator>();

/**
 * The translator for a locale, with a stable identity.
 *
 * A caller usually does `const t = translatorFor(locale)` at the top of a
 * component, then lists `t` in a `useCallback` or `useEffect` dependency. A
 * factory that built a new closure on every call would invalidate that
 * dependency on every render, and an effect that depends on it would re-run on
 * every render — which for a polling effect means an immediate, self-triggering
 * request loop. Caching by locale makes the dependency honest.
 */
export function translatorFor(locale: Locale): Translator {
  const cached = TRANSLATORS.get(locale);
  if (cached) return cached;
  const dictionary = messagesFor(locale);
  const translator: Translator = (key, values) => format(dictionary[key], values);
  TRANSLATORS.set(locale, translator);
  return translator;
}
