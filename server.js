const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http);

app.use(express.static(__dirname));

app.get("/", (req, res) => res.sendFile(__dirname + "/index.html"));

// ===== ЧАТ + ВИДЕОЧАТ =====
let videoRoom = [];

io.on("connection", socket => {

  // простой чат
  socket.on("chat_message", msg => io.emit("chat_message", msg));

  // видеочат
  socket.on("join-video-room", () => {
    videoRoom.push(socket);

    if (videoRoom.length === 1) {
      socket.emit("waiting");
    } else if (videoRoom.length === 2) {
      const [first, second] = videoRoom;
      first.emit("ready");
      second.emit("ready");
    } else {
      socket.emit("waiting");
    }
  });

  socket.on("offer", data => {
    const other = videoRoom.find(s => s.id !== socket.id);
    if(other) other.emit("offer", data);
  });

  socket.on("answer", data => {
    const other = videoRoom.find(s => s.id !== socket.id);
    if(other) other.emit("answer", data);
  });

  socket.on("ice", data => {
    const other = videoRoom.find(s => s.id !== socket.id);
    if(other) other.emit("ice", data);
  });

  socket.on("disconnect", () => {
    videoRoom = videoRoom.filter(s => s.id !== socket.id);
  });

});

http.listen(3000, () => console.log("🚀 Сервер запущен на порту 3000"));
