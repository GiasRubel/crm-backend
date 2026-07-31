/*
 * CRM Pro login theme — progressive enhancement only.
 *
 * Everything here is optional: the pages submit and validate server-side
 * without any of it. Loaded with `defer`, so the DOM is ready when it runs.
 */
(function () {
  "use strict";

  /* ---------------------------------------------------------- password reveal
   * The base theme ships a `passwordVisibility.js` that expects Font Awesome
   * <i> tags; this theme uses inline SVGs instead, so it does its own toggling.
   */
  document.querySelectorAll("[data-crm-reveal]").forEach(function (button) {
    var input = document.getElementById(button.getAttribute("data-crm-reveal"));
    if (!input) return;

    button.addEventListener("click", function () {
      var reveal = input.type === "password";
      input.type = reveal ? "text" : "password";
      // Which glyph shows is a CSS concern (`.is-revealed`) — the `hidden`
      // attribute does nothing on SVG elements.
      button.classList.toggle("is-revealed", reveal);
      button.setAttribute(
        "aria-label",
        button.getAttribute(reveal ? "data-label-hide" : "data-label-show") || "",
      );
      // Keep the caret where the user left it instead of jumping to the end.
      var pos = input.value.length;
      try {
        input.setSelectionRange(pos, pos);
      } catch (e) {
        /* number/email inputs reject setSelectionRange — harmless */
      }
      input.focus();
    });
  });

  /* -------------------------------------------------------- password strength
   * A hint, not a gate. Keycloak's own password policy is still the authority
   * on what is accepted; this only tells the user how they are doing.
   */
  var LEVELS = [
    { label: "Too short", cls: "is-weak" },
    { label: "Weak", cls: "is-weak" },
    { label: "Fair", cls: "is-fair" },
    { label: "Good", cls: "is-good" },
    { label: "Strong", cls: "is-strong" },
  ];

  function score(value) {
    if (value.length < 8) return 0;
    var points = 0;
    if (/[a-z]/.test(value)) points++;
    if (/[A-Z]/.test(value)) points++;
    if (/[0-9]/.test(value)) points++;
    if (/[^A-Za-z0-9]/.test(value)) points++;
    if (value.length >= 12) points++;
    return Math.max(1, Math.min(4, points - 1));
  }

  document.querySelectorAll("[data-crm-strength]").forEach(function (input) {
    var meter = document.getElementById(input.getAttribute("data-crm-strength"));
    if (!meter) return;

    var bar = meter.querySelector(".crm-strength__bar");
    var label = meter.querySelector(".crm-strength__label");

    input.addEventListener("input", function () {
      if (!input.value) {
        meter.hidden = true;
        return;
      }
      var level = LEVELS[score(input.value)];
      meter.hidden = false;
      meter.className = "crm-strength " + level.cls;
      if (bar) bar.style.width = (score(input.value) + 1) * 20 + "%";
      if (label) label.textContent = level.label;
    });
  });

  /* ------------------------------------------------------------ locale menu */
  var locale = document.querySelector("[data-crm-locale]");
  if (locale) {
    var trigger = locale.querySelector("button");
    var list = locale.querySelector("ul");

    var close = function () {
      locale.classList.remove("is-open");
      if (trigger) trigger.setAttribute("aria-expanded", "false");
    };

    if (trigger && list) {
      trigger.addEventListener("click", function (event) {
        event.stopPropagation();
        var open = locale.classList.toggle("is-open");
        trigger.setAttribute("aria-expanded", String(open));
      });
      document.addEventListener("click", close);
      document.addEventListener("keydown", function (event) {
        if (event.key === "Escape") close();
      });
    }
  }

  /* ------------------------------------------------- submit button feedback
   * Guards against double submits (a real problem on slow Keycloak round-trips)
   * and gives the click some acknowledgement.
   */
  document.querySelectorAll("form").forEach(function (form) {
    form.addEventListener("submit", function () {
      var submit = form.querySelector('button[type="submit"], input[type="submit"]');
      if (!submit || submit.classList.contains("is-busy")) return;
      // Named buttons carry a value the server branches on (e.g. cancel-aia),
      // so disable rather than remove, and only after the value is serialised.
      window.setTimeout(function () {
        submit.classList.add("is-busy");
        submit.setAttribute("aria-busy", "true");
      }, 0);
    });
  });
})();
