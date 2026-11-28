'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTranslations } from 'next-intl'
import { addPlannerRole } from './actions'

type VendorLogin = { id: string; name: string; email: string | null; company: string }

export function AddPlannerRoleForm({ vendors, plannerNames }: { vendors: VendorLogin[]; plannerNames: string[] }) {
  const t = useTranslations('Admin')
  const tc = useTranslations('Common')
  const router = useRouter()
  const formRef = useRef<HTMLFormElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  const handleSubmit = async (formData: FormData) => {
    setError(null)
    setSuccess(null)
    setIsLoading(true)
    const result = await addPlannerRole(formData)
    setIsLoading(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setSuccess(t('doneThatLoginIsNowAlsoAPlanner'))
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">{t('makeAVendorAlsoAPlanner')}</h2>
      <p className="text-xs text-gray-400">{t('makePlannerHelp')}</p>
      {plannerNames.length > 0 && <p className="text-xs text-gray-400">{t('alreadyPlanners', { names: plannerNames.join(', ') })}</p>}
      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}
      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('vendorLogin')}</label>
        <select name="rentalManagerId" required defaultValue="" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="" disabled>{t('selectAVendorLogin')}</option>
          {vendors.map((v) => (
            <option key={v.id} value={v.id}>{v.company} — {v.name}{v.email ? ` (${v.email})` : ''}</option>
          ))}
        </select>
      </div>
      <button type="submit" disabled={isLoading || vendors.length === 0} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">
        {isLoading ? tc('saving') : t('makePlanner')}
      </button>
    </form>
  )
}
