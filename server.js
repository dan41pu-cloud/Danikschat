const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",          // разрешаем любые источники (включая WebView)
    methods: ["GET","POST"]
  }
});

// ---- ОТДАЁМ ПАПКУ PUBLIC ----
app.use(express.static(path.join(__dirname, "public")));

const messagesFile = path.join(__dirname, "messages.json");
const usersFile = path.join(__dirname, "users.json");
const securityLogFile = path.join(__dirname, "security.log");

function loadData(file, defaultValue = []) {
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
  return defaultValue;
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function logSecurity(message) {
  const time = new Date().toISOString();
  fs.appendFile(securityLogFile, `[${time}] ${message}\n`, (err) => {
    if (err) console.error(err);
  });
}

let messages = loadData(messagesFile);
let users = loadData(usersFile);
let activeUsers = new Set();

// ----------------------  WebRTC  1-на-1  ----------------------

let videoRoom = [];

io.on("connection", (socket) => {
  console.log("🔗 Новый пользователь");

  socket.on("video-join", () => {
    videoRoom.push(socket);

    console.log("Комната:", videoRoom.length);

    if (videoRoom.length === 1) {
      socket.emit("video-wait");
    }

    if (videoRoom.length === 2) {
      videoRoom[0].emit("video-ready");
      videoRoom[1].emit("video-ready");
    }

    if (videoRoom.length > 2) {
      socket.emit("video-full");
      videoRoom = videoRoom.filter(s => s !== socket);
    }
  });

  socket.on("video-offer", (offer) => {
    videoRoom.forEach(s => {
      if (s !== socket) s.emit("video-offer", offer);
    });
  });

  socket.on("video-answer", (answer) => {
    videoRoom.forEach(s => {
      if (s !== socket) s.emit("video-answer", answer);
    });
  });

  socket.on("video-candidate", (candidate) => {
    videoRoom.forEach(s => {
      if (s !== socket) s.emit("video-candidate", candidate);
    });
  });

  socket.on("disconnect", () => {
    videoRoom = videoRoom.filter(s => s !== socket);
  });

  // ---------------------- ЧАТ ----------------------

  socket.on("register", ({ username, password }) => {
    if (!username || !password)
      return socket.emit("registerError", "Введите имя и пароль");

    if (users.find((u) => u.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("registerError", "Имя уже занято");

    const isFirstUser = users.length === 0;

    users.push({ username, password, admin: isFirstUser });
    saveData(usersFile, users);

    socket.emit("registerSuccess", "Регистрация успешна! Теперь войдите.");
  });

  socket.on("login", ({ username, password }) => {
    const user = users.find((u) => u.username === username && u.password === password);

    if (!user) return socket.emit("loginError", "Неверное имя или пароль");

    if (activeUsers.has(username)) {
      socket.emit("loginError", "Этот пользователь уже онлайн!");
      return;
    }

    socket.username = username;
    socket.admin = !!user.admin;
    activeUsers.add(username);

    socket.emit("loginSuccess", {
      username,
      admin: user.admin,
      messages,
    });
  });

  socket.on("chat message", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time };
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat message", message);
  });

  socket.on("chat image", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time };
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat image", message);
  });

  socket.on("clear-messages", () => {
    if (!socket.admin) return;
    messages = [];
    saveData(messagesFile, messages);
    io.emit("chat-cleared");
  });

  socket.on("disconnect", () => {
    if (socket.username) activeUsers.delete(socket.username);
  });
});

server.listen(3000, () => {
  console.log("🚀 Сервер запущен: http://localhost:3000");
});
    
