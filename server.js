const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const https = require("https");


const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });
app.use(express.static(__dirname));


// Хранилища
let users = JSON.parse(fs.readFileSync("users.json", "utf8"));
let active = {}; // username → socket.id


// XIRSYS
const X_USER = "daniil";
const X_TOKEN = "787333b8-cedf-11f0-bad6-0242ac130003";
const X_PATH = "/_turn/MyFirstApp";


function getIce() {
return new Promise((resolve, reject) => {
const body = JSON.stringify({ format: "ice" });
const req = https.request({
host: "global.xirsys.net",
path: X_PATH,
method: "PUT",
headers: {
Authorization: "Basic " + Buffer.from(`${X_USER}:${X_TOKEN}`).toString("base64"),
"Content-Type": "application/json",
"Content-Length": Buffer.byteLength(body)
}
}, res => {
let data = "";
res.on("data", c => data += c);
res.on("end", () => {
try {
const json = JSON.parse(data);
resolve(json?.v?.iceServers || [{ urls: "stun:stun.l.google.com:19302" }]);
} catch (e) { reject(e); }
});
});
req.on("error", reject);
req.write(body);
req.end();
});
}


io.on("connection", socket => {


socket.on("register", d => {
if (users.find(u => u.username === d.username))
return socket.emit("registerError", "Имя уже занято");


users.push({ username: d.username, password: d.password });
fs.writeFileSync("users.json", JSON.stringify(users, null, 2));
socket.emit("registerSuccess", "Успех!");
server.listen(3000);
