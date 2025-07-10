const GameRoom = require("../models/GameRoom");

// 방 코드 생성 함수
function generateRoomCode() {
  const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

function setupSocketHandlers(io, rooms, playerRooms) {
  io.on("connection", (socket) => {
    console.log("플레이어 연결:", socket.id);

    // 방 생성
    socket.on("createRoom", (data) => {
      const { playerName } = data;
      let roomCode;

      do {
        roomCode = generateRoomCode();
      } while (rooms.has(roomCode));

      const room = new GameRoom(roomCode, roomCode, playerName);
      rooms.set(roomCode, room);

      const success = room.addPlayer(socket, playerName);
      if (success) {
        playerRooms.set(socket.id, roomCode);
        socket.emit("roomCreated", {
          roomCode: roomCode,
          hostName: playerName,
        });
        socket.emit("waitingForPlayers", {
          current: room.players.size,
          max: room.maxPlayers,
        });
      } else {
        socket.emit("roomCreateFailed", "방 생성에 실패했습니다.");
      }
    });

    // 방 참가
    socket.on("joinRoom", (data) => {
      const { roomCode, playerName } = data;
      const room = rooms.get(roomCode);

      if (!room) {
        socket.emit("joinFailed", "존재하지 않는 방입니다.");
        return;
      }

      if (room.gameStarted) {
        socket.emit("joinFailed", "이미 게임이 시작된 방입니다.");
        return;
      }

      const existingPlayer = Array.from(room.players.values()).find(
        (p) => p.name === playerName
      );
      if (existingPlayer) {
        socket.emit("joinFailed", "이미 사용 중인 이름입니다.");
        return;
      }

      const success = room.addPlayer(socket, playerName);
      if (success) {
        playerRooms.set(socket.id, roomCode);
        socket.emit("joinSuccess", {
          roomCode: roomCode,
          hostName: room.hostName,
        });
        socket.emit("waitingForPlayers", {
          current: room.players.size,
          max: room.maxPlayers,
        });
      } else {
        socket.emit("joinFailed", "방이 가득 찼습니다.");
      }
    });

    // 방 목록 조회
    socket.on("getRoomList", () => {
      const availableRooms = Array.from(rooms.values())
        .filter(
          (room) => !room.gameStarted && room.players.size < room.maxPlayers
        )
        .map((room) => ({
          roomCode: room.roomCode,
          hostName: room.hostName,
          playerCount: room.players.size,
          maxPlayers: room.maxPlayers,
        }));

      socket.emit("roomList", availableRooms);
    });

    // 게임 액션 핸들러들
    const gameActions = [
      { event: "nominate", handler: "handleNomination" },
      { event: "vote", handler: "handleVote" },
      { event: "selectCard", handler: "handleCardSelection" },
      { event: "kill", handler: "handleKill" },
      { event: "guessGod", handler: "handleGodGuess" },
    ];

    gameActions.forEach(({ event, handler }) => {
      socket.on(event, (data) => {
        const roomId = playerRooms.get(socket.id);
        const room = rooms.get(roomId);
        if (room && room[handler]) {
          room[handler](socket.id, data);
        }
      });
    });

    // 채팅 메시지
    socket.on("chatMessage", (message) => {
      const roomId = playerRooms.get(socket.id);
      const room = rooms.get(roomId);
      if (room) {
        const player = room.players.get(socket.id);
        if (player) {
          room.broadcast("chatMessage", {
            playerName: player.name,
            message: message,
            timestamp: Date.now(),
          });
        }
      }
    });

    // 연결 해제
    socket.on("disconnect", () => {
      console.log("플레이어 연결 해제:", socket.id);
      const roomId = playerRooms.get(socket.id);
      const room = rooms.get(roomId);
      if (room) {
        room.removePlayer(socket.id);
        if (room.players.size === 0) {
          rooms.delete(roomId);
        }
      }
      playerRooms.delete(socket.id);
    });
  });
}

module.exports = setupSocketHandlers;
