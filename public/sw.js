self.addEventListener("push", event => {
  const data = event.data?.json() || {};

  const title = data.title || "Новое сообщение";
  const options = {
    body: data.body || "Вам пришло сообщение",
    icon: "/icon-192.png",
    badge: "/icon-192.png",
    data: data.url || "/"
  };

  event.waitUntil(
    self.registration.showNotification(title, options)
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data || "/")
  );
});
