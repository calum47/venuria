import { createClient } from '@/lib/supabase/server'
import { SignOutButton } from '@/components/auth/SignOutButton'
import StockManager from '@/components/stock/StockManager'

export default async function RentalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <p className="text-sm text-gray-500">Not signed in.</p>
      </main>
    )
  }

  const { data: rentalManager } = await supabase
    .from('rental_managers')
    .select('rental_company_id, rental_companies(name)')
    .eq('user_id', user.id)
    .maybeSingle()

  const rentalCompanyId = rentalManager?.rental_company_id as string | undefined
  const rentalCompanyName = (rentalManager as { rental_companies: { name: string } | null } | null)
    ?.rental_companies?.name

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-8">
          <h1 className="text-xl font-semibold text-gray-900">
            Rental Manager{rentalCompanyName ? ` — ${rentalCompanyName}` : ''}
          </h1>
          <SignOutButton />
        </div>
        <p className="text-sm text-gray-500 mb-6">
          Logged in as <span className="font-medium text-gray-900">{user.email}</span>.
        </p>

        {!rentalCompanyId ? (
          <p className="text-sm text-red-600">
            No rental company is linked to this account — contact an admin.
          </p>
        ) : (
          <section>
            <h2 className="text-lg font-medium text-gray-900 mb-2">Stock — tables &amp; chairs</h2>
            <p className="text-sm text-gray-500 mb-4">
              How many of each standard item your company has available to rent out. Planners draw from
              a venue&apos;s own stock first — this is what fills the gap when a project needs more than the
              venue has.
            </p>
            <StockManager ownerType="rental_company" ownerId={rentalCompanyId} />
          </section>
        )}
      </div>
    </main>
  )
}
