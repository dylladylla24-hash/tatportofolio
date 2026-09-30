

(function () {
  "use strict";

  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  Array.prototype.slice.call(document.querySelectorAll("[data-split]")).forEach(function (title) {
    var outer = document.createElement("span");
    var inner = document.createElement("span");
    outer.className = "mask_tatiana";
    while (title.firstChild) inner.appendChild(title.firstChild);
    outer.appendChild(inner);
    title.appendChild(outer);
  });

  var yearEl = document.getElementById("year");
  if (yearEl) yearEl.textContent = new Date().getFullYear();

  var toastEl = document.getElementById("toast");
  var toastTimer;

  function toast(message) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.add("is-on_tatiana");
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      toastEl.classList.remove("is-on_tatiana");
    }, 2600);
  }

  var nav = document.getElementById("nav");

  function updateNav() {
    if (!nav) return;
    nav.classList.toggle("is-scrolled_tatiana", window.scrollY > 24);
  }
  updateNav();

  var toggle = document.getElementById("nav-toggle");
  var menu = document.getElementById("nav-menu");

  function setMenu(open) {
    document.body.classList.toggle("menu-open_tatiana", open);
    if (toggle) toggle.setAttribute("aria-expanded", open ? "true" : "false");
  }

  if (toggle && menu) {
    toggle.addEventListener("click", function () {
      setMenu(toggle.getAttribute("aria-expanded") !== "true");
    });

    menu.addEventListener("click", function (event) {
      if (event.target.closest("a")) setMenu(false);
    });

    document.addEventListener("keydown", function (event) {
      if (event.key === "Escape") setMenu(false);
    });

    window.addEventListener("resize", function () {
      if (window.innerWidth > 860) setMenu(false);
    });
  }

  var navLinks = Array.prototype.slice.call(document.querySelectorAll(".nav__list_tatiana a"));
  var sections = navLinks
    .map(function (link) { return document.querySelector(link.getAttribute("href")); })
    .filter(Boolean);

  if ("IntersectionObserver" in window && sections.length) {
    var spy = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        navLinks.forEach(function (link) {
          link.classList.toggle("is-current_tatiana", link.getAttribute("href") === "#" + entry.target.id);
        });
      });
    }, { rootMargin: "-45% 0px -50% 0px", threshold: 0 });

    sections.forEach(function (section) { spy.observe(section); });
  }

  var revealEls = Array.prototype.slice.call(document.querySelectorAll(".reveal_tatiana"));

  if (!("IntersectionObserver" in window) || reduceMotion) {
    revealEls.forEach(function (el) { el.classList.add("is-in_tatiana"); });
  } else {
    var counters = new Map();
    revealEls.forEach(function (el) {
      var parent = el.parentElement;
      var index = counters.get(parent) || 0;
      counters.set(parent, index + 1);
      el.style.setProperty("--d", Math.min(index, 6) * 70 + "ms");
    });

    var revealer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("is-in_tatiana");
        revealer.unobserve(entry.target);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.1 });

    revealEls.forEach(function (el) { revealer.observe(el); });
  }

  var filters = Array.prototype.slice.call(document.querySelectorAll(".filter_tatiana"));
  var projects = Array.prototype.slice.call(document.querySelectorAll(".work_tatiana"));
  var emptyNote = document.getElementById("gallery-empty");

  function categoriesOf(project) {
    return (project.getAttribute("data-category") || "").split(/\s+/);
  }

  filters.forEach(function (button) {
    var wanted = button.getAttribute("data-filter");
    if (wanted === "all") return;
    button.hidden = !projects.some(function (project) {
      return categoriesOf(project).indexOf(wanted) !== -1;
    });
  });

  filters.forEach(function (button) {
    button.addEventListener("click", function () {
      var wanted = button.getAttribute("data-filter");
      var visible = 0;

      filters.forEach(function (other) {
        var active = other === button;
        other.classList.toggle("is-active_tatiana", active);
        other.setAttribute("aria-pressed", active ? "true" : "false");
      });

      var gallery = document.getElementById("gallery");
      function apply() {
        projects.forEach(function (project) {
          var match = wanted === "all" || categoriesOf(project).indexOf(wanted) !== -1;
          project.classList.toggle("is-hidden_tatiana", !match);
          if (match) visible++;
        });
        if (emptyNote) emptyNote.hidden = visible !== 0;
      }
      if (reduceMotion || !gallery) { apply(); return; }
      clearTimeout(gallery._swap);
      gallery.classList.add("is-sinking_tatiana");
      gallery._swap = setTimeout(function () {
        apply();
        requestAnimationFrame(function () { requestAnimationFrame(function () { gallery.classList.remove("is-sinking_tatiana"); }); });
      }, 520);
    });
  });

  var parallaxEls = Array.prototype.slice.call(document.querySelectorAll("[data-parallax]"));
  var ticking = false;

  function applyParallax() {
    var middle = window.innerHeight / 2;
    parallaxEls.forEach(function (el) {
      var box = el.getBoundingClientRect();
      var speed = parseFloat(el.getAttribute("data-parallax")) || 0;
      var shift = (box.top + box.height / 2 - middle) * speed;
      el.style.transform = "translate3d(0," + shift.toFixed(2) + "px,0)";
    });
  }

  function onScroll() {
    updateNav();
    if (reduceMotion || ticking) return;
    ticking = true;
    window.requestAnimationFrame(function () {
      applyParallax();
      ticking = false;
    });
  }

  window.addEventListener("scroll", onScroll, { passive: true });
  window.addEventListener("resize", onScroll);
  if (!reduceMotion) applyParallax();

  document.addEventListener("click", function (event) {
    var placeholder = event.target.closest("[data-placeholder]");
    if (!placeholder) return;
    event.preventDefault();
    toast("Add your link in index.html");
  });

  function copyText(text, done) {
    function fallback() {
      var field = document.createElement("textarea");
      field.value = text;
      field.setAttribute("readonly", "");
      field.style.position = "fixed";
      field.style.opacity = "0";
      document.body.appendChild(field);
      field.select();
      var ok = false;
      try { ok = document.execCommand("copy"); } catch (error) {}
      document.body.removeChild(field);
      done(ok);
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, fallback);
    } else {
      fallback();
    }
  }

  Array.prototype.slice.call(document.querySelectorAll("[data-copy]")).forEach(function (button) {
    var label = button.textContent;
    button.addEventListener("click", function () {
      var text = button.getAttribute("data-copy");
      copyText(text, function (ok) {
        if (!ok) { toast(text); return; }
        button.textContent = "Copied";
        toast(button.getAttribute("data-copied") || "Copied");
        setTimeout(function () { button.textContent = label; }, 2200);
      });
    });
  });

  var isApple = /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent) ||
    (navigator.userAgentData && /macOS|iOS/.test(navigator.userAgentData.platform || ""));
  Array.prototype.slice.call(document.querySelectorAll("[data-imessage]")).forEach(function (link) {
    link.addEventListener("click", function (event) {
      if (isApple) return;
      event.preventDefault();
      var address = link.getAttribute("data-imessage");
      copyText(address, function (ok) {
        toast(ok ? "iMessage needs an Apple device. Address copied." : "iMessage: " + address);
      });
    });
  });

  var timeline = document.querySelector("[data-timeline]");
  if (timeline) {
    var stops = Array.prototype.slice.call(timeline.querySelectorAll(".tl_tatiana"));
    var tlQueued = false;
    var paintTimeline = function () {
      tlQueued = false;
      var box = timeline.getBoundingClientRect();
      var line = window.innerHeight * 0.6;
      var p = reduceMotion ? 1 : Math.min(1, Math.max(0, (line - box.top) / box.height));
      timeline.style.setProperty("--p", p.toFixed(3));
      stops.forEach(function (stop) {
        var dot = stop.querySelector(".tl__dot_tatiana");
        var y = dot ? dot.getBoundingClientRect().top : stop.getBoundingClientRect().top;
        stop.classList.toggle("is-lit_tatiana", reduceMotion || y < line);
      });
    };
    var queueTimeline = function () {
      if (tlQueued) return;
      tlQueued = true;
      window.requestAnimationFrame(paintTimeline);
    };
    window.addEventListener("scroll", queueTimeline, { passive: true });
    window.addEventListener("resize", queueTimeline);
    paintTimeline();
  }
})();
