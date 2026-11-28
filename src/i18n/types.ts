/**
 * Loose type for a translator handed to plain (non-React) helper functions, so they can return text in the
 * current language. Pass `t` from useTranslations('Ns') (client) or getTranslations('Ns') (server).
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type Tr = (key: any, values?: any) => string
