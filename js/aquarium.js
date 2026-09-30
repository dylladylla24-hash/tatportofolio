(function () {
  "use strict";

  var root = document.documentElement;
  var canvas = document.getElementById("tank");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var coarse = window.matchMedia("(pointer: coarse)").matches;
  var revealed = false;

  function revealPage() {
    if (revealed) return;
    revealed = true;
    root.classList.add("is-water_tatiana");
    root.classList.remove("is-loading_tatiana");
  }
  function fail() {
    root.classList.add("no-webgl_tatiana");
    revealPage();
  }

  if (!canvas || !window.THREE) { fail(); return; }
  var THREE = window.THREE;

  var renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: false, alpha: false, stencil: false, powerPreference: "high-performance" });
  } catch (e) { fail(); return; }
  if (!renderer.getContext()) { fail(); return; }

  var gl2 = renderer.capabilities.isWebGL2;
  var small = coarse || window.innerWidth < 760;
  var Q = {
    dpr: small ? 1.35 : 1.75,
    particles: small ? 560 : 1500,
    bubbles: small ? 22 : 46,
    burst: small ? 12 : 20,
    grass: small ? 34 : 70,
    samples: gl2 && !small ? 4 : 0
  };
  var LOW = /[?&]quality=low/.test(location.search);
  if (LOW) { Q.dpr = 0.5; Q.samples = 0; Q.particles = 400; Q.grass = 20; }
  var dpr = Math.min(window.devicePixelRatio || 1, Q.dpr);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NoToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.setClearColor(0x625d80, 1);

  var TRAVEL = 112;
  var FLOOR = -8.6;
  var TAU = Math.PI * 2;

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }
  function lerp(a, b, t) { return a + (b - a) * t; }
  function smooth(a, b, v) { var t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); }
  function damp(k, dt) { return 1 - Math.exp(-k * dt); }
  function Spr(w, z, x) { this.w = w; this.z = z; this.x = x || 0; this.v = 0; }
  Spr.prototype.step = function (t, dt) {
    var n = Math.max(1, Math.ceil(dt / 0.008)), h = dt / n, w = this.w, z = this.z;
    for (var i = 0; i < n; i++) { this.v += (w * w * (t - this.x) - 2 * z * w * this.v) * h; this.x += this.v * h; }
    return this.x;
  };
  Spr.prototype.set = function (x) { this.x = x; this.v = 0; return this; };
  var seed = 7;
  function rnd() { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; }
  function range(a, b) { return a + (b - a) * rnd(); }

  var C = {
    fogShallow: new THREE.Color(0xcbdae9),
    fogDeep: new THREE.Color(0xd6cbe1),
    topShallow: new THREE.Color(0xf8f1e7),
    topDeep: new THREE.Color(0xf2dedd),
    botShallow: new THREE.Color(0xa7bcd5),
    botDeep: new THREE.Color(0xa99fc4),
    dusk: new THREE.Color(0x625d80),
    light: new THREE.Color(0xfffaf4),
    caust: new THREE.Color(0xfff4ea),
    grassBase: new THREE.Color(0x8fb0b3),
    grassTip: new THREE.Color(0xd5e7e0)
  };

  var U = {
    time: { value: 0 },
    caust: { value: 1 },
    caustColor: { value: C.caust.clone() },
    fogColor: { value: C.fogShallow.clone() },
    fogDensity: { value: 0.034 },
    intro: { value: 0 },
    blushAmt: { value: 0.86 }
  };

  var scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(U.fogColor.value.getHex(), 0.034);
  var camera = new THREE.PerspectiveCamera(42, 1, 0.05, 160);
  camera.rotation.order = "YXZ";
  var baseCam = new THREE.Object3D();
  baseCam.rotation.order = "YXZ";
  scene.add(camera);

  var CAUSTIC = [
    "float causticF(vec2 uv, float time) {",
    "  vec2 p = mod(uv * 6.28318, 6.28318) - 250.0;",
    "  vec2 i = p; float c = 1.0; float inten = 0.005;",
    "  for (int n = 0; n < 4; n++) {",
    "    float t = time * (1.0 - (3.5 / float(n + 1)));",
    "    i = p + vec2(cos(t - i.x) + sin(t + i.y), sin(t - i.y) + cos(t + i.x));",
    "    c += 1.0 / length(vec2(p.x / (sin(i.x + t) / inten), p.y / (cos(i.y + t) / inten)));",
    "  }",
    "  c /= 4.0; c = 1.17 - pow(c, 1.4);",
    "  return pow(abs(c), 8.0);",
    "}"
  ].join("\n");

  var BEND_DECL = "uniform float uCurl; uniform float uPhase; uniform float uSway; uniform float uTip; uniform float uSide;\n";
  var BEND_NORMAL = [
    "float bk = uCurl + (sin(uTime * 0.9 + uPhase) * 0.22 + sin(uTime * 0.53 + uPhase * 1.7) * 0.12) * uSway;",
    "float bs = position.y;",
    "float ba = bk * bs;",
    "float bc = cos(ba); float bsn = sin(ba);",
    "vec3 objectNormal = vec3(normal.x * bc + normal.y * bsn, -normal.x * bsn + normal.y * bc, normal.z);",
    "#ifdef USE_TANGENT",
    "vec3 objectTangent = vec3( tangent.xyz );",
    "#endif"
  ].join("\n");
  var BEND_POS = [
    "vec3 transformed = vec3(position);",
    "if (abs(bk) > 0.0001) {",
    "  transformed.x = (1.0 - bc) / bk + position.x * bc;",
    "  transformed.y = bsn / bk - position.x * bsn;",
    "}",
    "float bt = pow(clamp(bs / 0.84, 0.0, 1.25), 3.0);",
    "transformed.x += uTip * bt * 0.3;",
    "transformed.z += sin(uTime * 0.7 + uPhase * 1.3) * 0.05 * bs * bs * uSway + uSide * bs * bs * 0.45;"
  ].join("\n");
  var BLUSH = [
    "vec3 bn = normalize(vObj);",
    "vec3 c1 = normalize(vec3(0.56, -0.14, 0.82));",
    "vec3 c2 = normalize(vec3(-0.56, -0.14, 0.82));",
    "vec3 sc = vec3(1.0, 1.4, 1.0);",
    "float bl = max(1.0 - smoothstep(0.06, 0.24, length((bn - c1) * sc)), 1.0 - smoothstep(0.06, 0.24, length((bn - c2) * sc)));",
    "diffuseColor.rgb = mix(diffuseColor.rgb, uBlush, bl * uBlushAmt);"
  ].join("\n");

  function waterize(mat, opt) {
    opt = opt || {};
    var amt = (opt.caust == null ? 1 : opt.caust).toFixed(2);
    mat.onBeforeCompile = function (sh) {
      sh.uniforms.uTime = U.time;
      sh.uniforms.uCaust = U.caust;
      sh.uniforms.uCaustColor = U.caustColor;
      if (opt.bend) {
        sh.uniforms.uCurl = opt.bend.curl;
        sh.uniforms.uPhase = opt.bend.phase;
        sh.uniforms.uSway = opt.bend.sway;
        sh.uniforms.uTip = opt.bend.tip;
        sh.uniforms.uSide = opt.bend.side;
      }
      if (opt.blush) { sh.uniforms.uBlush = { value: new THREE.Color(0xf7a8c4) }; sh.uniforms.uBlushAmt = U.blushAmt; }
      sh.vertexShader = sh.vertexShader
        .replace("#include <common>", "#include <common>\nuniform float uTime;\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec3 vObj;\n" + (opt.bend ? BEND_DECL : ""))
        .replace("#include <beginnormal_vertex>", opt.bend ? BEND_NORMAL : "#include <beginnormal_vertex>")
        .replace("#include <begin_vertex>", opt.bend ? BEND_POS : "#include <begin_vertex>")
        .replace("#include <project_vertex>", [
          "#include <project_vertex>",
          "vObj = position;",
          "vec4 wq = vec4(transformed, 1.0);",
          "vec3 wn = objectNormal;",
          "#ifdef USE_INSTANCING",
          "wq = instanceMatrix * wq; wn = mat3(instanceMatrix) * wn;",
          "#endif",
          "wq = modelMatrix * wq; vWPos = wq.xyz;",
          "vWNrm = normalize(mat3(modelMatrix) * wn);"
        ].join("\n"));
      sh.fragmentShader = sh.fragmentShader
        .replace("#include <common>", "#include <common>\nvarying vec3 vWPos; varying vec3 vWNrm; varying vec3 vObj;\nuniform float uTime; uniform float uCaust; uniform vec3 uCaustColor;\n" + (opt.blush ? "uniform vec3 uBlush; uniform float uBlushAmt;\n" : "") + CAUSTIC)
        .replace("#include <color_fragment>", "#include <color_fragment>\n" + (opt.blush ? BLUSH : ""))
        .replace("#include <opaque_fragment>", [
          "float cUp = clamp(vWNrm.y * 0.65 + 0.35, 0.0, 1.0);",
          "float cz = causticF(vWPos.xz * 0.2 + vec2(vWPos.y * 0.04, 0.0), uTime * 0.32);",
          "outgoingLight += uCaustColor * cz * cUp * uCaust * " + amt + " * (diffuseColor.rgb * 0.9 + 0.06);",
          "#include <opaque_fragment>"
        ].join("\n"));
    };
    mat.customProgramCacheKey = function () { return "w" + (opt.bend ? "b" : "") + (opt.blush ? "c" : "") + amt; };
    return mat;
  }

  function fogChunk() {
    return "uniform vec3 uFogColor; uniform float uFogDensity;\nfloat fogAmt(float d) { return 1.0 - exp(-uFogDensity * uFogDensity * d * d); }\n";
  }

  var pmrem = new THREE.PMREMGenerator(renderer);
  (function buildEnv() {
    var env = new THREE.Scene();
    var sky = new THREE.Mesh(new THREE.SphereGeometry(10, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide,
      vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: "varying vec3 vD; void main(){ vec3 c = mix(vec3(0.33,0.35,0.5), vec3(0.74,0.79,0.9), smoothstep(-0.3,0.85,vD.y)); c += vec3(1.0,0.97,0.93) * pow(max(vD.y,0.0), 12.0) * 2.4; gl_FragColor = vec4(c,1.0); }"
    }));
    env.add(sky);
    function panel(w, h, x, y, z, k, col) {
      var m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshBasicMaterial({ color: new THREE.Color(col).multiplyScalar(k), side: THREE.DoubleSide }));
      m.position.set(x, y, z); m.lookAt(0, 0, 0); env.add(m);
    }
    panel(3.2, 1.4, 3.6, 5.4, 5.6, 7, 0xffffff);
    panel(1.2, 1.2, -5.2, 3.2, 6.4, 5, 0xffffff);
    panel(0.7, 0.7, 1.2, -1.2, 8.6, 3, 0xffffff);
    panel(6, 2.4, -2, 3, -8, 1.6, 0xd8cdf5);
    scene.environment = pmrem.fromScene(env, 0.035).texture;
    env.traverse(function (o) { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); });
  })();

  var hemi = new THREE.HemisphereLight(0xe3eef8, 0xd6c8dc, 0.9);
  var key = new THREE.DirectionalLight(0xfff3ec, 2.6);
  var rim = new THREE.DirectionalLight(0xcfc3f2, 2.4);
  var fill = new THREE.PointLight(0xffe4e4, 0, 14, 1.6);
  scene.add(hemi, key, key.target, rim, rim.target, fill);

  var backdrop = new THREE.Mesh(new THREE.SphereGeometry(120, 48, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { uTop: { value: C.topShallow.clone() }, uHor: U.fogColor, uBot: { value: C.botShallow.clone() }, uDusk: { value: C.dusk }, uTime: U.time, uIntro: U.intro, uShaft: { value: 1 } },
    vertexShader: "varying vec3 vD; void main(){ vD = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position.z = gl_Position.w * 0.9999; }",
    fragmentShader: [
      "uniform vec3 uTop; uniform vec3 uHor; uniform vec3 uBot; uniform vec3 uDusk; uniform float uTime; uniform float uIntro; uniform float uShaft; varying vec3 vD;",
      "void main(){",
      "  float y = vD.y;",
      "  vec3 c = mix(uBot, uHor, smoothstep(-0.55, 0.02, y));",
      "  c = mix(c, uTop, smoothstep(0.02, 0.85, y));",
      "  float ang = atan(vD.x, vD.z);",
      "  float rays = pow(0.5 + 0.5 * sin(ang * 9.0 + sin(ang * 3.0 + uTime * 0.05) * 2.0 + uTime * 0.03), 6.0);",
      "  c += uTop * rays * smoothstep(0.1, 0.9, y) * 0.35 * uShaft;",
      "  c += vec3(1.0, 0.96, 0.92) * pow(max(y, 0.0), 7.0) * 0.22 * uShaft;",
      "  gl_FragColor = vec4(mix(uDusk, c, uIntro), 1.0);",
      "}"
    ].join("\n")
  }));
  backdrop.frustumCulled = false;
  backdrop.renderOrder = -10;
  scene.add(backdrop);

  function floorH(x, z) {
    return Math.sin(x * 0.27 + z * 0.05) * 0.32 + Math.sin(z * 0.19 + x * 0.12) * 0.42 + Math.sin(x * 0.9 + z * 0.7) * 0.06;
  }
  (function buildFloor() {
    var len = TRAVEL + 90;
    var g = new THREE.PlaneGeometry(90, len, small ? 60 : 110, small ? 120 : 240);
    g.rotateX(-Math.PI / 2);
    g.translate(0, 0, -len / 2 + 24);
    var p = g.attributes.position;
    for (var i = 0; i < p.count; i++) p.setY(i, FLOOR + floorH(p.getX(i), p.getZ(i)));
    g.computeVertexNormals();
    var m = waterize(new THREE.MeshStandardMaterial({ color: 0xe8dccf, roughness: 1, metalness: 0, envMapIntensity: 0.25 }), { caust: 1.5 });
    var mesh = new THREE.Mesh(g, m);
    scene.add(mesh);
  })();

  function rockGeo(s) {
    var g = new THREE.SphereGeometry(1, 30, 22);
    var p = g.attributes.position;
    var v = new THREE.Vector3();
    for (var i = 0; i < p.count; i++) {
      v.fromBufferAttribute(p, i).normalize();
      var d = 1 + 0.24 * Math.sin(v.x * 3.1 + s) * Math.sin(v.y * 2.6 + s * 1.7) * Math.sin(v.z * 3.4 + s * 2.3) +
        0.07 * Math.sin(v.x * 9 + s * 3) * Math.sin(v.z * 8.5 + s) + 0.03 * Math.sin(v.y * 17 + s * 5);
      v.multiplyScalar(d);
      if (v.y < -0.3) v.y = -0.3 + (v.y + 0.3) * 0.15;
      p.setXYZ(i, v.x, v.y, v.z);
    }
    g.computeVertexNormals();
    return g;
  }
  (function buildRocks() {
    var mat = waterize(new THREE.MeshStandardMaterial({ color: 0xbab5ca, roughness: 0.94, metalness: 0, envMapIntensity: 0.35 }), { caust: 1.1 });
    var perGeo = small ? 16 : 30;
    var dummy = new THREE.Object3D();
    for (var k = 0; k < 3; k++) {
      var inst = new THREE.InstancedMesh(rockGeo(k * 2.3 + 1), mat, perGeo + 4);
      for (var i = 0; i < perGeo; i++) {
        var side = rnd() < 0.5 ? -1 : 1;
        var x = side * range(3.5, 22);
        var z = range(14, -(TRAVEL + 50));
        var s = range(0.6, 2.8) * (Math.abs(x) > 12 ? 1.5 : 1);
        dummy.position.set(x, FLOOR + floorH(x, z) + s * 0.2, z);
        dummy.rotation.set(range(-0.2, 0.2), range(0, TAU), range(-0.2, 0.2));
        dummy.scale.set(s * range(0.9, 1.5), s * range(0.6, 1.1), s * range(0.9, 1.4));
        dummy.updateMatrix();
        inst.setMatrixAt(i, dummy.matrix);
      }
      for (var j = 0; j < 4; j++) {
        var sx = (j % 2 ? -1 : 1) * range(18, 30);
        var sz = -j * 30 - k * 11 - 10;
        var ss = range(2.2, 3.6);
        dummy.position.set(sx, FLOOR + ss * 2.4, sz);
        dummy.rotation.set(0, range(0, TAU), range(-0.1, 0.1));
        dummy.scale.set(ss, ss * range(3.5, 5.5), ss);
        dummy.updateMatrix();
        inst.setMatrixAt(perGeo + j, dummy.matrix);
      }
      inst.instanceMatrix.needsUpdate = true;
      scene.add(inst);
    }
  })();

  var grassMat;
  (function buildGrass() {
    var base = new THREE.PlaneGeometry(1, 1, 1, 12);
    base.translate(0, 0.5, 0);
    var g = new THREE.InstancedBufferGeometry();
    g.index = base.index;
    g.setAttribute("position", base.attributes.position);
    var list = [];
    for (var c = 0; c < Q.grass; c++) {
      var side = rnd() < 0.5 ? -1 : 1;
      var cx = side * range(2.2, 20), cz = range(12, -(TRAVEL + 40));
      var n = Math.floor(range(8, 22));
      for (var i = 0; i < n; i++) {
        var a = range(0, TAU), r = Math.sqrt(rnd()) * 1.6;
        var x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        var tall = rnd() < 0.07;
        list.push([x, FLOOR + floorH(x, z) - 0.05, z, tall ? range(0.3, 0.5) : range(0.08, 0.2), tall ? range(4, 9) : range(0.6, 2.3), rnd(), range(0, TAU)]);
      }
    }
    var nearN = small ? 10 : 22;
    for (var q = 0; q < nearN; q++) {
      var qs = q % 2 ? -1 : 1;
      var qx = qs * range(2.6, 5.2), qz = 6 - q * (TRAVEL + 20) / nearN - range(0, 3);
      for (var qq = 0; qq < 3; qq++) {
        var bx = qx + range(-0.5, 0.5), bz = qz + range(-0.5, 0.5);
        list.push([bx, FLOOR + floorH(bx, bz) - 0.05, bz, range(0.28, 0.46), range(8.5, 11.5), rnd(), range(0, TAU)]);
      }
    }
    var N = list.length;
    var aPos = new Float32Array(N * 3), aSize = new Float32Array(N * 2), aSeed = new Float32Array(N), aRot = new Float32Array(N);
    list.forEach(function (b, i) {
      aPos[i * 3] = b[0]; aPos[i * 3 + 1] = b[1]; aPos[i * 3 + 2] = b[2];
      aSize[i * 2] = b[3]; aSize[i * 2 + 1] = b[4]; aSeed[i] = b[5]; aRot[i] = b[6];
    });
    g.setAttribute("aPos", new THREE.InstancedBufferAttribute(aPos, 3));
    g.setAttribute("aSize", new THREE.InstancedBufferAttribute(aSize, 2));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(aSeed, 1));
    g.setAttribute("aRot", new THREE.InstancedBufferAttribute(aRot, 1));
    g.instanceCount = N;
    grassMat = new THREE.ShaderMaterial({
      side: THREE.DoubleSide,
      uniforms: { uTime: U.time, uFogColor: U.fogColor, uFogDensity: U.fogDensity, uBase: { value: C.grassBase }, uTip: { value: C.grassTip }, uLight: { value: C.light }, uPush: { value: new THREE.Vector3(0, -99, 0) }, uPushA: { value: 0 }, uIntro: U.intro, uFlow: { value: new THREE.Vector2() } },
      vertexShader: [
        "attribute vec3 aPos; attribute vec2 aSize; attribute float aSeed; attribute float aRot;",
        "uniform float uTime; uniform vec3 uPush; uniform float uPushA; uniform vec2 uFlow; varying float vH; varying float vD; varying float vSeed;",
        "void main(){",
        "  float h = position.y;",
        "  float w = (1.0 - h * 0.86) * aSize.x;",
        "  vec3 p = vec3(position.x * w, h * aSize.y, 0.0);",
        "  float c = cos(aRot), s = sin(aRot);",
        "  p = vec3(p.x * c, p.y, p.x * s);",
        "  float bend = h * h * aSize.y * 0.2;",
        "  float sway = sin(uTime * 0.5 + aSeed * 6.28 + aPos.z * 0.15 + h * 1.4) * 0.35 + sin(uTime * 0.29 + aSeed * 3.0) * 0.22;",
        "  p.x += sway * bend;",
        "  p.z += cos(uTime * 0.37 + aSeed * 5.0 + h) * bend * 0.45;",
        "  vec3 wp = aPos + p;",
        "  wp.xz += uFlow * h * h * (0.6 + aSize.y * 0.12) * (0.7 + aSeed * 0.6);",
        "  vec3 dp = wp - uPush; float dl = length(dp.xz);",
        "  wp.xz += normalize(dp.xz + 0.001) * exp(-dl * dl * 0.25) * h * 0.6 * uPushA;",
        "  vec4 mv = viewMatrix * vec4(wp, 1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  vH = h; vSeed = aSeed; vD = -mv.z;",
        "}"
      ].join("\n"),
      fragmentShader: fogChunk() + [
        "uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uLight; uniform float uIntro; varying float vH; varying float vD; varying float vSeed;",
        "void main(){",
        "  vec3 col = mix(uBase, uTip, pow(vH, 1.3)) * (0.55 + 0.5 * vSeed) * mix(0.8, 1.0, smoothstep(2.5, 9.0, vD));",
        "  col += uLight * pow(vH, 3.0) * 0.08;",
        "  col = mix(col, uFogColor, fogAmt(vD));",
        "  gl_FragColor = vec4(mix(uFogColor, col, uIntro), 1.0);",
        "}"
      ].join("\n")
    });
    var mesh = new THREE.Mesh(g, grassMat);
    mesh.frustumCulled = false;
    scene.add(mesh);
  })();

  var farGlass = new THREE.Mesh(new THREE.PlaneGeometry(90, 50), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uColor: { value: C.light }, uI: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: [
      "uniform float uTime; uniform vec3 uColor; uniform float uI; varying vec2 vUv;",
      "void main(){",
      "  float x = vUv.x * 90.0;",
      "  float streak = pow(0.5 + 0.5 * sin(x * 0.33 + sin(vUv.y * 4.0 + uTime * 0.1) * 0.6), 18.0);",
      "  float band = smoothstep(0.0, 0.4, vUv.y) * (1.0 - smoothstep(0.6, 1.0, vUv.y));",
      "  float sheen = pow(max(0.0, 1.0 - abs(vUv.x - 0.5 - sin(uTime * 0.05) * 0.2) * 3.0), 3.0);",
      "  float a = (0.05 + streak * 0.35 + sheen * 0.25) * band * uI;",
      "  gl_FragColor = vec4(uColor, a * 0.4);",
      "}"
    ].join("\n")
  }));
  farGlass.position.set(0, FLOOR + 22, -(TRAVEL + 34));
  scene.add(farGlass);

  var shaftVS = "varying vec2 vUv; varying float vD; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vD = -mv.z; gl_Position = projectionMatrix * mv; }";
  var shaftFS = [
    "uniform float uI; uniform float uTime; uniform vec3 uColor; uniform float uSeed; varying vec2 vUv; varying float vD;",
    "void main(){",
    "  float edge = pow(sin(3.14159 * vUv.x), 2.2);",
    "  float top = pow(vUv.y, 1.7);",
    "  float streak = 0.5 + 0.5 * sin(vUv.x * 21.0 + uSeed * 10.0 + uTime * 0.35 + sin(vUv.y * 3.0 + uTime * 0.25) * 2.0);",
    "  float a = edge * top * (0.45 + 0.55 * streak) * uI * smoothstep(0.6, 4.0, vD) * (1.0 - smoothstep(24.0, 70.0, vD));",
    "  gl_FragColor = vec4(uColor, a * 0.16);",
    "}"
  ].join("\n");
  function shaftMat(s) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { uI: { value: 1 }, uTime: U.time, uColor: { value: C.light }, uSeed: { value: s } },
      vertexShader: shaftVS, fragmentShader: shaftFS
    });
  }
  var shafts = [];
  var shaftGeo = new THREE.PlaneGeometry(1, 1);
  shaftGeo.translate(0, -0.5, 0);
  for (var si = 0; si < 9; si++) {
    var sm = new THREE.Mesh(shaftGeo, shaftMat(rnd()));
    var w = range(2.2, 5.5);
    sm.scale.set(w, range(20, 30), 1);
    sm.position.set((si % 2 ? -1 : 1) * range(1.5, 10), 9 - si * 0.5, -si * 14 - range(0, 6));
    sm.userData.tilt = range(-0.28, 0.1);
    sm.userData.base = range(0.7, 1.2);
    sm.frustumCulled = false;
    scene.add(sm);
    shafts.push(sm);
  }
  var sweep = new THREE.Mesh(shaftGeo, shaftMat(0.3));
  sweep.scale.set(3.4, 18, 1);
  sweep.frustumCulled = false;
  camera.add(sweep);

  var particles;
  (function buildParticles() {
    var n = Q.particles;
    var box = new THREE.Vector3(30, 20, 38);
    var pos = new Float32Array(n * 3), size = new Float32Array(n), sd = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      pos[i * 3] = range(-15, 15); pos[i * 3 + 1] = range(-10, 10); pos[i * 3 + 2] = range(-19, 19);
      var r = rnd();
      size[i] = r < 0.9 ? range(0.8, 2.2) : range(2.4, 4.6);
      sd[i] = rnd();
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
    g.setAttribute("aSize", new THREE.BufferAttribute(size, 1));
    g.setAttribute("aSeed", new THREE.BufferAttribute(sd, 1));
    var m = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: {
        uTime: U.time, uCam: { value: new THREE.Vector3() }, uBox: { value: box },
        uRayO: { value: new THREE.Vector3() }, uRayD: { value: new THREE.Vector3(0, 0, -1) }, uForce: { value: 0 },
        uPR: { value: dpr }, uOpacity: { value: 0 }, uColor: { value: C.light }, uDrift: { value: 0 }
      },
      vertexShader: [
        "attribute float aSize; attribute float aSeed;",
        "uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform vec3 uRayO; uniform vec3 uRayD; uniform float uForce; uniform float uPR; uniform float uDrift;",
        "varying float vA; varying float vSeed;",
        "void main(){",
        "  vec3 p = position;",
        "  p.x += sin(uTime * 0.13 + aSeed * 20.0) * 0.6;",
        "  p.y += uTime * (0.03 + aSeed * 0.05) + uDrift * (0.3 + aSeed);",
        "  p.z += cos(uTime * 0.11 + aSeed * 13.0) * 0.6;",
        "  p = mod(p - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;",
        "  vec3 toP = p - uRayO; float al = max(dot(toP, uRayD), 0.0); vec3 dv = p - (uRayO + uRayD * al);",
        "  float d2 = dot(dv, dv);",
        "  p += normalize(dv + 0.0001) * uForce * exp(-d2 * 0.8) * 0.8;",
        "  vec4 mv = viewMatrix * vec4(p, 1.0);",
        "  gl_Position = projectionMatrix * mv;",
        "  float dep = -mv.z;",
        "  gl_PointSize = aSize * uPR * (15.0 / max(dep, 0.4));",
        "  vA = smoothstep(0.3, 1.6, dep) * (1.0 - smoothstep(10.0, uBox.z * 0.5, dep));",
        "  vSeed = aSeed;",
        "}"
      ].join("\n"),
      fragmentShader: [
        "uniform float uOpacity; uniform vec3 uColor; varying float vA; varying float vSeed;",
        "void main(){",
        "  float d = length(gl_PointCoord - 0.5);",
        "  float a = smoothstep(0.5, 0.0, d); a *= a;",
        "  gl_FragColor = vec4(uColor, a * vA * uOpacity * (0.18 + 0.42 * vSeed));",
        "}"
      ].join("\n")
    });
    particles = new THREE.Points(g, m);
    particles.frustumCulled = false;
    scene.add(particles);
  })();

  var bubbleFS = [
    "uniform vec3 uColor; uniform float uOpacity; varying vec3 vN; varying vec3 vV; varying float vFade;",
    "void main(){",
    "  vec3 n = normalize(vN);",
    "  float ndv = abs(dot(n, normalize(vV)));",
    "  float rim = pow(1.0 - ndv, 2.4);",
    "  float edge = pow(1.0 - ndv, 9.0);",
    "  float spec = pow(max(dot(n, normalize(vec3(-0.4, 0.62, 0.68))), 0.0), 70.0);",
    "  float spec2 = pow(max(dot(n, normalize(vec3(0.5, -0.5, 0.7))), 0.0), 30.0) * 0.3;",
    "  vec3 col = mix(uColor, vec3(0.56, 0.52, 0.72), edge * 0.75);",
    "  float a = clamp((rim * 0.42 + edge * 0.4 + spec * 1.3 + spec2) * vFade * uOpacity, 0.0, 1.0);",
    "  gl_FragColor = vec4(col, a);",
    "}"
  ].join("\n");
  function bubbleGeo(n, extra) {
    var base = new THREE.IcosahedronGeometry(1, 3);
    var g = new THREE.InstancedBufferGeometry();
    g.setAttribute("position", base.attributes.position);
    g.setAttribute("normal", base.attributes.normal);
    var off = new Float32Array(n * 3), sc = new Float32Array(n), sp = new Float32Array(n), sd = new Float32Array(n);
    for (var i = 0; i < n; i++) {
      extra(i, off, sc, sp, sd);
    }
    g.setAttribute("aOff", new THREE.InstancedBufferAttribute(off, 3));
    g.setAttribute("aScale", new THREE.InstancedBufferAttribute(sc, 1));
    g.setAttribute("aSpeed", new THREE.InstancedBufferAttribute(sp, 1));
    g.setAttribute("aSeed", new THREE.InstancedBufferAttribute(sd, 1));
    g.instanceCount = n;
    return g;
  }
  var bubbles = new THREE.Mesh(bubbleGeo(Q.bubbles, function (i, off, sc, sp, sd) {
    off[i * 3] = range(-13, 13); off[i * 3 + 1] = range(-9, 9); off[i * 3 + 2] = range(-17, 17);
    var r = rnd();
    sc[i] = r < 0.8 ? range(0.018, 0.05) : range(0.06, 0.12);
    sp[i] = range(0.35, 0.9) + sc[i] * 4;
    sd[i] = rnd();
  }), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uTime: U.time, uCam: { value: new THREE.Vector3() }, uBox: { value: new THREE.Vector3(26, 18, 34) }, uColor: { value: C.light }, uOpacity: { value: 0 }, uFogDensity: U.fogDensity, uLift: { value: 0 } },
    vertexShader: [
      "attribute vec3 aOff; attribute float aScale; attribute float aSpeed; attribute float aSeed;",
      "uniform float uTime; uniform vec3 uCam; uniform vec3 uBox; uniform float uFogDensity; uniform float uLift;",
      "varying vec3 vN; varying vec3 vV; varying float vFade;",
      "void main(){",
      "  vec3 c = aOff;",
      "  c.y += uTime * aSpeed + uLift * aSpeed;",
      "  c.x += sin(uTime * 1.3 + aSeed * 30.0) * 0.08;",
      "  c.z += cos(uTime * 1.1 + aSeed * 17.0) * 0.06;",
      "  c = mod(c - uCam + uBox * 0.5, uBox) - uBox * 0.5 + uCam;",
      "  float wob = 1.0 + sin(uTime * 4.0 + aSeed * 10.0) * 0.07;",
      "  vec3 p = c + position * aScale * vec3(wob, 2.0 - wob, wob);",
      "  vec4 mv = viewMatrix * vec4(p, 1.0);",
      "  gl_Position = projectionMatrix * mv;",
      "  vN = normalize(mat3(viewMatrix) * normal); vV = normalize(-mv.xyz);",
      "  float dep = -mv.z;",
      "  vFade = smoothstep(0.25, 1.4, dep) * exp(-dep * dep * uFogDensity * uFogDensity * 1.3);",
      "  vFade *= 1.0 - smoothstep(0.75, 1.0, abs((c.y - uCam.y) / (uBox.y * 0.5)));",
      "}"
    ].join("\n"),
    fragmentShader: bubbleFS
  }));
  bubbles.frustumCulled = false;
  scene.add(bubbles);

  var burstOpacity = 0.55;
  var burst = new THREE.Mesh(bubbleGeo(Q.burst, function (i, off, sc, sp, sd) {
    off[i * 3] = range(-1, 1); off[i * 3 + 1] = range(0, 0.55); off[i * 3 + 2] = range(0, 1);
    sc[i] = range(0.04, 0.2); sp[i] = range(0.8, 1.3); sd[i] = rnd();
  }), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uP: { value: -1 }, uTime: U.time, uAspect: { value: 1 }, uTan: { value: Math.tan(21 * Math.PI / 180) }, uColor: { value: C.light }, uOpacity: { value: burstOpacity } },
    vertexShader: [
      "attribute vec3 aOff; attribute float aScale; attribute float aSpeed; attribute float aSeed;",
      "uniform float uP; uniform float uTime; uniform float uAspect; uniform float uTan;",
      "varying vec3 vN; varying vec3 vV; varying float vFade;",
      "void main(){",
      "  float z = 1.1 + aOff.z * 5.0;",
      "  float hh = uTan * z; float hw = hh * uAspect;",
      "  float t = uP * 1.55 * aSpeed - aOff.y;",
      "  vec3 c = vec3(aOff.x * hw * 1.1 + sin(t * 9.0 + aSeed * 20.0) * 0.08 * z, mix(-hh * 1.4, hh * 1.4, t), -z);",
      "  float s = aScale * (0.6 + z * 0.25);",
      "  vec3 p = c + position * s * vec3(1.0 + sin(uTime * 5.0 + aSeed * 9.0) * 0.06, 1.0, 1.0);",
      "  gl_Position = projectionMatrix * vec4(p, 1.0);",
      "  vN = normal; vV = normalize(-p);",
      "  vFade = step(0.0, t) * step(t, 1.0) * smoothstep(0.0, 0.1, uP) * (1.0 - smoothstep(0.9, 1.0, uP));",
      "}"
    ].join("\n"),
    fragmentShader: bubbleFS
  }));
  burst.frustumCulled = false;
  burst.visible = false;
  camera.add(burst);

  var wipeGroup = new THREE.Group();
  camera.add(wipeGroup);
  var wipeMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: U.time, uA: { value: 0 }, uBase: { value: new THREE.Color(0xa89ec8) }, uTip: { value: new THREE.Color(0xdad2ec) }, uLight: { value: C.light } },
    vertexShader: [
      "uniform float uTime; varying vec2 vUv;",
      "void main(){",
      "  vUv = uv; vec3 p = position;",
      "  float h = uv.y;",
      "  p.x *= (1.0 - h * 0.55);",
      "  p.x += sin(h * 3.2 + uTime * 0.6) * 0.35 * h + sin(h * 7.0 + uTime) * 0.05;",
      "  gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);",
      "}"
    ].join("\n"),
    fragmentShader: [
      "uniform float uA; uniform vec3 uBase; uniform vec3 uTip; uniform vec3 uLight; varying vec2 vUv;",
      "void main(){",
      "  float e = abs(vUv.x - 0.5) * 2.0;",
      "  float body = 1.0 - smoothstep(0.82, 1.0, e);",
      "  float vein = 1.0 - smoothstep(0.0, 0.05, abs(vUv.x - 0.5));",
      "  vec3 col = mix(uBase, uTip, vUv.y) + uLight * (pow(e, 6.0) * 0.12 + vein * 0.03);",
      "  gl_FragColor = vec4(col, body * uA * 0.94);",
      "}"
    ].join("\n")
  });
  var wipeGeo = new THREE.PlaneGeometry(1.6, 7, 1, 40);
  wipeGeo.translate(0, 1.6, 0);
  for (var wi = 0; wi < 3; wi++) {
    var wm = new THREE.Mesh(wipeGeo, wipeMat);
    wm.position.set(wi * 0.9 - 0.9, -3.6 + wi * 0.25, -2.2 - wi * 0.35);
    wm.rotation.z = (wi - 1) * 0.12;
    wm.frustumCulled = false;
    wipeGroup.add(wm);
  }
  wipeGroup.visible = false;

  var shadowBlob = new THREE.Mesh(new THREE.CircleGeometry(1.8, 40), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false,
    uniforms: { uA: { value: 0 } },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
    fragmentShader: "uniform float uA; varying vec2 vUv; void main(){ float d = length(vUv - 0.5) * 2.0; gl_FragColor = vec4(0.3, 0.27, 0.42, (1.0 - smoothstep(0.1, 1.0, d)) * uA * 0.75); }"
  }));
  shadowBlob.rotation.x = -Math.PI / 2;
  scene.add(shadowBlob);

  var octo = new THREE.Group();
  octo.rotation.order = "YXZ";
  var octoBody = new THREE.Group();
  octo.add(octoBody);
  var headGroup = new THREE.Group();
  headGroup.rotation.order = "YXZ";
  var skirt = new THREE.Group();
  skirt.rotation.order = "YXZ";
  skirt.position.y = -0.35;
  octoBody.add(headGroup, skirt);
  scene.add(octo);
  var OCT = { tentacles: [], pupils: [], whites: [], eyeBase: [], glints: [], pupilMesh: [], mouth: null };
  var HEAD_SCALE = new THREE.Vector3(1, 0.96, 0.97);

  (function buildOctopus() {
    var red = new THREE.Color(0xe4574e);
    function vinyl(color, extra) {
      var o = {
        color: color, roughness: 0.3, metalness: 0,
        clearcoat: 1, clearcoatRoughness: 0.07,
        sheen: 0.35, sheenRoughness: 0.6, sheenColor: new THREE.Color(0xffb8b0),
        envMapIntensity: 1.05
      };
      for (var k in extra) o[k] = extra[k];
      return new THREE.MeshPhysicalMaterial(o);
    }
    var headMat = waterize(vinyl(red), { blush: true, caust: 0.35 });
    var head = new THREE.Mesh(new THREE.SphereGeometry(1, small ? 64 : 96, small ? 48 : 72), headMat);
    head.scale.copy(HEAD_SCALE);
    headGroup.add(head);

    function surface(d) {
      d = d.clone().normalize();
      var k = 1 / Math.sqrt((d.x * d.x) / 1 + (d.y * d.y) / (0.96 * 0.96) + (d.z * d.z) / (0.97 * 0.97));
      return d.multiplyScalar(k);
    }
    function mountOnHead(obj, dir, lift) {
      var p = surface(dir);
      var n = dir.clone().normalize();
      obj.position.copy(p).addScaledVector(n, lift);
      obj.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), n);
      headGroup.add(obj);
    }

    var whiteMat = vinyl(new THREE.Color(0xf6f3ee), { sheen: 0, roughness: 0.22 });
    var pupilMat = vinyl(new THREE.Color(0x1f1c2b), { sheen: 0, roughness: 0.12 });
    var glintMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xffffff).multiplyScalar(2.4) });
    var eyeGeo = new THREE.SphereGeometry(1, 40, 28);
    [-1, 1].forEach(function (s) {
      var eye = new THREE.Group();
      var white = new THREE.Mesh(eyeGeo, whiteMat);
      white.scale.set(0.152, 0.19, 0.08);
      eye.add(white);
      var pupil = new THREE.Group();
      var pm = new THREE.Mesh(eyeGeo, pupilMat);
      pm.scale.set(0.1, 0.12, 0.045);
      pupil.add(pm);
      var g1 = new THREE.Mesh(eyeGeo, glintMat);
      g1.scale.setScalar(0.031); g1.position.set(0.03, 0.042, 0.034);
      var g2 = new THREE.Mesh(eyeGeo, glintMat);
      g2.scale.setScalar(0.015); g2.position.set(-0.034, -0.036, 0.034);
      pupil.position.set(-s * 0.01, -0.01, 0.056);
      g1.position.add(pupil.position); g2.position.add(pupil.position);
      g1.userData.base = g1.position.clone(); g2.userData.base = g2.position.clone();
      eye.add(pupil, g1, g2);
      mountOnHead(eye, new THREE.Vector3(s * 0.26, 0.07, 1), 0.012);
      OCT.pupils.push(pupil);
      OCT.pupilMesh.push(pm);
      OCT.glints.push([g1, g2]);
      OCT.whites.push(eye);
      OCT.eyeBase.push(new THREE.Vector3(-s * 0.01, -0.01, 0.056));
    });

    var mouth = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.068, 28, 56), vinyl(new THREE.Color(0xef8fa3), { sheenColor: new THREE.Color(0xffd0da) }));
    mountOnHead(mouth, new THREE.Vector3(0, -0.24, 1), 0.035);
    OCT.mouth = mouth;
    var hole = new THREE.Mesh(new THREE.CircleGeometry(0.05, 24), new THREE.MeshStandardMaterial({ color: 0xd85c55, roughness: 0.5 }));
    hole.position.z = -0.012;
    mouth.add(hole);

    var L = 0.84;
    var prof = [];
    prof.push(new THREE.Vector2(0.001, -0.3));
    prof.push(new THREE.Vector2(0.2, -0.3));
    for (var i = 0; i <= 24; i++) {
      var t = i / 24;
      var r = lerp(0.24, 0.19, smooth(0, 0.6, t)) + 0.04 * smooth(0.5, 0.95, t);
      prof.push(new THREE.Vector2(r, t * L));
    }
    var rt = prof[prof.length - 1].x;
    for (var j = 1; j <= 12; j++) {
      var a = (j / 12) * Math.PI / 2;
      prof.push(new THREE.Vector2(Math.max(0.0005, rt * Math.cos(a)), L + rt * Math.sin(a) * 0.9));
    }
    var tGeo = new THREE.LatheGeometry(prof, small ? 22 : 32);
    var up = new THREE.Vector3(0, 1, 0);
    for (var k = 0; k < 8; k++) {
      var ang = k / 8 * TAU + Math.PI / 8;
      var radial = new THREE.Vector3(Math.sin(ang), 0, Math.cos(ang));
      var dir = radial.clone().multiplyScalar(0.46).add(new THREE.Vector3(0, -0.89, 0)).normalize();
      var X = radial.clone().sub(dir.clone().multiplyScalar(radial.dot(dir))).normalize();
      var Z = new THREE.Vector3().crossVectors(X, dir).normalize();
      var bend = { curl: { value: 0.52 }, phase: { value: k * 1.37 }, sway: { value: 1 }, tip: { value: 0 }, side: { value: 0 } };
      var mat = waterize(vinyl(red), { bend: bend, caust: 0.35 });
      var m = new THREE.Mesh(tGeo, mat);
      m.frustumCulled = false;
      m.position.set(radial.x * 0.62, -0.15, radial.z * 0.62);
      m.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, dir, Z));
      skirt.add(m);
      var wk = 5 + rnd() * 3.5, zk = 0.32 + rnd() * 0.18;
      OCT.tentacles.push({ mesh: m, bend: bend, radial: radial, tangent: new THREE.Vector3(Math.cos(ang), 0, -Math.sin(ang)),
        curl: new Spr(wk, zk, 0.52), side: new Spr(wk * 0.9, zk, 0), tipC: new Spr(wk * 0.62, 0.28, 0.52), tipS: new Spr(wk * 0.6, 0.28, 0) });
    }
    octo.traverse(function (o) { if (o.isMesh) o.renderOrder = 1; });
  })();

  var FRAMES = [];
  (function buildFrames() {
    var figs = Array.prototype.slice.call(document.querySelectorAll(".hero__photo_tatiana, .about__photo_tatiana"));
    if (!figs.length) return;
    var FW = 1, FH = 1.25, RIM = 0.075, MAT = 0.05;
    function rrect(w, h, r) {
      var sh = new THREE.Shape();
      var x = -w / 2, y = -h / 2;
      sh.moveTo(x + r, y); sh.lineTo(x + w - r, y); sh.quadraticCurveTo(x + w, y, x + w, y + r);
      sh.lineTo(x + w, y + h - r); sh.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
      sh.lineTo(x + r, y + h); sh.quadraticCurveTo(x, y + h, x, y + h - r);
      sh.lineTo(x, y + r); sh.quadraticCurveTo(x, y, x + r, y);
      return sh;
    }
    function ring(w, h, t, r, depth, bevel) {
      var sh = rrect(w, h, r);
      sh.holes.push(rrect(w - t * 2, h - t * 2, Math.max(0.002, r * 0.4)));
      var g = new THREE.ExtrudeGeometry(sh, { depth: depth, bevelEnabled: !!bevel, bevelThickness: bevel || 0, bevelSize: bevel || 0, bevelSegments: 4, curveSegments: 8 });
      g.translate(0, 0, -depth / 2);
      return g;
    }
    var rimGeo = ring(FW, FH, RIM, 0.018, 0.07, 0.014);
    var lipGeo = ring(FW - RIM * 2 + 0.004, FH - RIM * 2 + 0.004, 0.009, 0.004, 0.018, 0.003);
    var matGeo = ring(FW - RIM * 2, FH - RIM * 2, MAT, 0.003, 0.008, 0);
    var backGeo = new THREE.BoxGeometry(FW - 0.02, FH - 0.02, 0.02);
    var pw = FW - RIM * 2 - MAT * 2, ph = FH - RIM * 2 - MAT * 2;
    var photoGeo = new THREE.PlaneGeometry(pw, ph);
    var glassGeo = new THREE.PlaneGeometry(FW - RIM * 2, FH - RIM * 2);
    var shadowGeo = new THREE.PlaneGeometry(FW * 1.9, FH * 1.9);

    function frameMats() {
      return {
        rim: waterize(new THREE.MeshPhysicalMaterial({ color: 0x9087b4, roughness: 0.5, metalness: 0.05, clearcoat: 0.6, clearcoatRoughness: 0.25, envMapIntensity: 0.55 }), { caust: 0.5 }),
        lip: new THREE.MeshStandardMaterial({ color: 0xd8c29f, roughness: 0.32, metalness: 1, envMapIntensity: 1.2 }),
        mat: waterize(new THREE.MeshStandardMaterial({ color: 0xf4eee6, roughness: 0.92, metalness: 0, envMapIntensity: 0.4 }), { caust: 0.6 }),
        back: new THREE.MeshStandardMaterial({ color: 0x7e7599, roughness: 0.8 })
      };
    }
    var glassMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { uTime: U.time, uTilt: { value: new THREE.Vector2() }, uA: { value: 0 }, uColor: { value: C.light } },
      vertexShader: "varying vec2 vUv; varying vec3 vN; varying vec3 vV; void main(){ vUv = uv; vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }",
      fragmentShader: [
        "uniform float uTime; uniform vec2 uTilt; uniform float uA; uniform vec3 uColor; varying vec2 vUv; varying vec3 vN; varying vec3 vV;",
        "void main(){",
        "  float fres = pow(1.0 - abs(dot(normalize(vN), normalize(vV))), 3.0);",
        "  float d = vUv.x * 0.8 + vUv.y * 0.55 - 0.7 - uTilt.y * 1.6 + uTilt.x * 0.9 + sin(uTime * 0.07) * 0.05;",
        "  float streak = exp(-d * d * 160.0) * 0.28 + exp(-(d - 0.14) * (d - 0.14) * 700.0) * 0.16;",
        "  float top = smoothstep(0.55, 1.0, vUv.y) * 0.06;",
        "  float a = (0.015 + streak + top * 0.6 + fres * 0.4) * uA;",
        "  gl_FragColor = vec4(uColor, a * 0.42);",
        "}"
      ].join("\n")
    });
    var shadowMat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uA: { value: 0 }, uSize: { value: new THREE.Vector2(FW, FH) }, uSoft: { value: 0.22 } },
      vertexShader: "varying vec2 vP; void main(){ vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }",
      fragmentShader: [
        "uniform float uA; uniform vec2 uSize; uniform float uSoft; varying vec2 vP;",
        "float sdBox(vec2 p, vec2 b, float r){ vec2 q = abs(p) - b + r; return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - r; }",
        "void main(){",
        "  float d = sdBox(vP, uSize * 0.5, 0.04);",
        "  float a = 1.0 - smoothstep(-uSoft * 0.6, uSoft, d);",
        "  gl_FragColor = vec4(0.29, 0.26, 0.42, a * a * uA * 0.6);",
        "}"
      ].join("\n")
    });

    var loader = new THREE.TextureLoader();
    figs.forEach(function (fig, idx) {
      var img = fig.querySelector("img");
      if (!img) return;
      var group = new THREE.Group();
      group.rotation.order = "YXZ";
      var body = new THREE.Group();
      body.rotation.order = "YXZ";
      group.add(body);
      var M = frameMats();
      var rim = new THREE.Mesh(rimGeo, M.rim);
      var lip = new THREE.Mesh(lipGeo, M.lip); lip.position.z = 0.02;
      var mat = new THREE.Mesh(matGeo, M.mat); mat.position.z = 0.004;
      var back = new THREE.Mesh(backGeo, M.back); back.position.z = -0.03;
      var photoMat = waterize(new THREE.MeshStandardMaterial({ color: 0x7a7a7a, roughness: 0.85, metalness: 0, emissive: 0xffffff, emissiveIntensity: 0.72, envMapIntensity: 0.08, transparent: true, opacity: 0 }), { caust: 0.18 });
      var photo = new THREE.Mesh(photoGeo, photoMat); photo.position.z = -0.012;
      var glass = new THREE.Mesh(glassGeo, glassMat.clone()); glass.position.z = 0.03;
      glass.material.uniforms.uTime = U.time;
      var shadow = new THREE.Mesh(shadowGeo, shadowMat.clone());
      shadow.position.set(0.1, -0.13, -0.55);
      body.add(shadow, back, photo, mat, lip, rim, glass);
      glass.renderOrder = 3; shadow.renderOrder = -1;
      group.visible = false;
      scene.add(group);
      var f = {
        fig: fig, group: group, body: body, photo: photo, glass: glass, shadow: shadow, ready: false, fade: new Spr(1.6, 1, 0),
        seed: idx * 2.37 + 0.6,
        rx: new Spr(2.6, 0.42), ry: new Spr(2.6, 0.42), rz: new Spr(2.2, 0.5),
        tx: new Spr(2.4, 0.55), ty: new Spr(2.4, 0.55), tz: new Spr(2.2, 0.5),
        hover: new Spr(2, 0.8), init: false
      };
      loader.load(img.currentSrc || img.src, function (tex) {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
        var ia = tex.image.width / tex.image.height, fa = pw / ph;
        if (ia > fa) { tex.repeat.set(fa / ia, 1); tex.offset.set((1 - fa / ia) / 2, 0); }
        else { tex.repeat.set(1, ia / fa); tex.offset.set(0, (1 - ia / fa) * 0.78); }
        photoMat.map = tex; photoMat.emissiveMap = tex; photoMat.needsUpdate = true;
        f.ready = true;
        fig.classList.add("is-3d_tatiana");
      });
      FRAMES.push(f);
    });
  })();

  function updateFrames(dt, time, intro) {
    var H = window.innerHeight, Wd = window.innerWidth;
    var DF = 5.2;
    var hh = Math.tan(camera.fov * Math.PI / 360) * DF;
    FRAMES.forEach(function (f) {
      var r = f.fig.getBoundingClientRect();
      var on = f.ready && r.bottom > -H * 0.3 && r.top < H * 1.3 && r.width > 4;
      f.group.visible = on || f.fade.x > 0.01;
      if (!f.group.visible) return;
      var alpha = f.fade.step(on ? intro : 0, dt);
      var cx = (r.left + r.width / 2) / Wd * 2 - 1, cy = -((r.top + r.height / 2) / H * 2 - 1);
      var scale = (r.height / H) * 2 * hh / 1.25;
      var near = 0;
      var ux = 0, uy = 0;
      if (pointer.active) {
        ux = (pointer.px - (r.left + r.width / 2)) / (r.width * 0.5);
        uy = (pointer.py - (r.top + r.height / 2)) / (r.height * 0.5);
        near = clamp(1.6 - Math.max(Math.abs(ux), Math.abs(uy)), 0, 1);
      }
      var hv = f.hover.step(near, dt);
      var s = f.seed;
      var idleRx = (Math.sin(time * 0.31 + s) * 0.6 + Math.sin(time * 0.17 + s * 2.1) * 0.4) * 0.022;
      var idleRy = (Math.sin(time * 0.23 + s * 1.3) * 0.6 + Math.sin(time * 0.13 + s * 0.7) * 0.4) * 0.03;
      var idleRz = (Math.sin(time * 0.19 + s * 0.4) * 0.6 + Math.sin(time * 0.29 + s * 3.1) * 0.4) * 0.012;
      var idleY = (Math.sin(time * 0.41 + s) * 0.6 + Math.sin(time * 0.23 + s * 1.9) * 0.4) * 0.028;
      var idleX = Math.sin(time * 0.27 + s * 2.7) * 0.012;
      var drag = clamp(state.sv / 2600, -1.2, 1.2);
      var tRx = idleRx - clamp(uy, -1, 1) * 0.16 * hv + drag * 0.07;
      var tRy = idleRy + clamp(ux, -1, 1) * 0.22 * hv;
      var tRz = idleRz - drag * 0.015;
      var tX = idleX + clamp(ux, -1, 1) * 0.02 * hv;
      var tY = idleY + drag * 0.05;
      var tZ = -0.12 * hv;
      if (!f.init) { f.init = true; }
      f.body.rotation.set(f.rx.step(tRx, dt), f.ry.step(tRy, dt), f.rz.step(tRz, dt));
      f.body.position.set(f.tx.step(tX, dt), f.ty.step(tY, dt), f.tz.step(tZ, dt));
      tmpV.set(cx * hh * aspect, cy * hh, -DF);
      baseCam.localToWorld(tmpV);
      f.group.position.copy(tmpV);
      f.group.quaternion.copy(baseCam.quaternion);
      f.group.scale.setScalar(scale);
      f.photo.material.opacity = alpha;
      f.photo.material.emissiveIntensity = 0.7 + hv * 0.08;
      f.glass.material.uniforms.uA.value = alpha * (1 + hv * 0.6);
      f.glass.material.uniforms.uTilt.value.set(f.body.rotation.y, f.body.rotation.x);
      f.shadow.material.uniforms.uA.value = alpha * (0.78 + hv * 0.12);
      f.shadow.position.set(0.1 + f.body.rotation.y * 0.35, -0.13 - f.body.rotation.x * 0.3, -0.55 - hv * 0.08);
      f.body.children.forEach(function (m) { if (m.material && m !== f.photo && m !== f.glass && m !== f.shadow) { m.material.transparent = alpha < 0.999; m.material.opacity = alpha; } });
    });
  }

  var PUFF = [];
  (function buildPuffs() {
    var g = new THREE.IcosahedronGeometry(1, 2);
    for (var i = 0; i < 18; i++) {
      var m = new THREE.Mesh(g, new THREE.ShaderMaterial({
        transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
        uniforms: { uColor: { value: C.light }, uOpacity: { value: 0 } },
        vertexShader: "varying vec3 vN; varying vec3 vV; varying float vFade; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); vFade = 1.0; gl_Position = projectionMatrix * mv; }",
        fragmentShader: bubbleFS
      }));
      m.visible = false; m.frustumCulled = false; m.renderOrder = 2;
      scene.add(m);
      PUFF.push({ m: m, life: -1, delay: 0, vel: new THREE.Vector3(), size: 0, seed: 0 });
    }
  })();
  var puffAt = 5, mouthW = new THREE.Vector3(), mouthN = new THREE.Vector3(), puffQ = new THREE.Quaternion(), puffT = new THREE.Vector3();
  function puff(n, strength) {
    if (!OCT.mouth || reduceMotion) return;
    OCT.mouth.getWorldPosition(mouthW);
    mouthN.set(0, 0, 1).applyQuaternion(OCT.mouth.getWorldQuaternion(puffQ));
    for (var i = 0, c = 0; i < PUFF.length && c < n; i++) {
      var b = PUFF[i];
      if (b.life >= 0) continue;
      b.life = 0; b.delay = c * (0.08 + rnd() * 0.09); b.seed = rnd() * 10;
      b.size = (0.02 + rnd() * 0.05) * (strength > 1 ? 1.15 : 1);
      b.vel.copy(mouthN).multiplyScalar(0.3 * strength + rnd() * 0.25).add(puffT.set((rnd() - 0.5) * 0.14, 0.22 + rnd() * 0.2, (rnd() - 0.5) * 0.14));
      c++;
    }
  }
  function updatePuffs(dt, time) {
    PUFF.forEach(function (b) {
      if (b.life < 0) return;
      if (b.delay > 0) {
        b.delay -= dt;
        b.m.visible = false;
        if (OCT.mouth) { OCT.mouth.getWorldPosition(b.m.position); b.m.position.addScaledVector(mouthN, 0.06); }
        return;
      }
      b.life += dt;
      b.vel.y += 0.85 * dt;
      b.vel.multiplyScalar(Math.exp(-1.5 * dt));
      b.m.position.addScaledVector(b.vel, dt);
      b.m.position.x += Math.sin(time * 5 + b.seed) * 0.11 * dt;
      b.m.position.z += Math.cos(time * 4.3 + b.seed) * 0.09 * dt;
      var sz = b.size * (1 + b.life * 0.12), wob = 1 + Math.sin(time * 9 + b.seed) * 0.08;
      b.m.scale.set(sz * wob, sz * (2 - wob), sz * wob);
      b.m.material.uniforms.uOpacity.value = smooth(0, 0.15, b.life) * (1 - smooth(3.2, 4.6, b.life)) * 1.1;
      b.m.visible = true;
      if (b.life > 4.6) { b.life = -1; b.m.visible = false; }
    });
  }

  bubbles.material.blending = THREE.NormalBlending;
  burst.material.blending = THREE.NormalBlending;
  PUFF.forEach(function (b) { b.m.material.blending = THREE.NormalBlending; });

  var rt = null;
  var post = new THREE.Mesh((function () {
    var g = new THREE.BufferGeometry();
    g.setAttribute("position", new THREE.BufferAttribute(new Float32Array([-1, -1, 0, 3, -1, 0, -1, 3, 0]), 3));
    g.setAttribute("uv", new THREE.BufferAttribute(new Float32Array([0, 0, 2, 0, 0, 2]), 2));
    return g;
  })(), new THREE.ShaderMaterial({
    depthTest: false, depthWrite: false,
    uniforms: {
      tDiffuse: { value: null }, uTime: U.time, uDistort: { value: 0 }, uAspect: { value: 1 },
      uRip: { value: [new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99), new THREE.Vector3(0, 0, 99)] },
      uExposure: { value: 1 }, uRes: { value: new THREE.Vector2(1, 1) }
    },
    vertexShader: "varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }",
    fragmentShader: [
      "uniform sampler2D tDiffuse; uniform float uTime; uniform float uDistort; uniform float uAspect; uniform vec3 uRip[3]; uniform float uExposure; uniform vec2 uRes;",
      "varying vec2 vUv;",
      "float hash(vec2 p){ return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }",
      "void main(){",
      "  vec2 uv = vUv;",
      "  vec2 w = vec2(sin(uv.y * 9.0 + uTime * 0.7), cos(uv.x * 7.0 + uTime * 0.55)) * 0.0011;",
      "  w += vec2(sin(uv.y * 16.0 + uTime * 1.9 + sin(uv.x * 5.0)), cos(uv.x * 13.0 - uTime * 1.6)) * 0.011 * uDistort;",
      "  for (int i = 0; i < 3; i++) {",
      "    vec2 d = (uv - uRip[i].xy) * vec2(uAspect, 1.0);",
      "    float dist = length(d); float age = uRip[i].z;",
      "    float ring = sin(dist * 55.0 - age * 8.0) * exp(-dist * 5.0) * exp(-age * 1.3) * smoothstep(0.0, 0.35, age) * (1.0 - smoothstep(age * 0.3, age * 0.3 + 0.07, dist));",
      "    w += normalize(d + 0.00001) * ring * 0.0055;",
      "  }",
      "  vec4 col = texture2D(tDiffuse, uv + w);",
      "  float v = smoothstep(1.3, 0.3, length((uv - 0.5) * vec2(uAspect * 0.85, 1.0)));",
      "  col.rgb = mix(col.rgb * vec3(0.86, 0.84, 0.94), col.rgb, v) * uExposure;",
      "  vec3 over = max(col.rgb - 0.8, 0.0);",
      "  col.rgb = min(col.rgb, vec3(0.8)) + 0.2 * (1.0 - exp(-over / 0.2));",
      "  col.rgb += (hash(uv * uRes + fract(uTime) * 91.0) - 0.5) * 0.006;",
      "  gl_FragColor = col;",
      "  #include <tonemapping_fragment>",
      "  #include <colorspace_fragment>",
      "}"
    ].join("\n")
  }));
  post.frustumCulled = false;
  var postScene = new THREE.Scene();
  postScene.add(post);
  var postCam = new THREE.Camera();
  var ripIndex = 0;
  function ripple(x, y) {
    var r = post.material.uniforms.uRip.value[ripIndex];
    r.set(x, y, 0);
    ripIndex = (ripIndex + 1) % 3;
  }

  function makeTarget(w, h) {
    if (rt) rt.dispose();
    rt = new THREE.WebGLRenderTarget(w, h, {
      type: gl2 ? THREE.HalfFloatType : THREE.UnsignedByteType,
      samples: Q.samples,
      depthBuffer: true
    });
    post.material.uniforms.tDiffuse.value = rt.texture;
  }

  var W = 1, H = 1, aspect = 1;
  function resize() {
    W = Math.max(1, canvas.clientWidth || window.innerWidth);
    H = Math.max(1, canvas.clientHeight || window.innerHeight);
    aspect = W / H;
    var pw = Math.floor(W * dpr), ph = Math.floor(H * dpr);
    renderer.setSize(pw, ph, false);
    camera.aspect = aspect;
    camera.updateProjectionMatrix();
    makeTarget(pw, ph);
    post.material.uniforms.uAspect.value = aspect;
    post.material.uniforms.uRes.value.set(pw, ph);
    burst.material.uniforms.uAspect.value = aspect;
    particles.material.uniforms.uPR.value = dpr;
    sweep.position.set(0, 7, -5.5);
    small = coarse || window.innerWidth < 760;
    layout();
  }

  var BASE = { ox: 0.4, oy: 0.1, od: 7, oyaw: 0, opitch: 0, oroll: 0, follow: 1.5, gaze: 0.6, camY: 0, camPitch: 0, camX: 0, camYaw: 0, fov: 42, fog: 0.034, water: 0, shaft: 1, caust: 1, glass: 0.3, exposure: 1 };
  var KEYS = Object.keys(BASE);
  var DEFS = [
    { s: 0, p: { ox: 0.47, oy: 0.3, od: 6.6, oyaw: -0.3, camY: 0, shaft: 1.1, glass: 0.55, fov: 42, camX: 0.3 }, m: { ox: 0.28, oy: 0.4, od: 7.8 } },
    { sel: "#top", f: 0.72, p: { ox: 0.04, oy: -0.5, od: 11, oyaw: -0.35, opitch: -0.08, camY: -0.4, glass: 0.3, fov: 44, camX: 0, camYaw: 0.03 }, m: { ox: 0.5, oy: 0.66, od: 10.5 } },
    { sel: "#services", f: 0.0, p: { ox: -0.15, oy: -1.55, od: 12, oyaw: 0.3, opitch: -0.3, camY: -0.8, follow: 1.8, fov: 41 }, m: { ox: 0.66, oy: 0.7, od: 11, opitch: 0 } },
    { sel: "#services", f: 0.14, p: { ox: -0.6, oy: 0.12, od: 9.6, oyaw: 0.55, camY: -1, fog: 0.036, glass: 0.2, fov: 40, camX: -0.9, camYaw: 0.05 }, m: { ox: 0.72, oy: 0.74, od: 11 } },
    { sel: "#services", f: 0.82, p: { ox: -0.64, oy: -0.3, od: 10, oyaw: 0.5, opitch: -0.1, camY: -1.4, camX: -0.6, fov: 41 }, m: { ox: 0.78, oy: 0.78, od: 11 } },
    { sel: "#skills", f: 0.4, p: { ox: 0.28, oy: 1.7, od: 11, oyaw: -0.2, opitch: 0.55, oroll: 0.3, camY: -1.8, shaft: 1.3, follow: 1.2, fov: 45, camX: 0.7, camYaw: -0.04, camPitch: 0.05 }, m: { ox: 0.3, oy: 1.8 } },
    { sel: "#projects", f: 0.02, p: { ox: 0.7, oy: 0.52, od: 12.5, oyaw: -0.5, camY: -2.3, shaft: 1.2, fov: 42, camX: 0.2, camYaw: 0 }, m: { ox: 0.8, oy: 0.8, od: 11 } },
    { sel: '.work_tatiana[data-project="hotel-sriwidjaja"]', f: 0.3, p: { ox: -0.93, oy: -0.8, od: 7.4, oyaw: 0.7, opitch: -0.3, oroll: -0.15, camY: -2.6, shaft: 0.9, camX: 0.5, camYaw: -0.03, fov: 41 }, m: { ox: 1.0, oy: 0.82, od: 8.5, oyaw: -0.7 } },
    { sel: '.work_tatiana[data-project="egg-timer"]', f: 0.3, p: { ox: 0.94, oy: -0.74, od: 7.4, oyaw: -0.7, opitch: -0.3, oroll: 0.15, camY: -3, camX: -0.5, camYaw: 0.03 }, m: { ox: -1.0, oy: 0.82, od: 8.5, oyaw: 0.7 } },
    { sel: '.work_tatiana[data-project="tourify"]', f: 0.3, p: { ox: -0.9, oy: 0.74, od: 8, oyaw: 0.6, opitch: 0.3, camY: -3.4, camX: 0.4, camYaw: -0.02 }, m: { ox: 1.0, oy: 0.82, od: 8.5, oyaw: -0.7 } },
    { sel: "#experience", f: 0.3, p: { ox: 0.66, oy: 0.06, od: 9.2, oyaw: -0.6, camY: -3.8, fog: 0.036, water: 0.25, camX: 0.9, camYaw: -0.05, fov: 43 }, m: { ox: 0.78, oy: 0.8, od: 11 } },
    { sel: "#experience", f: 0.86, p: { ox: 0.62, oy: -0.22, od: 9.8, oyaw: -0.55, camY: -4.2, camX: 0.6, fov: 42 }, m: { ox: 0.78, oy: 0.8, od: 11 } },
    { sel: "#education", f: 0.42, p: { ox: 0.66, oy: -0.52, od: 8.2, oyaw: -0.5, opitch: -0.14, camY: -5.4, camPitch: -0.2, fog: 0.038, water: 0.45, caust: 1.6, fov: 38, camX: -0.4, camYaw: 0.04 }, m: { ox: 0.6, oy: -0.84, od: 10 } },
    { sel: "#about", f: 0.14, p: { ox: 0.6, oy: -1.75, od: 7, oyaw: -0.4, opitch: 0.3, camY: -5, camPitch: -0.1, water: 0.55, fov: 42, camX: 0, camYaw: 0 }, m: { ox: 0.6, oy: -1.85 } },
    { sel: "#about", f: 0.7, p: { ox: -1.75, oy: -1.85, od: 7, oyaw: 0.9, opitch: 0, camY: -5.05 }, m: { ox: -1.9, oy: -1.9 } },
    { sel: ".interlude_tatiana", f: 0.1, wipe: true, p: { ox: -1.6, oy: 0.06, od: 3.6, oyaw: 1.3, oroll: 0.15, follow: 4, gaze: 0, camY: -5.1, camPitch: -0.05, fov: 46 }, m: { ox: -2.2 } },
    { sel: ".interlude_tatiana", f: 0.5, wipe: true, p: { ox: 0, oy: 0.02, od: 2.6, oyaw: 1.25, opitch: 0.1, follow: 4.5, gaze: 0 } },
    { sel: ".interlude_tatiana", f: 0.9, wipe: true, p: { ox: 1.8, oy: -0.1, od: 3.6, oyaw: 1.2, follow: 4, gaze: 0, fov: 45 }, m: { ox: 2.4 } },
    { sel: "#contact", f: 0.3, p: { ox: 0.66, oy: 0.6, od: 15, oyaw: -0.3, follow: 1.1, camY: -5.3, camPitch: -0.05, fog: 0.04, water: 0.75, shaft: 0.7, glass: 0.5, caust: 0.55, fov: 40, camX: 0.3, camYaw: -0.02 }, m: { ox: 0.5, oy: 0.72, od: 16 } },
    { sel: ".finale_tatiana", f: 1, p: { ox: 0.1, oy: 0.05, od: 26, oyaw: 0, camY: -5.6, water: 1, shaft: 0.35, glass: 0.6, exposure: 0.95, caust: 0.3, fov: 35, camX: 0, camYaw: 0 }, m: { ox: 0.2, oy: 0.3 } }
  ];
  var KF = [], EV = [], maxScroll = 1, vh = 1;
  function docTop(el) { var r = el.getBoundingClientRect(); return { top: r.top + window.scrollY, h: r.height }; }
  function layout() {
    vh = window.innerHeight;
    maxScroll = Math.max(1, document.documentElement.scrollHeight - vh);
    function at(sel, f) {
      var el = document.querySelector(sel);
      if (!el || el.classList.contains("is-hidden_tatiana")) return null;
      var b = docTop(el);
      return clamp(b.top + f * b.h - vh * 0.5, 0, maxScroll);
    }
    var portrait = small || aspect < 0.95;
    var prev = BASE;
    KF = [];
    DEFS.forEach(function (d) {
      if (d.wipe && reduceMotion) return;
      var s = d.s === 0 ? 0 : at(d.sel, d.f);
      if (s == null) return;
      var k = {};
      KEYS.forEach(function (key) { k[key] = prev[key]; });
      k.follow = BASE.follow; k.gaze = BASE.gaze;
      Object.keys(d.p).forEach(function (key) { k[key] = d.p[key]; });
      if (portrait && d.m) Object.keys(d.m).forEach(function (key) { k[key] = d.m[key]; });
      k.s = s;
      prev = k;
      KF.push(k);
    });
    KF.sort(function (a, b) { return a.s - b.s; });
    function top(sel) { var el = document.querySelector(sel); return el ? clamp(docTop(el).top - vh * 0.78, 0, maxScroll) : null; }
    EV = [];
    function ev(type, c, w, amt) { if (c != null) EV.push({ type: type, c: c, w: w, amt: amt || 1 }); }
    ev("depth", top("#services"), vh * 0.55);
    ev("bubbles", top("#skills"), vh * 0.6);
    ev("beam", top("#projects"), vh * 0.6);
    Array.prototype.slice.call(document.querySelectorAll(".work_tatiana")).forEach(function (w) {
      if (!w.classList.contains("is-hidden_tatiana")) ev("distort", clamp(docTop(w).top - vh * 0.55, 0, maxScroll), vh * 0.3, 0.55);
    });
    ev("plant", top("#experience"), vh * 0.55);
    ev("depth", top("#education"), vh * 0.55);
    ev("distort", top("#about"), vh * 0.45, 1);
    ev("bubbles2", top("#contact"), vh * 0.5);
  }

  var frame = {};
  function sample(s) {
    var n = KF.length;
    if (!n) { KEYS.forEach(function (k) { frame[k] = BASE[k]; }); return frame; }
    var a = KF[0], b = KF[0];
    if (s <= KF[0].s) { a = b = KF[0]; }
    else if (s >= KF[n - 1].s) { a = b = KF[n - 1]; }
    else {
      for (var i = 0; i < n - 1; i++) { if (s >= KF[i].s && s < KF[i + 1].s) { a = KF[i]; b = KF[i + 1]; break; } }
    }
    var t = a === b ? 0 : (s - a.s) / Math.max(1, b.s - a.s);
    t = t * t * (3 - 2 * t);
    KEYS.forEach(function (k) { frame[k] = lerp(a[k], b[k], t); });
    return frame;
  }
  var evOut = { depth: 0, depthRamp: 0, bubbles: -1, beam: -1, distort: 0, plant: -1 };
  function events(s) {
    evOut.depth = 0; evOut.depthRamp = 0; evOut.bubbles = -1; evOut.beam = -1; evOut.distort = 0; evOut.plant = -1;
    if (reduceMotion) return evOut;
    EV.forEach(function (e) {
      var p = (s - (e.c - e.w)) / (2 * e.w);
      var bump = Math.max(0, 1 - Math.abs(p - 0.5) * 2);
      bump = bump * bump * (3 - 2 * bump);
      if (e.type === "depth") { evOut.depth += bump; evOut.depthRamp += smooth(0, 1, p); }
      else if (e.type === "distort") evOut.distort += bump * e.amt;
      else if ((e.type === "bubbles" || e.type === "bubbles2") && p > 0 && p < 1) evOut.bubbles = p;
      else if (e.type === "beam" && p > 0 && p < 1) evOut.beam = p;
      else if (e.type === "plant" && p > 0 && p < 1) evOut.plant = p;
    });
    return evOut;
  }

  var pointer = { x: 0, y: 0, sx: 0, sy: 0, px: -1, py: -1, active: false, last: 0, force: 0, vx: 0, vy: 0 };
  window.addEventListener("pointermove", function (e) {
    var nx = e.clientX / window.innerWidth * 2 - 1;
    var ny = -(e.clientY / window.innerHeight * 2 - 1);
    pointer.vx = nx - pointer.x; pointer.vy = ny - pointer.y;
    pointer.ax = clamp((pointer.ax || 0) + pointer.vx, -0.35, 0.35); pointer.ay = clamp((pointer.ay || 0) + pointer.vy, -0.35, 0.35);
    pointer.x = nx; pointer.y = ny;
    pointer.px = e.clientX; pointer.py = e.clientY;
    pointer.active = e.pointerType !== "touch";
    pointer.last = clock.elapsedTime;
    pointer.force = Math.min(1.4, pointer.force + Math.hypot(pointer.vx, pointer.vy) * 3);
  }, { passive: true });
  document.addEventListener("pointerleave", function () { pointer.active = false; });
  window.addEventListener("mouseout", function (e) { if (!e.relatedTarget) pointer.active = false; });
  window.addEventListener("blur", function () { pointer.active = false; });
  window.addEventListener("pointerdown", function (e) {
    ripple(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight);
    pointer.force = 1.6;
    pointer.x = e.clientX / window.innerWidth * 2 - 1;
    pointer.y = -(e.clientY / window.innerHeight * 2 - 1);
    if (!e.target.closest || !e.target.closest("a, button, input, .viewer_tatiana")) pointer.down = true;
    FRAMES.forEach(function (f) {
      var r = f.fig.getBoundingClientRect();
      if (!f.ready || e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) return;
      var ux = (e.clientX - (r.left + r.width / 2)) / (r.width / 2), uy = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
      f.ry.v += ux * 1.9; f.rx.v -= uy * 1.5; f.rz.v += ux * 0.3; f.tz.v -= 0.7; f.ty.v -= uy * 0.2;
    });
  }, { passive: true });

  var ATTN = ".craft_tatiana, .work__stage_tatiana, .work__title_tatiana a, .btn_tatiana, .link-quiet_tatiana, .tl_tatiana, .reach__item_tatiana, .way_tatiana, .skills__group_tatiana, .edu__card_tatiana, .filter_tatiana, .hero__photo_tatiana, .about__photo_tatiana, .nav__brand_tatiana, .section__title_tatiana, .hero__title_tatiana h1";
  var MAJOR = ".craft_tatiana, .work__stage_tatiana, .reach__item_tatiana, .way_tatiana, .tl_tatiana";
  var attn = { el: null, w: 0, nod: 0 };
  document.addEventListener("pointerover", function (e) {
    if (e.pointerType === "touch") return;
    var el = e.target.closest ? e.target.closest(ATTN) : null;
    if (el === attn.el) return;
    attn.el = el;
    if (el) {
      attn.nod = 1;
      OCT.tentacles.forEach(function (t) { t.curl.v += 1.4; t.side.v += (rnd() - 0.5) * 1.2; });
      if (el.matches(MAJOR)) { ripple(e.clientX / window.innerWidth, 1 - e.clientY / window.innerHeight); pointer.force = 1.5; }
    }
  });
  document.addEventListener("focusin", function (e) {
    var el = e.target.closest ? e.target.closest(ATTN) : null;
    if (el) { attn.el = el; attn.nod = 1; }
  });

  var tilts = [];
  Array.prototype.slice.call(document.querySelectorAll(".work__stage_tatiana")).forEach(function (el, i) {
    var t = { el: el, seed: i * 1.91 + 0.4, ux: 0, uy: 0, over: 0,
      rx: new Spr(2.8, 0.45), ry: new Spr(2.8, 0.45), mx: new Spr(2.5, 0.7), lift: new Spr(2.4, 0.6), dy: new Spr(2.2, 0.5) };
    el.addEventListener("pointermove", function (e) {
      if (e.pointerType === "touch") return;
      var r = el.getBoundingClientRect();
      t.ux = (e.clientX - r.left) / r.width - 0.5; t.uy = (e.clientY - r.top) / r.height - 0.5; t.over = 1;
    });
    el.addEventListener("pointerleave", function () { t.over = 0; t.ux = 0; t.uy = 0; });
    tilts.push(t);
  });
  var depthEls = [];
  function addDepth(sel, lag, par) {
    Array.prototype.slice.call(document.querySelectorAll(sel)).forEach(function (el) { depthEls.push({ el: el, lag: lag, par: par, y: new Spr(2.6, 0.9) }); });
  }
  addDepth(".hero__title_tatiana h1", 0.22, 0.05);
  addDepth(".section__title_tatiana", 0.3, 0.06);
  addDepth(".section__note_tatiana", 0.16, -0.03);
  addDepth(".craft__name_tatiana", 0.2, 0.025);
  addDepth(".skills__group_tatiana:nth-child(odd) .chips_tatiana", 0.26, 0.06);
  addDepth(".skills__group_tatiana:nth-child(even) .chips_tatiana", 0.14, -0.05);
  addDepth(".work__title_tatiana", 0.24, 0.03);
  addDepth(".tl__role_tatiana", 0.2, 0.025);
  addDepth(".edu__school_tatiana", 0.28, 0.05);
  addDepth(".way_tatiana h3", 0.18, 0.02);
  addDepth(".contact__title_tatiana", 0.26, 0.05);

  function updateDom(dt, time) {
    var H = window.innerHeight;
    var lagPx = clamp(state.s - window.scrollY, -900, 900);
    var fine = !small && !reduceMotion;
    depthEls.forEach(function (d) {
      var r = d.el.getBoundingClientRect();
      if (r.bottom < -300 || r.top > H + 300) { if (d.y.x !== 0) { d.y.set(0); d.el.style.translate = ""; } return; }
      var target = fine ? clamp(-lagPx * d.lag * 0.12, -34, 34) + clamp((r.top + r.height / 2 - H / 2) * d.par, -40, 40) : 0;
      var y = d.y.step(target, dt);
      d.el.style.translate = Math.abs(y) < 0.05 ? "" : "0 " + y.toFixed(2) + "px";
    });
    tilts.forEach(function (t) {
      var r = t.el.getBoundingClientRect();
      if (r.bottom < -100 || r.top > H + 100) return;
      var s = t.seed;
      var drag = clamp(state.sv / 3000, -1, 1);
      var iRx = reduceMotion ? 0 : (Math.sin(time * 0.29 + s) * 0.6 + Math.sin(time * 0.13 + s * 2) * 0.4) * 0.9;
      var iRy = reduceMotion ? 0 : (Math.sin(time * 0.21 + s * 1.7) * 0.6 + Math.sin(time * 0.11 + s) * 0.4) * 1.3;
      var iDy = reduceMotion ? 0 : (Math.sin(time * 0.37 + s) * 0.6 + Math.sin(time * 0.19 + s * 2.3) * 0.4) * 5;
      var st = t.el.style;
      st.setProperty("--rx", t.rx.step(iRx - t.uy * 7 * t.over + drag * 3, dt).toFixed(3) + "deg");
      st.setProperty("--ry", t.ry.step(iRy + t.ux * 10 * t.over, dt).toFixed(3) + "deg");
      st.setProperty("--mx", t.mx.step(t.ux * t.over, dt).toFixed(3));
      st.setProperty("--lift", t.lift.step(t.over, dt).toFixed(3));
      st.setProperty("--fy", (t.dy.step(iDy + drag * 10, dt)).toFixed(2) + "px");
    });
  }

  var clock = new THREE.Clock();
  var state = {
    s: window.scrollY, sPrev: window.scrollY, sv: 0,
    cam: new THREE.Vector3(), oLocal: new THREE.Vector3(), oPos: new THREE.Vector3(), oPrev: new THREE.Vector3(), oVel: new THREE.Vector3(),
    yaw: 0, yawV: 0, pitch: 0, pitchV: 0, roll: 0, rollV: 0,
    started: false, introT: 0, blinkAt: 2.5, blinkT: -1, frames: 0, slowFrames: 0, tier: 0,
    sVel: 0, camPrev: new THREE.Vector3(), oPrevVel: new THREE.Vector3(), oAcc: new THREE.Vector3(),
    camS: { y: new Spr(1.5, 1), x: new Spr(1.3, 1), p: new Spr(1.5, 1), yaw: new Spr(1.3, 1), fov: new Spr(1.2, 1, 42), px: new Spr(1.6, 1), py: new Spr(1.6, 1) },
    flowX: new Spr(1.2, 1), flowZ: new Spr(1.2, 1),
    gw: new Spr(1.1, 1), gx: new Spr(2.2, 0.9), gy: new Spr(2.2, 0.9), nod: new Spr(5, 0.5),
    oS: { x: new Spr(1.8, 1), y: new Spr(1.8, 1), z: new Spr(1.5, 1) },
    rS: { yaw: new Spr(1.25, 0.85), pitch: new Spr(1.3, 0.85), roll: new Spr(1.4, 0.7) },
    hS: { yaw: new Spr(3.4, 0.68), pitch: new Spr(3.4, 0.68), roll: new Spr(3, 0.6) },
    skS: { yaw: new Spr(2.1, 0.42), pitch: new Spr(2.1, 0.42), roll: new Spr(2, 0.45) },
    squash: new Spr(5.5, 0.32), mouthJ: new Spr(8.5, 0.28),
    rayX: new Spr(3.2, 0.95), rayY: new Spr(3.2, 0.95), forceS: new Spr(3, 1), pushX: new Spr(1.8, 1, 0), pushZ: new Spr(1.8, 1, -99), pushA: new Spr(1.5, 1),
    pupS: [{ x: new Spr(13, 0.8), y: new Spr(13, 0.8) }, { x: new Spr(12.3, 0.82), y: new Spr(12.3, 0.82) }],
    eg: { x: new Spr(7.5, 0.86), y: new Spr(7.5, 0.86) },
    look: { next: 1.2, x: 0, y: 0.05, tilt: 0, away: false, mNext: 0, mx: 0, my: 0 },
    xp: { widen: new Spr(7, 0.62), squint: new Spr(4.5, 0.85), dil: new Spr(3.6, 0.85, 1), blush: new Spr(2, 1, 0.86), tilt: new Spr(2.4, 0.72), perk: new Spr(4.2, 0.6), mouth: new Spr(4.6, 0.55) },
    notice: 0, surprise: 0, lastActive: -99, wasActive: false, lastPtr: { x: 0, y: 0.05 }, blinkQ: 0, mode: 0
  };
  state.sPrev = state.s;
  var tmpV2 = new THREE.Vector3(), tmpW2 = new THREE.Vector3(), tmpW3 = new THREE.Vector3(), tmpQ2 = new THREE.Quaternion();
  var tmpV = new THREE.Vector3(), tmpW = new THREE.Vector3(), tmpQ = new THREE.Quaternion(), tmpE = new THREE.Euler(0, 0, 0, "YXZ");
  var gazeV = new THREE.Vector3();
  var fogC = new THREE.Color(), topC = new THREE.Color(), botC = new THREE.Color();

  function spring(x, v, target, k, c, dt) {
    var n = Math.max(1, Math.ceil(dt / 0.012)), h = dt / n;
    for (var i = 0; i < n; i++) { v += ((target - x) * k - v * c) * h; x += v * h; }
    return [x, v];
  }
  function camLocalToWorld(nx, ny, d, out) {
    var hh = Math.tan(camera.fov * Math.PI / 360) * d;
    out.set(nx * hh * aspect, ny * hh, -d);
    return camera.localToWorld(out);
  }
  function elementNdc(el) {
    var r = el.getBoundingClientRect();
    if (r.bottom < 0 || r.top > window.innerHeight) return null;
    var cx = r.left + r.width / 2, cy = clamp(r.top + r.height / 2, 0, window.innerHeight);
    return { x: cx / window.innerWidth * 2 - 1, y: -(cy / window.innerHeight * 2 - 1) };
  }

  var HEADS = Array.prototype.slice.call(document.querySelectorAll(".section__title_tatiana, .work__title_tatiana, .hero__title_tatiana h1, .contact__title_tatiana, .edu__school_tatiana"));
  var glassEl = document.querySelector(".glass_tatiana");
  var paused = false;
  function isPaused() { return document.hidden || root.classList.contains("is-viewing_tatiana"); }

  function tick() {
    var rawDt = clock.getDelta();
    var dt = Math.min(rawDt, LOW ? 0.3 : 0.05);
    var now = clock.elapsedTime;
    if (isPaused()) { paused = true; setTimeout(function () { requestAnimationFrame(tick); }, 250); return; }
    if (paused) { paused = false; clock.getDelta(); dt = 0.016; }
    U.time.value += dt * (reduceMotion ? 0.3 : 1);
    var time = U.time.value;

    var intro = 1;
    if (state.started) {
      state.introT += Math.min(rawDt, 0.25);
      var it = reduceMotion ? 10 : state.introT;
      intro = smooth(0.15, 1.5, it);
      U.intro.value = intro;
      particles.material.uniforms.uOpacity.value = smooth(0.4, 1.5, it);
      bubbles.material.uniforms.uOpacity.value = smooth(0.7, 1.8, it);
      var rimK = smooth(0.9, 1.6, it), keyK = smooth(1.4, 2.3, it);
      rim.userData.k = rimK; key.userData.k = keyK;
      if (it > 0.3) root.classList.add("is-water_tatiana");
      if (it > 2.0) revealPage();
    } else {
      U.intro.value = 0; rim.userData.k = 0; key.userData.k = 0;
    }
    var introIn = 1 - smooth(0.8, 2.4, reduceMotion ? 10 : state.introT);

    var sTarget = window.scrollY;
    state.sPrev = state.s;
    if (reduceMotion) state.s += (sTarget - state.s) * damp(30, dt);
    else {
      var maxV = vh * 4.5, SW = 3.3;
      var sn = Math.max(1, Math.ceil(dt / 0.008)), shh = dt / sn;
      for (var si = 0; si < sn; si++) {
        state.sVel += (SW * SW * (sTarget - state.s) - 2 * SW * state.sVel) * shh;
        state.sVel = clamp(state.sVel, -maxV, maxV);
        state.s += state.sVel * shh;
      }
    }
    state.sv = (state.s - state.sPrev) / Math.max(dt, 0.001);
    var k = sample(state.s);
    var e = events(state.s);
    var prog = state.s / maxScroll;

    var CS = state.camS;
    var cY = CS.y.step(k.camY, dt), cX = CS.x.step(k.camX, dt), cP = CS.p.step(k.camPitch - e.depth * 0.03, dt);
    var cYaw = CS.yaw.step(k.camYaw, dt), cF = CS.fov.step(k.fov - e.depth * 2.5, dt);
    baseCam.position.set(cX + Math.sin(prog * 5.3) * 0.45, cY, -prog * TRAVEL - e.depthRamp * 4 + 8);
    baseCam.rotation.set(cP, cYaw, 0);
    baseCam.updateMatrixWorld();
    var pActive = pointer.active && now - pointer.last < 8;
    var px = CS.px.step(pActive ? pointer.x : 0, dt), py = CS.py.step(pActive ? pointer.y : 0, dt);
    var fx = (Math.sin(time * 0.13) * 0.6 + Math.sin(time * 0.071 + 1.3) * 0.4) * 0.07;
    var fy = (Math.sin(time * 0.17 + 0.4) * 0.6 + Math.sin(time * 0.093 + 2.1) * 0.4) * 0.055;
    state.camPrev.copy(camera.position);
    camera.position.copy(baseCam.position).add(tmpV.set(px * 0.24 + fx, py * 0.15 + fy, Math.sin(time * 0.061) * 0.08).applyQuaternion(baseCam.quaternion));
    camera.rotation.set(
      cP + py * 0.02 + Math.sin(time * 0.11 + 0.3) * 0.0045,
      cYaw - px * 0.03 + Math.sin(time * 0.083 + 1.1) * 0.005,
      Math.sin(time * 0.13) * 0.005 - px * 0.004
    );
    if (Math.abs(camera.fov - cF) > 0.0005) {
      camera.fov = cF;
      camera.updateProjectionMatrix();
      burst.material.uniforms.uTan.value = Math.tan(cF * Math.PI / 360);
    }
    camera.updateMatrixWorld();
    tmpV.subVectors(camera.position, state.camPrev).divideScalar(Math.max(dt, 0.001));
    grassMat.uniforms.uFlow.value.set(state.flowX.step(clamp(-tmpV.x * 0.08, -0.6, 0.6), dt), state.flowZ.step(clamp(-tmpV.z * 0.05, -0.6, 0.6), dt));

    var fogD = k.fog + e.depth * 0.03 + introIn * 0.05;
    U.fogDensity.value = fogD;
    scene.fog.density = fogD;
    fogC.copy(C.fogShallow).lerp(C.fogDeep, k.water).lerp(C.dusk, 1 - intro);
    U.fogColor.value.copy(fogC);
    scene.fog.color.copy(fogC);
    topC.copy(C.topShallow).lerp(C.topDeep, k.water);
    botC.copy(C.botShallow).lerp(C.botDeep, k.water);
    backdrop.material.uniforms.uTop.value.copy(topC);
    backdrop.material.uniforms.uBot.value.copy(botC);
    backdrop.material.uniforms.uShaft.value = k.shaft * (0.92 + 0.08 * Math.sin(time * 0.07));
    backdrop.position.copy(camera.position);
    U.caust.value = k.caust * (0.82 + 0.1 * Math.sin(time * 0.37) + 0.08 * Math.sin(time * 0.13 + 2)) * intro + e.distort * 0.5;
    renderer.setClearColor(fogC, 1);

    var L = state.look;
    if (pActive && !state.wasActive && now - state.lastActive > 3) {
      state.notice = 1;
      if (state.blinkT < 0) state.blinkAt = Math.min(state.blinkAt, time + 0.6);
    }
    state.wasActive = pActive;
    if (pActive) { state.lastActive = now; state.lastPtr.x = pointer.x; state.lastPtr.y = pointer.y; }
    if (time > L.next) {
      var lx0 = L.x, ly0 = L.y, pick = rnd();
      L.away = false; L.tilt = 0;
      if (pick < 0.46) { L.x = (rnd() - 0.5) * 0.3; L.y = (rnd() - 0.5) * 0.2 + 0.05; }
      else if (pick < 0.8) { L.x = (rnd() - 0.5) * 1.5; L.y = (rnd() - 0.5) * 0.9; L.tilt = (rnd() - 0.5) * 0.18; L.away = true; }
      else {
        var seen = HEADS.map(elementNdc).filter(Boolean);
        if (seen.length) { var hp = seen[Math.floor(rnd() * seen.length)]; L.x = hp.x; L.y = hp.y; L.tilt = (rnd() - 0.5) * 0.12; L.away = true; }
      }
      L.next = time + (reduceMotion ? 7 : L.away ? 1.6 + rnd() * 2.4 : 2.8 + rnd() * 4);
      if (!reduceMotion && Math.hypot(L.x - lx0, L.y - ly0) > 0.6 && rnd() < 0.45 && state.blinkT < 0) state.blinkAt = time + 0.03;
    }
    if (time > L.mNext) {
      L.mx = reduceMotion ? 0 : (rnd() - 0.5) * 0.07; L.my = reduceMotion ? 0 : (rnd() - 0.5) * 0.05;
      L.mNext = time + 0.35 + rnd() * 1.2;
    }
    var gTarget = null, mode = 0;
    if (attn.el && document.contains(attn.el)) { gTarget = elementNdc(attn.el); if (gTarget) mode = 2; }
    if (!gTarget && pActive && now - pointer.last < 2.6) { gTarget = { x: pointer.x, y: pointer.y }; mode = 2; }
    if (!gTarget && pActive) { gTarget = L.away ? { x: L.x, y: L.y } : { x: pointer.x, y: pointer.y }; mode = 1; }
    if (!gTarget && now - state.lastActive < 0.9) { gTarget = { x: state.lastPtr.x, y: state.lastPtr.y }; mode = 1; }
    if (!gTarget) gTarget = { x: L.x, y: L.y };
    state.mode = mode;
    var engaged = mode === 2 ? 1 : mode === 1 ? 0.6 : 0;
    var gw = state.gw.step(engaged, dt);
    state.gx.w = state.gy.w = mode ? 2.4 : 1.05;
    var gnx = state.gx.step(gTarget.x, dt), gny = state.gy.step(gTarget.y, dt);
    var micro = mode === 2 ? 0.4 : 1;
    state.eg.x.w = state.eg.y.w = mode ? 7.5 : 3;
    var ex = state.eg.x.step(gTarget.x + L.mx * micro, dt), ey = state.eg.y.step(gTarget.y + L.my * micro, dt);

    var aspectK = lerp(1, 1.9, smooth(0.85, 0.45, aspect));
    var od = (k.od + introIn * 3) * aspectK;
    var hh0 = Math.tan(camera.fov * Math.PI / 360) * od;
    var ix = (Math.sin(time * 0.21) * 0.6 + Math.sin(time * 0.113 + 2) * 0.4) * 0.032;
    var iy = (Math.sin(time * 0.33 + 1) * 0.6 + Math.sin(time * 0.157) * 0.4) * 0.036;
    var iz = (Math.sin(time * 0.09 + 0.5) * 0.6 + Math.sin(time * 0.051 + 1.9) * 0.4) * 0.3;
    var lean = gw * (1 - k.follow / 6);
    var tgx = (k.ox + ix + (gnx - k.ox) * 0.05 * lean) * hh0 * aspect;
    var tgy = (k.oy + iy + (gny - k.oy) * 0.04 * lean - introIn * 0.35) * hh0;
    var tgz = -od + iz;
    var OS = state.oS, ow = k.follow * 1.15;
    OS.x.w = ow; OS.y.w = ow; OS.z.w = ow * 0.85;
    if (!state.init) { OS.x.set(tgx); OS.y.set(tgy); OS.z.set(tgz); state.init = true; }
    state.oLocal.set(OS.x.step(tgx, dt), OS.y.step(tgy, dt), OS.z.step(tgz, dt));
    state.oPrevVel.copy(state.oVel);
    state.oVel.set(OS.x.v, OS.y.v, OS.z.v).applyQuaternion(baseCam.quaternion);
    state.oAcc.subVectors(state.oVel, state.oPrevVel).divideScalar(Math.max(dt, 0.001));
    state.oPos.copy(state.oLocal);
    baseCam.localToWorld(state.oPos);
    octo.position.copy(state.oPos);

    camLocalToWorld(gnx, gny, Math.max(1.2, od * 0.35), tmpW);
    tmpW.sub(state.oPos).normalize();
    var camYawNow = camera.rotation.y;
    var gYaw = clamp(Math.atan2(tmpW.x, tmpW.z) - camYawNow, -1, 1) + camYawNow;
    var gPitch = clamp(-Math.asin(clamp(tmpW.y, -1, 1)), -0.6, 0.6);
    var gStr = k.gaze * (0.3 + 0.7 * gw);
    var baseYaw = k.oyaw + camYawNow;
    var idleYaw = (Math.sin(time * 0.19 + 0.7) * 0.6 + Math.sin(time * 0.071) * 0.4) * 0.09;
    var idlePitch = (Math.sin(time * 0.23 + 1.4) * 0.6 + Math.sin(time * 0.097 + 0.3) * 0.4) * 0.05;
    var idleRoll = (Math.sin(time * 0.17 + 2.3) * 0.6 + Math.sin(time * 0.061 + 1.1) * 0.4) * 0.045;
    var RS = state.rS;
    var rootYaw = RS.yaw.step(baseYaw + (gYaw - baseYaw) * gStr * 0.35 + idleYaw, dt);
    var nod = state.nod.step(attn.nod, dt);
    attn.nod = Math.max(0, attn.nod - dt * 1.6);
    var rootPitch = RS.pitch.step(k.opitch + (gPitch - k.opitch) * gStr * 0.3 + idlePitch, dt);
    var lateral = clamp(-(state.oVel.x * Math.cos(camYawNow) - state.oVel.z * Math.sin(camYawNow)) * 0.05, -0.4, 0.4);
    var rootRoll = RS.roll.step(k.oroll + lateral + idleRoll, dt);
    octo.rotation.set(rootPitch, rootYaw, rootRoll);

    tmpV2.set(pointer.x, pointer.y, 0.5).unproject(camera).sub(camera.position).normalize();
    tmpW2.copy(state.oPos); tmpW2.y += octoBody.position.y - 0.2;
    tmpW3.subVectors(tmpW2, camera.position);
    var along = tmpW3.dot(tmpV2);
    var dRay = Math.sqrt(Math.max(0, tmpW3.lengthSq() - along * along));
    var RAD = 1.3;
    var overO = pActive && along > 0 && dRay < RAD && !reduceMotion;
    if (overO !== !!state.overO) {
      state.overO = overO;
      root.classList.toggle("is-over-octopus_tatiana", overO);
      if (overO) { state.nod.v -= 0.8; OCT.tentacles.forEach(function (t) { t.curl.v += 0.8; }); }
    }
    if (pActive && along > 0 && !reduceMotion) {
      var fall = 1 - smooth(RAD * 0.7, RAD * 2.5, dRay);
      if (fall > 0) {
        var wX = (pointer.ax || 0) * hh0 * aspect, wY = (pointer.ay || 0) * hh0;
        OS.x.v += wX * 0.95 * fall; OS.y.v += wY * 0.95 * fall;
        RS.yaw.v += wX * 0.35 * fall; RS.roll.v -= wX * 0.2 * fall; RS.pitch.v -= wY * 0.16 * fall;
        OCT.tentacles.forEach(function (t) { t.side.v -= wX * 0.9 * fall; t.curl.v += (Math.abs(wX) + Math.abs(wY)) * 0.6 * fall; });
      }
    }
    pointer.ax = 0; pointer.ay = 0;
    if (pointer.down) {
      pointer.down = false;
      if (along > 0 && dRay < RAD && !reduceMotion) {
        tmpW3.copy(tmpW2).project(camera);
        var sxp = clamp((pointer.x - tmpW3.x) * 4, -1, 1), syp = clamp((pointer.y - tmpW3.y) * 4, -1, 1);
        OS.z.v -= 2.8; OS.x.v -= sxp * 1.5; OS.y.v -= syp * 1.1;
        RS.yaw.v -= sxp * 2.1; RS.pitch.v += syp * 1.5; RS.roll.v += sxp * 1.1;
        state.squash.v -= 1.5;
        OCT.tentacles.forEach(function (t) { t.curl.v += 4 + rnd() * 1.5; t.side.v += (rnd() - 0.5) * 2.2; });
        state.surprise = 1;
        if (state.blinkT < 0) state.blinkAt = time + 0.32;
        puff(7, 1.7);
      } else if (along > 0 && dRay < RAD * 2.8 && !reduceMotion) {
        state.surprise = Math.max(state.surprise, 0.35);
        state.notice = Math.max(state.notice, 0.5);
      }
    }
    if (time > puffAt) { puff(2 + Math.floor(rnd() * 3), 1); puffAt = time + 6 + rnd() * 7; }
    updatePuffs(dt, time);

    var HS = state.hS;
    var hYaw = HS.yaw.step(clamp((gYaw - rootYaw) * gStr, -0.55, 0.55) + Math.sin(time * 0.29 + 0.4) * 0.025, dt);
    var hPitch = HS.pitch.step(clamp((gPitch - rootPitch) * gStr, -0.38, 0.38) - nod * 0.2 + Math.sin(time * 0.37) * 0.018, dt);
    var XP = state.xp;
    var hTilt = XP.tilt.step(mode === 2 ? 0 : L.tilt, dt);
    var perk = XP.perk.step(-state.notice * 0.08 - state.surprise * 0.06, dt);
    headGroup.rotation.set(hPitch + perk, hYaw, HS.roll.step(-hYaw * 0.12, dt) + hTilt);
    var SS = state.skS;
    var skYaw = SS.yaw.step(hYaw * 0.8, dt), skPitch = SS.pitch.step(hPitch * 0.6 - clamp(state.oVel.y * 0.02, -0.2, 0.2), dt);
    skirt.rotation.set(skPitch, skYaw, SS.roll.step(hYaw * -0.06, dt));

    var pulse = reduceMotion ? 0 : Math.pow(Math.max(0, Math.sin(time * 0.42)), 10);
    var bob = (Math.sin(time * 0.55) * 0.6 + Math.sin(time * 0.29 + 1.3) * 0.4) * 0.07;
    octoBody.position.y = bob + pulse * 0.07;
    var speed = state.oVel.length();
    var sq = state.squash.step(clamp(speed * 0.011, 0, 0.07) - clamp(state.oAcc.y * 0.0025, -0.05, 0.05) + pulse * 0.03, dt);
    octoBody.scale.set(1 - sq * 0.5, 1 + sq, 1 - sq * 0.5);
    if (OCT.mouth) {
      var mj = state.mouthJ.step(clamp(HS.yaw.v * 0.06 + HS.pitch.v * 0.05, -0.12, 0.12) + pulse * 0.04, dt);
      var mx = XP.mouth.step(state.surprise * 0.12 + state.notice * 0.03 - (L.away && mode !== 2 ? 0.05 : 0), dt);
      OCT.mouth.scale.set(1 + mj + mx, 1 - mj * 0.6 + mx, 1);
    }

    tmpQ.copy(skirt.getWorldQuaternion(new THREE.Quaternion())).invert();
    tmpV.copy(state.oVel).applyQuaternion(tmpQ);
    var yawV = SS.yaw.v + RS.yaw.v * 0.6, pitV = SS.pitch.v + RS.pitch.v * 0.6;
    OCT.tentacles.forEach(function (t) {
      var drag = -(tmpV.x * t.radial.x + tmpV.z * t.radial.z) * 0.05 - tmpV.y * 0.045 + pitV * t.radial.z * 0.25;
      var cg = 0.52 + pulse * 0.55 + clamp(drag, -0.7, 0.9);
      var c = t.curl.step(cg, dt);
      var sg = clamp(-yawV * 0.32 - (tmpV.x * t.tangent.x + tmpV.z * t.tangent.z) * 0.035, -0.8, 0.8);
      var sd = t.side.step(sg, dt);
      t.bend.curl.value = c;
      t.bend.side.value = sd;
      t.bend.tip.value = clamp((t.tipC.step(c, dt) - c) * 1.6, -0.6, 0.6);
      t.bend.side.value += clamp((t.tipS.step(sd, dt) - sd) * 0.8, -0.3, 0.3);
      t.bend.sway.value = reduceMotion ? 0.2 : 1 + clamp(speed * 0.05, 0, 1);
    });

    camLocalToWorld(ex, ey, Math.max(1.2, od * 0.35), gazeV);
    var hoverO = state.overO ? 1 : 0;
    var widen = XP.widen.step(state.notice * 0.07 + state.surprise * 0.13 + (mode === 2 ? 0.015 : 0), dt);
    var squint = XP.squint.step(hoverO * 0.07, dt);
    var dil = XP.dil.step(1 + (mode === 2 ? 0.05 : 0) + hoverO * 0.05 + state.notice * 0.04 - state.surprise * 0.12, dt);
    U.blushAmt.value = XP.blush.step(0.86 + hoverO * 0.11 + state.notice * 0.03, dt);
    state.notice = Math.max(0, state.notice - dt * 1.2);
    state.surprise = Math.max(0, state.surprise - dt * 1.0);

    if (!reduceMotion && time > state.blinkAt && state.blinkT < 0) state.blinkT = 0;
    var blinkK = 1;
    if (state.blinkT >= 0) {
      state.blinkT += dt;
      var bt = state.blinkT;
      blinkK = bt < 0.075 ? 1 - 0.94 * smooth(0, 1, bt / 0.075) : 0.06 + 0.94 * smooth(0, 1, (bt - 0.075) / 0.13);
      if (bt > 0.205) {
        state.blinkT = -1; blinkK = 1;
        if (state.blinkQ > 0) { state.blinkQ--; state.blinkAt = time + 0.14; }
        else { state.blinkAt = time + 2.2 + rnd() * 5; state.blinkQ = rnd() < 0.18 ? 1 : 0; }
      }
    }

    headGroup.getWorldQuaternion(tmpQ2).invert();
    OCT.whites.forEach(function (eye, i) {
      eye.getWorldPosition(tmpW3);
      tmpV2.subVectors(gazeV, tmpW3).applyQuaternion(tmpQ2);
      var ax = Math.atan2(tmpV2.x, tmpV2.z), ay = Math.atan2(tmpV2.y, Math.hypot(tmpV2.x, tmpV2.z));
      var ux = clamp(ax / 0.42, -1.5, 1.5), uy = clamp(ay / 0.4, -1.5, 1.5);
      var um = Math.hypot(ux, uy);
      if (um > 1) { ux /= um; uy /= um; }
      var b = OCT.eyeBase[i], ps = state.pupS[i];
      var px = ps.x.step(b.x + ux * 0.044, dt), py = ps.y.step(b.y + uy * 0.058, dt);
      var lim = Math.hypot(px / (0.046 / dil), py / (0.062 / dil));
      if (lim > 1) { px /= lim; py /= lim; }
      var sz = Math.sqrt(Math.max(0.05, 1 - (px / 0.152) * (px / 0.152) - (py / 0.19) * (py / 0.19)));
      var p = OCT.pupils[i];
      p.position.set(px, py, 0.08 * sz - 0.024);
      p.rotation.set(-Math.asin(clamp(py / 0.19, -0.9, 0.9)) * 0.7, Math.asin(clamp(px / 0.152, -0.9, 0.9)) * 0.7, 0);
      OCT.pupilMesh[i].scale.set(0.1 * dil, 0.12 * dil, 0.045);
      OCT.glints[i].forEach(function (g) {
        var gb = g.userData.base;
        g.position.set(gb.x + (px - b.x) * 0.35, gb.y + (py - b.y) * 0.35, gb.z);
      });
      eye.scale.set(1 + widen * 0.35, (1 + widen - squint) * blinkK, 1);
    });

    var attnK = attn.el ? 1 : 0;
    attn.w += (attnK - attn.w) * damp(3, dt);
    var la = Math.sin(time * 0.037) * 0.45 + Math.sin(time * 0.019 + 1) * 0.2;
    key.position.copy(state.oPos).add(tmpV.set(3.5 * Math.cos(la) - 6 * Math.sin(la) * 0.4, 7 + Math.sin(time * 0.05) * 0.8, 6 * Math.cos(la) + 3.5 * Math.sin(la) * 0.4));
    key.target.position.copy(state.oPos);
    key.intensity = (2.4 + attn.w * 0.6) * (0.95 + 0.05 * Math.sin(time * 0.21)) * (key.userData.k || 0);
    rim.position.copy(state.oPos).add(tmpV.set(-5, 3, -6));
    rim.target.position.copy(state.oPos);
    rim.intensity = 2.6 * (rim.userData.k || 0);
    hemi.intensity = 0.7 * (key.userData.k || 0) + 0.05;
    fill.position.copy(state.oPos).add(tmpV.set(-1.2, 0.6, 3.6).applyQuaternion(camera.quaternion));
    fill.intensity = (9 + attn.w * 3) * (key.userData.k || 0);
    key.target.updateMatrixWorld(); rim.target.updateMatrixWorld();

    var fh = FLOOR + floorH(state.oPos.x, state.oPos.z);
    shadowBlob.position.set(state.oPos.x, fh + 0.05, state.oPos.z);
    shadowBlob.material.uniforms.uA.value = clamp(1 - (state.oPos.y - fh) / 6, 0, 1) * 0.55 * intro;

    shafts.forEach(function (m) {
      m.rotation.set(0, Math.atan2(camera.position.x - m.position.x, camera.position.z - m.position.z), m.userData.tilt, "YXZ");
      m.material.uniforms.uI.value = k.shaft * m.userData.base * (0.8 + 0.2 * Math.sin(time * 0.09 + m.userData.tilt * 20)) * smooth(0.8, 1.9, reduceMotion ? 10 : state.introT) * (1 + (e.beam > 0 ? Math.sin(e.beam * Math.PI) * 0.6 : 0));
    });
    if (e.beam > 0) {
      sweep.visible = true;
      sweep.position.set(lerp(-7, 7, e.beam), 7, -5.5);
      sweep.rotation.set(0, 0, lerp(0.55, -0.45, e.beam));
      sweep.material.uniforms.uI.value = Math.sin(e.beam * Math.PI) * 6;
    } else sweep.visible = false;

    if (e.bubbles > 0) { burst.visible = true; burst.material.uniforms.uP.value = e.bubbles; } else burst.visible = false;
    if (e.plant > 0) {
      wipeGroup.visible = true;
      var hw = Math.tan(camera.fov * Math.PI / 360) * 2.4 * aspect;
      wipeGroup.position.x = lerp(-hw - 2.2, hw + 2.2, e.plant);
      wipeMat.uniforms.uA.value = smooth(0, 0.12, e.plant) * (1 - smooth(0.88, 1, e.plant));
    } else wipeGroup.visible = false;

    var pu = particles.material.uniforms;
    pu.uCam.value.copy(camera.position);
    pointer.force = Math.max(0, pointer.force - dt * 1.2);
    var rx = state.rayX.step(pointer.x, dt), ry = state.rayY.step(pointer.y, dt);
    tmpV.set(rx, ry, 0.5).unproject(camera).sub(camera.position).normalize();
    pu.uRayO.value.copy(camera.position); pu.uRayD.value.copy(tmpV);
    pu.uForce.value = Math.max(0, state.forceS.step(pointer.force, dt)) * (reduceMotion ? 0 : 1);
    pu.uDrift.value += clamp(state.sv / 3000, -1, 1) * dt * -0.6;
    bubbles.material.uniforms.uCam.value.copy(camera.position);
    bubbles.material.uniforms.uLift.value += clamp(Math.abs(state.sv) / 2500, 0, 1.5) * dt;
    var pushOn = 0;
    if (pActive) {
      tmpV.set(rx, ry, 0.5).unproject(camera).sub(camera.position).normalize();
      var tt = (FLOOR + 0.5 - camera.position.y) / (tmpV.y || -0.001);
      if (tt > 0 && tt < 40) { pushOn = 1; tmpW.copy(camera.position).addScaledVector(tmpV, tt); state.pushT = state.pushT || new THREE.Vector3(); state.pushT.copy(tmpW); }
    }
    if (state.pushT) {
      var pa = state.pushA.step(pushOn, dt);
      grassMat.uniforms.uPush.value.set(state.pushX.step(state.pushT.x, dt), lerp(-99, FLOOR, clamp(pa * 4, 0, 1)), state.pushZ.step(state.pushT.z, dt));
      grassMat.uniforms.uPushA.value = pa;
    }
    farGlass.material.uniforms.uI.value = smooth(0.55, 1, prog);

    var rips = post.material.uniforms.uRip.value;
    for (var ri = 0; ri < 3; ri++) rips[ri].z += dt;
    post.material.uniforms.uDistort.value = (e.distort + clamp(Math.abs(state.sv) / 5000, 0, 0.25)) * (reduceMotion ? 0 : 1);
    post.material.uniforms.uExposure.value = k.exposure * (0.7 + 0.3 * intro);

    if (glassEl) {
      glassEl.style.setProperty("--glass", (k.glass * intro).toFixed(3));
      glassEl.style.setProperty("--gx", px.toFixed(3));
      glassEl.style.setProperty("--seam-shift", (px * -8).toFixed(1) + "px");
    }
    updateFrames(dt, time, intro);
    updateDom(dt, time);

    renderer.setRenderTarget(rt);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
    renderer.render(postScene, postCam);

    if (state.started && state.introT > 3) {
      state.frames++;
      if (dt > 0.026) state.slowFrames++;
      if (state.frames >= 90) {
        if (state.slowFrames > 45 && state.tier < 2) {
          state.tier++;
          dpr = Math.max(1, dpr - 0.35);
          if (Q.samples) Q.samples = 0;
          if (state.tier === 2) particles.geometry.setDrawRange(0, Math.floor(Q.particles * 0.55));
          resize();
        }
        state.frames = 0; state.slowFrames = 0;
      }
    }
    requestAnimationFrame(tick);
  }

  resize();
  window.addEventListener("resize", resize);
  window.addEventListener("load", layout);
  if (window.ResizeObserver) {
    var lt;
    new ResizeObserver(function () { clearTimeout(lt); lt = setTimeout(layout, 120); }).observe(document.body);
  }
  Array.prototype.slice.call(document.querySelectorAll(".filter_tatiana")).forEach(function (b) {
    b.addEventListener("click", function () { setTimeout(layout, 620); ripple(0.5, 0.5); });
  });

  try {
    renderer.setRenderTarget(rt);
    renderer.compile(scene, camera);
    renderer.render(scene, camera);
    renderer.setRenderTarget(null);
  } catch (err) { fail(); return; }

  function start() { if (!state.started) { state.started = true; state.introT = 0; } }
  var fontsReady = document.fonts && document.fonts.ready ? document.fonts.ready : Promise.resolve();
  Promise.race([fontsReady, new Promise(function (r) { setTimeout(r, 1200); })]).then(start);
  requestAnimationFrame(tick);
  setTimeout(revealPage, 5000);
})();
