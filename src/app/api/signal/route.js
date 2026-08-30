// In-memory WebRTC signaling store
// Using global to persist across Next.js hot reloads
if (!global._rtcStore) {
  global._rtcStore = {
    offer: null,       // SDP offer from sender
    answer: null,      // SDP answer from receiver
    timestamp: 0,
  }
}

export async function GET(request) {
  const { searchParams } = new URL(request.url)
  const type = searchParams.get('type')
  const store = global._rtcStore

  if (type === 'offer') {
    return Response.json({ data: store.offer })
  }
  if (type === 'answer') {
    return Response.json({ data: store.answer })
  }

  return Response.json({ error: 'unknown type' }, { status: 400 })
}

export async function POST(request) {
  const body = await request.json()
  const { type, data } = body
  const store = global._rtcStore

  if (type === 'offer') {
    store.offer = data
    store.answer = null // Reset answer when new offer comes in
    store.timestamp = Date.now()
    console.log('[Signal] Offer stored')
  } else if (type === 'answer') {
    store.answer = data
    console.log('[Signal] Answer stored')
  } else if (type === 'reset') {
    store.offer = null
    store.answer = null
    console.log('[Signal] Store reset')
  } else {
    return Response.json({ error: 'unknown type' }, { status: 400 })
  }

  return Response.json({ ok: true })
}
