(function () {
  "use strict";

  var root = document.documentElement;
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  var fine = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function Spr(w, z, x) { this.w = w; this.z = z; this.x = x || 0; this.v = 0; }
  Spr.prototype.step = function (t, dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, w = this.w, z = this.z;
    for (var i = 0; i < n; i++) { this.v += (w * w * (t - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
    return this.x;
  };
  function $$(sel, el) { return Array.prototype.slice.call((el || document).querySelectorAll(sel)); }

  root.classList.add("has-motion_tatiana");

  var counts = new Map();
  var surfacing = $$(".reveal_tatiana").map(function (el) {
    var parent = el.parentElement;
    var i = counts.get(parent) || 0;
    counts.set(parent, i + 1);
    var big = el.matches(".section__head_tatiana, .contact__title_tatiana, .about__intro_tatiana");
    return {
      el: el,
      p: new Spr(Math.max(1.7, 3 - i * 0.28), 0.86, 0),
      masks: $$(".mask_tatiana > span", el).map(function (m, j) { return { el: m, s: new Spr(2.3 - j * 0.25, 0.8, 0) }; }),
      big: big,
      last: ""
    };
  });

  var pointer = { x: -9999, y: -9999, on: false };
  window.addEventListener("pointermove", function (e) {
    if (e.pointerType === "touch") return;
    pointer.x = e.clientX; pointer.y = e.clientY; pointer.on = true;
  }, { passive: true });
  window.addEventListener("mouseout", function (e) { if (!e.relatedTarget) pointer.on = false; });
  window.addEventListener("blur", function () { pointer.on = false; });

  var magnets = [];
  function magnet(sel, layers, reach) {
    $$(sel).forEach(function (el) {
      var m = { el: el, reach: reach || 24, w: new Spr(3.4, 0.9, 0), layers: [] };
      layers.forEach(function (L) {
        var targets = L.self ? [el] : $$(L.sel, el);
        targets.forEach(function (t) {
          m.layers.push({ el: t, cfg: L, x: new Spr(L.w, L.z), y: new Spr(L.w, L.z), r: new Spr(L.w * 0.9, L.z), v: L.vars });
        });
      });
      if (m.layers.length) magnets.push(m);
    });
  }
  if (fine) {
    magnet(".craft_tatiana", [
      { sel: ".craft__name_tatiana", px: 12, py: 5, rot: 5, w: 5.2, z: 0.55 },
      { sel: ".craft__desc_tatiana", px: 7, py: 3, rot: 0, w: 3.1, z: 0.6 }
    ]);
    magnet(".way_tatiana", [
      { sel: "h3", px: 9, py: 4, rot: 5, w: 5, z: 0.55 },
      { sel: "p", px: 5, py: 2, rot: 0, w: 3, z: 0.6 }
    ]);
    magnet(".tl_tatiana", [
      { sel: ".tl__role_tatiana", px: 10, py: 3, rot: 4, w: 4.8, z: 0.55 },
      { sel: ".tl__org_tatiana", px: 7, py: 2, rot: 0, w: 3.6, z: 0.6 },
      { sel: ".tl__desc_tatiana", px: 4, py: 1.5, rot: 0, w: 2.6, z: 0.62 }
    ], 0);
    magnet(".reach__item_tatiana", [
      { sel: ".reach__value_tatiana", px: 12, py: 4, rot: 3, w: 5, z: 0.55 },
      { sel: ".reach__label_tatiana", px: 6, py: 2, rot: 0, w: 3.4, z: 0.6 },
      { sel: ".reach__icon_tatiana", px: 16, py: 8, rot: 0, w: 2.6, z: 0.45 }
    ], 10);
    magnet(".work__title_tatiana", [{ sel: "a", px: 12, py: 6, rot: 5, w: 4.8, z: 0.55 }], 30);
    magnet(".btn_tatiana, .link-quiet_tatiana", [
      { self: true, px: 5, py: 4, rot: 0, w: 5.5, z: 0.5 },
      { self: true, vars: true, px: 10, py: 8, w: 3.2, z: 0.42 }
    ], 26);
    magnet(".filter_tatiana, .copy_tatiana, .nav__list_tatiana a", [{ self: true, px: 4, py: 3, rot: 0, w: 5.5, z: 0.5 }], 14);
  }

  function measure() {
    surfacing.forEach(function (it) {
      var t = it.el.style.transform, o = it.el.style.opacity, f = it.el.style.filter;
      it.el.style.transform = "none";
      var r = it.el.getBoundingClientRect();
      it.top = r.top + window.scrollY; it.h = r.height;
      it.noExit = r.height > window.innerHeight * 0.8 || it.el.matches(".about__intro_tatiana, .work_tatiana");
      it.el.style.transform = t; it.el.style.opacity = o; it.el.style.filter = f;
    });
  }
  measure();
  window.addEventListener("load", measure);
  window.addEventListener("resize", measure);
  if (window.ResizeObserver) {
    var mt;
    new ResizeObserver(function () { clearTimeout(mt); mt = setTimeout(measure, 100); }).observe(document.body);
  }

  var last = performance.now();
  function frame(now) {
    var dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    var H = window.innerHeight, sy = window.scrollY;

    var reads = magnets.map(function (m) {
      var busy = pointer.on || m.w.x > 0.001 || m.layers.some(function (L) { return Math.abs(L.x.x) > 0.02 || Math.abs(L.x.v) > 0.02 || Math.abs(L.y.x) > 0.02; });
      return busy ? m.el.getBoundingClientRect() : null;
    });

    surfacing.forEach(function (it) {
      if (it.top == null || it.el.offsetParent === null) return;
      var top = it.top - sy, bottom = top + it.h;
      if (top > H * 1.6 || bottom < -H * 0.6) {
        if (it.last !== "far") { it.p.x = top > H ? 0 : (it.noExit ? 1 : 0.72); it.p.v = 0; }
        it.last = "far";
        it.masks.forEach(function (m) { m.s.x = it.p.x; m.s.v = 0; });
        return;
      }
      var enter = smooth(0, 1, (H - top) / (H * 0.32));
      var exit = smooth(0, 1, bottom / (H * 0.35));
      var target = it.noExit ? enter : Math.min(enter, 0.86 + 0.14 * exit);
      var p = it.p.step(target, dt);
      var d = clamp(1 - p, 0, 1);
      var tall = clamp((H * 0.55) / Math.max(1, it.h), 0.15, 1);
      var key;
      if (d < 0.002) {
        key = "rest";
        if (it.last !== key) { it.el.style.transform = ""; it.el.style.opacity = ""; it.el.style.filter = ""; }
      } else {
        key = d.toFixed(4);
        if (it.last !== key) {
          it.el.style.transform = "perspective(1200px) translate3d(0," + (d * 44).toFixed(2) + "px," + (-d * 150).toFixed(1) + "px) rotateX(" + (d * 11 * tall).toFixed(2) + "deg)";
          it.el.style.opacity = (1 - d * 0.82).toFixed(3);
          it.el.style.filter = it.big && d > 0.01 && top > H * 0.45 ? "blur(" + (d * 5).toFixed(2) + "px)" : "";
        }
      }
      it.last = key;
      it.masks.forEach(function (m) {
        var y = m.s.step(p, dt);
        var off = clamp(1 - y, -0.2, 1);
        m.el.style.transform = Math.abs(off) < 0.001 ? "" : "translate3d(0," + (off * 106).toFixed(2) + "%,0)";
      });
    });

    magnets.forEach(function (m, idx) {
      var r = reads[idx];
      if (!r || r.bottom < -40 || r.top > H + 40) return;
      var cx = r.left + r.width / 2, cy = r.top + r.height / 2;
      var inside = pointer.on && pointer.x > r.left - m.reach && pointer.x < r.right + m.reach && pointer.y > r.top - m.reach && pointer.y < r.bottom + m.reach;
      var wv = m.w.step(inside ? 1 : 0, dt);
      var ux = inside ? clamp((pointer.x - cx) / (r.width / 2 + m.reach), -1, 1) : 0;
      var uy = inside ? clamp((pointer.y - cy) / (r.height / 2 + m.reach), -1, 1) : 0;
      m.layers.forEach(function (L) {
        var c = L.cfg;
        var x = L.x.step(ux * c.px * wv, dt), y = L.y.step(uy * c.py * wv, dt);
        var rot = c.rot ? L.r.step(ux * c.rot * wv, dt) : 0;
        var still = Math.abs(x) < 0.02 && Math.abs(y) < 0.02 && Math.abs(rot) < 0.01 && wv < 0.002;
        if (L.v) {
          L.el.style.setProperty("--bx", (x - (L.el._sx || 0)).toFixed(2) + "px");
          L.el.style.setProperty("--by", y.toFixed(2) + "px");
          L.el.style.setProperty("--bs", (1 + wv * 0.14).toFixed(3));
          return;
        }
        if (c.self) L.el._sx = x;
        L.el.style.transform = still ? "" : "perspective(700px) translate3d(" + x.toFixed(2) + "px," + y.toFixed(2) + "px,0) rotateY(" + rot.toFixed(2) + "deg) rotateX(" + (-y * 0.35).toFixed(2) + "deg)";
      });
    });

    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
