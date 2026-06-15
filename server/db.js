import { createClient } from '@supabase/supabase-js'

export const supabase = createClient(
  process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY || process.env.VITE_SUPABASE_SERVICE_KEY,
  { auth: { persistSession: false } }
)

export async function fetchAllRows(table) {
  const rows = []
  let from = 0
  const PAGE = 1000
  while (true) {
    const { data, error } = await supabase.from(table).select('*').range(from, from + PAGE - 1)
    if (error || !data?.length) break
    rows.push(...data)
    if (data.length < PAGE) break
    from += PAGE
  }
  return rows
}
