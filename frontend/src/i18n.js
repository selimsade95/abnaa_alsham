import arabic from "@/i18n/ar.json";
import english from "@/i18n/en.json";
import i18next from "i18next";
import { initReactI18next } from "react-i18next";

const STORAGE_KEY = "abnaa-language";
const phraseLookup = new Map();

function indexPhrases(ar, en, prefix = "") {
  Object.keys(ar).forEach((key) => {
    const arabicValue = ar[key];
    const englishValue = en?.[key];
    if (
      arabicValue &&
      typeof arabicValue === "object" &&
      !Array.isArray(arabicValue)
    ) {
      indexPhrases(arabicValue, englishValue || {}, `${prefix}${key}.`);
    } else if (typeof arabicValue === "string" && englishValue) {
      phraseLookup.set(arabicValue, `${prefix}${key}`);
    }
  });
}

indexPhrases(arabic, english);

i18next.use(initReactI18next).init({
  resources: {
    ar: { translation: arabic },
    en: { translation: english },
  },
  lng: getLanguage(),
  fallbackLng: "ar",
  interpolation: { escapeValue: false },
  returnNull: false,
});

export function getLanguage() {
  try {
    return localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "ar";
  } catch {
    return "ar";
  }
}

export function setLanguage(language) {
  const nextLanguage = language === "en" ? "en" : "ar";
  try {
    localStorage.setItem(STORAGE_KEY, nextLanguage);
  } catch {
    // Language changes still apply for this page when storage is unavailable.
  }
  applyDocumentLanguage(nextLanguage);
  i18next.changeLanguage(nextLanguage);
  return nextLanguage;
}

function applyDocumentLanguage(language) {
  if (typeof document === "undefined") return;
  document.documentElement.lang = language;
  document.documentElement.dir = language === "ar" ? "rtl" : "ltr";
  document.title =
    language === "ar"
      ? "مدرسة أبناء الشام | نظام إدارة المدرسة"
      : "Abnaa Alsham School | School Management System";
}

export const i18n = i18next;

export function getIntlLocale() {
  return getLanguage() === "ar" ? "ar-EG" : "en-US";
}

export function t(key, options = {}) {
  if (typeof key !== "string") return key;
  const section = key.split(".", 1)[0];
  const translationKey =
    phraseLookup.get(key) ||
    (Object.prototype.hasOwnProperty.call(arabic, section) ? key : null);
  return translationKey ? i18next.t(translationKey, options) : key;
}

export function initializeLanguage() {
  const language = getLanguage();
  applyDocumentLanguage(language);
  i18next.changeLanguage(language);
}
