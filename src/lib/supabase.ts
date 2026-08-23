import { createClient } from '@supabase/supabase-js'

export const SUPABASE_URL      = 'https://ruepnwhgehcwfeekkpjb.supabase.co'
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1ZXBud2hnZWhjd2ZlZWtrcGpiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQzNjU2MzMsImV4cCI6MjA4OTk0MTYzM30.JQCiafSVHOX1DMgPDNSTTXJmXu34Spzj8j58PsU1fY0'

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
