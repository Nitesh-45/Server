# 🔥 Burner Chat - Server

Real-time WebSocket server for anonymous ephemeral chat rooms.

![Node.js](https://img.shields.io/badge/Node.js-18+-green) ![Socket.io](https://img.shields.io/badge/Socket.io-4.7-yellow) ![Express](https://img.shields.io/badge/Express-4.18-blue)

## Features

- 🚀 Real-time messaging with Socket.io
- 🔒 Room-based chat isolation
- 👤 Custom usernames support
- 💨 Ephemeral messages (in-memory only)
- ⚡ CORS configured for frontend

## Quick Start

```bash
# Install dependencies
npm install

# Run server
npm run dev
```

Server runs on `http://localhost:3001`

## Environment Variables

Create a `.env` file:

```env
PORT=3001
CLIENT_URL=http://localhost:5173
```

## API Events

### Client → Server

| Event | Payload | Description |
|-------|---------|-------------|
| `join_room` | `{ roomId, username }` | Join a chat room |
| `send_message` | `{ message }` | Send a message |

### Server → Client

| Event | Payload | Description |
|-------|---------|-------------|
| `user_joined` | `{ username, userCount }` | Join confirmation |
| `receive_message` | `{ id, sender, message, timestamp }` | New message |
| `user_activity` | `{ type, message, userCount }` | User join/leave |

## Deploy on Render

1. Connect this repo to Render
2. Set environment:
   - `PORT` → Render provides this
   - `CLIENT_URL` → Your frontend URL
3. Deploy!

---

Made with 💚 by **NSM**
