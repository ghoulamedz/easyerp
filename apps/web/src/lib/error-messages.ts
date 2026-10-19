/**
 * Client-side translations for API error messages.
 *
 * Server errors arrive in English (`{ error: { code, message } }`) and every
 * screen renders `failure.message` raw, so the message a Business sees follows
 * the server language instead of the `<html lang>`. This dictionary keys the
 * stable error CODE — the one thing the API guarantees — to a short message in
 * each interface language. `api.ts` keeps `ApiError(code, status)` untouched
 * and only localizes the message; an unknown code keeps the server message so
 * a new failure stays visible instead of becoming a wrong translation.
 */

export type ErrorLocale = 'en' | 'fr' | 'ar';

type LocalizedMessage = Record<ErrorLocale, string>;

/**
 * One generic message per error code. Generic on purpose: the server message
 * may carry an id or a quantity ("Item 12 was not found"), which no dictionary
 * can enumerate, so the client renders the kind of failure, not its details.
 */
export const ERROR_MESSAGES: Readonly<Record<string, LocalizedMessage>> = {
  NOT_FOUND: {
    en: 'The requested record was not found.',
    fr: "L'enregistrement demandé est introuvable.",
    ar: 'السجل المطلوب غير موجود.',
  },
  VALIDATION_FAILED: {
    en: 'The submitted data is invalid.',
    fr: 'Les données saisies sont invalides.',
    ar: 'البيانات المدخلة غير صالحة.',
  },
  UNAUTHORIZED: {
    en: 'Authentication is required.',
    fr: 'Authentification requise.',
    ar: 'المصادقة مطلوبة.',
  },
  FORBIDDEN: {
    en: 'You are not permitted to perform this action.',
    fr: "Vous n'êtes pas autorisé à effectuer cette action.",
    ar: 'ليس لديك صلاحية لتنفيذ هذا الإجراء.',
  },
  CONFLICT: {
    en: 'The action conflicts with the current state.',
    fr: "L'action est en conflit avec l'état actuel.",
    ar: 'يتعارض الإجراء مع الحالة الحالية.',
  },
  ILLEGAL_TRANSITION: {
    en: 'This state change is not allowed.',
    fr: "Ce changement d'état n'est pas autorisé.",
    ar: 'هذا التغيير في الحالة غير مسموح به.',
  },
  INSUFFICIENT_STOCK: {
    en: 'There is not enough stock for this action.',
    fr: 'Le stock est insuffisant pour cette action.',
    ar: 'لا يوجد مخزون كافٍ لهذا الإجراء.',
  },
  ARCHIVE_UNAVAILABLE: {
    en: 'The archived PDF of this document is not available on this deployment. Ask the operator to attach the document archive.',
    fr: "La version PDF archivée de ce document n'est pas disponible sur ce déploiement. Demandez à l'exploitant de rattacher l'archive documentaire.",
    ar: 'نسخة PDF المؤردة لهذا المستند غير متوفرة على هذا الخادم. يرجى طلب ربط أرشيف المستندات من المُشغِّل.',
  },
  INVARIANT_VIOLATION: {
    en: 'An unexpected error occurred.',
    fr: "Une erreur inattendue s'est produite.",
    ar: 'حدث خطأ غير متوقع.',
  },
  REQUEST_FAILED: {
    en: 'The request failed.',
    fr: 'La requête a échoué.',
    ar: 'فشل الطلب.',
  },
  INTERNAL_ERROR: {
    en: 'Something went wrong on our side. Please try again.',
    fr: "Quelque chose s'est mal passé de notre côté. Veuillez réessayer.",
    ar: 'حدث خطأ من جانبنا. يرجى المحاولة مرة أخرى.',
  },
};

/** The interface language from `<html lang>`, or English when unknown. */
export function currentLocale(): ErrorLocale {
  if (typeof document === 'undefined') return 'en';
  const raw = document.documentElement.lang.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (raw === 'fr' || raw === 'ar' || raw === 'en') return raw;
  return 'en';
}

/**
 * The message to render for an API failure: the dictionary entry for a known
 * code, otherwise the server message untouched.
 */
export function localizeErrorMessage(
  code: string,
  serverMessage: string,
  locale: ErrorLocale = currentLocale(),
): string {
  const entry = ERROR_MESSAGES[code];
  if (!entry) return serverMessage;
  return entry[locale];
}
