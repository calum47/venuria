'use server'

import { revalidatePath } from 'next/cache'
import { getTranslations } from 'next-intl/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Saves the vendor's contact details. Goes through update_my_vendor_profile() (migration 049), which can
 * only touch the caller's own company and only these four fields. Planners' timetables pick the change up
 * automatically (trigger), so there is nothing else to update here.
 */
export async function saveVendorProfile(formData: FormData) {
  const t = await getTranslations('VendorSettings')
  const supabase = await createClient()
  const str = (k: string) => String(formData.get(k) ?? '')
  const { error } = await supabase.rpc('update_my_vendor_profile', {
    p_contact_name: str('contactName'),
    p_phone: str('phone'),
    p_email: str('email'),
    p_instagram: str('instagram').replace(/^@+/, ''),
  })
  if (error) return { error: error.code === '42501' ? t('notAVendor') : error.message }
  revalidatePath('/rental/settings')
  return { success: true }
}
