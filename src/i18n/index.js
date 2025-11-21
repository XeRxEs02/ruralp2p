import i18n from "i18next";
import { initReactI18next } from "react-i18next";

import en from "./en.json";
import hi from "./hi.json";
import kn from "./kn.json";
import ur from "./ur.json";
import bn from "./bn.json";

const resources = { en: { translation: en }, hi: { translation: hi }, kn: { translation: kn }, ur: { translation: ur }, bn: { translation: bn } };

const stored = typeof window !== "undefined" ? localStorage.getItem("preferredLanguage") : null;
const lng = stored || "en";

i18n
  .use(initReactI18next)
  .init({
    resources,
    lng,
    fallbackLng: "en",
    interpolation: { escapeValue: false }
  });

export default i18n;
