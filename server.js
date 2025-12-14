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
  if (!fs.existsSync(file)) fs.writeFileSync(file, JSON.stringify(def, null, 2));
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function save(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

let users = load(usersFile);
let messages = load(messagesFile);

const sockets = {}; // username → socket

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

    req.on("error", () => resolve([{ urls: "stun:stun.l.google.com:19302" }]));
    req.write(body);
    req.end();
  });
}

/* ===== SOCKET.IO ===== */

io.on("connection", socket => {

  socket.on("request-ice", async () => {
    socket.emit("ice-servers", await getXirsys());
  });

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

    socket.emit("loginSuccess", {
      username,
      admin: user.admin,
      users: users.map(u => u.username), // ВСЕ зарегистрированные
      messages: messages.filter(
        m => m.from === username || m.to === username
      )
    });
  });

  /* === ВСЕ ЗАРЕГИСТРИРОВАННЫЕ ПОЛЬЗОВАТЕЛИ === */
  socket.on("get-all-users", () => {
    socket.emit("all-users", users.map(u => u.username));
  });

  /* === PRIVATE CHAT (ONLINE + OFFLINE) === */
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

  /* === VIDEO CALL === */
  socket.on("call-user", ({ target }) => {
    if (sockets[target]) {
      sockets[target].emit("incoming-call", {
        from: socket.username
      });
    }
  });

  socket.on("webrtc-offer", ({ target, offer }) => {
    if (sockets[target]) {
      sockets[target].emit("webrtc-offer", {
        from: socket.username,
        offer
      });
    }
  });

  socket.on("webrtc-answer", ({ target, answer }) => {
    if (sockets[target]) {
      sockets[target].emit("webrtc-answer", {
        from: socket.username,
        answer
      });
    }
  });

  socket.on("webrtc-candidate", ({ target, candidate }) => {
    if (sockets[target]) {
      sockets[target].emit("webrtc-candidate", {
        from: socket.username,
        candidate
      });
    }
  });

  socket.on("disconnect", () => {
    if (socket.username) delete sockets[socket.username];
  });
});

server.listen(3000, () => {
  console.log("Server running http://localhost:3000");
});
