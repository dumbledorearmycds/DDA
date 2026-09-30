/**
 * ══════════════════════════════════════════════════════════════════════════════
 * 🏠 HOC-3D: House of Cards Cinematic 3D WebGL Tabletop Engine
 * Powered by Three.js (Local Bundle) — Mobile-First, 60 FPS, Offline PWA
 * ══════════════════════════════════════════════════════════════════════════════
 */

(function () {
  'use strict';

  // Card geometry dimensions (world units)
  const CARD_W = 1.0;
  const CARD_H = 1.35;
  const CARD_D = 0.038;
  const COLS = 5;
  const ROWS = 3;
  const SPACING_X = 1.14;
  const SPACING_Y = 1.44;

  // Reusable vector and raycaster
  let raycaster, mouse;
  let scene, camera, renderer, container;
  let cardMeshes = [];
  let particleGroup = null;
  let activeAnimations = [];
  let isDirty = true;
  let animFrameId = null;
  let onCardClickCallback = null;
  let currentSetData = null;
  let currentGridData = null;
  let isInitialized = false;
  let isDealing = false;
  let hoveredMesh = null;

  // Cached materials & textures
  const textureCache = new Map();
  let backTexture = null;
  let bombTexture = null;
  let edgeMaterial = null;

  /**
   * Check if WebGL is supported
   */
  function isSupported() {
    if (typeof THREE === 'undefined') return false;
    try {
      const c = document.createElement('canvas');
      return !!(
        window.WebGLRenderingContext &&
        (c.getContext('webgl') || c.getContext('experimental-webgl'))
      );
    } catch (e) {
      return false;
    }
  }

  /**
   * Generate Back Face Canvas Texture
   */
  function getBackTexture() {
    if (backTexture) return backTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');

    // Rich royal obsidian-purple gradient
    const grad = ctx.createLinearGradient(0, 0, 320, 432);
    grad.addColorStop(0, '#2b1b54');
    grad.addColorStop(0.5, '#180e33');
    grad.addColorStop(1, '#0c071a');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 432);

    // Subtle magic rune grid pattern
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.08)';
    ctx.lineWidth = 1.5;
    for (let x = -100; x < 420; x += 24) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x + 432, 432);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x + 432, 0);
      ctx.lineTo(x, 432);
      ctx.stroke();
    }

    // Outer double gold metallic border
    ctx.strokeStyle = '#d4af37';
    ctx.lineWidth = 6;
    ctx.strokeRect(10, 10, 300, 412);
    ctx.strokeStyle = 'rgba(255, 215, 0, 0.45)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, 288, 400);

    // Corner ornate runes
    const drawCorner = (cx, cy) => {
      ctx.fillStyle = '#ffd700';
      ctx.beginPath();
      ctx.arc(cx, cy, 5, 0, Math.PI * 2);
      ctx.fill();
    };
    drawCorner(24, 24);
    drawCorner(296, 24);
    drawCorner(24, 408);
    drawCorner(296, 408);

    // Center circular seal
    ctx.save();
    ctx.translate(160, 216);
    ctx.beginPath();
    ctx.arc(0, 0, 72, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(24, 14, 51, 0.9)';
    ctx.fill();
    ctx.strokeStyle = '#ffd700';
    ctx.lineWidth = 3;
    ctx.stroke();

    // Inner glow
    ctx.beginPath();
    ctx.arc(0, 0, 64, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(168, 85, 247, 0.6)';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    // Hogwarts DA Lightning Bolt symbol
    ctx.font = 'bold 54px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffd700';
    ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
    ctx.shadowBlur = 16;
    ctx.fillText('⚡', 0, -8);

    // "D.A." Label
    ctx.shadowBlur = 6;
    ctx.font = 'bold 22px "Fredoka One", "Nunito", sans-serif';
    ctx.fillStyle = '#ffeaa7';
    ctx.letterSpacing = '3px';
    ctx.fillText('D.A.', 0, 38);
    ctx.restore();

    backTexture = new THREE.CanvasTexture(canvas);
    backTexture.minFilter = THREE.LinearFilter;
    backTexture.generateMipmaps = false;
    return backTexture;
  }

  /**
   * Generate Front Face Canvas Texture for Safe Card
   */
  function getFrontCardTexture(card) {
    const cacheKey = `card-${card.name}-${!!card.gold}`;
    if (textureCache.has(cacheKey)) return textureCache.get(cacheKey);

    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');

    const isGold = !!card.gold;

    // Background gradient based on card bg or gold
    const grad = ctx.createLinearGradient(0, 0, 320, 432);
    if (isGold) {
      grad.addColorStop(0, '#fef08a');
      grad.addColorStop(0.3, '#eab308');
      grad.addColorStop(0.7, '#ca8a04');
      grad.addColorStop(1, '#854d0e');
    } else if (card.bg === 'orange-bg') {
      grad.addColorStop(0, '#ffb347');
      grad.addColorStop(1, '#d97706');
    } else if (card.bg === 'purple-bg') {
      grad.addColorStop(0, '#c084fc');
      grad.addColorStop(1, '#7e22ce');
    } else if (card.bg === 'green-bg') {
      grad.addColorStop(0, '#4ade80');
      grad.addColorStop(1, '#15803d');
    } else if (card.bg === 'teal-bg') {
      grad.addColorStop(0, '#2dd4bf');
      grad.addColorStop(1, '#0f766e');
    } else if (card.bg === 'pink-bg') {
      grad.addColorStop(0, '#f472b6');
      grad.addColorStop(1, '#be185d');
    } else {
      grad.addColorStop(0, '#93c5fd');
      grad.addColorStop(1, '#1d4ed8');
    }
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 432);

    // Diagonal shine effect
    const shine = ctx.createLinearGradient(0, 0, 320, 432);
    shine.addColorStop(0, 'rgba(255, 255, 255, 0.45)');
    shine.addColorStop(0.35, 'rgba(255, 255, 255, 0.1)');
    shine.addColorStop(0.7, 'transparent');
    ctx.fillStyle = shine;
    ctx.fillRect(0, 0, 320, 432);

    // Card border
    ctx.strokeStyle = isGold ? '#fffbeb' : 'rgba(255, 255, 255, 0.85)';
    ctx.lineWidth = isGold ? 8 : 6;
    ctx.strokeRect(8, 8, 304, 416);

    // Gold Badge
    if (isGold) {
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#fff';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.roundRect(170, 16, 134, 34, 17);
      ctx.fill();
      ctx.stroke();
      ctx.font = 'bold 15px "Fredoka One", "Nunito", sans-serif';
      ctx.fillStyle = '#fff';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.shadowColor = 'rgba(0,0,0,0.5)';
      ctx.shadowBlur = 4;
      ctx.fillText('🌟 GOLD', 237, 33);
      ctx.shadowBlur = 0;
    }

    // Artwork Box
    const artBoxY = isGold ? 64 : 48;
    const artSize = 190;
    const artX = (320 - artSize) / 2;

    ctx.save();
    ctx.beginPath();
    ctx.roundRect(artX, artBoxY, artSize, artSize, 18);
    ctx.clip();

    ctx.fillStyle = 'rgba(0, 0, 0, 0.2)';
    ctx.fillRect(artX, artBoxY, artSize, artSize);

    // Draw image if cached, or fallback to emoji
    let imageDrawn = false;
    if (card.img) {
      const img = new Image();
      img.src = card.img;
      if (img.complete && img.naturalWidth > 0) {
        ctx.drawImage(img, artX, artBoxY, artSize, artSize);
        imageDrawn = true;
      } else {
        img.onload = () => {
          textureCache.delete(cacheKey);
          if (cardMeshes.length > 0) isDirty = true;
        };
      }
    }

    if (!imageDrawn) {
      ctx.font = '84px "Segoe UI Emoji", sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(card.emoji || '🃏', 160, artBoxY + artSize / 2);
    }
    ctx.restore();

    // Art border
    ctx.strokeStyle = isGold ? '#ffd700' : 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(artX, artBoxY, artSize, artSize, 18);
    ctx.stroke();

    // Card Name
    ctx.font = 'bold 24px "Fredoka One", "Nunito", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = '#ffffff';
    ctx.shadowColor = 'rgba(0, 0, 0, 0.8)';
    ctx.shadowBlur = 8;
    ctx.shadowOffsetY = 2;
    ctx.fillText(card.name.toUpperCase(), 160, artBoxY + artSize + 36);

    // Star Rating
    ctx.shadowBlur = 0;
    ctx.shadowOffsetY = 0;
    const starsCount = card.stars || (isGold ? 5 : 4);
    const starStr = '⭐'.repeat(starsCount);
    ctx.font = '22px "Segoe UI Emoji", sans-serif';
    ctx.fillText(starStr, 160, artBoxY + artSize + 72);

    const texture = new THREE.CanvasTexture(canvas);
    texture.minFilter = THREE.LinearFilter;
    texture.generateMipmaps = false;
    textureCache.set(cacheKey, texture);
    return texture;
  }

  /**
   * Generate Bomb Canvas Texture
   */
  function getBombTexture() {
    if (bombTexture) return bombTexture;
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 432;
    const ctx = canvas.getContext('2d');

    // Dark void crimson gradient
    const grad = ctx.createLinearGradient(0, 0, 320, 432);
    grad.addColorStop(0, '#2d0609');
    grad.addColorStop(0.5, '#1a0406');
    grad.addColorStop(1, '#0d0203');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 320, 432);

    // Blood-red warning border
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 7;
    ctx.strokeRect(8, 8, 304, 416);
    ctx.strokeStyle = 'rgba(239, 68, 68, 0.4)';
    ctx.lineWidth = 2;
    ctx.strokeRect(16, 16, 288, 400);

    // Bomb icon
    ctx.font = '96px "Segoe UI Emoji", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 24;
    ctx.fillText('💣', 160, 168);

    // Warning Title
    ctx.font = 'bold 30px "Fredoka One", "Nunito", sans-serif';
    ctx.fillStyle = '#fee2e2';
    ctx.shadowColor = '#b91c1c';
    ctx.shadowBlur = 12;
    ctx.fillText('DARK ARTS!', 160, 275);

    // Subtext
    ctx.font = 'bold 16px "Nunito", sans-serif';
    ctx.fillStyle = '#f87171';
    ctx.shadowBlur = 4;
    ctx.fillText('⚡ TRAP TRIGGERED ⚡', 160, 318);

    bombTexture = new THREE.CanvasTexture(canvas);
    bombTexture.minFilter = THREE.LinearFilter;
    bombTexture.generateMipmaps = false;
    return bombTexture;
  }

  /**
   * Initialize 3D Engine
   */
  function init(targetContainer, onClickCallback) {
    if (!isSupported()) return false;
    container = targetContainer;
    onCardClickCallback = onClickCallback;

    // Clean previous if any
    destroy();

    const w = container.clientWidth || 360;
    const h = container.clientHeight || 480;

    // Scene
    scene = new THREE.Scene();

    // Camera
    camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 100);
    adjustCamera(w, h);

    // Renderer
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      powerPreference: 'high-performance'
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(w, h);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0x4a3275, 0.9);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xfff0c2, 1.4);
    dirLight.position.set(2, 4, 9);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 1024;
    dirLight.shadow.mapSize.height = 1024;
    dirLight.shadow.camera.near = 1;
    dirLight.shadow.camera.far = 25;
    dirLight.shadow.camera.left = -5;
    dirLight.shadow.camera.right = 5;
    dirLight.shadow.camera.top = 5;
    dirLight.shadow.camera.bottom = -5;
    dirLight.shadow.bias = -0.001;
    scene.add(dirLight);

    const rimLight = new THREE.PointLight(0xa855f7, 0.8, 15);
    rimLight.position.set(-3, 3, 5);
    scene.add(rimLight);

    // Tabletop Plane
    const tableGeo = new THREE.PlaneGeometry(16, 16);
    const tableMat = new THREE.MeshStandardMaterial({
      color: 0x0e081e,
      roughness: 0.85,
      metalness: 0.15
    });
    const table = new THREE.Mesh(tableGeo, tableMat);
    table.position.z = -0.05;
    table.receiveShadow = true;
    scene.add(table);

    // Raycaster & Interaction
    raycaster = new THREE.Raycaster();
    mouse = new THREE.Vector2();

    const canvasDom = renderer.domElement;
    canvasDom.addEventListener('click', onPointerClick);
    canvasDom.addEventListener('pointermove', onPointerMove);
    canvasDom.addEventListener('pointerleave', onPointerLeave);
    window.addEventListener('resize', onWindowResize);

    // Edge metallic material
    edgeMaterial = new THREE.MeshStandardMaterial({
      color: 0xd4af37,
      metalness: 0.85,
      roughness: 0.35
    });

    isInitialized = true;
    isDirty = true;
    startRenderLoop();
    return true;
  }

  /**
   * Adjust camera distance dynamically for portrait mobile
   */
  function adjustCamera(width, height) {
    if (!camera) return;
    const aspect = width / height;
    camera.aspect = aspect;
    camera.updateProjectionMatrix();

    // Target coverage for 5 columns x 3 rows grid
    const targetW = 6.0;
    const targetH = 4.7;

    const fovRad = (camera.fov * Math.PI) / 180;
    const distH = targetH / (2 * Math.tan(fovRad / 2));
    const distW = targetW / (2 * Math.tan(fovRad / 2) * aspect);
    const dist = Math.max(distH, distW) * 1.04;

    camera.position.set(0, dist * 0.12 - 0.4, dist * 0.99);
    camera.lookAt(0, -0.4, 0);
  }

  function onWindowResize() {
    if (!container || !renderer || !camera) return;
    const w = container.clientWidth || 360;
    const h = container.clientHeight || 480;
    renderer.setSize(w, h);
    adjustCamera(w, h);
    isDirty = true;
  }

  /**
   * Map grid coordinate to 3D world space
   */
  function getGridPosition(index) {
    const col = index % COLS;
    const row = Math.floor(index / COLS);
    const x = (col - (COLS - 1) / 2) * SPACING_X;
    const y = ((ROWS - 1) / 2 - row) * SPACING_Y;
    return { x, y, z: 0 };
  }

  /**
   * Deal / Populate Board with 15 Cards
   */
  function dealCards(gridData, set, onComplete) {
    currentGridData = gridData;
    currentSetData = set;

    // Clear old card meshes
    cardMeshes.forEach((mesh) => {
      scene.remove(mesh);
      if (mesh.geometry) mesh.geometry.dispose();
    });
    cardMeshes = [];
    activeAnimations = [];
    isDealing = true;

    const boxGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
    const backTex = getBackTexture();

    gridData.forEach((cell, i) => {
      let frontTex;
      if (cell.type === 'fruit') {
        const c = set.cards[cell.cardIdx];
        frontTex = getFrontCardTexture(c);
      } else {
        frontTex = getBombTexture();
      }

      // Three.js Box: [px, nx, py, ny, pz, nz]
      // pz = +Z (front), nz = -Z (back)
      const frontMat = new THREE.MeshStandardMaterial({
        map: frontTex,
        roughness: 0.4,
        metalness: 0.1
      });
      const backMat = new THREE.MeshStandardMaterial({
        map: backTex,
        roughness: 0.45,
        metalness: 0.2
      });

      const materials = [
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        edgeMaterial,
        frontMat,
        backMat
      ];

      const mesh = new THREE.Mesh(boxGeo, materials);
      mesh.castShadow = true;
      mesh.receiveShadow = false;
      mesh.userData = {
        index: i,
        cell: cell,
        flipped: !!cell.flipped,
        isFlipping: false,
        targetPos: getGridPosition(i),
        originalZ: 0
      };

      // Initially face down (rotated 180 on Y so back faces +Z)
      // When flipped, rotation.y goes to 0 (or 2*PI)
      mesh.rotation.y = cell.flipped ? 0 : Math.PI;

      // Start position: deck stack at bottom
      mesh.position.set(0, -4.5, 1.2 + i * 0.015);
      mesh.scale.set(0.6, 0.6, 0.6);

      scene.add(mesh);
      cardMeshes.push(mesh);

      // Slide & deal animation with stagger
      const target = mesh.userData.targetPos;
      const delay = i * 28;
      const duration = 400;

      activeAnimations.push({
        mesh: mesh,
        startTime: performance.now() + delay,
        duration: duration,
        startX: mesh.position.x,
        startY: mesh.position.y,
        startZ: mesh.position.z,
        startScale: 0.6,
        targetX: target.x,
        targetY: target.y,
        targetZ: 0,
        targetScale: 1.0,
        easing: (t) => 1 + --t * t * t, // Ease out cubic
        onUpdate: (prog, anim) => {
          mesh.position.x = anim.startX + (anim.targetX - anim.startX) * prog;
          mesh.position.y = anim.startY + (anim.targetY - anim.startY) * prog;
          mesh.position.z = anim.startZ + (anim.targetZ - anim.startZ) * prog;
          const s = anim.startScale + (anim.targetScale - anim.startScale) * prog;
          mesh.scale.set(s, s, s);
        },
        onFinish: () => {
          mesh.position.set(target.x, target.y, 0);
          mesh.scale.set(1, 1, 1);
        }
      });
    });

    setTimeout(() => {
      isDealing = false;
      if (onComplete) onComplete();
    }, gridData.length * 28 + 420);

    isDirty = true;
  }

  /**
   * Flip Card 3D Animation
   */
  function flipCard(index, onFlipped) {
    const mesh = cardMeshes[index];
    if (!mesh || mesh.userData.flipped || mesh.userData.isFlipping) return;

    mesh.userData.isFlipping = true;
    mesh.userData.flipped = true;

    // Haptic tap on mobile
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate(30); } catch (e) {}
    }

    const duration = 380;
    const startRotY = mesh.rotation.y;
    const targetRotY = 0; // Front face faces camera

    activeAnimations.push({
      mesh: mesh,
      startTime: performance.now(),
      duration: duration,
      onUpdate: (prog) => {
        // Lifts slightly on Z during flip
        const zLift = Math.sin(prog * Math.PI) * 0.45;
        mesh.position.z = mesh.userData.originalZ + zLift;
        mesh.rotation.y = startRotY + (targetRotY - startRotY) * prog;
      },
      onFinish: () => {
        mesh.rotation.y = 0;
        mesh.position.z = mesh.userData.originalZ;
        mesh.userData.isFlipping = false;
        isDirty = true;
        if (onFlipped) onFlipped();
      }
    });

    isDirty = true;
  }

  /**
   * Explode Dark Arts Bomb (3D Shake + Embers)
   */
  function explodeBomb(index) {
    const mesh = cardMeshes[index];
    if (!mesh) return;

    // Haptic shock
    if (typeof navigator !== 'undefined' && navigator.vibrate) {
      try { navigator.vibrate([45, 60, 90]); } catch (e) {}
    }

    const origPos = { ...mesh.position };
    const duration = 450;

    activeAnimations.push({
      mesh: mesh,
      startTime: performance.now(),
      duration: duration,
      onUpdate: (prog) => {
        const shakeMag = (1 - prog) * 0.12;
        mesh.position.x = origPos.x + (Math.random() - 0.5) * shakeMag;
        mesh.position.y = origPos.y + (Math.random() - 0.5) * shakeMag;
      },
      onFinish: () => {
        mesh.position.copy(origPos);
        isDirty = true;
      }
    });

    // Spawn 3D embers/sparks
    spawnBombEmbers(mesh.position.x, mesh.position.y, mesh.position.z);
    isDirty = true;
  }

  /**
   * Spawn 3D Particles for Bomb
   */
  function spawnBombEmbers(x, y, z) {
    const count = 28;
    const geo = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);
    const velocities = [];

    for (let i = 0; i < count; i++) {
      positions[i * 3] = x + (Math.random() - 0.5) * 0.6;
      positions[i * 3 + 1] = y + (Math.random() - 0.5) * 0.8;
      positions[i * 3 + 2] = z + 0.1;
      velocities.push({
        vx: (Math.random() - 0.5) * 1.8,
        vy: (Math.random() - 0.5) * 1.8 + 1.2,
        vz: Math.random() * 2.5 + 0.5
      });
    }

    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const mat = new THREE.PointsMaterial({
      color: 0xef4444,
      size: 0.16,
      transparent: true,
      opacity: 1.0,
      blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geo, mat);
    scene.add(particles);

    const startTime = performance.now();
    const duration = 650;

    activeAnimations.push({
      startTime: startTime,
      duration: duration,
      onUpdate: (prog) => {
        const dt = 0.016;
        const posAttr = geo.attributes.position;
        for (let i = 0; i < count; i++) {
          posAttr.array[i * 3] += velocities[i].vx * dt;
          posAttr.array[i * 3 + 1] += velocities[i].vy * dt;
          posAttr.array[i * 3 + 2] += velocities[i].vz * dt;
          velocities[i].vy -= 2.0 * dt; // Gravity
        }
        posAttr.needsUpdate = true;
        mat.opacity = 1 - prog;
      },
      onFinish: () => {
        scene.remove(particles);
        geo.dispose();
        mat.dispose();
        isDirty = true;
      }
    });
  }

  /**
   * Highlight Safe Card for Hint
   */
  function highlightCard(index) {
    const mesh = cardMeshes[index];
    if (!mesh) return;

    // Lift and pulse
    const duration = 800;
    activeAnimations.push({
      mesh: mesh,
      startTime: performance.now(),
      duration: duration,
      onUpdate: (prog) => {
        const pulse = Math.sin(prog * Math.PI * 2);
        mesh.position.z = mesh.userData.originalZ + 0.25 + pulse * 0.08;
      },
      onFinish: () => {
        mesh.position.z = mesh.userData.originalZ + 0.25;
        isDirty = true;
      }
    });

    isDirty = true;
  }

  /**
   * Pointer Click / Tap Handler
   */
  function onPointerClick(e) {
    if (!isInitialized || isDealing || cardMeshes.length === 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cardMeshes);

    if (intersects.length > 0) {
      const hitMesh = intersects[0].object;
      const idx = hitMesh.userData.index;
      if (onCardClickCallback && typeof idx === 'number') {
        onCardClickCallback(idx);
      }
    }
  }

  /**
   * Pointer Hover Handler (Tactile 3D Tilt)
   */
  function onPointerMove(e) {
    if (!isInitialized || isDealing || cardMeshes.length === 0) return;
    const rect = renderer.domElement.getBoundingClientRect();
    mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
    mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

    raycaster.setFromCamera(mouse, camera);
    const intersects = raycaster.intersectObjects(cardMeshes);

    if (intersects.length > 0) {
      const mesh = intersects[0].object;
      if (hoveredMesh !== mesh) {
        if (hoveredMesh && !hoveredMesh.userData.flipped) {
          hoveredMesh.position.z = hoveredMesh.userData.originalZ;
        }
        hoveredMesh = mesh;
        if (!mesh.userData.flipped) {
          mesh.position.z = mesh.userData.originalZ + 0.08;
        }
        renderer.domElement.style.cursor = 'pointer';
        isDirty = true;
      }
    } else if (hoveredMesh) {
      if (!hoveredMesh.userData.flipped) {
        hoveredMesh.position.z = hoveredMesh.userData.originalZ;
      }
      hoveredMesh = null;
      renderer.domElement.style.cursor = 'default';
      isDirty = true;
    }
  }

  function onPointerLeave() {
    if (hoveredMesh) {
      if (!hoveredMesh.userData.flipped) {
        hoveredMesh.position.z = hoveredMesh.userData.originalZ;
      }
      hoveredMesh = null;
      isDirty = true;
    }
  }

  /**
   * Main Render Loop with On-Demand Power Saving
   */
  function startRenderLoop() {
    function tick() {
      const now = performance.now();

      // Process active animations
      if (activeAnimations.length > 0) {
        isDirty = true;
        for (let i = activeAnimations.length - 1; i >= 0; i--) {
          const anim = activeAnimations[i];
          if (now < anim.startTime) continue;
          const elapsed = now - anim.startTime;
          const progress = Math.min(elapsed / anim.duration, 1.0);
          const eased = anim.easing ? anim.easing(progress) : progress;

          if (anim.onUpdate) anim.onUpdate(eased, anim);

          if (progress >= 1.0) {
            if (anim.onFinish) anim.onFinish();
            activeAnimations.splice(i, 1);
          }
        }
      }

      // Render only when dirty
      if (isDirty && renderer && scene && camera) {
        renderer.render(scene, camera);
        isDirty = activeAnimations.length > 0;
      }

      animFrameId = requestAnimationFrame(tick);
    }

    if (animFrameId) cancelAnimationFrame(animFrameId);
    animFrameId = requestAnimationFrame(tick);
  }

  /**
   * Clean up and destroy
   */
  function destroy() {
    if (animFrameId) {
      cancelAnimationFrame(animFrameId);
      animFrameId = null;
    }
    window.removeEventListener('resize', onWindowResize);
    if (renderer && renderer.domElement) {
      renderer.domElement.removeEventListener('click', onPointerClick);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      renderer.domElement.removeEventListener('pointerleave', onPointerLeave);
      if (renderer.domElement.parentNode) {
        renderer.domElement.parentNode.removeChild(renderer.domElement);
      }
      renderer.dispose();
      renderer = null;
    }
    cardMeshes = [];
    activeAnimations = [];
    isInitialized = false;
    isDirty = false;
  }

  // Export public API
  window.Hoc3D = {
    isSupported,
    init,
    dealCards,
    flipCard,
    explodeBomb,
    highlightCard,
    destroy
  };
})();
