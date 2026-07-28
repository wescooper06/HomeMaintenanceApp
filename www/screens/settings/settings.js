function initSettingsScreen() {
  const form = document.getElementById("settingsForm");
  const message = document.getElementById("settingsMessage");

  if (!form || !message) return;

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    message.textContent = "Settings saved.";
  });
}

window.initSettingsScreen = initSettingsScreen;
