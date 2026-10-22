/* The ribbon: Pau's quiet 3D motif.
   Dependency-free WebGL. One fragment shader ray-marches a twisted satin ribbon; two variants share it:
   - "ribbon": a cream-and-caramel object beside the speaking style, with a soft contact shadow
   - "halo":   a slow caramel orbit behind the cover portrait, on a transparent ground
   Each canvas starts only near the viewport, pauses off-screen and in background tabs, draws one still
   frame for reduced-motion visitors, and leaves the CSS fallback in place if WebGL is unavailable. */
(() => {
  'use strict';
  const hosts = [...document.querySelectorAll('[data-sculpture]')];
  if (!hosts.length || !('IntersectionObserver' in window)) return;

  const VERTEX = 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}';
  const FRAGMENT = `
#ifdef GL_FRAGMENT_PRECISION_HIGH
precision highp float;
#else
precision mediump float;
#endif
uniform vec2 uRes;uniform float uTime;uniform vec2 uPointer;uniform float uHalo;
mat2 rot(float a){float c=cos(a),s=sin(a);return mat2(c,-s,s,c);}
float ribbon(vec3 p){
  float a=atan(p.z,p.x);
  float radius=mix(.92,1.02,uHalo);
  vec2 q=vec2(length(p.xz)-radius,p.y);
  q=rot(a*1.5+uTime*mix(.18,.1,uHalo))*q;
  vec2 d=abs(q)-mix(vec2(.36,.032),vec2(.075,.012),uHalo);
  return length(max(d,0.))+min(max(d.x,d.y),0.)-mix(.028,.01,uHalo);
}
float map(vec3 p){
  p.yz=rot(mix(.62,1.32,uHalo)+uPointer.y*.12)*p.yz;
  p.xy=rot(mix(-.28,-.12,uHalo))*p.xy;
  p.xz=rot(uTime*mix(.11,.06,uHalo)+uPointer.x*.3)*p.xz;
  return ribbon(p)*.55;
}
vec3 normalAt(vec3 p){vec2 e=vec2(.0015,0.);return normalize(vec3(map(p+e.xyy)-map(p-e.xyy),map(p+e.yxy)-map(p-e.yxy),map(p+e.yyx)-map(p-e.yyx)));}
void main(){
  vec2 uv=(gl_FragCoord.xy-.5*uRes)/uRes.y;
  vec3 ro=vec3(0.,.05,mix(4.3,4.1,uHalo)),rd=normalize(vec3(uv,-1.55));
  float t=0.;bool hit=false;
  for(int i=0;i<110;i++){float d=map(ro+rd*t);if(d<.0007){hit=true;break;}t+=d;if(t>7.)break;}
  vec2 s=(uv-vec2(0.,-.36))*vec2(2.6,8.);
  float shade=exp(-dot(s,s)*3.)*.22*(1.-uHalo)*smoothstep(-.5,-.44,uv.y);
  vec4 col=vec4(vec3(.17,.12,.09)*shade,shade);
  if(hit){
    vec3 p=ro+rd*t,n=normalAt(p);
    vec3 key=normalize(vec3(-.55,.75,.6)),fill=normalize(vec3(.7,-.2,.4));
    float wrap=clamp(dot(n,key)*.5+.5,0.,1.);
    float rim=pow(1.-max(dot(n,-rd),0.),3.);
    float sheen=pow(max(dot(n,normalize(key-rd)),0.),36.);
    float ao=clamp(map(p+n*.14)/.14*.55+.45,0.,1.);
    vec3 lo=mix(vec3(.69,.54,.37)*.82,vec3(.36,.25,.17),uHalo);
    vec3 hi=mix(vec3(.97,.94,.89),vec3(.86,.70,.50),uHalo);
    vec3 c=mix(lo,hi,smoothstep(.05,.95,wrap));
    c+=vec3(.95,.86,.74)*max(dot(n,fill),0.)*.12;
    c=c*ao+sheen*mix(.32,.45,uHalo)*vec3(1.,.93,.82)+rim*vec3(.98,.92,.84)*mix(.22,.12,uHalo);
    float alpha=mix(1.,.62,uHalo);
    col=vec4(c*alpha,alpha);
  }
  gl_FragColor=col;
}`;
  const still = window.matchMedia('(prefers-reduced-motion: reduce)');

  function create(host) {
    const canvas = host.querySelector('canvas');
    const halo = host.dataset.sculpture === 'halo' ? 1 : 0;
    let gl, uniforms, running = false, visible = false, raf = 0, last = 0, time = halo ? 4 : 2.2, started = false;
    const pointer = { x: 0, y: 0, tx: 0, ty: 0 };

    function compile(type, source) {
      const shader = gl.createShader(type);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error('shader');
      return shader;
    }
    function init() {
      try {
        gl = canvas.getContext('webgl', { alpha: true, antialias: true, premultipliedAlpha: true, powerPreference: 'low-power' });
        if (!gl) return false;
        const program = gl.createProgram();
        gl.attachShader(program, compile(gl.VERTEX_SHADER, VERTEX));
        gl.attachShader(program, compile(gl.FRAGMENT_SHADER, FRAGMENT));
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return false;
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
        const location = gl.getAttribLocation(program, 'p');
        gl.enableVertexAttribArray(location);
        gl.vertexAttribPointer(location, 2, gl.FLOAT, false, 0, 0);
        uniforms = ['uRes', 'uTime', 'uPointer', 'uHalo'].reduce((all, name) => (all[name] = gl.getUniformLocation(program, name), all), {});
        gl.uniform1f(uniforms.uHalo, halo);
        return true;
      } catch {
        return false;
      }
    }
    function resize() {
      const width = host.clientWidth, height = host.clientHeight || width;
      const cap = halo ? 1.2 : (width < 500 ? 1.25 : 1.6);
      const ratio = Math.min(window.devicePixelRatio || 1, cap);
      canvas.width = Math.max(1, Math.round(width * ratio));
      canvas.height = Math.max(1, Math.round(height * ratio));
      gl.viewport(0, 0, canvas.width, canvas.height);
    }
    function draw() {
      pointer.x += (pointer.tx - pointer.x) * 0.05;
      pointer.y += (pointer.ty - pointer.y) * 0.05;
      gl.uniform2f(uniforms.uRes, canvas.width, canvas.height);
      gl.uniform1f(uniforms.uTime, time);
      gl.uniform2f(uniforms.uPointer, pointer.x, pointer.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      if (!host.classList.contains('is-live')) host.classList.add('is-live');
    }
    function frame(now) {
      if (!running) return;
      const delta = last ? Math.min((now - last) / 1000, 0.05) : 0;
      last = now;
      time += delta;
      draw();
      raf = requestAnimationFrame(frame);
    }
    function update() {
      const shouldRun = visible && !document.hidden && !still.matches;
      if (shouldRun && !running) { running = true; last = 0; raf = requestAnimationFrame(frame); }
      if (!shouldRun && running) { running = false; cancelAnimationFrame(raf); }
      if (still.matches && visible) draw();
    }
    const observer = new IntersectionObserver((entries) => {
      visible = entries.some((entry) => entry.isIntersecting);
      if (visible && !started) {
        started = true;
        if (!init()) { observer.disconnect(); return; }
        resize();
        if ('ResizeObserver' in window) new ResizeObserver(() => { resize(); if (!running) draw(); }).observe(host);
      }
      if (started && gl) update();
    }, { rootMargin: '200px 0px' });
    observer.observe(host);

    document.addEventListener('visibilitychange', () => { if (gl) update(); });
    still.addEventListener('change', () => { if (gl) update(); });
    const area = halo ? host.closest('.hero') || host : host;
    area.addEventListener('pointermove', (event) => {
      const box = area.getBoundingClientRect();
      pointer.tx = ((event.clientX - box.left) / box.width) * 2 - 1;
      pointer.ty = ((event.clientY - box.top) / box.height) * 2 - 1;
    });
    area.addEventListener('pointerleave', () => { pointer.tx = 0; pointer.ty = 0; });
    canvas.addEventListener('webglcontextlost', (event) => { event.preventDefault(); running = false; host.classList.remove('is-live'); });
  }

  hosts.forEach(create);
})();
