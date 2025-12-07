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

function load(file, def = []) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def));
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = load(usersFile);
let messages = load(messagesFile);

const sockets = {};

/* === XIRSYS ICE === */

const XIRSYS_USER = "daniil";
const XIRSYS_TOKEN = "787333b8-cedf-11f0-bad6-0242ac130003";
const XIRSYS_PATH = "/_turn/MyFirstApp";

function getXirsys() {
  return new Promise((resolve) => {
    const body = JSON.stringify({ format: "ice" });

    const req = https.request({
      host: "global.xirsys.net",
      path: XIRSYS_PATH,
      method: "PUT",
      headers: {
        "Authorization": "Basic " + Buffer.from(`${XIRSYS_USER}:${XIRSYS_TOKEN}`).toString("base64"),
        "Content-Type": "application/json",
        "Content-Length": body.length
      }
    }, res => {
      let data = "";
      res.on("data", chunk => data += chunk);
      res.on("end", () => {
        try {
          const json = JSON.parse(data);
          resolve(json.v.iceServers);
        } catch {
          resolve([{ urls: "stun:stun.l.google.com:19302" }]);
        }
      });
    });

    req.on("error", () => resolve([{ urls: "stun:stun.l.google.com:19302" }]));
    req.write(body);
    req.end();
  });
}

/* ============= SOCKET.IO =============== */

io.on("connection", socket => {

  socket.on("request-ice", async () => {
    const ice = await getXirsys();
    socket.emit("ice-servers", ice);
  });

  /* === Registration === */
  socket.on("register", ({ username, password }) => {
    if (!username || !password) {
      socket.emit("registerError", "Введите имя и пароль");
      return;
    }

    if (users.find(u => u.username === username)) {
      socket.emit("registerError", "Имя занято");
      return;
    }

    const admin = users.length === 0;
    users.push({ username, password, admin });
    save(usersFile, users);

    socket.emit("registerSuccess", "Регистрация успешна");
  });

  /* === Login === */
  socket.on("login", ({ username, password }) => {
    const user = users.find(u => u.username === username && u.password === password);

    if (!user) {
      socket.emit("loginError", "Неверное имя или пароль");
      return;
    }

    socket.username = username;
    socket.admin = user.admin;

    sockets[username] = socket;

    socket.emit("loginSuccess", {
      username,
      admin: user.admin,
      users: users.map(u => u.username),   // ВСЕ зарегистрированные
      messages
    });

    io.emit("active-users", Object.keys(sockets));
  });

  /* === Private Text Message === */
  socket.on("chat message", msg => {
    const time = new Date().toLocaleTimeString();
    const fullMsg = { ...msg, type: "text", time };

    messages.push(fullMsg);
    save(messagesFile, messages);

    if (sockets[msg.to]) sockets[msg.to].emit("private-message", fullMsg);
    socket.emit("private-message", fullMsg);
  });

  /* === Image Message === */
  socket.on("chat image", msg => {
    const time = new Date().toLocaleTimeString();
    const fullMsg = { ...msg, type: "image", time };

    messages.push(fullMsg);
    save(messagesFile, messages);

    if (sockets[msg.to]) sockets[msg.to].emit("private-message", fullMsg);
    socket.emit("private-message", fullMsg);
  });

  /* === Video Call === */
  socket.on("call-user", ({ target }) => {
    if (sockets[target]) {
      sockets[target].emit("incoming-call", { from: socket.username });
    }
  });

  socket.on("webrtc-offer", ({ to, offer }) => {
    if (sockets[to]) {
      sockets[to].emit("webrtc-offer", { from: socket.username, to, offer });
    }
  });

  socket.on("webrtc-answer", ({ to, answer }) => {
    if (sockets[to]) {
      sockets[to].emit("webrtc-answer", { from: socket.username, to, answer });
    }
  });

  socket.on("webrtc-candidate", ({ to, candidate }) => {
    if (sockets[to]) {
      sockets[to].emit("webrtc-candidate", { from: socket.username, to, candidate });
    }
  });

  socket.on("audio-join", ({ to, from }) => {
    if (sockets[to]) {
      sockets[to].emit("audio-join", { from });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) {
      delete sockets[socket.username];
      io.emit("active-users", Object.keys(sockets));
    }
  });
});

server.listen(3000, () => {
  console.log("✅ Server running: http://localhost:3000");
});
