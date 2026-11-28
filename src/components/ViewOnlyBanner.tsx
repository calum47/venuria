import { useTranslations } from 'next-intl'

/** Shown on project pages a Member opened through a Public project they are not assigned to. */
export default function ViewOnlyBanner() {
  const t = useTranslations('Common')
  return (
    <p role="status" className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
      <span className="font-medium">{t('viewOnlyTitle')}</span> {t('viewOnlyBody')}
    </p>
  )
}
