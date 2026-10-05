/**
 * GDC Attendance - Cinematic Game Background
 * Features: 3D neon environment, floating geometry, glow grid, particles, no character artwork
 */

(function() {
  'use strict';

  const canvas = document.getElementById('bg-canvas');
  const ctx = canvas.getContext('2d');

  const config = {
    particleCount: 180,
    cubeCount: 14,
    colors: {
      blue: { r: 99, g: 102, b: 241 },
      cyan: { r: 34, g: 211, b: 238 },
      violet: { r: 168, g: 85, b: 247 },
      pink: { r: 236, g: 72, b: 153 },
      gold: { r: 250, g: 204, b: 21 },
      orange: { r: 251, g: 146, b: 60 },
      red: { r: 239, g: 68, b: 68 }
    }
  };

  let width = 0;
  let height = 0;
  let particles = [];
  let cubes = [];
  let time = 0;
  let mouse = { x: 0, y: 0 };

  function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
    mouse.x = width * 0.5;
    mouse.y = height * 0.4;
  }

  class Particle3D {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height;
      this.z = Math.random() * 2.2 + 0.6;
      this.vx = (Math.random() - 0.5) * 0.55 * this.z;
      this.vy = (Math.random() - 0.5) * 0.55 * this.z;
      this.radius = Math.random() * 2.4 + 0.8;
      this.color = this.getRandomColor();
      this.alpha = Math.random() * 0.45 + 0.12;
      this.pulse = Math.random() * Math.PI * 2;
    }

    getRandomColor() {
      const palette = [config.colors.blue, config.colors.cyan, config.colors.violet, config.colors.pink, config.colors.gold];
      return palette[Math.floor(Math.random() * palette.length)];
    }

    update() {
      this.x += this.vx;
      this.y += this.vy;
      this.pulse += 0.02;

      const dx = mouse.x - this.x;
      const dy = mouse.y - this.y;
      const dist = Math.hypot(dx, dy) || 1;
      if (dist < 220) {
        const force = (220 - dist) / 220;
        this.vx -= (dx / dist) * force * 0.04;
        this.vy -= (dy / dist) * force * 0.04;
      }

      if (this.x < 0) this.x = width;
      if (this.x > width) this.x = 0;
      if (this.y < 0) this.y = height;
      if (this.y > height) this.y = 0;
    }

    draw() {
      const pulseAlpha = (Math.sin(this.pulse) + 1) * 0.5 * 0.5 + this.alpha;
      const size = this.radius * this.z;

      ctx.beginPath();
      ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${pulseAlpha})`;
      ctx.fill();

      ctx.beginPath();
      ctx.arc(this.x, this.y, size * 3.2, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${pulseAlpha * 0.08})`;
      ctx.fill();
    }
  }

  class FloatingCube {
    constructor() {
      this.reset();
    }

    reset() {
      this.x = Math.random() * width;
      this.y = Math.random() * height * 0.9;
      this.z = Math.random() * 1.3 + 0.3;
      this.size = Math.random() * 34 + 16;
      this.rotation = Math.random() * Math.PI * 2;
      this.speed = Math.random() * 0.009 + 0.003;
      this.tilt = Math.random() * 0.8 + 0.2;
      this.color = this.getRandomColor();
      this.alpha = Math.random() * 0.34 + 0.12;
    }

    getRandomColor() {
      const palette = [config.colors.blue, config.colors.cyan, config.colors.violet, config.colors.pink, config.colors.gold];
      return palette[Math.floor(Math.random() * palette.length)];
    }

    update() {
      this.rotation += this.speed;
      this.y += 0.18 + this.z * 0.12;
      if (this.y > height + 60) {
        this.y = -60;
        this.x = Math.random() * width;
      }
    }

    draw() {
      const scale = 0.8 + this.z * 0.7;
      const size = this.size * scale;
      const x = this.x;
      const y = this.y;
      const r = this.rotation;

      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(r);
      ctx.strokeStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.alpha})`;
      ctx.lineWidth = 1.2;
      ctx.fillStyle = `rgba(${this.color.r}, ${this.color.g}, ${this.color.b}, ${this.alpha * 0.18})`;

      ctx.beginPath();
      ctx.moveTo(-size * 0.5, -size * 0.35);
      ctx.lineTo(size * 0.35, -size * 0.5);
      ctx.lineTo(size * 0.55, size * 0.35);
      ctx.lineTo(-size * 0.35, size * 0.5);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(-size * 0.35, size * 0.5);
      ctx.lineTo(-size * 0.2, size * 0.8);
      ctx.lineTo(size * 0.45, size * 0.8);
      ctx.lineTo(size * 0.55, size * 0.35);
      ctx.stroke();

      ctx.beginPath();
      ctx.moveTo(size * 0.55, size * 0.35);
      ctx.lineTo(size * 0.7, size * 0.05);
      ctx.lineTo(size * 0.35, -size * 0.5);
      ctx.stroke();

      ctx.restore();
    }
  }

  function drawBackground() {
    const bg = ctx.createLinearGradient(0, 0, 0, height);
    bg.addColorStop(0, '#020712');
    bg.addColorStop(0.24, '#071426');
    bg.addColorStop(0.56, '#120d1d');
    bg.addColorStop(0.78, '#190b13');
    bg.addColorStop(1, '#18070c');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);

    const farField = ctx.createRadialGradient(width * 0.5, height * 0.35, 0, width * 0.5, height * 0.35, width * 0.72);
    farField.addColorStop(0, 'rgba(144, 175, 255, 0.18)');
    farField.addColorStop(0.42, 'rgba(93, 99, 255, 0.1)');
    farField.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = farField;
    ctx.fillRect(0, 0, width, height);

    const centralPortal = ctx.createRadialGradient(width * 0.5, height * 0.72, 0, width * 0.5, height * 0.72, Math.min(width, height) * 0.46);
    centralPortal.addColorStop(0, 'rgba(110, 230, 255, 0.38)');
    centralPortal.addColorStop(0.27, 'rgba(78, 111, 255, 0.24)');
    centralPortal.addColorStop(0.58, 'rgba(183, 97, 255, 0.14)');
    centralPortal.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = centralPortal;
    ctx.fillRect(0, 0, width, height);

    const coreGlow = ctx.createRadialGradient(width * 0.5, height * 0.7, 0, width * 0.5, height * 0.7, width * 0.38);
    coreGlow.addColorStop(0, 'rgba(34, 211, 238, 0.28)');
    coreGlow.addColorStop(0.24, 'rgba(99, 102, 241, 0.2)');
    coreGlow.addColorStop(0.56, 'rgba(168, 85, 247, 0.12)');
    coreGlow.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = coreGlow;
    ctx.fillRect(0, 0, width, height);

    const platform = ctx.createRadialGradient(width * 0.5, height * 0.82, 20, width * 0.5, height * 0.82, width * 0.36);
    platform.addColorStop(0, 'rgba(34, 211, 238, 0.26)');
    platform.addColorStop(0.35, 'rgba(99, 102, 241, 0.15)');
    platform.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = platform;
    ctx.fillRect(0, 0, width, height);

    const lightA = ctx.createRadialGradient(width * 0.22, height * 0.26, 0, width * 0.22, height * 0.26, width * 0.39);
    lightA.addColorStop(0, 'rgba(59,130,246,0.24)');
    lightA.addColorStop(0.5, 'rgba(99,102,241,0.12)');
    lightA.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lightA;
    ctx.fillRect(0, 0, width, height);

    const lightB = ctx.createRadialGradient(width * 0.8, height * 0.35, 0, width * 0.8, height * 0.35, width * 0.43);
    lightB.addColorStop(0, 'rgba(236,72,153,0.2)');
    lightB.addColorStop(0.38, 'rgba(168,85,247,0.1)');
    lightB.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = lightB;
    ctx.fillRect(0, 0, width, height);

    const vignette = ctx.createRadialGradient(width * 0.5, height * 0.52, 180, width * 0.5, height * 0.52, width * 0.84);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(1, 'rgba(0,0,0,0.7)');
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, width, height);
  }

  function drawPerspectiveGrid() {
    const horizon = height * 0.62;
    const count = 24;

    ctx.save();
    ctx.globalAlpha = 0.25;

    for (let i = 0; i < count; i++) {
      const t = i / count;
      const y = horizon + Math.pow(t, 1.8) * (height - horizon);
      ctx.strokeStyle = `rgba(79, 140, 255, ${0.08 + t * 0.2})`;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    const centerX = width * 0.5;
    for (let i = -count; i <= count; i++) {
      const offset = i * (width / (count * 1.8));
      const x = centerX + offset;
      ctx.strokeStyle = `rgba(110, 230, 255, ${0.08 + Math.abs(i) / count * 0.14})`;
      ctx.beginPath();
      ctx.moveTo(centerX, horizon);
      ctx.lineTo(x, height);
      ctx.stroke();
    }

    const portalRing = 180 + Math.sin(time * 0.05) * 14;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.7, portalRing, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110, 230, 255, 0.12)';
    ctx.lineWidth = 1.4;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.7, portalRing * 0.65, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(183, 97, 255, 0.10)';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.beginPath();
    ctx.ellipse(width * 0.5, height * 0.7, portalRing * 1.5, portalRing * 0.6, 0, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.restore();
  }

  function drawEnergyRings() {
    const ringCount = 7;
    for (let i = 0; i < ringCount; i++) {
      const p = ((time * 0.0055 + i / ringCount) % 1);
      const radius = p * Math.max(width, height) * 0.6;
      const alpha = (1 - p) * 0.14;
      const hue = i % 2 === 0 ? '34, 211, 238' : '99, 102, 241';
      ctx.beginPath();
      ctx.arc(width * 0.5, height * 0.7, radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(${hue}, ${alpha})`;
      ctx.lineWidth = 2 + i * 0.45;
      ctx.stroke();
    }

    const pulse = 1 + Math.sin(time * 0.045) * 0.12;
    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.7, 120 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.16)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(width * 0.5, height * 0.7, 180 * pulse, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(110, 230, 255, 0.10)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawOrbitalGlow() {
    for (let i = 0; i < 7; i++) {
      const x = width * (0.18 + i * 0.12) + Math.sin(time * 0.008 + i) * 90;
      const y = height * (0.36 + (i % 3) * 0.16) + Math.cos(time * 0.009 + i) * 48;
      const radius = width * (0.1 + i * 0.024);
      const fog = ctx.createRadialGradient(x, y, 0, x, y, radius);
      fog.addColorStop(0, `rgba(120, 160, 255, ${0.06 + i * 0.012})`);
      fog.addColorStop(0.45, `rgba(90, 80, 180, ${0.04 + i * 0.01})`);
      fog.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = fog;
      ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
    }
  }

  function drawConnections() {
    for (let i = 0; i < particles.length; i++) {
      for (let j = i + 1; j < particles.length; j++) {
        const dx = particles[i].x - particles[j].x;
        const dy = particles[i].y - particles[j].y;
        const dist = Math.hypot(dx, dy);
        if (dist < 140) {
          const alpha = (1 - dist / 140) * 0.08;
          ctx.beginPath();
          ctx.moveTo(particles[i].x, particles[i].y);
          ctx.lineTo(particles[j].x, particles[j].y);
          ctx.strokeStyle = `rgba(99, 102, 241, ${alpha})`;
          ctx.lineWidth = 0.5;
          ctx.stroke();
        }
      }
    }
  }

  function drawParticles() {
    particles.forEach((particle) => {
      particle.update();
      particle.draw();
    });
  }

  function drawCubes() {
    cubes.forEach((cube) => {
      cube.update();
      cube.draw();
    });
  }

  function drawFloatingRibbons() {
    for (let i = 0; i < 18; i++) {
      const x = (i / 18) * width;
      const y = height * 0.72 + Math.sin(time * 0.012 + i * 1.3) * 46;
      const wave = Math.sin(time * 0.02 + i * 0.9) * 80;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.bezierCurveTo(
        x + 20, y + wave * 0.2,
        x + 45, y + wave * 0.6,
        x + 90, y + wave
      );
      ctx.bezierCurveTo(
        x + 110, y + wave * 0.4,
        x + 140, y - wave * 0.1,
        x + 170, y + wave * 0.2
      );
      ctx.strokeStyle = `rgba(34, 211, 238, ${0.09 + (i % 5) * 0.02})`;
      ctx.lineWidth = 1.2;
      ctx.stroke();
    }

    for (let i = 0; i < 12; i++) {
      const x = width * (0.15 + i * 0.07) + Math.sin(time * 0.015 + i) * 22;
      const y = height * 0.24 + Math.cos(time * 0.016 + i * 1.4) * 34;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x + 70, y + 18);
      ctx.lineTo(x + 110, y - 12);
      ctx.strokeStyle = `rgba(189, 140, 255, ${0.08 + i * 0.01})`;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    const beamX = width * 0.5 + Math.sin(time * 0.014) * 170;
    ctx.beginPath();
    ctx.moveTo(beamX, height * 0.13);
    ctx.lineTo(width * 0.5, height * 0.92);
    ctx.strokeStyle = 'rgba(110, 230, 255, 0.12)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width * 0.5, height * 0.08);
    ctx.lineTo(width * 0.5, height * 0.98);
    ctx.strokeStyle = 'rgba(255,255,255,0.04)';
    ctx.lineWidth = 1;
    ctx.stroke();
  }

  function drawScanlines() {
    ctx.save();
    ctx.globalAlpha = 0.08;
    for (let y = 0; y < height; y += 4) {
      ctx.fillStyle = y % 8 === 0 ? 'rgba(255,255,255,0.18)' : 'rgba(90,120,255,0.10)';
      ctx.fillRect(0, y, width, 2);
    }
    ctx.restore();
  }

  let animFrameId = null;
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function renderFrame() {
    drawBackground();
    drawPerspectiveGrid();
    drawEnergyRings();
    drawOrbitalGlow();
    drawConnections();
    drawParticles();
    drawFloatingRibbons();
    drawCubes();
    drawScanlines();
  }

  function animate() {
    if (document.hidden) {
      return;
    }

    time += 1;
    renderFrame();

    if (!prefersReducedMotion.matches) {
      animFrameId = requestAnimationFrame(animate);
    }
  }

  function startLoop() {
    if (!animFrameId && !prefersReducedMotion.matches && !document.hidden) {
      animFrameId = requestAnimationFrame(animate);
    }
  }

  function stopLoop() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
  }

  function init() {
    resize();
    particles = [];
    cubes = [];

    for (let i = 0; i < config.particleCount; i++) {
      particles.push(new Particle3D());
    }

    for (let i = 0; i < config.cubeCount; i++) {
      cubes.push(new FloatingCube());
    }
    
    renderFrame();
  }

  window.addEventListener('resize', () => {
    resize();
    renderFrame();
  });

  window.addEventListener('mousemove', (event) => {
    mouse.x = event.clientX;
    mouse.y = event.clientY;
  });

  window.addEventListener('mouseleave', () => {
    mouse.x = width * 0.5;
    mouse.y = height * 0.4;
  });

  window.addEventListener('touchmove', (event) => {
    if (event.touches.length > 0) {
      mouse.x = event.touches[0].clientX;
      mouse.y = event.touches[0].clientY;
    }
  });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      stopLoop();
    } else {
      startLoop();
    }
  });

  if (prefersReducedMotion.addEventListener) {
    prefersReducedMotion.addEventListener('change', (e) => {
      if (e.matches) {
        stopLoop();
        renderFrame();
      } else {
        startLoop();
      }
    });
  }

  init();
  if (!prefersReducedMotion.matches) {
    animate();
  }
  window.addEventListener('load', () => {
    resize();
    renderFrame();
  });
})();