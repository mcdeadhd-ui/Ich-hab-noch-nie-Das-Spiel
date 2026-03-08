const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: true,
    methods: ['GET', 'POST'],
  },
});

const questions = require('./questions.json');

app.use(express.static(path.join(__dirname, 'public')));

// In-memory rooms store
// rooms[roomId] = {
//   id, name, category, adminSocketId, adminPlayerId,
//   players: [{id, name, socketId}],
//   state: 'lobby' | 'playing' | 'finished',
//   questionPool: [...],
//   currentQuestionIndex: number,
//   reactions: { playerId: 'done' | 'notDone' }
// }
const rooms = {};

function isJoinDuringGameAllowed(room) {
  return room.allowJoinDuringGame === true;
}

function getRoomList() {
  return Object.values(rooms).map((room) => ({
    canJoin:
      room.state === 'lobby' ||
      (room.state === 'playing' && isJoinDuringGameAllowed(room)),
    id: room.id,
    name: room.name,
    category: room.category,
    playerCount: room.players.length,
    state: room.state,
    allowJoinDuringGame: isJoinDuringGameAllowed(room),
  }));
}

function buildQuestionPool(category) {
  const pool = [...(questions[category] || [])];
  // Shuffle the pool
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }
  return pool;
}

function emitRoomUpdate(roomId) {
  const room = rooms[roomId];
  if (!room) return;
  io.to(roomId).emit('roomUpdated', sanitizeRoom(room));
}

function sanitizeRoom(room) {
  return {
    id: room.id,
    name: room.name,
    category: room.category,
    adminPlayerId: room.adminPlayerId,
    players: room.players.map((p) => ({ id: p.id, name: p.name })),
    state: room.state,
    allowJoinDuringGame: isJoinDuringGameAllowed(room),
    currentQuestion:
      room.state === 'playing'
        ? room.questionPool[room.currentQuestionIndex] || null
        : null,
    currentQuestionIndex: room.currentQuestionIndex,
    totalQuestions: room.questionPool.length,
    reactions: room.reactions,
  };
}

io.on('connection', (socket) => {
  // Send room list to newly connected client
  socket.emit('roomList', getRoomList());

  // Create a room
  socket.on('createRoom', ({ roomName, category, playerName }, callback) => {
    if (!roomName || !roomName.trim()) return callback({ error: 'Raumname fehlt.' });
    if (!category || !questions[category]) return callback({ error: 'Ungültige Kategorie.' });
    if (!playerName || !playerName.trim()) return callback({ error: 'Spielername fehlt.' });

    const roomId = uuidv4();
    const playerId = uuidv4();

    rooms[roomId] = {
      id: roomId,
      name: roomName.trim(),
      category,
      adminPlayerId: playerId,
      adminSocketId: socket.id,
      players: [{ id: playerId, name: playerName.trim(), socketId: socket.id }],
      state: 'lobby',
      allowJoinDuringGame: false,
      questionPool: buildQuestionPool(category),
      currentQuestionIndex: 0,
      reactions: {},
    };

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;

    io.emit('roomList', getRoomList());
    callback({ success: true, roomId, playerId, room: sanitizeRoom(rooms[roomId]) });
  });

  // Join a room
  socket.on('joinRoom', ({ roomId, playerName }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (!playerName || !playerName.trim()) return callback({ error: 'Spielername fehlt.' });
    if (room.state === 'finished') return callback({ error: 'Diese Runde ist bereits beendet.' });
    if (room.state === 'playing' && !isJoinDuringGameAllowed(room)) {
      return callback({ error: 'Der Raum ist waehrend der laufenden Runde geschlossen.' });
    }
    if (!['lobby', 'playing'].includes(room.state)) {
      return callback({ error: 'Beitritt aktuell nicht moeglich.' });
    }

    const trimmedName = playerName.trim();
    const nameExists = room.players.some(
      (p) => p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) return callback({ error: 'Dieser Name ist bereits vergeben.' });

    const playerId = uuidv4();
    room.players.push({ id: playerId, name: trimmedName, socketId: socket.id });

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true, roomId, playerId, room: sanitizeRoom(room) });
  });

  // Admin: update room settings (name, category)
  socket.on('updateRoom', ({ roomId, roomName, category, allowJoinDuringGame }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });

    // Join policy can be changed at any time.
    if (typeof allowJoinDuringGame === 'boolean') {
      room.allowJoinDuringGame = allowJoinDuringGame === true;
    }

    // Name/category remain lobby-only to avoid changing active rounds.
    if (room.state !== 'lobby') {
      emitRoomUpdate(roomId);
      io.emit('roomList', getRoomList());
      return callback({ success: true, room: sanitizeRoom(room) });
    }

    if (roomName && roomName.trim()) room.name = roomName.trim();
    if (category && questions[category]) {
      room.category = category;
      room.questionPool = buildQuestionPool(category);
      room.currentQuestionIndex = 0;
    }

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true, room: sanitizeRoom(room) });
  });

  // Admin: kick a player
  socket.on('kickPlayer', ({ roomId, targetPlayerId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });
    if (targetPlayerId === room.adminPlayerId) return callback({ error: 'Admin kann sich nicht selbst kicken.' });

    const playerIndex = room.players.findIndex((p) => p.id === targetPlayerId);
    if (playerIndex === -1) return callback({ error: 'Spieler nicht gefunden.' });

    const [kicked] = room.players.splice(playerIndex, 1);

    // Notify kicked player
    const kickedSocket = io.sockets.sockets.get(kicked.socketId);
    if (kickedSocket) {
      kickedSocket.leave(roomId);
      kickedSocket.data.roomId = null;
      kickedSocket.data.playerId = null;
      kickedSocket.emit('kicked', { roomId, message: 'Du wurdest aus dem Raum gekickt.' });
    }

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true });
  });

  // Admin: delete room
  socket.on('deleteRoom', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });

    io.to(roomId).emit('roomDeleted', { roomId, message: 'Der Raum wurde vom Admin gelöscht.' });

    // Remove all sockets from the room
    room.players.forEach((p) => {
      const s = io.sockets.sockets.get(p.socketId);
      if (s) {
        s.leave(roomId);
        s.data.roomId = null;
        s.data.playerId = null;
      }
    });

    delete rooms[roomId];
    io.emit('roomList', getRoomList());
    callback({ success: true });
  });

  // Admin: change a player's name
  socket.on('changePlayerName', ({ roomId, targetPlayerId, newName }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });
    if (!newName || !newName.trim()) return callback({ error: 'Name fehlt.' });

    const trimmedName = newName.trim();
    const nameExists = room.players.some(
      (p) => p.id !== targetPlayerId && p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) return callback({ error: 'Dieser Name ist bereits vergeben.' });

    const player = room.players.find((p) => p.id === targetPlayerId);
    if (!player) return callback({ error: 'Spieler nicht gefunden.' });

    player.name = trimmedName;
    emitRoomUpdate(roomId);
    callback({ success: true });
  });

  // Player: change own name (only in lobby)
  socket.on('changeOwnName', ({ roomId, newName }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (!['lobby', 'playing'].includes(room.state)) return callback({ error: 'Name kann jetzt nicht geändert werden.' });

    const playerId = socket.data.playerId;
    const player = room.players.find((p) => p.id === playerId);
    if (!player) return callback({ error: 'Spieler nicht gefunden.' });
    if (!newName || !newName.trim()) return callback({ error: 'Name fehlt.' });

    const trimmedName = newName.trim();
    const nameExists = room.players.some(
      (p) => p.id !== playerId && p.name.toLowerCase() === trimmedName.toLowerCase()
    );
    if (nameExists) return callback({ error: 'Dieser Name ist bereits vergeben.' });

    player.name = trimmedName;
    socket.data.playerName = trimmedName;
    emitRoomUpdate(roomId);
    callback({ success: true, newName: trimmedName });
  });

  // Admin: start game
  socket.on('startGame', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });
    if (room.players.length < 1) return callback({ error: 'Mindestens 1 Spieler benötigt.' });
    if (room.state !== 'lobby') return callback({ error: 'Spiel läuft bereits.' });

    room.state = 'playing';
    room.currentQuestionIndex = 0;
    room.reactions = {};

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true });
  });

  // Admin: next question
  socket.on('nextQuestion', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });
    if (room.state !== 'playing') return callback({ error: 'Spiel ist nicht aktiv.' });

    room.currentQuestionIndex += 1;
    room.reactions = {};

    if (room.currentQuestionIndex >= room.questionPool.length) {
      room.state = 'finished';
      emitRoomUpdate(roomId);
      io.emit('roomList', getRoomList());
      return callback({ success: true, finished: true });
    }

    emitRoomUpdate(roomId);
    callback({ success: true, finished: false });
  });

  // Player: react to current question
  socket.on('react', ({ roomId, reaction }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.state !== 'playing') return callback({ error: 'Spiel ist nicht aktiv.' });

    const playerId = socket.data.playerId;
    if (!playerId) return callback({ error: 'Nicht in diesem Raum.' });
    if (!['done', 'notDone'].includes(reaction)) return callback({ error: 'Ungültige Reaktion.' });

    room.reactions[playerId] = reaction;
    emitRoomUpdate(roomId);
    callback({ success: true });
  });

  // Admin: end game / back to lobby
  socket.on('endGame', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    if (room.adminSocketId !== socket.id) return callback({ error: 'Keine Berechtigung.' });

    room.state = 'lobby';
    room.questionPool = buildQuestionPool(room.category);
    room.currentQuestionIndex = 0;
    room.reactions = {};

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true });
  });

  // Get current room state
  socket.on('getRoomState', ({ roomId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });
    callback({ success: true, room: sanitizeRoom(room) });
  });

  // Player/Admin: leave room manually
  socket.on('leaveRoom', ({ roomId }, callback) => {
    const actualRoomId = roomId || socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!actualRoomId || !playerId) return callback({ error: 'Du bist in keinem Raum.' });

    const room = rooms[actualRoomId];
    if (!room) {
      socket.data.roomId = null;
      socket.data.playerId = null;
      return callback({ success: true, alreadyClosed: true });
    }

    // Admin leaves: close room for everyone.
    if (room.adminPlayerId === playerId) {
      room.players.forEach((p) => {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) {
          if (s.id !== socket.id) {
            s.emit('roomDeleted', {
              roomId: actualRoomId,
              message: 'Der Admin hat den Raum verlassen. Raum wurde geschlossen.',
            });
          }
          s.leave(actualRoomId);
          s.data.roomId = null;
          s.data.playerId = null;
        }
      });

      delete rooms[actualRoomId];
      io.emit('roomList', getRoomList());
      return callback({ success: true, roomClosed: true });
    }

    // Regular player leaves the room.
    room.players = room.players.filter((p) => p.id !== playerId);
    if (room.reactions && room.reactions[playerId]) {
      delete room.reactions[playerId];
    }

    socket.leave(actualRoomId);
    socket.data.roomId = null;
    socket.data.playerId = null;

    emitRoomUpdate(actualRoomId);
    io.emit('roomList', getRoomList());
    callback({ success: true });
  });

  // Rejoin room after page reload / temporary disconnect
  socket.on('rejoinRoom', ({ roomId, playerId }, callback) => {
    const room = rooms[roomId];
    if (!room) return callback({ error: 'Raum nicht gefunden.' });

    const player = room.players.find((p) => p.id === playerId);
    if (!player) return callback({ error: 'Spieler nicht mehr im Raum.' });

    // Cancel pending disconnect timer if any
    if (room.disconnectTimers && room.disconnectTimers[playerId]) {
      clearTimeout(room.disconnectTimers[playerId]);
      delete room.disconnectTimers[playerId];
    }

    // Update socket references
    player.socketId = socket.id;
    if (room.adminPlayerId === playerId) {
      room.adminSocketId = socket.id;
    }

    socket.join(roomId);
    socket.data.roomId = roomId;
    socket.data.playerId = playerId;

    emitRoomUpdate(roomId);
    io.emit('roomList', getRoomList());
    callback({ success: true, room: sanitizeRoom(room) });
  });

  // Handle disconnect – grace period of 10 s to allow page reloads / reconnects
  socket.on('disconnect', () => {
    const roomId = socket.data.roomId;
    const playerId = socket.data.playerId;
    if (!roomId || !playerId) return;

    const room = rooms[roomId];
    if (!room) return;

    // If the player already rejoined with a new socket (page reload), skip.
    const player = room.players.find((p) => p.id === playerId);
    if (player && player.socketId !== socket.id) return;

    if (!room.disconnectTimers) room.disconnectTimers = {};

    room.disconnectTimers[playerId] = setTimeout(() => {
      const r = rooms[roomId];
      if (!r) return; // room was already deleted

      delete r.disconnectTimers[playerId];

      if (r.adminPlayerId === playerId) {
        io.to(roomId).emit('roomDeleted', {
          roomId,
          message: 'Der Admin hat die Verbindung verloren. Raum wurde geschlossen.',
        });
        r.players.forEach((p) => {
          const s = io.sockets.sockets.get(p.socketId);
          if (s) {
            s.leave(roomId);
            s.data.roomId = null;
            s.data.playerId = null;
          }
        });
        delete rooms[roomId];
      } else {
        r.players = r.players.filter((p) => p.id !== playerId);
        if (r.reactions && r.reactions[playerId]) {
          delete r.reactions[playerId];
        }
        emitRoomUpdate(roomId);
      }

      io.emit('roomList', getRoomList());
    }, 10000);
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
});
