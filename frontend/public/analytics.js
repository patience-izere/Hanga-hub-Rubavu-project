// Google Tag Manager (container GTM-W55LTRRF), which loads Google Analytics.
// A file rather than an inline script so the Content-Security-Policy can keep script-src 'self'
// plus Google's tag domain. Runs only on the live site, so local testing and CI never send
// visits. Page changes inside the app are counted by GA4's "page changes based on browser
// history" setting (enhanced measurement), which is on by default.
(function () {
  if (window.location.hostname !== "opedu.izere.work") return;
  var containerId = "GTM-W55LTRRF";
  window.dataLayer = window.dataLayer || [];
  window.gtag = function () {
    window.dataLayer.push(arguments);
  };
  window.dataLayer.push({ "gtm.start": new Date().getTime(), event: "gtm.js" });
  window.gtag("js", new Date());
  var script = document.createElement("script");
  script.async = true;
  script.src = "https://www.googletagmanager.com/gtm.js?id=" + containerId;
  document.head.appendChild(script);
})();
