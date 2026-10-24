export function desktopNotificationStatus() {
  if (!window.isSecureContext) return 'insecure';
  if (!('Notification' in window)) return 'unsupported';
  return window.Notification.permission;
}

// Desktop notifications are best-effort; unsupported mobile browsers keep the in-app toast.
export function showDesktopNotification(notification, onOpen) {
  if (desktopNotificationStatus() !== 'granted' || document.visibilityState !== 'hidden') return null;
  try {
    const popup = new window.Notification('CE Hub', {
      body: notification.message || 'You have a new notification.',
      tag: `cehub-${notification.id}`,
    });
    const timer = window.setTimeout(() => popup.close(), 6000);
    popup.onclick = () => {
      window.focus();
      popup.close();
      onOpen(notification);
    };
    return () => {
      window.clearTimeout(timer);
      popup.onclick = null;
      popup.close();
    };
  } catch {
    return null;
  }
}
