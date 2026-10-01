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
    checkStatusTitle: 'Services',

    // Dashboard
    dashboardTitle: 'Tableau de bord',
    dashboardGreeting: 'Bonjour',
    dashboardPhase: 'Fondations',
    dashboardPhaseBody:
      'Identité, autorisations et exploitation sont en place. Le stock, les documents et la facturation arrivent ensuite.',
    dashboardQuickTitle: 'À venir',
    dashboardQuickBody:
      'Chaque module est annoncé seulement une fois son test de concurrence écrit.',
    moduleStock: 'Stock',
    moduleStockBody: 'Grandeur dérivée d’un journal en append-only.',
    moduleSales: 'Ventes',
    moduleSalesBody: 'Prix et taxes résolus côté serveur.',
    moduleInvoicing: 'Facturation',
    moduleInvoicingBody: 'Numérotation à l’émission, documents immuables.',
    moduleCustomFields: 'Champs personnalisés',
    moduleCustomFieldsBody: 'Données en base, pas en JSON opaque.',

    // Permissions
    permissionsTitle: 'Permissions',
    permissionsDescription:
      "Le serveur décide. Chaque route déclare ce qu'elle exige ; l'interface n'accorde rien.",
    permissionsTotal: '{count} permissions',
    permissionsSearch: 'Filtrer les permissions…',
    permissionsEmpty: 'Aucune permission ne correspond.',
    permissionsResource: 'Ressource',
    permissionsGrantedBy: 'Accordées par',

    // Settings
    settingsTitle: 'Paramètres',
    settingsDescription: 'Préférences de cette interface et de ce déploiement.',
    settingsAppearance: 'Apparence',
    settingsLanguage: 'Langue',
    settingsBusiness: 'Entreprise',
    settingsBusinessName: 'Raison sociale',
    settingsVatRegime: 'Régime de TVA',
    settingsCurrency: 'Devise',
    settingsNotPersisted:
      "Les préférences d'apparence et de langue sont enregistrées sur cet appareil. Les données d'entreprise ne sont pas encore enregistrées : aucun point d'entrée ne les accepte encore.",
    settingsPlaceholder: 'Non renseigné',

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
      "Aucun compte n'existe encore : la création d'utilisateurs arrive avec l'écran d'administration.",
    signInBack: 'Retour au tableau de bord',

    // Common
    save: 'Enregistrer',
    cancel: 'Annuler',
    close: 'Fermer',
    loading: 'Chargement…',
    retry: 'Réessayer',
    yes: 'Oui',
    no: 'Non',
  },

  en: {
    appName: 'easyERP',
    tagline: 'Run your business, in your own language.',

    navDashboard: 'Dashboard',
    navPermissions: 'Permissions',
    navSettings: 'Settings',
    navSignIn: 'Sign in',
    navSignOut: 'Sign out',
    navMain: 'Main navigation',
    navSkipToContent: 'Skip to content',

    appearance: 'Appearance',
    themeLabel: 'Theme',
    themeLight: 'Light',
    themeDark: 'Dark',
    themeSystem: 'System',
    themeToggle: 'Switch theme',
    themeCurrent: 'Current theme: {theme}',

    localeLabel: 'Language',

    statusTitle: 'Deployment status',
    statusSubtitle: 'Each client runs on its own host, its own database and its own port.',
    statusOk: 'Operational',
    statusDegraded: 'Degraded',
    statusDown: 'Unreachable',
    statusChecking: 'Checking…',
    checkApi: 'API',
    checkDatabase: 'Database',
    checkWeb: 'Web interface',
    checkStatusTitle: 'Services',

    dashboardTitle: 'Dashboard',
    dashboardGreeting: 'Hello',
    dashboardPhase: 'Foundations',
    dashboardPhaseBody:
      'Identity, authorization and operations are in place. Stock, documents and invoicing come next.',
    dashboardQuickTitle: 'Coming next',
    dashboardQuickBody: 'A module is only announced once its concurrency test is written.',
    moduleStock: 'Stock',
    moduleStockBody: 'A quantity derived from an append-only ledger.',
    moduleSales: 'Sales',
    moduleSalesBody: 'Prices and taxes resolved on the server.',
    moduleInvoicing: 'Invoicing',
    moduleInvoicingBody: 'Numbered at issue, immutable afterwards.',
    moduleCustomFields: 'Custom fields',
    moduleCustomFieldsBody: 'Real columns, not opaque JSON.',

    permissionsTitle: 'Permissions',
    permissionsDescription:
      'The server decides. Each route states what it needs; the interface grants nothing.',
    permissionsTotal: '{count} permissions',
    permissionsSearch: 'Filter permissions…',
    permissionsEmpty: 'No permission matches.',
    permissionsResource: 'Resource',
    permissionsGrantedBy: 'Granted by',

    settingsTitle: 'Settings',
    settingsDescription: 'Preferences for this interface and this deployment.',
    settingsAppearance: 'Appearance',
    settingsLanguage: 'Language',
    settingsBusiness: 'Business',
    settingsBusinessName: 'Registered name',
    settingsVatRegime: 'VAT regime',
    settingsCurrency: 'Currency',
    settingsNotPersisted:
      'Appearance and language are saved on this device. Business details are not saved yet: no endpoint accepts them.',
    settingsPlaceholder: 'Not set',

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

    save: 'Save',
    cancel: 'Cancel',
    close: 'Close',
    loading: 'Loading…',
    retry: 'Retry',
    yes: 'Yes',
    no: 'No',
  },

  ar: {
    // Machine draft — awaiting native review before release.
    appName: 'easyERP',
    tagline: 'أدر أعمالك بلغتك الخاصة.',

    navDashboard: 'لوحة القيادة',
    navPermissions: 'الصلاحيات',
    navSettings: 'الإعدادات',
    navSignIn: 'تسجيل الدخول',
    navSignOut: 'تسجيل الخروج',
    navMain: 'التنقل الرئيسي',
    navSkipToContent: 'تخطَّ إلى المحتوى',

    appearance: 'المظهر',
    themeLabel: 'السمة',
    themeLight: 'نهاري',
    themeDark: 'ليلي',
    themeSystem: 'النظام',
    themeToggle: 'تبديل السمة',
    themeCurrent: 'السمة الحالية: {theme}',

    localeLabel: 'اللغة',

    statusTitle: 'حالة النشر',
    statusSubtitle: 'كل عميل يعمل على مضيف خاص به، وقاعدة بيانات خاصة به، ومنفذ خاص به.',
    statusOk: 'يعمل',
    statusDegraded: 'متدهور',
    statusDown: 'غير متاح',
    statusChecking: 'جارٍ التحقق…',
    checkApi: 'الواجهة البرمجية',
    checkDatabase: 'قاعدة البيانات',
    checkWeb: 'واجهة الاستعمال',
    checkStatusTitle: 'الخدمات',

    dashboardTitle: 'لوحة القيادة',
    dashboardGreeting: 'مرحبًا',
    dashboardPhase: 'الأساسات',
    dashboardPhaseBody:
      'الهوية والصلاحيات والتشغيل جاهزة. أما المخزون والمستندات والفوترة فتأتي بعدها.',
    dashboardQuickTitle: 'قادم',
    dashboardQuickBody: 'لا يُعلَن عن أي وحدة إلا بعد كتابة اختبار التزامن الخاص بها.',
    moduleStock: 'المخزون',
    moduleStockBody: 'كمية مشتقّة من سجل لا يُعدَّل إلّا بالإضافة.',
    moduleSales: 'المبيعات',
    moduleSalesBody: 'الأسعار والضرائب يُحلّان في الخادم.',
    moduleInvoicing: 'الفوترة',
    moduleInvoicingBody: 'الترقيم عند الإصدار، ولا تُعدَّل المستندات بعدها.',
    moduleCustomFields: 'الحقول المخصّصة',
    moduleCustomFieldsBody: 'أعمدة حقيقية، لا بيانات غامضة.',

    permissionsTitle: 'الصلاحيات',
    permissionsDescription: 'القرار في الخادم. كل مسار يعلن ما يحتاجه، والواجهة لا تمنح شيئًا.',
    permissionsTotal: '{count} صلاحية',
    permissionsSearch: 'تصفية الصلاحيات…',
    permissionsEmpty: 'لا توجد صلاحية مطابقة.',
    permissionsResource: 'المورد',
    permissionsGrantedBy: 'تُمنح بواسطة',

    settingsTitle: 'الإعدادات',
    settingsDescription: 'تفضيلات هذه الواجهة وهذا النشر.',
    settingsAppearance: 'المظهر',
    settingsLanguage: 'اللغة',
    settingsBusiness: 'المؤسسة',
    settingsBusinessName: 'التسمية التجارية',
    settingsVatRegime: 'نظام ضريبة القيمة المضافة',
    settingsCurrency: 'العملة',
    settingsNotPersisted:
      'يُحفظ المظهر واللغة على هذا الجهاز. أما بيانات المؤسسة فلا تُحفظ بعد: لا يوجد أي مسار يقبلها.',
    settingsPlaceholder: 'غير محدَّد',

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

    save: 'حفظ',
    cancel: 'إلغاء',
    close: 'إغلاق',
    loading: 'جارٍ التحميل…',
    retry: 'إعادة المحاولة',
    yes: 'نعم',
    no: 'لا',
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
