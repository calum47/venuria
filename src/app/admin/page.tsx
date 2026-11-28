import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import { CreateVenueForm } from './CreateVenueForm'
import { CreateRentalCompanyForm } from './CreateRentalCompanyForm'
import { CreateAccountForm } from './CreateAccountForm'
import { AddVendorRoleForm } from './AddVendorRoleForm'
import { AddPlannerRoleForm } from './AddPlannerRoleForm'
import { VendorAccessList, type VendorAccessRow } from './VendorAccessList'
import { ResetPasswordForm, type ResettableAccount } from './ResetPasswordForm'
import { getTranslations } from 'next-intl/server'

export default async function AdminPage() {
  const t = await getTranslations('Admin')
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const [{ data: venues }, { data: venueManagers }, { data: rentalCompanies }, { data: rentalManagers }, { data: planners }] =
    await Promise.all([
      supabase
        .from('venues')
        .select('id, name, max_capacity_persons, created_at')
        .order('created_at', { ascending: false }),
      supabase
        .from('venue_managers')
        .select('id, name, email, user_id, venue_id, venues(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('rental_companies')
        .select('id, name, contact_email, created_at, is_vendor, has_vendor_stock')
        .order('created_at', { ascending: false }),
      supabase
        .from('rental_managers')
        .select('id, name, email, user_id, rental_company_id, rental_companies(name)')
        .order('created_at', { ascending: false }),
      supabase
        .from('planners')
        .select('id, name, email, user_id, planner_code, created_at')
        .order('created_at', { ascending: false }),
    ])

  // One entry per login (a planner who is also a vendor shares one login), labelled with every role it has.
  const byUser = new Map<string, { name: string; email: string; roles: string[] }>()
  const addLogin = (userId: string | null, name: string, email: string, roleLabel: string) => {
    if (!userId) return
    const e = byUser.get(userId) ?? { name, email, roles: [] }
    if (!e.roles.includes(roleLabel)) e.roles.push(roleLabel)
    byUser.set(userId, e)
  }
  for (const p of planners ?? []) addLogin(p.user_id, p.name, p.email, t('planner'))
  for (const m of venueManagers ?? []) addLogin(m.user_id, m.name, m.email, t('venueManager'))
  for (const m of rentalManagers ?? []) addLogin(m.user_id, m.name, m.email, t('rentalManagerVendor'))
  const vendorRows: VendorAccessRow[] = (rentalCompanies ?? [])
    .map((rc) => ({
      id: rc.id as string,
      name: rc.name as string,
      logins: (rentalManagers ?? []).filter((m) => m.rental_company_id === rc.id).map((m) => `${m.name} — ${m.email}`),
      isVendor: rc.is_vendor as boolean,
      hasVendorStock: rc.has_vendor_stock as boolean,
    }))
    .sort((a, b) => a.name.localeCompare(b.name))
  const resettable: ResettableAccount[] = [...byUser.entries()]
    .map(([userId, e]) => ({ userId, label: `${e.name} — ${e.email} (${e.roles.join(' + ')})` }))
    .sort((a, b) => a.label.localeCompare(b.label))

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-semibold text-gray-900">{t('administration')}</h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500">
          {t.rich('loggedInAs', { email: user?.email ?? '', b: (c) => <span className="font-medium text-gray-900">{c}</span> })}
        </p>

        <CreateVenueForm />
        <CreateRentalCompanyForm />
        <CreateAccountForm venues={venues ?? []} rentalCompanies={rentalCompanies ?? []} />
        <ResetPasswordForm accounts={resettable} />
        <AddVendorRoleForm
          planners={(planners ?? []).filter((p) => !(rentalManagers ?? []).some((m) => m.user_id === p.user_id)).map((p) => ({ id: p.id, name: p.name, email: p.email }))}
          vendorUserNames={(planners ?? []).filter((p) => (rentalManagers ?? []).some((m) => m.user_id === p.user_id)).map((p) => p.name)}
        />

        <AddPlannerRoleForm
          vendors={(rentalManagers ?? [])
            .filter((m) => !(planners ?? []).some((p) => p.user_id === m.user_id))
            .map((m) => ({
              id: m.id as string,
              name: m.name as string,
              email: m.email as string | null,
              company: (m.rental_companies as unknown as { name: string } | null)?.name ?? '',
            }))}
          plannerNames={(rentalManagers ?? []).filter((m) => (planners ?? []).some((p) => p.user_id === m.user_id)).map((m) => m.name as string)}
        />

        <VendorAccessList key={vendorRows.map((r) => `${r.id}${r.isVendor}${r.hasVendorStock}`).join()} rows={vendorRows} />

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            {t('venuesCount', { count: venues?.length ?? 0 })}
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {venues?.map((v) => (
              <li key={v.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">{v.name}</span>
                <span className="text-gray-400">{v.max_capacity_persons != null ? t('maxSuffix', { count: v.max_capacity_persons }) : '—'}</span>
              </li>
            ))}
            {venues?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">{t('noVenuesYet')}</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            {t('venueManagersCount', { count: venueManagers?.length ?? 0 })}
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {venueManagers?.map((vm) => (
              <li key={vm.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">
                  {vm.name} <span className="text-gray-400">({vm.email})</span>
                </span>
                <span className="text-gray-400 text-xs">
                  {(vm.venues as unknown as { name: string } | null)?.name ?? '—'}
                </span>
              </li>
            ))}
            {venueManagers?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">{t('noVenueManagersYet')}</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            {t('rentalCompaniesCount', { count: rentalCompanies?.length ?? 0 })}
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {rentalCompanies?.map((rc) => (
              <li key={rc.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">{rc.name}</span>
                <span className="text-gray-400">{rc.contact_email ?? '—'}</span>
              </li>
            ))}
            {rentalCompanies?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">{t('noRentalCompaniesYet')}</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            {t('rentalManagersCount', { count: rentalManagers?.length ?? 0 })}
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {rentalManagers?.map((rm) => (
              <li key={rm.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">
                  {rm.name} <span className="text-gray-400">({rm.email})</span>
                </span>
                <span className="text-gray-400 text-xs">
                  {(rm.rental_companies as unknown as { name: string } | null)?.name ?? '—'}
                </span>
              </li>
            ))}
            {rentalManagers?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">{t('noRentalManagersYet')}</li>
            )}
          </ul>
        </section>

        <section>
          <h2 className="text-sm font-semibold text-gray-900 mb-2">
            {t('plannersCount', { count: planners?.length ?? 0 })}
          </h2>
          <ul className="divide-y divide-gray-100 bg-white rounded-xl border border-gray-100">
            {planners?.map((p) => (
              <li key={p.id} className="px-4 py-2.5 text-sm flex justify-between">
                <span className="text-gray-900">
                  {p.name} <span className="text-gray-400">({p.email})</span>
                </span>
                <span className="text-gray-400 font-mono text-xs">{p.planner_code}</span>
              </li>
            ))}
            {planners?.length === 0 && (
              <li className="px-4 py-2.5 text-sm text-gray-400">{t('noPlannersYet')}</li>
            )}
          </ul>
        </section>
      </div>
    </main>
  )
}
