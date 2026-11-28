import type { SupabaseClient } from '@supabase/supabase-js'

/**
 * Who the signed-in user is as a vendor: the rental company they manage and its admin switches
 * (Admin → Vendor access). Null when the login manages no company, or the Vendor tag is switched off.
 * `isPlanner` = the same login is also a planner (then "back" goes to the planner side).
 */
export type VendorContext = {
  userId: string
  companyId: string
  companyName: string
  hasVendorStock: boolean
  isPlanner: boolean
}

export async function getVendorContext(supabase: SupabaseClient): Promise<VendorContext | null> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return null
  const [{ data: rm }, { data: planner }] = await Promise.all([
    supabase
      .from('rental_managers')
      .select('rental_company_id, rental_companies(name, is_vendor, has_vendor_stock)')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase.from('planners').select('id').eq('user_id', user.id).maybeSingle(),
  ])
  const co = (rm as { rental_company_id: string; rental_companies: { name: string; is_vendor: boolean; has_vendor_stock: boolean } | null } | null)
  if (!co?.rental_companies || co.rental_companies.is_vendor === false) return null
  return {
    userId: user.id,
    companyId: co.rental_company_id,
    companyName: co.rental_companies.name,
    hasVendorStock: co.rental_companies.has_vendor_stock !== false,
    isPlanner: !!planner,
  }
}
