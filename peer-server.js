const { PeerServer } = require('peer')

const peerServer = PeerServer({ 
    port: 9000, 
    path: '/myapp',
    allow_discovery: true
})

peerServer.on('connection', (client) => {
    console.log(`[PeerServer] Client connected: ${client.getId()}`)
})

peerServer.on('disconnect', (client) => {
    console.log(`[PeerServer] Client disconnected: ${client.getId()}`)
})

console.log('✅ PeerJS signaling server running on http://localhost:9000/myapp')
