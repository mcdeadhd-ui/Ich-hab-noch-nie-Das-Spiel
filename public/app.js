/* ============================================================
   Ich hab noch nie – Frontend App
   ============================================================ */

function detectSocketServerUrl() {
  const url = new URL(window.location.href);

  // Codespaces pattern, e.g. ...-5500.app.github.dev -> ...-3000.app.github.dev
  const csMatch = url.hostname.match(/-(\d+)\.app\.github\.dev$/);
  if (csMatch && csMatch[1] !== '3000') {
    return `${url.protocol}//${url.hostname.replace(/-\d+\.app\.github\.dev$/, '-3000.app.github.dev')}`;
  }

  // Local dev fallback when UI is served from a non-backend port.
  if ((url.hostname === 'localhost' || url.hostname === '127.0.0.1') && url.port && url.port !== '3000') {
    return `${url.protocol}//${url.hostname}:3000`;
  }

  return url.origin;
}

const socket = typeof io === 'function'
  ? io(detectSocketServerUrl())
  : {
    on() {},
    emit(eventName, payload, callback) {
      if (typeof callback === 'function') {
        callback({ error: 'Keine Serververbindung. Bitte Seite neu laden.' });
      }
    },
  };

// ── State ───────────────────────────────────────────────────
const state = {
  roomId: null,
  playerId: null,
  isAdmin: false,
  room: null,
};

// ── Screens ─────────────────────────────────────────────────
const screens = {
  landing: document.getElementById('screen-landing'),
  lobby: document.getElementById('screen-lobby'),
  game: document.getElementById('screen-game'),
  finished: document.getElementById('screen-finished'),
};

function showScreen(name) {
  Object.values(screens).forEach((s) => s.classList.remove('active'));
  screens[name].classList.add('active');
  window.scrollTo(0, 0);
}

// ── Toast ────────────────────────────────────────────────────
let toastTimer = null;
function showToast(message, type = 'info') {
  const toast = document.getElementById('toast');
  toast.textContent = message;
  toast.className = `toast toast-${type}`;
  toast.classList.remove('hidden');
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add('hidden'), 3200);
}

// ── Category label helper ────────────────────────────────────
function categoryLabel(cat) {
  return cat === 'under12' ? '👶 Bis 12 Jahre'
    : cat === 'under16' ? '🧒 Bis 16 Jahre'
    : '🔞 Ab 18 Jahre';
}

function joinPolicyLabel(room) {
  return room.allowJoinDuringGame
    ? 'Das Beitreten ist waehrend einer bereits laufenden Runde erlaubt.'
    : 'Das Beitreten ist waehrend einer bereits laufenden Runde geschlossen.';
}

// ── Room List (Landing) ──────────────────────────────────────
socket.on('roomList', (rooms) => {
  renderRoomList(rooms);
});

function renderRoomList(rooms) {
  const container = document.getElementById('room-list');
  if (!rooms || rooms.length === 0) {
    container.innerHTML = '<p class="empty-hint">Keine Räume vorhanden. Erstelle einen neuen Raum!</p>';
    return;
  }
  container.innerHTML = rooms.map((r) => {
    const stateLabel = r.state === 'lobby' ? 'Wartezimmer' : r.state === 'playing' ? 'Läuft' : 'Beendet';
    const stateClass = r.state === 'playing' ? 'tag-playing' : 'tag-state';
    const joinDisabled = !r.canJoin ? 'disabled' : '';
    const joinLabel = r.state === 'playing' ? '⚡ Nachjoinen' : '🎮 Beitreten';
    const joinHintTag = r.state === 'playing'
      ? `<span class="room-tag ${r.allowJoinDuringGame ? 'tag-open' : 'tag-closed'}">${r.allowJoinDuringGame ? 'Offen' : 'Geschlossen'}</span>`
      : '';
    return `
      <div class="room-card">
        <h3>${escHtml(r.name)}</h3>
        <div class="room-meta">
          <span class="room-tag tag-category">${categoryLabel(r.category)}</span>
          <span class="room-tag tag-players">👥 ${r.playerCount} Spieler</span>
          <span class="room-tag ${stateClass}">${stateLabel}</span>
          ${joinHintTag}
        </div>
        <button class="btn btn-primary join-btn"
          data-room-id="${escHtml(r.id)}"
          data-room-name="${escHtml(r.name)}"
          ${joinDisabled}>
          ${joinLabel}
        </button>
      </div>`;
  }).join('');
}

// Event delegation for join buttons in room list
document.getElementById('room-list').addEventListener('click', (e) => {
  const btn = e.target.closest('.join-btn');
  if (btn && !btn.disabled) {
    openJoinModal(btn.dataset.roomId, btn.dataset.roomName);
  }
});

// ── Create Room ──────────────────────────────────────────────
document.getElementById('btn-create-room').addEventListener('click', () => {
  document.getElementById('modal-create-room').classList.remove('hidden');
  document.getElementById('create-room-name').focus();
});

document.getElementById('btn-create-room-cancel').addEventListener('click', () => {
  document.getElementById('modal-create-room').classList.add('hidden');
  clearError('create-room-error');
});

document.getElementById('btn-create-room-confirm').addEventListener('click', createRoom);
document.getElementById('create-player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') createRoom();
});

function createRoom() {
  const roomName = document.getElementById('create-room-name').value.trim();
  const category = document.getElementById('create-category').value;
  const playerName = document.getElementById('create-player-name').value.trim();

  if (!roomName) return setError('create-room-error', 'Bitte einen Raumnamen eingeben.');
  if (!playerName) return setError('create-room-error', 'Bitte einen Spielernamen eingeben.');

  socket.emit('createRoom', { roomName, category, playerName }, (res) => {
    if (res.error) return setError('create-room-error', res.error);
    document.getElementById('modal-create-room').classList.add('hidden');
    document.getElementById('create-room-name').value = '';
    document.getElementById('create-player-name').value = '';
    clearError('create-room-error');

    state.roomId = res.roomId;
    state.playerId = res.playerId;
    state.isAdmin = true;
    state.room = res.room;
    enterLobby(res.room);
  });
}

// ── Join Room ─────────────────────────────────────────────────
let pendingJoinRoomId = null;

function openJoinModal(roomId, roomName) {
  pendingJoinRoomId = roomId;
  document.getElementById('join-room-title').textContent = `Raum: ${roomName}`;
  document.getElementById('modal-join-room').classList.remove('hidden');
  document.getElementById('join-player-name').focus();
  clearError('join-room-error');
}

document.getElementById('btn-join-room-cancel').addEventListener('click', () => {
  document.getElementById('modal-join-room').classList.add('hidden');
  pendingJoinRoomId = null;
  clearError('join-room-error');
});

document.getElementById('btn-join-room-confirm').addEventListener('click', joinRoom);
document.getElementById('join-player-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') joinRoom();
});

function joinRoom() {
  const playerName = document.getElementById('join-player-name').value.trim();
  if (!playerName) return setError('join-room-error', 'Bitte einen Namen eingeben.');

  socket.emit('joinRoom', { roomId: pendingJoinRoomId, playerName }, (res) => {
    if (res.error) return setError('join-room-error', res.error);
    document.getElementById('modal-join-room').classList.add('hidden');
    document.getElementById('join-player-name').value = '';
    clearError('join-room-error');

    state.roomId = res.roomId;
    state.playerId = res.playerId;
    state.isAdmin = res.room.adminPlayerId === res.playerId;
    state.room = res.room;
    if (res.room.state === 'playing') {
      renderGame(res.room);
      showScreen('game');
      return;
    }
    if (res.room.state === 'finished') {
      renderFinished();
      showScreen('finished');
      return;
    }
    enterLobby(res.room);
  });
}

// ── Lobby ─────────────────────────────────────────────────────
function enterLobby(room) {
  state.room = room;
  state.isAdmin = room.adminPlayerId === state.playerId;
  renderLobby(room);
  showScreen('lobby');
}

function renderLobby(room) {
  document.getElementById('lobby-room-name').textContent = room.name;
  document.getElementById('lobby-badge').textContent = categoryLabel(room.category);
  document.getElementById('lobby-join-policy').textContent = joinPolicyLabel(room);
  document.getElementById('lobby-player-count').textContent = room.players.length;

  // Player list
  const list = document.getElementById('lobby-player-list');
  list.innerHTML = room.players.map((p) => {
    const isAdmin = p.id === room.adminPlayerId;
    const isYou = p.id === state.playerId;
    let cls = 'player-name';
    if (isAdmin && isYou) cls += ' is-admin is-you';
    else if (isAdmin) cls += ' is-admin';
    else if (isYou) cls += ' is-you';
    return `<li class="player-item"><span class="${cls}">${escHtml(p.name)}</span></li>`;
  }).join('');

  // Own name input prefill
  const me = room.players.find((p) => p.id === state.playerId);
  if (me) document.getElementById('input-own-name').value = me.name;

  // Admin panel
  const adminPanel = document.getElementById('admin-panel');
  if (state.isAdmin) {
    adminPanel.classList.remove('hidden');
    document.getElementById('admin-room-name').value = room.name;
    document.getElementById('admin-category').value = room.category;
    document.getElementById('admin-allow-join-during-game').checked = !!room.allowJoinDuringGame;
    renderAdminPlayerList(room);
  } else {
    adminPanel.classList.add('hidden');
  }
}

function renderAdminPlayerList(room) {
  const list = document.getElementById('admin-player-list');
  list.innerHTML = room.players.map((p) => {
    const isAdmin = p.id === room.adminPlayerId;
    const adminBadge = isAdmin ? ' 👑' : '';
    const actions = isAdmin ? '' : `
      <button class="btn btn-icon btn-secondary rename-player-btn"
        data-player-id="${escHtml(p.id)}"
        data-player-name="${escHtml(p.name)}">✏️</button>
      <button class="btn btn-icon btn-danger kick-player-btn"
        data-player-id="${escHtml(p.id)}"
        data-player-name="${escHtml(p.name)}">🚫</button>`;
    return `<li class="player-item">
      <span class="player-name">${escHtml(p.name)}${adminBadge}</span>
      ${actions}
    </li>`;
  }).join('');
}

// Event delegation for admin player list actions
document.getElementById('admin-player-list').addEventListener('click', (e) => {
  const renameBtn = e.target.closest('.rename-player-btn');
  const kickBtn = e.target.closest('.kick-player-btn');
  if (renameBtn) {
    openChangeNameModal(renameBtn.dataset.playerId, renameBtn.dataset.playerName);
  } else if (kickBtn) {
    kickPlayer(kickBtn.dataset.playerId, kickBtn.dataset.playerName);
  }
});

// Own name change
document.getElementById('btn-change-own-name').addEventListener('click', changeOwnName);
document.getElementById('input-own-name').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') changeOwnName();
});

function changeOwnName() {
  const newName = document.getElementById('input-own-name').value.trim();
  if (!newName) return setError('own-name-error', 'Name darf nicht leer sein.');
  socket.emit('changeOwnName', { roomId: state.roomId, newName }, (res) => {
    if (res.error) return setError('own-name-error', res.error);
    clearError('own-name-error');
    showToast('Name geändert!', 'success');
  });
}

// Admin: update room
document.getElementById('btn-update-room').addEventListener('click', () => {
  const roomName = document.getElementById('admin-room-name').value.trim();
  const category = document.getElementById('admin-category').value;
  const allowJoinDuringGame = document.getElementById('admin-allow-join-during-game').checked;
  socket.emit('updateRoom', { roomId: state.roomId, roomName, category, allowJoinDuringGame }, (res) => {
    if (res.error) {
      setError('update-room-error', res.error);
      showToast(res.error, 'error');
      return;
    }
    clearError('update-room-error');
    if (res.room) {
      state.room = res.room;
      renderLobby(res.room);
    }
    showToast('Einstellung gespeichert: Beitritt waehrend laufender Runde aktualisiert.', 'success');
  });
});

function leaveRoom() {
  if (!state.roomId) {
    resetState();
    showScreen('landing');
    return;
  }

  const confirmText = state.isAdmin
    ? 'Als Admin schliesst du den Raum fuer alle. Wirklich verlassen?'
    : 'Raum wirklich verlassen?';

  if (!confirm(confirmText)) return;

  const wasAdmin = state.isAdmin;

  socket.emit('leaveRoom', { roomId: state.roomId }, (res) => {
    if (res && res.error) {
      showToast(res.error, 'error');
      return;
    }
    resetState();
    showScreen('landing');
    showToast(wasAdmin ? 'Raum wurde geschlossen.' : 'Du hast den Raum verlassen.', 'success');
  });
}

document.getElementById('btn-leave-room-lobby').addEventListener('click', leaveRoom);
document.getElementById('btn-leave-room-game').addEventListener('click', leaveRoom);
document.getElementById('btn-leave-room-finished').addEventListener('click', leaveRoom);

// Admin: delete room
document.getElementById('btn-delete-room').addEventListener('click', () => {
  if (!confirm('Raum wirklich löschen? Alle Spieler werden rausgeworfen.')) return;
  socket.emit('deleteRoom', { roomId: state.roomId }, (res) => {
    if (res.error) return showToast(res.error, 'error');
    resetState();
    showScreen('landing');
  });
});

// Admin: start game
document.getElementById('btn-start-game').addEventListener('click', () => {
  socket.emit('startGame', { roomId: state.roomId }, (res) => {
    if (res.error) return setError('start-game-error', res.error);
    clearError('start-game-error');
  });
});

// ── Admin: Kick & Rename Player ───────────────────────────────
function kickPlayer(targetPlayerId, playerName) {
  if (!confirm(`${playerName} wirklich kicken?`)) return;
  socket.emit('kickPlayer', { roomId: state.roomId, targetPlayerId }, (res) => {
    if (res.error) return setError('admin-player-error', res.error);
    clearError('admin-player-error');
    showToast(`${playerName} wurde gekickt.`, 'success');
  });
}

// Change player name modal
let pendingRenamePlayerId = null;

function openChangeNameModal(targetPlayerId, currentName) {
  pendingRenamePlayerId = targetPlayerId;
  document.getElementById('change-name-player-label').textContent = `Aktueller Name: ${currentName}`;
  document.getElementById('change-name-input').value = currentName;
  document.getElementById('modal-change-name').classList.remove('hidden');
  document.getElementById('change-name-input').focus();
  clearError('change-name-error');
}

document.getElementById('btn-change-name-cancel').addEventListener('click', () => {
  document.getElementById('modal-change-name').classList.add('hidden');
  pendingRenamePlayerId = null;
  clearError('change-name-error');
});

document.getElementById('btn-change-name-confirm').addEventListener('click', confirmChangeName);
document.getElementById('change-name-input').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') confirmChangeName();
});

function confirmChangeName() {
  const newName = document.getElementById('change-name-input').value.trim();
  if (!newName) return setError('change-name-error', 'Name darf nicht leer sein.');
  socket.emit('changePlayerName', { roomId: state.roomId, targetPlayerId: pendingRenamePlayerId, newName }, (res) => {
    if (res.error) return setError('change-name-error', res.error);
    document.getElementById('modal-change-name').classList.add('hidden');
    pendingRenamePlayerId = null;
    clearError('change-name-error');
    showToast('Name geändert!', 'success');
  });
}

// ── Real-time Events ──────────────────────────────────────────
socket.on('roomUpdated', (room) => {
  state.room = room;

  if (room.state === 'lobby') {
    renderLobby(room);
    if (screens.lobby.classList.contains('active')) return;
    if (screens.game.classList.contains('active') || screens.finished.classList.contains('active')) {
      enterLobby(room);
    }
  } else if (room.state === 'playing') {
    renderGame(room);
    showScreen('game');
  } else if (room.state === 'finished') {
    renderFinished();
    showScreen('finished');
  }
});

socket.on('kicked', ({ message }) => {
  showToast(message, 'error');
  resetState();
  showScreen('landing');
});

socket.on('roomDeleted', ({ message }) => {
  showToast(message, 'error');
  resetState();
  showScreen('landing');
});

// ── Game Screen ───────────────────────────────────────────────
function renderGame(room) {
  state.room = room;
  state.isAdmin = room.adminPlayerId === state.playerId;

  document.getElementById('game-room-name').textContent = room.name;
  document.getElementById('game-badge').textContent = categoryLabel(room.category);
  document.getElementById('game-join-policy').textContent = joinPolicyLabel(room);

  const idx = room.currentQuestionIndex;
  const total = room.totalQuestions;
  const question = room.currentQuestion;

  document.getElementById('question-counter').textContent = `Frage ${idx + 1} / ${total}`;
  document.getElementById('question-text').textContent = question || 'Keine Frage verfügbar.';

  // Show/hide reaction buttons based on whether we already reacted
  const myReaction = room.reactions && room.reactions[state.playerId];
  const btnDone = document.getElementById('btn-done');
  const btnNotDone = document.getElementById('btn-not-done');
  const hint = document.getElementById('reaction-hint');

  btnDone.classList.remove('selected');
  btnNotDone.classList.remove('selected');

  if (myReaction) {
    btnDone.disabled = true;
    btnNotDone.disabled = true;
    hint.textContent = 'Du hast bereits abgestimmt!';
    if (myReaction === 'done') btnDone.classList.add('selected');
    else btnNotDone.classList.add('selected');
  } else {
    btnDone.disabled = false;
    btnNotDone.disabled = false;
    hint.textContent = '';
  }

  // Reactions overview
  const reactionsList = document.getElementById('reactions-list');
  reactionsList.innerHTML = room.players.map((p) => {
    const r = room.reactions && room.reactions[p.id];
    let icon = '<span class="reaction-icon-pending">⏳</span>';
    let label = 'Ausstehend';
    if (r === 'done') { icon = '<span class="reaction-icon-done">✅</span>'; label = 'Hat es gemacht!'; }
    if (r === 'notDone') { icon = '<span class="reaction-icon-not">❌</span>'; label = 'Noch nie!'; }
    return `<li class="reaction-item">${icon}<span class="r-name">${escHtml(p.name)}</span><span style="color:var(--text-muted);font-size:0.85rem">${label}</span></li>`;
  }).join('');

  // Admin controls
  const adminControls = document.getElementById('admin-game-controls');
  if (state.isAdmin) adminControls.classList.remove('hidden');
  else adminControls.classList.add('hidden');
}

// Reaction buttons
document.getElementById('btn-done').addEventListener('click', () => {
  sendReaction('done');
});
document.getElementById('btn-not-done').addEventListener('click', () => {
  sendReaction('notDone');
});

function sendReaction(reaction) {
  socket.emit('react', { roomId: state.roomId, reaction }, (res) => {
    if (res.error) showToast(res.error, 'error');
  });
}

// Admin: next question
document.getElementById('btn-next-question').addEventListener('click', () => {
  socket.emit('nextQuestion', { roomId: state.roomId }, (res) => {
    if (res.error) showToast(res.error, 'error');
  });
});

// Admin: end game
document.getElementById('btn-end-game').addEventListener('click', () => {
  if (!confirm('Spiel wirklich beenden?')) return;
  socket.emit('endGame', { roomId: state.roomId }, (res) => {
    if (res.error) showToast(res.error, 'error');
  });
});

// ── Finished Screen ───────────────────────────────────────────
function renderFinished() {
  const adminControls = document.getElementById('admin-finished-controls');
  const playerHint = document.getElementById('player-finished-hint');

  if (state.isAdmin) {
    adminControls.classList.remove('hidden');
    playerHint.classList.add('hidden');
  } else {
    adminControls.classList.add('hidden');
    playerHint.classList.remove('hidden');
  }
}

document.getElementById('btn-play-again').addEventListener('click', () => {
  socket.emit('endGame', { roomId: state.roomId }, (res) => {
    if (res.error) showToast(res.error, 'error');
  });
});

document.getElementById('btn-back-to-lobby-finished').addEventListener('click', () => {
  socket.emit('endGame', { roomId: state.roomId }, (res) => {
    if (res.error) showToast(res.error, 'error');
  });
});

// ── Close modals on overlay click ─────────────────────────────
document.querySelectorAll('.modal-overlay').forEach((overlay) => {
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) {
      overlay.classList.add('hidden');
    }
  });
});

// ── Helpers ──────────────────────────────────────────────────
function setError(id, msg) {
  document.getElementById(id).textContent = msg;
}

function clearError(id) {
  document.getElementById(id).textContent = '';
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function resetState() {
  state.roomId = null;
  state.playerId = null;
  state.isAdmin = false;
  state.room = null;
}

// ── Init ─────────────────────────────────────────────────────
showScreen('landing');
