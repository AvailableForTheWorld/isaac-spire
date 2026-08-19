import { useTranslation } from 'react-i18next';

export function LanguageToggle({ compact = false }: { compact?: boolean }) {
  const { t, i18n } = useTranslation();
  const isChinese = i18n.resolvedLanguage !== 'en';
  return (
    <button
      className={`language-toggle ${compact ? 'compact' : ''}`}
      onClick={() => void i18n.changeLanguage(isChinese ? 'en' : 'zh-CN')}
      title={t('language.label')}
      aria-label={`${t('language.label')}: ${t('language.switchTo')}`}
    >
      <span>{t('language.current')}</span>
      <b>{t('language.switchTo')}</b>
    </button>
  );
}
