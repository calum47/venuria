'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import { addVendorRole } from './actions'
import { useTranslations } from 'next-intl'

type Planner = { id: string; name: string; email: string | null }

export function AddVendorRoleForm({ planners, vendorUserNames }: { planners: Planner[]; vendorUserNames: string[] }) {
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
    const result = await addVendorRole(formData)
    setIsLoading(false)
    if (result?.error) {
      setError(result.error)
      return
    }
    setSuccess(t('doneThatLoginNowHas'))
    formRef.current?.reset()
    router.refresh()
  }

  return (
    <form ref={formRef} action={handleSubmit} className="bg-white border border-gray-100 rounded-xl p-6 space-y-4">
      <h2 className="text-sm font-semibold text-gray-900">{t('makeAPlannerAlsoA')}</h2>
      <p className="text-xs text-gray-400">
        Creates the vendor company and links it to the planner&apos;s own login: same email and password, with a switch between Planner and Vendor.
        The vendor gets what a rental company has (rentable tables and chairs) plus the team&apos;s stock, shared with My stock.
      </p>
      {vendorUserNames.length > 0 && (
        <p className="text-xs text-gray-400">{t('alreadyVendors', { names: vendorUserNames.join(', ') })}</p>
      )}

      {error && <p className="text-sm text-red-600">{error}</p>}
      {success && <p className="text-sm text-green-600">{success}</p>}

      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('planner2')}</label>
        <select name="plannerId" required defaultValue="" className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900">
          <option value="" disabled>{t('selectAPlanner')}</option>
          {planners.map((p) => (
            <option key={p.id} value={p.id}>{p.name}{p.email ? ` — ${p.email}` : ''}</option>
          ))}
        </select>
      </div>

      <div className="space-y-1">
        <label className="text-xs text-gray-500">{t('vendorCompanyName')}</label>
        <input name="companyName" required className="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm text-gray-900" />
      </div>

      <button type="submit" disabled={isLoading} className="rounded-lg bg-gray-900 px-4 py-2 text-sm text-white disabled:opacity-40">
        {isLoading ? tc('saving') : t('makeVendor')}
      </button>
    </form>
  )
}
