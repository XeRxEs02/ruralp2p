import { useTranslation } from "react-i18next";

export default function LanguageSelector() {
  const { i18n, t } = useTranslation();
  const setLang = (lang: string) => {
    i18n.changeLanguage(lang);
    localStorage.setItem("preferredLanguage", lang);
  };
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm">{t("nav.language")}:</span>
      <select
        className="border rounded px-2 py-1 text-sm"
        value={i18n.language}
        onChange={(e) => setLang(e.target.value)}
      >
        <option value="en">English</option>
        <option value="hi">हिन्दी</option>
        <option value="kn">ಕನ್ನಡ</option>
        <option value="ur">اردو</option>
        <option value="bn">বাংলা</option>
      </select>
    </div>
  );
}
