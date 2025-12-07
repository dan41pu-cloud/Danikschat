// server.js
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const https = require("https"); // для запроса к Xirsys

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
  if (fs.existsSync(file)) return JSON.parse(fs.readFileSync(file, "utf8"));
  fs.writeFileSync(file, JSON.stringify(defaultValue, null, 2));
  return defaultValue;
}

function saveData(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2), "utf8");
}

function logSecurity(message) {
  const time = new Date().toISOString();
  fs.appendFile(securityLogFile, `[${time}] ${message}\n`, () => {});
}

let messages = loadData(messagesFile);
let users = loadData(usersFile);

// activeUsers set (usernames) and mapping username->socket.id
let activeUsers = new Set();
let userSockets = {}; // username -> socket.id

/* === АВТО-УДАЛЕНИЕ СООБЩЕНИЙ === */
const THREE_HOURS = 3 * 60 * 60 * 1000;

function deleteOldMessages() {
  const now = Date.now();
  const filtered = messages.filter(m => !m.timestamp || now - m.timestamp < THREE_HOURS);

  if (filtered.length !== messages.length) {
    messages = filtered;
    saveData(messagesFile, messages);
  }
}

setInterval(deleteOldMessages, 10 * 60 * 1000);
deleteOldMessages();

/* =======================
   XIRSYS: получение ICE
   ======================= */

// Заменить user:token, если нужно поставить другие
const XIRSYS_AUTH_USER = "daniil";
const XIRSYS_AUTH_TOKEN = "787333b8-cedf-11f0-bad6-0242ac130003";
const XIRSYS_APP_PATH = "/_turn/MyFirstApp";

async function getXirsysServers() {
  return new Promise((resolve, reject) => {
    const body = JSON.stringify({ format: "ice" });

    const options = {
      host: "global.xirsys.net",
      path: XIRSYS_APP_PATH,
      method: "PUT",
      headers: {
        "Authorization":
          "Basic " + Buffer.from(`${XIRSYS_AUTH_USER}:${XIRSYS_AUTH_TOKEN}`).toString("base64"),
        "Content-Type": "application/json",
        "Content-Length": Buffer.byteLength(body),
      },
      timeout: 10000
    };

    const req = https.request(options, (res) => {
      let data = "";
      res.on("data", (chunk) => (data += chunk));
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          if (json && json.v && json.v.iceServers) {
            resolve(json.v.iceServers);
          } else {
            reject(new Error("Unexpected Xirsys response: " + data));
          }
        } catch (err) {
          reject(err);
        }
      });
    });

    req.on("error", (err) => reject(err));
    req.on("timeout", () => {
      req.destroy();
      reject(new Error("Xirsys request timed out"));
    });

    req.write(body);
    req.end();
  });
}

/* ====== Socket.IO ====== */

io.on("connection", (socket) => {

  // Клиент запросил список ICE серверов
  socket.on("request-ice", async () => {
    try {
      const ice = await getXirsysServers();
      socket.emit("ice-servers", ice);
    } catch (err) {
      console.log("ICE ERROR:", err);
      socket.emit("ice-servers", [{ urls: "stun:stun.l.google.com:19302" }]);
    }
  });

  socket.on("register", ({ username, password }) => {
    if (!username || !password) return socket.emit("registerError", "Введите имя и пароль");
    if (users.find(u => u.username.toLowerCase() === username.toLowerCase()))
      return socket.emit("registerError", "Имя уже занято");

    const isFirstUser = users.length === 0;
    users.push({ username, password, admin: isFirstUser });
    saveData(usersFile, users);
    socket.emit("registerSuccess", "Регистрация успешна!");
  });

  socket.on("login", ({ username, password }) => {
    const user = users.find(u => u.username === username && u.password === password);
    if (!user) return socket.emit("loginError", "Неверное имя или пароль");

    if (activeUsers.has(username)) {
      socket.emit("loginError", "Этот пользователь уже онлайн!");
      logSecurity(`Двойной вход: ${username}`);
      return;
    }

    socket.username = username;
    socket.admin = user.admin;
    activeUsers.add(username);
    userSockets[username] = socket.id;

    deleteOldMessages();

    // Отправляем клиенту только его личные сообщения (from/to === username)
    const userMessages = messages.filter(m => m.from === username || m.to === username);

    // Отдаем список онлайн-пользователей (без этого пользователя)
    const others = Array.from(activeUsers).filter(u => u !== username);

    socket.emit("loginSuccess", { username, admin: user.admin, messages: userMessages, online: others });

    // Уведомить остальных о новом онлайне
    socket.broadcast.emit("active-users", Array.from(activeUsers));
  });

  // приватное текстовое сообщение
  socket.on("chat message", (msg) => {
    // msg: { from, to, text }
    if (!msg || !msg.from || !msg.to || !msg.text) return;
    const time = new Date().toLocaleTimeString();
    const data = { ...msg, time, timestamp: Date.now(), type: "text" };
    messages.push(data);
    saveData(messagesFile, messages);

    // отправляем отправителю (подтверждение) и получателю (если онлайн)
    socket.emit("private-message", data);
    const targetId = userSockets[msg.to];
    if (targetId) io.to(targetId).emit("private-message", data);
  });

  // приватное изображение
  socket.on("chat image", (msg) => {
    // msg: { from, to, data }
    if (!msg || !msg.from || !msg.to || !msg.data) return;
    const time = new Date().toLocaleTimeString();
    const data = { ...msg, time, timestamp: Date.now(), type: "image" };
    messages.push(data);
    saveData(messagesFile, messages);

    socket.emit("private-message", data);
    const targetId = userSockets[msg.to];
    if (targetId) io.to(targetId).emit("private-message", data);
  });

  socket.on("clear-messages", () => {
    if (!socket.admin) return;
    messages = [];
    saveData(messagesFile, messages);
    // здесь можно оповестить всех, но т.к. у нас приватные, просто всем отправим событие очистки
    io.emit("chat-cleared");
  });

  /* === WebRTC сигналинг (приватно, с полем to) === */

  socket.on("webrtc-offer", (payload) => {
    // payload: { from, to, offer }
    if (!payload || !payload.to) return;
    const target = userSockets[payload.to];
    if (target) io.to(target).emit("webrtc-offer", payload);
  });

  socket.on("webrtc-answer", (payload) => {
    // payload: { from, to, answer }
    if (!payload || !payload.to) return;
    const target = userSockets[payload.to];
    if (target) io.to(target).emit("webrtc-answer", payload);
  });

  socket.on("webrtc-candidate", (payload) => {
    // payload: { from, to, candidate }
    if (!payload || !payload.to) return;
    const target = userSockets[payload.to];
    if (target) io.to(target).emit("webrtc-candidate", payload);
  });

  /* === 🔊 УВЕДОМЛЕНИЕ О ВХОДЕ В ВИДЕОЧАТ (только конкретному пользователю) === */
  socket.on("audio-join", ({ from, to }) => {
    if (!to) return;
    const target = userSockets[to];
    if (target) io.to(target).emit("audio-join", { from });
  });

  /* === Запрос списка активных пользователей (по требованию) === */
  socket.on("get-active", () => {
    socket.emit("active-users", Array.from(activeUsers));
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      activeUsers.delete(socket.username);
      delete userSockets[socket.username];
      logSecurity(`${socket.username} отключился`);
      socket.broadcast.emit("active-users", Array.from(activeUsers));
    }
  });
});

server.listen(3000, () =>
  console.log("🚀 Сервер запущен http://localhost:3000")
);

