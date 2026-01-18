const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const https = require("https");

const app = express();
const server = http.createServer(app);

const io = new Server(server, {
  cors: { origin: "*", methods: ["GET", "POST"] }
});

app.use(express.static(__dirname));

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");

/* ===== helpers ===== */
function load(file, def = []) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def));
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ===== data ===== */
let users = load(usersFile);
let messages = load(messagesFile);

const sockets = {}; // username -> socket

/* ===== XIRSYS ICE ===== */
const XIRSYS_USER = "daniil";
const XIRSYS_TOKEN = "787333b8-cedf-11f0-bad6-0242ac130003";
const XIRSYS_PATH = "/_turn/MyFirstApp";

function getXirsys() {
  return new Promise(resolve => {
    const body = JSON.stringify({ format: "ice" });

    const req = https.request({
      host: "global.xirsys.net",
      path: XIRSYS_PATH,
      method: "PUT",
      headers: {
        "Authorization":
          "Basic " + Buffer.from(`${XIRSYS_USER}:${XIRSYS_TOKEN}`).toString("base64"),
        "Content-Type": "application/json",
        "Content-Length": body.length
      }
    }, res => {
      let data = "";
      res.on("data", c => data += c);
      res.on("end", () => {
        try {
          resolve(JSON.parse(data).v.iceServers);
        } catch {
          resolve([{ urls: "stun:stun.l.google.com:19302" }]);
        }
      });
    });

    req.on("error", () =>
      resolve([{ urls: "stun:stun.l.google.com:19302" }])
    );

    req.write(body);
    req.end();
  });
}

/* ===== SOCKET.IO ===== */
io.on("connection", socket => {

  /* ICE */
  socket.on("request-ice", async () => {
    socket.emit("ice-servers", await getXirsys());
  });

  /* REGISTRATION */
  socket.on("register", ({ username, password }) => {
    if (!username || !password)
      return socket.emit("registerError", "Введите имя и пароль");

    if (users.find(u => u.username === username))
      return socket.emit("registerError", "Имя занято");

    const admin = users.length === 0;
    users.push({ username, password, admin });
    save(usersFile, users);

    socket.emit("registerSuccess", "Регистрация успешна");
  });

  /* LOGIN */
  socket.on("login", ({ username, password }) => {
    const user = users.find(
      u => u.username === username && u.password === password
    );
    /* LOGIN FROM LOCALSTORAGE */
socket.on("loginFromStorage", ({ username }) => {
  const user = users.find(u => u.username === username);
  if (!user) {
    // если пользователь не найден
    socket.emit("loginError", "Сессия устарела, войдите снова");
    return;
  }

  // сохраняем сокет
  socket.username = user.username;
  socket.admin = user.admin;
  sockets[user.username] = socket;

  // уведомляем всех, кто онлайн
  io.emit("active-users", Object.keys(sockets));

  // отправляем фронту данные, как при обычном логине
  socket.emit("loginFromStorageSuccess", {
    username: user.username,
    admin: user.admin,
    users: users.map(u => u.username),
    online: Object.keys(sockets),
    messages
  });
});

    if (!user)
      return socket.emit("loginError", "Неверное имя или пароль");

    socket.username = username;
    socket.admin = user.admin;
    sockets[username] = socket;

    io.emit("active-users", Object.keys(sockets));

    socket.emit("loginSuccess", {
      username,
      admin: user.admin,
      users: users.map(u => u.username),
      online: Object.keys(sockets),
      messages
    });
  });

  /* TEXT MESSAGE */
  socket.on("chat message", msg => {
    const fullMsg = {
      from: msg.from,
      to: msg.to,
      text: msg.text,
      type: "text",
      time: new Date().toLocaleTimeString()
    };

    messages.push(fullMsg);
    save(messagesFile, messages);

    if (sockets[fullMsg.to])
      sockets[fullMsg.to].emit("private-message", fullMsg);

    if (sockets[fullMsg.from])
      sockets[fullMsg.from].emit("private-message", fullMsg);
  });

  /* IMAGE MESSAGE */
  socket.on("chat image", msg => {
    const fullMsg = {
      from: msg.from,
      to: msg.to,
      data: msg.data,
      type: "image",
      time: new Date().toLocaleTimeString()
    };

    messages.push(fullMsg);
    save(messagesFile, messages);

    if (sockets[fullMsg.to])
      sockets[fullMsg.to].emit("private-message", fullMsg);

    if (sockets[fullMsg.from])
      sockets[fullMsg.from].emit("private-message", fullMsg);
  });

  /* WEBRTC */
  socket.on("webrtc-offer", p => sockets[p.to]?.emit("webrtc-offer", p));
  socket.on("webrtc-answer", p => sockets[p.to]?.emit("webrtc-answer", p));
  socket.on("webrtc-candidate", p => sockets[p.to]?.emit("webrtc-candidate", p));
  socket.on("audio-join", p => sockets[p.to]?.emit("audio-join", p));

  /* DISCONNECT */
  socket.on("disconnect", () => {
    if (socket.username) {
      delete sockets[socket.username];
      io.emit("active-users", Object.keys(sockets));
    }
  });
});

server.listen(3000, () => {
  console.log("✅ Server running http://localhost:3000");
});

