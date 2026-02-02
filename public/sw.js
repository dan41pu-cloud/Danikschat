self.addEventListener("push", event => {
  if (!event.data) return;

  const data = event.data.json();

  event.waitUntil(
    self.registration.showNotification(data.title || "Новое сообщение", {
      body: data.body,
      icon: "/icon-192.png",
      badge: "/icon-192.png",
      data: {
        url: data.url || "/"
      }
    })
  );
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  event.waitUntil(
    clients.openWindow(event.notification.data.url)
  );
});
