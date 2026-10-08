/* WearFairies — the live background shared by every page.
   Adds the moving silk, the gold glitter and the black lace behind the page.
   Each page has its own colour story, picked by data-wf on <html>:
     home       emerald, with a whisper of plum and papaya
     wardrobe   plum, fuchsia and papaya (the swirl reference)
     list       papaya and amber, with paradise rose
     auth       paradise rose, with emerald
     dashboard  palm frond, with papaya
     terms      vervain, with soft plum
   Moving between pages, the silk melts from the last page's colours into
   the new ones instead of snapping. */
(function(){
  function add(){
    if (document.getElementById('wf-silk')) return;
    var f = document.createDocumentFragment();
    var s = document.createElement('canvas'); s.id = 'wf-silk'; s.setAttribute('aria-hidden','true');
    var l = document.createElement('div'); l.className = 'wf-lace'; l.setAttribute('aria-hidden','true');
    var g = document.createElement('canvas'); g.id = 'wf-sparkle'; g.setAttribute('aria-hidden','true');
    f.appendChild(s); f.appendChild(l); f.appendChild(g);
    document.body.insertBefore(f, document.body.firstChild);
  }
  add();
})();

/* Colour stories. Each: [black, deep, jewel, glow] for the main silk, then
   [deep, jewel, glow] for the second colour that drifts through it, then
   how much of that second colour shows (0 = none, 1 = half and half). */
window.WF_PALETTES = {
  home:      { a:[[.004,.034,.024],[.012,.135,.088],[.024,.40,.25],[.11,.64,.45]],
               b:[[.10,.02,.08],[.34,.06,.24],[.88,.58,.42]], mix:.16 },
  wardrobe:  { a:[[.026,.003,.018],[.20,.02,.13],[.50,.05,.36],[.88,.44,.70]],
               b:[[.16,.05,.04],[.66,.36,.22],[.98,.80,.60]], mix:.38 },
  list:      { a:[[.035,.012,.004],[.22,.08,.012],[.66,.33,.03],[.98,.74,.40]],
               b:[[.17,.02,.07],[.50,.12,.24],[.93,.56,.64]], mix:.26 },
  auth:      { a:[[.030,.006,.008],[.22,.05,.06],[.60,.24,.26],[.96,.68,.62]],
               b:[[.14,.02,.09],[.40,.06,.26],[.88,.54,.70]], mix:.25 },
  dashboard: { a:[[.010,.022,.016],[.05,.14,.09],[.16,.32,.21],[.55,.74,.55]],
               b:[[.20,.08,.012],[.62,.31,.04],[.97,.76,.42]], mix:.28 },
  terms:     { a:[[.008,.014,.010],[.06,.11,.07],[.17,.28,.19],[.52,.66,.52]],
               b:[[.15,.03,.08],[.40,.10,.24],[.86,.56,.66]], mix:.25 }
};

/* LIVE SILK BACKGROUND
   Slow liquid swirls of coloured light moving through black, like cat-eye
   polish shifting under a lamp. Bends gently around the cursor or finger,
   keeps flowing as you scroll. Pauses when the tab is hidden, holds still for
   people who turn motion off, and falls back to a soft gradient on the rare
   phone without WebGL. */
(function(){
  var c = document.getElementById('wf-silk');
  if (!c) return;
  var key = document.documentElement.getAttribute('data-wf') || 'home';
  var P = window.WF_PALETTES, target = P[key] || P.home;
  var gl = c.getContext('webgl', {antialias:false, alpha:false, premultipliedAlpha:false, preserveDrawingBuffer:false});
  if (!gl){ c.classList.add('fallback'); return; }

  var vs = 'attribute vec2 a;void main(){gl_Position=vec4(a,0.,1.);}';
  var fs = [
    'precision highp float;',
    'uniform vec2 R;uniform float T;uniform vec2 M;uniform float S;',
    'uniform vec3 A0,A1,A2,A3,B1,B2,B3;uniform float X;',
    'uniform vec3 C0,C1,C2,C3,D1,D2,D3;uniform float Y;uniform float K;',
    'vec3 pal(vec3 a0,vec3 a1,vec3 a2,vec3 a3,vec3 b1,vec3 b2,vec3 b3,float x,float rib,float edge,float cloud){',
    ' vec3 ca=mix(a0,a1,smoothstep(.0,.35,rib)); ca=mix(ca,a2,smoothstep(.2,.8,rib)); ca=mix(ca,a3,smoothstep(.72,1.2,rib));',
    ' vec3 cb=mix(a0,b1,smoothstep(.0,.35,rib)); cb=mix(cb,b2,smoothstep(.2,.8,rib)); cb=mix(cb,b3,smoothstep(.72,1.2,rib));',
    ' vec3 col=mix(ca,cb,cloud*min(1.,x*1.9));',
    ' return col+mix(a3,b3,cloud*x)*edge*.14;',
    '}',
    'float h(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}',
    'float n(vec2 p){vec2 i=floor(p),f=fract(p);vec2 u=f*f*(3.-2.*f);',
    ' return mix(mix(h(i),h(i+vec2(1,0)),u.x),mix(h(i+vec2(0,1)),h(i+vec2(1,1)),u.x),u.y);}',
    'float fbm(vec2 p){float v=0.,a=.5;mat2 r=mat2(.8,.6,-.6,.8);',
    ' for(int i=0;i<4;i++){v+=a*n(p);p=r*p*2.03+3.1;a*=.5;}return v;}',
    'void main(){',
    ' float m=min(R.x,R.y);',
    ' vec2 p=(gl_FragCoord.xy-.5*R)/m*.95;',
    ' p.y+=S;',
    /* the pointer gently twists the silk around it */
    ' vec2 mp=(M-.5*R)/m*.95; mp.y+=S;',
    ' vec2 d=p-mp; float k=exp(-dot(d,d)*2.2)*.9;',
    ' float cs=cos(k),sn=sin(k); p=mp+mat2(cs,-sn,sn,cs)*d;',
    ' float t=T*.036;',
    ' vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)-t*.7));',
    ' vec2 w=vec2(fbm(p+1.9*q+vec2(1.7,9.2)+t*.9),fbm(p+1.9*q+vec2(8.3,2.8)-t*.8));',
    ' float f=fbm(p+2.2*w);',
    /* silk ribbons: smooth bands of light that fold and stretch with the flow */
    ' float g=f*7.5+w.x*3.-t*1.2;',
    ' float band=.5+.5*sin(g);',
    ' float lit=smoothstep(.25,.75,fbm(p*.7+q-t*.3));',
    ' float rib=pow(band,2.2)*(.25+.95*lit);',
    ' float edge=pow(band,14.)*lit;',
    ' float cloud=smoothstep(.44,.62,fbm(p*.55+q*.8+vec2(11.,-4.)+t*.35));',
    /* the old colours and the new ones, with the new flowing in along the
       folds of the silk like dye through fabric (never a flat grey fade) */
    ' vec3 oldc=pal(A0,A1,A2,A3,B1,B2,B3,X,rib,edge,cloud);',
    ' vec3 newc=pal(C0,C1,C2,C3,D1,D2,D3,Y,rib,edge,cloud);',
    ' float fld=clamp((fbm(p*.8+w*1.3+vec2(3.,7.))-.28)/.44,0.,1.)*.72+(1.-rib)*.28;',
    ' float pr=K*1.5-.25;',
    ' vec3 col=mix(oldc,newc,smoothstep(fld-.25,fld+.25,pr));',
    /* a hint of warm gold where the light is strongest, like the chrome */
    ' col+=vec3(.22,.16,.03)*edge*.45;',
    /* darker at the edges so the words always sit on calm ground */
    ' vec2 uv=gl_FragCoord.xy/R; float v=smoothstep(1.15,.25,length((uv-.5)*vec2(1.1,1.)));',
    ' col*=(.6+.4*v);',
    ' col+=(h(gl_FragCoord.xy+T)-.5)/255.*2.;',
    ' gl_FragColor=vec4(col,1.);',
    '}'
  ].join('\n');

  function sh(type, src){ var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { console.warn(gl.getShaderInfoLog(s)); return null; } return s; }
  var v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
  if (!v || !f){ c.classList.add('fallback'); return; }
  var pr = gl.createProgram(); gl.attachShader(pr, v); gl.attachShader(pr, f); gl.linkProgram(pr);
  if (!gl.getProgramParameter(pr, gl.LINK_STATUS)){ c.classList.add('fallback'); return; }
  gl.useProgram(pr);
  var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1,-1,3,-1,-1,3]), gl.STATIC_DRAW);
  var a = gl.getAttribLocation(pr, 'a'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0);
  function U(n){ return gl.getUniformLocation(pr, n); }
  var uR = U('R'), uT = U('T'), uM = U('M'), uS = U('S'), uX = U('X'), uY = U('Y'), uK = U('K');
  var uOld = ['A0','A1','A2','A3','B1','B2','B3'].map(U), uNew = ['C0','C1','C2','C3','D1','D2','D3'].map(U);

  /* flatten a palette into 7 colours + mix amount, so two can be blended */
  function flat(pal){ return { c: pal.a.concat(pal.b), x: pal.mix }; }
  function send(locs, ux, pal){
    for (var i = 0; i < 7; i++) gl.uniform3f(locs[i], pal.c[i][0], pal.c[i][1], pal.c[i][2]);
    gl.uniform1f(ux, pal.x);
  }
  function ease(k){ return k*k*k*(k*(k*6 - 15) + 10); }   /* very soft start and finish */
  var to = flat(target), from = to, shown = to, blendStart = -1, BLEND = 2800;

  /* Pick up exactly where the last page left off: the same colours on screen
     (even halfway through a melt), the same swirl shapes in the same places,
     the same twist and scroll drift. Then melt slowly into this page's colours. */
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var saved = null;
  try { saved = JSON.parse(sessionStorage.getItem('wfSilk') || 'null'); } catch(e) {}
  var fresh = !saved || !Array.isArray(saved.c) || saved.c.length !== 7 || typeof saved.at !== 'number' || (Date.now() - saved.at) > 30 * 60 * 1000;
  if (!fresh && !still){ from = { c: saved.c, x: saved.x }; shown = from; }

  /* the swirls are soft, so we draw at reduced size and let the browser
     scale it up: smooth on phones, no battery drain */
  var Q = 0.5, W = 1, H = 1;
  function size(){
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = Math.max(1, Math.round(window.innerWidth * dpr * Q));
    H = Math.max(1, Math.round(window.innerHeight * dpr * Q));
    c.width = W; c.height = H; gl.viewport(0, 0, W, H);
  }
  size(); window.addEventListener('resize', function(){ size(); draw(performance.now(), true); });

  var tx = -1, ty = -1, cx = .6, cy = .45, scroll = 0, sc = 0;
  var start = performance.now() - 40000;
  if (!fresh){
    start = performance.now() - (saved.t + (Date.now() - saved.at));
    if (typeof saved.cx === 'number'){ cx = saved.cx; cy = saved.cy; }
    if (typeof saved.sc === 'number'){ sc = saved.sc * window.innerHeight; }
  }
  window.addEventListener('pointermove', function(e){ tx = e.clientX / window.innerWidth; ty = e.clientY / window.innerHeight; }, {passive:true});
  window.addEventListener('scroll', function(){ scroll = window.scrollY; }, {passive:true});

  var raf = null, lastT = 0, frame = 0;
  var drift = window.__silkTime; /* previews can pin the clock */
  function remember(){
    try {
      sessionStorage.setItem('wfSilk', JSON.stringify({ c: shown.c, x: shown.x, t: lastT * 1000, at: Date.now(),
        cx: cx, cy: cy, sc: sc / window.innerHeight }));
    } catch(e) {}
  }
  function draw(now, once){
    var t = (drift != null ? drift : (now - start)) / 1000;
    lastT = t;
    if (!still){
      /* when nobody is touching it, the twist point wanders on its own */
      var idleX = .55 + Math.sin(t * .13) * .22, idleY = .45 + Math.cos(t * .1) * .18;
      var gx = tx < 0 ? idleX : tx, gy = ty < 0 ? idleY : ty;
      cx += (gx - cx) * .04; cy += (gy - cy) * .04;
      sc += (scroll - sc) * .06;
    }
    var k = 1;
    if (from !== to){
      if (blendStart < 0) blendStart = now;
      k = Math.min(1, Math.max(0, (now - blendStart) / BLEND));
      if (window.__silkBlend != null) k = window.__silkBlend;
    }
    send(uOld, uX, from); send(uNew, uY, to);
    gl.uniform1f(uK, ease(k));
    /* what to hand on to the next page: whichever colours fill most of the screen */
    shown = k >= .5 ? to : from;
    if (k >= 1 && window.__silkBlend == null) from = to;
    gl.uniform2f(uR, W, H);
    gl.uniform1f(uT, t);
    gl.uniform2f(uM, cx * W, (1 - cy) * H);
    gl.uniform1f(uS, -sc / window.innerHeight * .35);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    if (++frame % 20 === 0) remember();
    if (!still && !once) raf = requestAnimationFrame(draw);
  }
  window.__silkDraw = function(ms){ drift = ms; draw(performance.now(), true); };

  /* draw the very first frame right away, so the page never shows up bare */
  draw(performance.now(), true);
  addEventListener('pagehide', remember);
  document.addEventListener('visibilitychange', function(){
    if (document.hidden){ remember(); if (raf) cancelAnimationFrame(raf); raf = null; }
    else if (!raf && !still){ raf = requestAnimationFrame(draw); }
  });
  /* links inside the site: save the moment of the click too */
  document.addEventListener('click', function(e){
    var a = e.target.closest && e.target.closest('a[href]');
    if (a && a.origin === location.origin) remember();
  }, true);
  if (!still) raf = requestAnimationFrame(draw);
})();

/* A few specks of gold glitter twinkling over the silk, like the polish */
(function(){
  var c = document.getElementById('wf-sparkle'); if (!c) return;
  var x = c.getContext('2d');
  var still = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var W, H, dots = [], raf = null;
  var tint = getComputedStyle(document.documentElement).getPropertyValue('--spark2').trim() || '#d9ffd8';
  function size(){
    var d = Math.min(window.devicePixelRatio || 1, 2);
    W = innerWidth; H = innerHeight; c.width = W*d; c.height = H*d; x.setTransform(d,0,0,d,0,0);
    var n = Math.round(Math.min(46, W*H/26000));
    dots = [];
    for (var i = 0; i < n; i++) dots.push({x:Math.random()*W, y:Math.random()*H, r:.6+Math.random()*1.3, p:Math.random()*6.3, s:.4+Math.random()*1.1, v:.04+Math.random()*.12, gold:Math.random()<.6});
  }
  function draw(t){
    x.clearRect(0,0,W,H);
    for (var i = 0; i < dots.length; i++){
      var o = dots[i];
      o.y -= still ? 0 : o.v; if (o.y < -5){ o.y = H+5; o.x = Math.random()*W; }
      var a = Math.max(0, Math.sin(t*.001*o.s + o.p)); if (a < .05) continue;
      var k = o.r * (1 + a*2.4);
      x.globalAlpha = a*.9;
      x.fillStyle = o.gold ? '#f7e3a0' : tint;
      x.beginPath(); x.arc(o.x, o.y, o.r*.9, 0, 6.29); x.fill();
      if (a > .7){  // the brightest ones flash a tiny star
        x.globalAlpha = (a-.7)*2.2; x.fillRect(o.x - k*2, o.y - .35, k*4, .7); x.fillRect(o.x - .35, o.y - k*2, .7, k*4);
      }
    }
    x.globalAlpha = 1;
    if (!still) raf = requestAnimationFrame(draw);
  }
  size(); addEventListener('resize', size);
  if (still) draw(1200); else {
    raf = requestAnimationFrame(draw);
    document.addEventListener('visibilitychange', function(){ if (document.hidden){ cancelAnimationFrame(raf); raf = null; } else if (!raf) raf = requestAnimationFrame(draw); });
  }
})();
