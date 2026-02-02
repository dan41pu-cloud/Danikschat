const socket = io();

let username = null;
let admin = false;

socket.emit("set-visibility", true);

// DOM элементы
const authDiv = document.getElementById('auth');
const chatDiv = document.getElementById('chat');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const authMsg = document.getElementById('authMsg');
const welcome = document.getElementById('welcome');
const input = document.getElementById('input');
const send = document.getElementById('send');
const messages = document.getElementById('messages');
const userSelect = document.getElementById('userSelect');

let allUsers = [];
let onlineUsers = [];

function renderUsers() {
  const prev = userSelect.value;
  userSelect.innerHTML = '<option value="">-- выберите пользователя --</option>';
  allUsers.forEach(user => {
    const option = document.createElement("option");
    option.value = user;
    option.textContent = onlineUsers.includes(user) ? `${user} 🟢 онлайн` : `${user} ⚫ оффлайн`;
    userSelect.appendChild(option);
  });
  if (prev && [...userSelect.options].some(o => o.value === prev)) userSelect.value = prev;
}

document.getElementById('register').onclick = () => {
  socket.emit('register', { username: usernameInput.value.trim(), password: passwordInput.value.trim() });
};
document.getElementById('login').onclick = () => {
  socket.emit('login', { username: usernameInput.value.trim(), password: passwordInput.value.trim() });
};

socket.on('registerSuccess', msg => authMsg.textContent = msg);
socket.on('registerError', msg => authMsg.textContent = msg);
socket.on('loginError', msg => authMsg.textContent = msg);

socket.on('loginSuccess', async data => {
  username = data.username;
  admin = data.admin;

  authDiv.classList.remove('active');
  chatDiv.classList.add('active');
  welcome.textContent = `Привет, ${username}!`;

  allUsers = data.users.filter(u => u !== username);
  onlineUsers = data.online;
  renderUsers();

  messages.innerHTML = '';
  data.messages.forEach(addMessage);

  await subscribePush();
});

function addMessage(msg) {
  if (!(msg.from === username || msg.to === username)) return;
  const li = document.createElement('li');
  if (msg.from === username) li.classList.add('my-message');
  const peer = msg.from === username ? msg.to : msg.from;
  const title = `${peer} (${msg.from === username ? 'я → ' + msg.to : msg.from})`;
  if (msg.type === 'text') li.innerHTML = `<div>${title}</div><div>${msg.text}</div><div>${msg.time}</div>`;
  else li.innerHTML = `<div>${title}</div><img src="${msg.data}" style="max-width:200px"><div>${msg.time}</div>`;
  messages.appendChild(li);
  messages.scrollTop = messages.scrollHeight;
}

socket.on('private-message', addMessage);
socket.on("active-users", list => { onlineUsers = list; renderUsers(); });

send.onclick = () => {
  const text = input.value.trim();
  const to = userSelect.value;
  if (!to) return alert("Выберите получателя.");
  if (text) {
    socket.emit('chat message', { from: username, to, text });
    input.value = '';
  }
};

async function subscribePush() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: "BJYi3h03X9-EdNQVsXPsKvku8G001TcpAxPgNFbvync7VlLRZnj8TgVkm-gdcpx23AmPZm7IPD0vAaSemX_MANY"
    });
    socket.emit("save-push", { username, subscription: sub });
  } catch (e) { console.warn("Push отключён пользователем"); }
}
