"use client"

import { useEffect, useState, useRef } from "react"
import { motion, AnimatePresence } from "framer-motion"

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
}

export default function LiveReceiverPage() {
  const [status, setStatus] = useState("Waiting for sender to connect...")
  const [isLive, setIsLive] = useState(false)
  const [location, setLocation] = useState(null)
  const [messages, setMessages] = useState([])
  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const pollingRef = useRef(null)
  const hasAnswered = useRef(false)

  const log = (msg) => {
    console.log("[Receiver]", msg)
    setStatus(msg)
  }

  const startPolling = () => {
    clearInterval(pollingRef.current)
    pollingRef.current = setInterval(async () => {
      if (hasAnswered.current) return

      try {
        const res = await fetch("/api/signal?type=offer")
        const { data: offer } = await res.json()

        if (!offer) return

        clearInterval(pollingRef.current)
        hasAnswered.current = true
        await connectToSender(offer)
      } catch (e) {
        console.error("Poll error:", e)
      }
    }, 1500)
  }

  const connectToSender = async (offer) => {
    log("Offer received! Connecting...")

    if (pcRef.current) pcRef.current.close()

    const pc = new RTCPeerConnection(ICE_SERVERS)
    pcRef.current = pc

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
        log("Connection lost. Reconnecting...")
        setIsLive(false)
        hasAnswered.current = false
        pc.close()
        startPolling()
      }
    }

    pc.ontrack = (event) => {
        if (event.streams && event.streams[0]) {
          log("🔴 LIVE — Stream connected!")
          setIsLive(true)
          if (videoRef.current) {
            videoRef.current.srcObject = event.streams[0]
            videoRef.current.play().catch(e => console.warn("Autoplay blocked:", e))
          }
        }
      }

      pc.ondatachannel = (event) => {
        const dc = event.channel
        dc.onmessage = (e) => {
          try {
            const payload = JSON.parse(e.data)
            if (payload.type === 'location') {
              setLocation(payload.data)
            } else if (payload.type === 'chat') {
              setMessages(prev => [...prev, payload.data])
            }
          } catch(err) {
            console.error("Failed to parse data channel msg:", err)
          }
        }
      }

      await pc.setRemoteDescription(new RTCSessionDescription(offer))

      const answer = await pc.createAnswer()
      await pc.setLocalDescription(answer)
      log("Answer created. Gathering ICE candidates...")

      await new Promise((resolve) => {
        if (pc.iceGatheringState === "complete") {
          resolve()
        } else {
          pc.addEventListener("icegatheringstatechange", () => {
            if (pc.iceGatheringState === "complete") resolve()
          })
          setTimeout(resolve, 4000)
        }
      })

      const completeAnswer = pc.localDescription
      await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "answer", data: { sdp: completeAnswer.sdp, type: completeAnswer.type } })
      })
      log("Answer sent! Waiting for video stream...")
    }

  useEffect(() => {
    const initReceiver = async () => {
      // Clear any stale connection data on the server when we refresh
      await fetch("/api/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "reset" }) })
      startPolling()
      log("Receiver ready. Waiting for sender...")
    }

    initReceiver()

    return () => {
      clearInterval(pollingRef.current)
      if (pcRef.current) pcRef.current.close()
    }
  }, [])

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center pt-8 px-6 pb-12 font-sans">
      <div className="flex items-center gap-3 mb-1">
        <h1 className="text-2xl font-bold text-pink-400">Live Monitor</h1>
        {isLive && (
          <span className="flex items-center gap-1.5 bg-red-600 text-white text-xs font-bold px-3 py-1 rounded-full animate-pulse">
            <span className="w-2 h-2 bg-white rounded-full" />
            LIVE
          </span>
        )}
      </div>
      <p className="text-gray-500 text-sm mb-5">{status}</p>

      <div className="w-full max-w-3xl aspect-video bg-gray-900 rounded-2xl overflow-hidden border border-gray-800 shadow-2xl relative mb-6 cursor-pointer" onClick={() => videoRef.current?.play()}>
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
        {!isLive && (
          <div className="absolute inset-0 flex flex-col items-center justify-center gap-3">
            <div className="w-16 h-16 rounded-full border-2 border-gray-700 flex items-center justify-center text-3xl">📷</div>
            <p className="text-gray-600 text-sm">Waiting for live feed...</p>
          </div>
        )}
      </div>

      {messages.length > 0 && (
        <div className="w-full max-w-xl mb-6 flex flex-col gap-3">
          <p className="text-gray-500 text-xs uppercase tracking-widest text-center">💬 Messages from Her</p>
          <div className="bg-gray-900 border border-gray-800 rounded-xl p-4 flex flex-col gap-2 max-h-48 overflow-y-auto">
            <AnimatePresence>
              {messages.map((msg, idx) => (
                <motion.div key={idx} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} className="bg-pink-500/20 text-pink-100 p-3 rounded-lg border border-pink-500/30">
                  {msg}
                </motion.div>
              ))}
            </AnimatePresence>
          </div>
        </div>
      )}

      {location && (
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="bg-gray-900 border border-gray-800 rounded-xl p-5 text-center w-full max-w-xl mb-6">
          <p className="text-gray-500 text-xs uppercase tracking-widest mb-2">📍 Location</p>
          <p className="text-pink-400 font-mono text-lg">{location.lat.toFixed(6)}, {location.lng.toFixed(6)}</p>
          <a href={`https://www.google.com/maps?q=${location.lat},${location.lng}`} target="_blank" rel="noopener noreferrer" className="text-blue-400 text-xs underline mt-2 inline-block">Open in Google Maps →</a>
        </motion.div>
      )}

      {!isLive && (
        <div className="bg-gray-900/60 border border-gray-800 rounded-xl p-5 text-sm text-gray-400 w-full max-w-xl">
          <p className="font-semibold text-white mb-2">How to connect:</p>
          <ol className="list-decimal list-inside space-y-1">
            <li>Keep this page open</li>
            <li>Open <span className="text-pink-400">localhost:3000</span> in another window</li>
            <li>Click through to the surprise screen</li>
            <li>Click the camera button and allow access</li>
            <li>Video will appear here automatically ✨</li>
          </ol>
        </div>
      )}
    </div>
  )
}
