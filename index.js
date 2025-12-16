/**
 * Burner Chat - Backend Server
 * ============================
 * Real-time anonymous chat server using Express and Socket.io
 * Messages are ephemeral - stored only in memory, lost on restart
 */

require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Configuration
const PORT = process.env.PORT || 3001;

// CORS - Allow both production (Vercel) and development (localhost)
const ALLOWED_ORIGINS = [
  'https://burner-chat.vercel.app',
  'http://localhost:5173'
];

// ==========================================
// SOCKET.IO SETUP WITH CORS
// ==========================================
const io = new Server(server, {
  cors: {
    origin: ALLOWED_ORIGINS,        // Allow both Vercel and localhost
    methods: ['GET', 'POST'],       // Allowed HTTP methods
    credentials: true               // Allow credentials if needed
  },
  // Transport configuration for cloud hosting (Render)
  transports: ['polling', 'websocket'],
  // Ping settings to keep connection alive
  pingTimeout: 60000,
  pingInterval: 25000,
  // Allow upgrades from polling to websocket
  allowUpgrades: true
});

// Express middleware
app.use(cors({
  origin: ALLOWED_ORIGINS,
  credentials: true
}));
app.use(express.json());

// ==========================================
// IN-MEMORY DATA STORAGE (EPHEMERAL)
// ==========================================
// Store active rooms and their messages
// NOTE: This data is lost when server restarts - by design!
const rooms = new Map(); // roomId -> { users: Set, messages: [] }

/**
 * Get or create a room
 * @param {string} roomId - Unique room identifier
 * @returns {object} Room object with users and messages
 */
function getOrCreateRoom(roomId) {
  if (!rooms.has(roomId)) {
    rooms.set(roomId, {
      users: new Set(),
      messages: [],
      createdAt: new Date()
    });
    console.log(`📦 Room created: ${roomId}`);
  }
  return rooms.get(roomId);
}

/**
 * Generate a random anonymous username
 * @returns {string} Random username like "Anon-7x3k"
 */
function generateUsername() {
  const suffix = Math.random().toString(36).substring(2, 6);
  return `Anon-${suffix}`;
}

// ==========================================
// SOCKET.IO EVENT HANDLERS
// ==========================================
io.on('connection', (socket) => {
  console.log(`🔌 User connected: ${socket.id}`);

  // Store user data on the socket
  socket.userData = {
    username: null, // Will be set when user joins with their chosen name
    currentRoom: null
  };

  // ------------------------------------------
  // JOIN ROOM EVENT
  // ------------------------------------------
  // Now accepts an object: { roomId: string, username: string }
  socket.on('join_room', (data) => {
    // Handle both old format (just roomId string) and new format (object with roomId + username)
    const roomId = typeof data === 'string' ? data : data.roomId;
    const customUsername = typeof data === 'object' ? data.username : null;

    // Set username - use custom name if provided, otherwise generate random
    if (customUsername && customUsername.trim()) {
      socket.userData.username = customUsername.trim().substring(0, 20); // Limit to 20 chars
    } else {
      socket.userData.username = generateUsername();
    }

    // Leave previous room if any
    if (socket.userData.currentRoom) {
      socket.leave(socket.userData.currentRoom);
      const prevRoom = rooms.get(socket.userData.currentRoom);
      if (prevRoom) {
        prevRoom.users.delete(socket.id);
      }
    }

    // Join the new room
    socket.join(roomId);
    socket.userData.currentRoom = roomId;

    const room = getOrCreateRoom(roomId);
    room.users.add(socket.id);

    console.log(`👤 ${socket.userData.username} joined room: ${roomId}`);
    console.log(`   Room now has ${room.users.size} user(s)`);

    // Send current user their username and user count
    socket.emit('user_joined', {
      username: socket.userData.username,
      userCount: room.users.size
    });

    // Notify others in the room
    socket.to(roomId).emit('user_activity', {
      type: 'join',
      message: `${socket.userData.username} joined the chat`,
      userCount: room.users.size
    });
  });

  // ------------------------------------------
  // SEND MESSAGE EVENT
  // ------------------------------------------
  socket.on('send_message', (data) => {
    const { message } = data;
    const roomId = socket.userData.currentRoom;

    if (!roomId || !message?.trim()) {
      return; // Ignore invalid messages
    }

    const room = rooms.get(roomId);
    if (!room) return;

    // Create message object
    const messageObj = {
      id: uuidv4(),
      sender: socket.userData.username,
      senderId: socket.id,
      message: message.trim(),
      timestamp: new Date().toISOString()
    };

    // Store in memory (ephemeral - lost on restart)
    room.messages.push(messageObj);

    // Keep only last 100 messages per room to prevent memory bloat
    if (room.messages.length > 100) {
      room.messages.shift();
    }

    console.log(`💬 [${roomId}] ${socket.userData.username}: ${message.trim()}`);

    // Broadcast message to ALL users in the room (including sender)
    io.to(roomId).emit('receive_message', messageObj);
  });

  // ------------------------------------------
  // DISCONNECT EVENT
  // ------------------------------------------
  socket.on('disconnect', () => {
    const roomId = socket.userData.currentRoom;

    if (roomId) {
      const room = rooms.get(roomId);
      if (room) {
        room.users.delete(socket.id);

        // Notify remaining users
        socket.to(roomId).emit('user_activity', {
          type: 'leave',
          message: `${socket.userData.username} left the chat`,
          userCount: room.users.size
        });

        // Clean up empty rooms after 5 minutes
        if (room.users.size === 0) {
          setTimeout(() => {
            const currentRoom = rooms.get(roomId);
            if (currentRoom && currentRoom.users.size === 0) {
              rooms.delete(roomId);
              console.log(`🗑️  Room deleted (empty): ${roomId}`);
            }
          }, 5 * 60 * 1000); // 5 minutes
        }
      }
    }

    console.log(`🔌 User disconnected: ${socket.id}`);
  });
});

// ==========================================
// REST API ENDPOINTS (Optional)
// ==========================================

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    activeRooms: rooms.size,
    timestamp: new Date().toISOString()
  });
});

// Get room info (for debugging)
app.get('/room/:roomId', (req, res) => {
  const room = rooms.get(req.params.roomId);
  if (!room) {
    return res.status(404).json({ error: 'Room not found' });
  }
  res.json({
    userCount: room.users.size,
    messageCount: room.messages.length,
    createdAt: room.createdAt
  });
});

// ==========================================
// START SERVER
// ==========================================
server.listen(PORT, () => {
  console.log(`
  ╔════════════════════════════════════════╗
  ║     🔥 BURNER CHAT SERVER 🔥           ║
  ╠════════════════════════════════════════╣
  ║  Server running on port ${PORT}            ║
  ║  Accepting connections from:           ║
  ║  ${ALLOWED_ORIGINS.join(', ')}
  ╚════════════════════════════════════════╝
  `);
});
