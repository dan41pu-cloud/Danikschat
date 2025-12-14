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

/* ===== FILES ===== */
const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");

/* ===== HELPERS ===== */
function load(file, def = []) {
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

/* ===== DATA ===== */
let users = load(usersFile);
let messages = load(messagesFile);
let missedCalls = [];

const sockets = {}; // username -> socket

/* ===== SOCKET.IO ===== */
io.on("connection", socket => {

  /* === REGISTRATION === */
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

  /* === LOGIN === */
  socket.on("login", ({ username, password }) => {
    const user = users.find(
      u => u.username === username && u.password === password
    );

    if (!user)
      return socket.emit("loginError", "Неверное имя или пароль");

    socket.username = username;
    socket.admin = user.admin;
    sockets[username] = socket;

    // пропущенные звонки
    const userMissed = missedCalls.filter(c => c.to === username);
    missedCalls = missedCalls.filter(c => c.to !== username);

    socket.emit("loginSuccess", {
      username,
      admin: user.admin,
      users: users.map(u => u.username),
      messages: messages.filter(
        m => m.from === username || m.to === username
      ),
      missedCalls: userMissed
    });
  });

  /* === GET ALL REGISTERED USERS === */
  socket.on("get-all-users", () => {
    socket.emit("all-users", users.map(u => u.username));
  });

  /* === PRIVATE MESSAGE (ONLINE + OFFLINE) === */
  socket.on("chat-private", msg => {
    const message = {
      ...msg,
      type: "text",
      time: new Date().toLocaleString()
    };

    messages.push(message);
    save(messagesFile, messages);

    if (sockets[msg.to]) {
      sockets[msg.to].emit("private-message", message);
    }
  });

  /* === CALL USER === */
  socket.on("call-user", ({ target }) => {
    if (sockets[target]) {
      sockets[target].emit("incoming-call", {
        from: socket.username
      });
    } else {
      missedCalls.push({
        from: socket.username,
        to: target,
        time: new Date().toLocaleString()
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) delete sockets[socket.username];
  });
});

server.listen(3000, () => {
  console.log("Server running: http://localhost:3000");
});
