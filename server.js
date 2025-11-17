const express = require("express");
const app = express();
const http = require("http").createServer(app);
const io = require("socket.io")(http, { cors:{origin:"*"} });


app.use(express.static(__dirname));


let videoRoomUsers = [];


io.on("connection", socket => {


// ----------- ЧАТ -----------
socket.on("msg", text => {
io.emit("msg", text);
});


// ----------- ВИДЕОЧАТ -----------
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


socket.on("offer", (offer) => {
socket.broadcast.emit("offer", offer);
});


socket.on("answer", (answer) => {
socket.broadcast.emit("answer", answer);
});


socket.on("ice", (candidate) => {
socket.broadcast.emit("ice", candidate);
});


socket.on("disconnect", () => {
videoRoomUsers = videoRoomUsers.filter(id => id !== socket.id);
socket.broadcast.emit("videoLeft");
});
});


http.listen(3000, () => console.log("Сервер работает на порту 3000"));
