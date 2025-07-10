const express = require("express");
const http = require("http");
const socketIo = require("socket.io");
const path = require("path");
const setupSocketHandlers = require("./src/handlers/socketHandlers");

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"],
  },
});

// 정적 파일 제공
app.use(express.static(path.join(__dirname, "public")));

// 루트 경로
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public", "index.html"));
});

// 게임 상태 관리
const rooms = new Map();
const playerRooms = new Map();

// 소켓 핸들러 설정
setupSocketHandlers(io, rooms, playerRooms);

const PORT = process.env.PORT || 3000;
server.listen(PORT, "0.0.0.0", () => {
  console.log(`서버가 포트 ${PORT}에서 실행 중입니다.`);
  console.log(`로컬 네트워크: http://10.96.11.56:${PORT}`);
});
