// WebRTC Signaling via kvdb.io (free persistent KV store)
// Works perfectly on Vercel serverless functions (no shared memory needed)
const KVDB_BUCKET = 'RpE3peQk8QkkUao6Ztrxck'
const KVDB_BASE = `https://kvdb.io/${KVDB_BUCKET}`

async function kvGet(key) {
  try {
    const res = await fetch(`${KVDB_BASE}/${key}`)
    if (res.status === 404) return null
    const text = await res.text()
    if (!text || text.trim() === '') return null
    return JSON.parse(text)
  } catch {
    return null
  }
}

async function kvSet(key, value) {
  await fetch(`${KVDB_BASE}/${key}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(value),
  })
}

async function kvDelete(key) {
  await fetch(`${KVDB_BASE}/${key}`, { method: 'DELETE' })
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')

  if (type === 'offer') {
    const data = await kvGet('offer')
    return Response.json({ data })
  }
  if (type === 'answer') {
    const data = await kvGet('answer')
    return Response.json({ data })
  }

  return Response.json({ error: 'unknown type' }, { status: 400 })
}

export async function POST(request) {
  const body = await request.json()
  const { type, data } = body

  if (type === 'offer') {
    await kvSet('offer', data)
    await kvDelete('answer') // Clear old answer when new offer arrives
    console.log('[Signal] Offer stored in KVDB')
  } else if (type === 'answer') {
    await kvSet('answer', data)
    console.log('[Signal] Answer stored in KVDB')
  } else if (type === 'reset') {
    await kvDelete('offer')
    await kvDelete('answer')
    console.log('[Signal] KVDB reset')
  } else {
    return Response.json({ error: 'unknown type' }, { status: 400 })
  }

  return Response.json({ ok: true })
}
