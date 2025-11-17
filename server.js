const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: "*", methods: ["GET","POST"] }
});

app.use(express.static(__dirname));

const messagesFile = path.join(__dirname, "messages.json");
const usersFile = path.join(__dirname, "users.json");
const securityLogFile = path.join(__dirname, "security.log");

function loadData(file, def = []) {
  if(fs.existsSync(file)) return JSON.parse(fs.readFileSync(file,"utf8"));
  fs.writeFileSync(file, JSON.stringify(def,null,2));
  return def;
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data,null,2));
}

function logSecurity(message) {
  fs.appendFile(securityLogFile, `[${new Date().toISOString()}] ${message}\n`, () => {});
}

let messages = loadData(messagesFile);
let users = loadData(usersFile);
let activeUsers = new Set();

// Видеокомната (только 2 пользователя)
let videoRoomUsers = [];

io.on("connection", (socket) => {
  console.log("🔗 Новый пользователь");

  // ------------------ РЕГИСТРАЦИЯ ------------------
  socket.on("register", ({ username, password }) => {
    if(!username || !password)
      return socket.emit("registerError", "Введите имя и пароль");

    if(users.some(u => u.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("registerError", "Имя занято");

    const isFirst = users.length === 0;

    users.push({ username, password, admin: isFirst });
    saveData(usersFile, users);

    socket.emit("registerSuccess", "Успешно! Теперь войдите.");
  });

  // ------------------ ВХОД ------------------
  socket.on("login", ({ username, password }) => {
    const user = users.find(u => u.username === username && u.password === password);
    if(!user) return socket.emit("loginError", "Неверные данные");

    if(activeUsers.has(username)) {
      socket.emit("loginError", "Этот пользователь уже онлайн");
      logSecurity(`Попытка входа ${username}: аккаунт уже активен`);
      return;
    }

    socket.username = username;
    socket.admin = !!user.admin;
    activeUsers.add(username);

    socket.emit("loginSuccess", { username, admin: user.admin, messages });

    logSecurity(`${username} вошёл`);
  });

  // ------------------ СООБЩЕНИЯ ------------------
  socket.on("chat message", msg => {
    const time = new Date().toLocaleTimeString();
    const m = { ...msg, time };
    messages.push(m);
    saveData(messagesFile, messages);
    io.emit("chat message", m);
  });

  // ------------------ ИЗОБРАЖЕНИЯ ------------------
  socket.on("chat image", msg => {
    const time = new Date().toLocaleTimeString();
    const m = { ...msg, time };
    messages.push(m);
    saveData(messagesFile, messages);
    io.emit("chat image", m);
  });

  // ------------------ ВИДЕОЧАТ ------------------
  socket.on("joinVideo", () => {
    videoRoomUsers.push(socket.id);

    if (videoRoomUsers.length === 2) {
      io.to(videoRoomUsers[0]).emit("videoReady");
      io.to(videoRoomUsers[1]).emit("videoReady");
    }
  });

  socket.on("leaveVideo", () => {
    videoRoomUsers = videoRoomUsers.filter(id => id !== socket.id);
    socket.broadcast.emit("videoLeft");
  });

  socket.on("offer", offer => socket.broadcast.emit("offer", offer));
  socket.on("answer", ans => socket.broadcast.emit("answer", ans));
  socket.on("ice", cand => socket.broadcast.emit("ice", cand));

  // ------------------ ОТКЛЮЧЕНИЕ ------------------
  socket.on("disconnect", () => {
    activeUsers.delete(socket.username);
    videoRoomUsers = videoRoomUsers.filter(id => id !== socket.id);
    socket.broadcast.emit("videoLeft");
    logSecurity(`${socket.username} вышел`);
  });
});

server.listen(3000, () => console.log("🚀 Сервер запущен на 3000"));
