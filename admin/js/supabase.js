import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js/+esm';

const SUPABASE_URL = 'https://njghrdnyqqbbngcgreah.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_rclbfr9D9j_13X6NK4d70A_0Ay2qObN';

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
