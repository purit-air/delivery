// Simple smoke test for Supabase RPC `get_public_tracking`
// Node 18+ (uses global fetch)

const SUPABASE_URL = process.env.SUPABASE_URL || 'https://njghrdnyqqbbngcgreah.supabase.co';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || 'sb_publishable_rclbfr9D9j_13X6NK4d70A_0Ay2qObN';
const TRACKING_NUMBER = process.env.TRACKING_NUMBER || 'TRE-2026-0001-0001';

async function main(){
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY){
    console.error('Please set SUPABASE_URL and SUPABASE_ANON_KEY env vars.');
    process.exit(2);
  }

  const url = `${SUPABASE_URL}/rest/v1/rpc/get_public_tracking`;
  console.log('POST', url, 'payload:', { tracking_number: TRACKING_NUMBER });

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`
    },
    body: JSON.stringify({ tracking_number: TRACKING_NUMBER })
  });

  const txt = await res.text();
  console.log('Status:', res.status);
  console.log('Response:', txt);
  if (!res.ok) process.exit(1);
}

main().catch(err=>{ console.error(err); process.exit(2); });
