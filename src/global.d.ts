import type { Messages } from '@/messages'
import type { Locale } from '@/i18n/config'

// Makes t('some.key') type-checked against en.json: a typo in a key fails `next build`.
declare module 'next-intl' {
  interface AppConfig {
    Locale: Locale
    Messages: Messages
  }
}
