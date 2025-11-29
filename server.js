const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
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
  fs.appendFile(securityLogFile, `[${time}] ${message}\n`, err => {});
}

let messages = loadData(messagesFile);
let users = loadData(usersFile);
let activeUsers = new Set();

/* === АВТО-УДАЛЕНИЕ СООБЩЕНИЙ — добавлено === */
const THREE_HOURS = 3 * 60 * 60 * 1000;

function deleteOldMessages() {
  const now = Date.now();
  const filtered = messages.filter(m => !m.timestamp || now - m.timestamp < THREE_HOURS);

  if (filtered.length !== messages.length) {
    console.log(`🗑 Удалено старых сообщений: ${messages.length - filtered.length}`);
    messages = filtered;
    saveData(messagesFile, messages);
  }
}

// запуск авто-удаления раз в 10 минут
setInterval(deleteOldMessages, 10 * 60 * 1000);

// очистка при старте сервера
deleteOldMessages();
/* =========================================== */

io.on("connection", (socket) => {
  console.log("🔗 Пользователь подключился");

  socket.on("register", ({ username, password }) => {
    if(!username || !password) return socket.emit("registerError", "Введите имя и пароль");
    if(users.find(u => u.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("registerError", "Имя уже занято");

    const isFirstUser = users.length === 0;
    users.push({ username, password, admin: isFirstUser });
    saveData(usersFile, users);
    socket.emit("registerSuccess","Регистрация успешна!");
  });

  socket.on("login", ({ username, password }) => {
    const user = users.find(u => u.username === username && u.password === password);
    if(!user) return socket.emit("loginError","Неверное имя или пароль");

    if(activeUsers.has(username)) {
      socket.emit("loginError","Этот пользователь уже онлайн!");
      logSecurity(`Двойной вход: ${username}`);
      return;
    }

    socket.username = username;
    socket.admin = user.admin;
    activeUsers.add(username);

    deleteOldMessages(); // очищаем перед отправкой

    socket.emit("loginSuccess",{ username, admin: user.admin, messages });
  });

  socket.on("chat message", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time, timestamp: Date.now() }; // <<< добавлено timestamp
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat message", message);
  });

  socket.on("chat image", (msg) => {
    const time = new Date().toLocaleTimeString();
    const message = { ...msg, time, timestamp: Date.now() }; // <<< добавлено timestamp
    messages.push(message);
    saveData(messagesFile, messages);
    io.emit("chat image", message);
  });

  // Очистка чата (только админ)
  socket.on("clear-messages", () => {
    if(!socket.admin) return;
    messages = [];
    saveData(messagesFile, messages);
    io.emit("chat-cleared");
  });

  /* === WebRTC сигналинг === */
  socket.on("webrtc-offer", (offer) => {
    socket.broadcast.emit("webrtc-offer", offer);
  });

  socket.on("webrtc-answer", (answer) => {
    socket.broadcast.emit("webrtc-answer", answer);
  });

  socket.on("webrtc-candidate", (candidate) => {
    socket.broadcast.emit("webrtc-candidate", candidate);
  });

  socket.on("disconnect", () => {
    if(socket.username) {
      activeUsers.delete(socket.username);
      logSecurity(`${socket.username} отключился`);
    }
  });
});

server.listen(3000, () => console.log("🚀 Сервер запущен http://localhost:3000"));



вот тебе мой сервер.джс можешь весь код прислать используя это только не меняй ничего там пожалуйста скажи если что то еще нужно будет изменить например индекс
