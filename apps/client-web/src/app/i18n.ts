import i18n from "i18next";
import { initReactI18next } from "react-i18next";

const resources = {
  fr: {
    translation: {
      appName: "Pilotage QHSE",
      dashboard: "Tableau de bord",
      projects: "Projets",
      sites: "Sites",
      signIn: "Se connecter",
      email: "Adresse e-mail",
      password: "Mot de passe",
      createSite: "Créer un site",
    },
  },
  ar: {
    translation: {
      appName: "منصة إدارة الجودة والصحة والسلامة والبيئة",
      dashboard: "لوحة القيادة",
      projects: "المشاريع",
      sites: "المواقع",
      signIn: "تسجيل الدخول",
      email: "البريد الإلكتروني",
      password: "كلمة المرور",
      createSite: "إنشاء موقع",
    },
  },
} as const;

void i18n.use(initReactI18next).init({
  resources,
  lng: import.meta.env["VITE_DEFAULT_LOCALE"] ?? "fr",
  fallbackLng: "fr",
  interpolation: { escapeValue: false },
});

i18n.on("languageChanged", (language) => {
  const direction = language === "ar" ? "rtl" : "ltr";
  document.documentElement.lang = language;
  document.documentElement.dir = direction;
});

export { i18n };
