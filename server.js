const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname));

const messagesFile = path.join(__dirname, "messages.json");
const usersFile = path.join(__dirname, "users.json");
const securityLogFile = path.join(__dirname, "security.log");

function loadData(file, defaultValue = []) {
  if(fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,"utf8"));
  fs.writeFileSync(file, JSON.stringify(defaultValue,null,2));
  return defaultValue;
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data,null,2), "utf8");
}

function logSecurity(message) {
  const time = new Date().toISOString();
  fs.appendFile(securityLogFile, `[${time}] ${message}\n`, err => { if(err) console.error(err); });
}

let messages = loadData(messagesFile);
let users = loadData(usersFile);
let activeUsers = new Set();

let videoRoom = []; // видеочат

io.on("connection", (socket) => {
  console.log("🔗 Новый пользователь подключился");

  // Регистрация
  socket.on("register", ({ username, password }) => {
    if(!username || !password) return socket.emit("registerError", "Введите имя и пароль");
    if(users.find(u => u.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("registerError", "Имя уже занято");

    const isFirstUser = users.length === 0;
    users.push({ username, password, admin: isFirstUser });
    saveData(usersFile, users);
    socket.emit("registerSuccess","✅ Регистрация успешна! Теперь войдите.");
  });

  // Вход
  socket.on("login", ({ username, password }) => {
    const user = users.find(u => u.username === username && u.password === password);
    if(!user) return socket.emit("loginError","Неверное имя или пароль");

    if(activeUsers.has(username)) {
      socket.emit("loginError","Этот пользователь уже онлайн!");
      logSecurity(`Попытка входа: ${username} — аккаунт уже используется`);
      return;
    }

    socket.username = username;
    socket.admin = !!user.admin;
    activeUsers.add(username);

    socket.emit("loginSuccess",{ username, admin: user.admin, messages });
    logSecurity(`${username} вошёл на сервер`);
  });

  // Сообщения
  socket.on("chat message", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time };
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat message", message);
  });

  // Изображения
  socket.on("chat image", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time };
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat image", message);
  });

  // ====== ВИДЕОЧАТ ======

  socket.on("join-video-room", () => {
    videoRoom.push(socket);

    if (videoRoom.length === 1) {
      socket.emit("waiting");
    }
    if (videoRoom.length === 2) {
      videoRoom[0].emit("ready");
      videoRoom[1].emit("ready");
    }
    if (videoRoom.length > 2) {
      socket.emit("waiting");
    }
  });

  socket.on("offer", data => socket.broadcast.emit("offer", data));
  socket.on("answer", data => socket.broadcast.emit("answer", data));
  socket.on("ice", data => socket.broadcast.emit("ice", data));

  // Выход
  socket.on("disconnect", () => {
    activeUsers.delete(socket.username);
    videoRoom = videoRoom.filter(s => s !== socket);
    console.log(`❌ ${socket.username} вышел`);
  });
});

server.listen(3000, () => console.log("🚀 Сервер запущен")); 
