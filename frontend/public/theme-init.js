// Sets data-theme on <html> before the first paint, so there is no flash of the other theme.
// "light" or "dark" is a person's choice; otherwise ("Device theme") the device setting is used,
// and src/theme/theme.ts keeps it in step if the device switches while the page is open.
(function () {
  var theme = null;
  try {
    theme = localStorage.getItem("opedu:theme");
  } catch (error) {
    // Storage blocked: follow the device.
  }
  if (theme !== "light" && theme !== "dark") {
    theme =
      window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
  }
  document.documentElement.dataset.theme = theme;
})();
