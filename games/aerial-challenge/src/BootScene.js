/**
 * Township Aerial Challenge — BootScene (Phase 2)
 * Generates 2X supersampled procedural vector textures:
 * - High-Res Township Red-and-Cream Biplane modular parts
 * - Animated fluttering scarf & spinning propeller disc
 * - Multi-layer parallax world textures: Mountains, Hills, Town & Farmland panorama, Hangar & Tower
 */

import { SCALE, COLORS } from './Constants.js';

export class BootScene extends Phaser.Scene {
  constructor() {
    super({ key: 'BootScene' });
  }

  preload() {
    // 1. Biplane Modular Vector Sprites (2X Supersampled)
    this.createBiplaneFuselage();
    this.createBiplaneWings();
    this.createBiplaneCowlingSpinner();
    this.createBiplanePilot();
    this.createBiplaneScarf();
    this.createBiplanePropeller();
    this.createBiplaneLandingGear();
    this.createBiplaneFlameVFX();
    this.createSmokePuffTexture();

    // 2. Parallax World Environment Textures
    this.createMountainsTexture();
    this.createHillsTexture();
    this.createTownFarmlandPanorama();
    this.createWindmillBladesTexture();
    this.createHangarTowerTexture();
    this.createWindsockTexture();
    this.createCloudTexture();

    // 3. Runway & Slingshot Infrastructure
    this.createSlingshotTexture();
    this.createTrajectoryPip();
    this.createRunwayGroundTexture();
    this.createMilestoneMarker();
    this.createBoosterBarTextures();

    // 4. Six Authentic High-Contrast Collectibles (2X Supersampled, Zero Emojis)
    this.createWingedStarTexture();
    this.createBatteryCanisterTexture();
    this.createHorseshoeMagnetTexture();
    this.createPartBoltTexture();
    this.createPartCogTexture();
    this.createPartSpringTexture();
    this.createMagneticAuraTexture();
    this.createStarSparkleTexture();

    // 5. 3-Tier Aircraft Evolution, Upgrade Icons & Airfield UI Sprites
    this.createEvolutionTierTextures();
    this.createUpgradeComponentIcons();
    this.createAirfieldUITextures();
  }

  create() {
    this.scene.start('FlightScene');
    this.scene.launch('UIScene');
  }

  /* ========================================================================
     1. HIGH-RES BIPLANE MODULAR PARTS (2X SUPERSAMPLED)
     ======================================================================== */

  createBiplaneFuselage() {
    // 2X size: 240 x 110 (Displayed at 120 x 55)
    const canvas = this.textures.createCanvas('plane_fuselage', 240, 110);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Rear Exhaust Nozzle Ring (dark metallic bronze with glowing inner rim)
    ctx.fillStyle = '#374151';
    ctx.beginPath();
    ctx.roundRect(4, 18, 12, 16, 3);
    ctx.fill();
    ctx.fillStyle = '#EA580C';
    ctx.beginPath();
    ctx.roundRect(2, 21, 6, 10, 2);
    ctx.fill();

    // Swept Vertical Tail Fin (Cherry Red with Cream leading edge)
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(24, 22);
    ctx.lineTo(8, 2);
    ctx.lineTo(20, 2);
    ctx.lineTo(38, 20);
    ctx.closePath();
    ctx.fill();
    // Tail Cream Trim
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(8, 2);
    ctx.lineTo(13, 2);
    ctx.lineTo(26, 18);
    ctx.lineTo(20, 18);
    ctx.closePath();
    ctx.fill();

    // Horizontal Stabilizer
    ctx.fillStyle = '#B91C1C';
    ctx.beginPath();
    ctx.roundRect(10, 24, 22, 6, 2);
    ctx.fill();

    // Chunky Aerodynamic Teardrop Fuselage (Vibrant Cherry Red Gradient)
    const fuseGrad = ctx.createLinearGradient(12, 12, 12, 42);
    fuseGrad.addColorStop(0, '#EF4444');
    fuseGrad.addColorStop(0.5, '#DC2626');
    fuseGrad.addColorStop(1, '#B91C1C');
    ctx.fillStyle = fuseGrad;

    ctx.beginPath();
    ctx.moveTo(102, 26); // Nose
    ctx.bezierCurveTo(102, 12, 48, 12, 16, 24); // Top curved spine
    ctx.lineTo(16, 28);
    ctx.bezierCurveTo(46, 44, 98, 44, 102, 26); // Lower belly
    ctx.closePath();
    ctx.fill();

    // Warm Cream Belly Underbody (#FEF3C7)
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(100, 28);
    ctx.bezierCurveTo(90, 42, 44, 42, 20, 28);
    ctx.bezierCurveTo(46, 40, 88, 40, 100, 28);
    ctx.closePath();
    ctx.fill();

    // Side Cream Racing Stripe (#FEF3C7)
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.moveTo(96, 24);
    ctx.bezierCurveTo(72, 24, 42, 24, 22, 26);
    ctx.lineTo(22, 29);
    ctx.bezierCurveTo(42, 27, 72, 27, 96, 27);
    ctx.closePath();
    ctx.fill();

    // Polished Brass Rivet Studs
    ctx.fillStyle = '#F59E0B';
    const rivets = [28, 44, 60, 76, 92];
    for (const rx of rivets) {
      ctx.beginPath();
      ctx.arc(rx, 25.5, 1.2, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
    canvas.refresh();
  }

  createBiplaneWings() {
    // 2X size: 240 x 140 (Displayed at 120 x 70)
    const canvas = this.textures.createCanvas('plane_wings', 240, 140);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Interplane Wing Struts (Bronze/wood with chrome brackets)
    ctx.strokeStyle = '#78350F';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(42, 16);
    ctx.lineTo(38, 52);
    ctx.moveTo(76, 16);
    ctx.lineTo(72, 52);
    ctx.stroke();

    // Chrome bracket joints
    ctx.fillStyle = '#E2E8F0';
    for (const [bx, by] of [[42, 16], [38, 52], [76, 16], [72, 52]]) {
      ctx.beginPath();
      ctx.arc(bx, by, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    // Lower Wing: Red with cream leading edge
    ctx.fillStyle = '#B91C1C';
    ctx.beginPath();
    ctx.roundRect(26, 48, 62, 11, 4);
    ctx.fill();
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.roundRect(32, 50, 54, 3.5, 1.5);
    ctx.fill();

    // Upper Wing: Swept Cherry Red with Cream leading edge
    const wingGrad = ctx.createLinearGradient(0, 4, 0, 18);
    wingGrad.addColorStop(0, '#EF4444');
    wingGrad.addColorStop(1, '#DC2626');
    ctx.fillStyle = wingGrad;
    ctx.beginPath();
    ctx.roundRect(22, 6, 76, 13, 5);
    ctx.fill();

    // Cream Leading Edge Stripe
    ctx.fillStyle = '#FEF3C7';
    ctx.beginPath();
    ctx.roundRect(30, 8, 64, 4, 2);
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplaneCowlingSpinner() {
    // 2X size: 64 x 90 (Displayed at 32 x 45)
    const canvas = this.textures.createCanvas('plane_cowling', 64, 90);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Golden-Yellow Radial Engine Cowling (#F59E0B)
    const cowGrad = ctx.createLinearGradient(4, 4, 28, 40);
    cowGrad.addColorStop(0, '#FBBF24');
    cowGrad.addColorStop(0.5, '#F59E0B');
    cowGrad.addColorStop(1, '#D97706');
    ctx.fillStyle = cowGrad;
    ctx.beginPath();
    ctx.roundRect(4, 8, 18, 28, 6);
    ctx.fill();

    // Polished Silver Front Ring (#E2E8F0)
    ctx.strokeStyle = '#E2E8F0';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.ellipse(22, 22, 3, 13, 0, 0, Math.PI * 2);
    ctx.stroke();

    // Glossy Conical Nose Spinner (#F59E0B / #FEF08A)
    const spinGrad = ctx.createLinearGradient(20, 16, 32, 28);
    spinGrad.addColorStop(0, '#FEF08A');
    spinGrad.addColorStop(0.5, '#F59E0B');
    spinGrad.addColorStop(1, '#B45309');
    ctx.fillStyle = spinGrad;
    ctx.beginPath();
    ctx.moveTo(22, 14);
    ctx.lineTo(31, 22);
    ctx.lineTo(22, 30);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplanePilot() {
    // 2X size: 80 x 80 (Displayed at 40 x 40)
    const canvas = this.textures.createCanvas('plane_pilot', 80, 80);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Curved Glass Windscreen (cyan tint with white reflection streak)
    ctx.fillStyle = 'rgba(186, 230, 253, 0.65)';
    ctx.strokeStyle = '#BAE6FD';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(28, 18, 12, Math.PI * 0.9, Math.PI * 1.9, false);
    ctx.lineTo(28, 28);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Specular reflection highlight
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.arc(26, 17, 9, Math.PI * 1.1, Math.PI * 1.5, false);
    ctx.stroke();

    // Pilot Body in Brown Leather Bomber Jacket (#5D4037)
    ctx.fillStyle = '#5D4037';
    ctx.beginPath();
    ctx.roundRect(10, 26, 18, 12, 4);
    ctx.fill();

    // Pilot Face (#FED7AA)
    ctx.fillStyle = '#FED7AA';
    ctx.beginPath();
    ctx.arc(18, 20, 7.5, 0, Math.PI * 2);
    ctx.fill();

    // Brown Aviator Leather Helmet (#78350F)
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.arc(18, 17, 7.5, Math.PI * 0.9, Math.PI * 2.1, false);
    ctx.lineTo(24, 22);
    ctx.lineTo(21, 26);
    ctx.lineTo(15, 26);
    ctx.lineTo(12, 22);
    ctx.closePath();
    ctx.fill();

    // Brass Aviator Goggles Frame (#F59E0B)
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.roundRect(14, 16, 11, 6, 2.5);
    ctx.fill();

    // Cyan Lenses (#38BDF8) with white shine
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(17.5, 19, 2.2, 0, Math.PI * 2);
    ctx.arc(22.5, 19, 2.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(18.2, 18.2, 0.8, 0, Math.PI * 2);
    ctx.arc(23.2, 18.2, 0.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplaneScarf() {
    // 2X size: 64 x 36 (Displayed at 32 x 18)
    const canvas = this.textures.createCanvas('plane_scarf', 64, 36);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Flowing White Aviator Scarf with Red Tip
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.moveTo(28, 6);
    ctx.bezierCurveTo(20, 2, 10, 10, 2, 8);
    ctx.lineTo(2, 14);
    ctx.bezierCurveTo(10, 16, 20, 8, 28, 11);
    ctx.closePath();
    ctx.fill();

    // Red racing tip
    ctx.fillStyle = '#DC2626';
    ctx.beginPath();
    ctx.moveTo(7, 9);
    ctx.lineTo(2, 8);
    ctx.lineTo(2, 14);
    ctx.lineTo(7, 13);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplanePropeller() {
    // 2X size: 32 x 120 (Displayed at 16 x 60)
    const canvas = this.textures.createCanvas('plane_propeller', 32, 120);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // 360-degree Translucent Spinning Propeller Blur Disc
    const grad = ctx.createRadialGradient(8, 30, 2, 8, 30, 28);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.85)');
    grad.addColorStop(0.35, 'rgba(254, 240, 138, 0.55)');
    grad.addColorStop(0.75, 'rgba(255, 255, 255, 0.25)');
    grad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(8, 30, 6, 28, 0, 0, Math.PI * 2);
    ctx.fill();

    // High-speed radial blur motion blades
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.lineTo(8, 56);
    ctx.stroke();

    // Brass hub center cap
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(8, 30, 4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplaneLandingGear() {
    // 2X size: 72 x 64 (Displayed at 36 x 32)
    const canvas = this.textures.createCanvas('plane_gear', 72, 64);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Sturdy V-Strut Landing Gear Struts (#475569)
    ctx.strokeStyle = '#475569';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(8, 4);
    ctx.lineTo(18, 22);
    ctx.moveTo(28, 4);
    ctx.lineTo(18, 22);
    ctx.stroke();

    // Oversized Charcoal-Grey Cartoon Tire (#1F2937)
    ctx.fillStyle = '#1F2937';
    ctx.beginPath();
    ctx.arc(18, 22, 9, 0, Math.PI * 2);
    ctx.fill();

    // Crisp White Hubcap (#F8FAFC)
    ctx.fillStyle = '#F8FAFC';
    ctx.beginPath();
    ctx.arc(18, 22, 4.5, 0, Math.PI * 2);
    ctx.fill();

    // Brass center lug nut (#F59E0B)
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(18, 22, 1.8, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createBiplaneFlameVFX() {
    // 2X size: 96 x 48 (Displayed at 48 x 24)
    const canvas = this.textures.createCanvas('plane_flame', 96, 48);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.scale(2, 2);

    // Two-Layer Animated Yellow-Orange Booster Jet Flame
    // Outer flame: Intense orange/red (#EA580C -> #DC2626)
    const outerGrad = ctx.createRadialGradient(42, 12, 2, 24, 12, 22);
    outerGrad.addColorStop(0, '#FEF08A');
    outerGrad.addColorStop(0.3, '#F59E0B');
    outerGrad.addColorStop(0.7, '#EA580C');
    outerGrad.addColorStop(1, 'rgba(220, 38, 38, 0)');
    ctx.fillStyle = outerGrad;
    ctx.beginPath();
    ctx.moveTo(46, 5);
    ctx.quadraticCurveTo(24, 2, 4, 12);
    ctx.quadraticCurveTo(24, 22, 46, 19);
    ctx.closePath();
    ctx.fill();

    // Inner flame core: Electric yellow/white (#FFFFFF -> #FEF08A)
    const innerGrad = ctx.createRadialGradient(44, 12, 1, 32, 12, 12);
    innerGrad.addColorStop(0, '#FFFFFF');
    innerGrad.addColorStop(0.5, '#FEF08A');
    innerGrad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = innerGrad;
    ctx.beginPath();
    ctx.moveTo(46, 8);
    ctx.quadraticCurveTo(34, 7, 20, 12);
    ctx.quadraticCurveTo(34, 17, 46, 16);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createSmokePuffTexture() {
    // 2X size: 48 x 48 (Displayed at 24 x 24)
    const canvas = this.textures.createCanvas('smoke_circle', 48, 48);
    const ctx = canvas.getContext();

    const grad = ctx.createRadialGradient(24, 24, 4, 24, 24, 22);
    grad.addColorStop(0, 'rgba(255, 255, 255, 0.9)');
    grad.addColorStop(0.65, 'rgba(241, 245, 249, 0.75)');
    grad.addColorStop(1, 'rgba(226, 232, 240, 0)');

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(24, 24, 22, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  /* ========================================================================
     2. MULTI-LAYER PARALLAX WORLD TEXTURES
     ======================================================================== */

  createMountainsTexture() {
    // Layer 1: Subtle, low-contrast pastel sky-blue distant horizon silhouette (0.15x parallax)
    // 1024 x 650 — extended bottom fill to groundY + 350px (zero blue sky seam at 2100+ FT)
    const canvas = this.textures.createCanvas('bg_mountains', 1024, 650);
    const ctx = canvas.getContext();

    // Gentle horizon ridge silhouettes (periodic heights at x=0 and x=1024)
    const peaks = [
      { x: 0, h: 65 },
      { x: 160, h: 80 },
      { x: 340, h: 60 },
      { x: 520, h: 85 },
      { x: 700, h: 68 },
      { x: 880, h: 82 },
      { x: 1024, h: 65 }
    ];

    // Rear distant mountain horizon ridge (softest sky-blue silhouette blending into sky)
    ctx.fillStyle = '#A3D2F8';
    ctx.beginPath();
    ctx.moveTo(0, 650);
    for (const p of peaks) {
      ctx.lineTo(p.x, 260 - p.h * 0.75);
    }
    ctx.lineTo(1024, 650);
    ctx.closePath();
    ctx.fill();

    // Front horizon ridge (gentle pastel mountain blue, zero distracting white snow caps)
    ctx.fillStyle = '#89C4F3';
    ctx.beginPath();
    ctx.moveTo(0, 650);
    for (const p of peaks) {
      ctx.lineTo(p.x, 260 - p.h);
    }
    ctx.lineTo(1024, 650);
    ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  createHillsTexture() {
    // Layer 2: Rolling green pastoral hills with trees (0.35x parallax)
    // 1024 x 600 — periodic profile with smooth C1 continuity (zero cliff seam on repeat)
    const canvas = this.textures.createCanvas('bg_hills', 1024, 600);
    const ctx = canvas.getContext();

    // Mathematically periodic hill profiles: identical height and slope at x = 0 and x = 1024
    const rearHillY = (x) => {
      const th = (x / 1024) * Math.PI * 2;
      return 92 + Math.sin(th) * 32 + Math.cos(th * 2) * 14;
    };

    const frontHillY = (x) => {
      const th = (x / 1024) * Math.PI * 2;
      return 132 + Math.sin(th + 1.2) * 36 + Math.cos(th * 2 + 0.6) * 16;
    };

    // Rear hill ridge (fills solid down to 600)
    ctx.fillStyle = '#65A30D';
    ctx.beginPath();
    ctx.moveTo(0, 600);
    for (let x = 0; x <= 1024; x += 8) {
      ctx.lineTo(x, rearHillY(x));
    }
    ctx.lineTo(1024, 600);
    ctx.closePath();
    ctx.fill();

    // Front hill ridge (fills solid down to 600)
    ctx.fillStyle = '#84CC16';
    ctx.beginPath();
    ctx.moveTo(0, 600);
    for (let x = 0; x <= 1024; x += 8) {
      ctx.lineTo(x, frontHillY(x));
    }
    ctx.lineTo(1024, 600);
    ctx.closePath();
    ctx.fill();

    // Round cartoon trees along the front crest
    const treeX = [60, 140, 220, 310, 410, 500, 620, 710, 800, 890, 970];
    for (const tx of treeX) {
      const ty = frontHillY(tx);
      // Trunk anchored into ground
      ctx.fillStyle = '#5D4037';
      ctx.fillRect(tx - 2, ty, 4, 18);
      // Foliage
      ctx.fillStyle = '#4D7C0F';
      ctx.beginPath();
      ctx.arc(tx, ty - 4, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#65A30D';
      ctx.beginPath();
      ctx.arc(tx - 3, ty - 7, 9, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.refresh();
  }

  createTownFarmlandPanorama() {
    // Layer 3: Vibrant Township Town and Farmland panorama (0.65x parallax)
    // Seamless repeating 1280 x 200 tile.
    // 0 FT to 70 FT (0 to 420 px in tile) is clean unobstructed airfield lawn!
    // European houses, barns, silos, and windmills start at x >= 430 px.
    const canvas = this.textures.createCanvas('bg_town_panorama', 1280, 200);
    const ctx = canvas.getContext();

    // Ground base ribbon flush to bottom
    ctx.fillStyle = '#4ADE80';
    ctx.fillRect(0, 182, 1280, 18);

    // Unobstructed Airfield Meadow (0 to 420 px): only gentle grass & distant small trees
    this._drawOakTree(ctx, 110, 150);
    this._drawOakTree(ctx, 290, 145);

    // 1. European Town House 1 (Cherry Red wall, terracotta roof, 2-story) - flush at y=200
    this._drawHouse(ctx, 440, 75, 70, 125, '#EF4444', '#B91C1C', '#FED7AA');

    // 2. European Town House 2 (Pastel Yellow wall, dark slate roof, blue awning) - flush at y=200
    this._drawHouse(ctx, 525, 60, 65, 140, '#FEF08A', '#475569', '#38BDF8');

    // 3. Round Shade Tree
    this._drawOakTree(ctx, 610, 140);

    // 4. Church with Steeple & Cross - flush at y=200
    this._drawChurch(ctx, 645, 30, 90, 170);

    // 5. Red Farm Barn with White X-Trim - flush at y=200
    this._drawBarn(ctx, 755, 65, 110, 135);

    // 6. Grain Silo (Silver cylinder with domed roof) - flush at y=200
    this._drawSilo(ctx, 880, 50, 45, 150);

    // 7. Windmill Body (Tower) at x = 945, w = 60, h = 155 (base at y=200, hub at x=975, y=70)
    this._drawWindmillTower(ctx, 945, 45, 60, 155);

    // 8. European Town House 3 (Sky Blue wall, terracotta roof) - flush at y=200
    this._drawHouse(ctx, 1030, 70, 65, 130, '#60A5FA', '#DC2626', '#FEF3C7');

    // 9. European Town House 4 (Warm Cream wall, green awning) - flush at y=200
    this._drawHouse(ctx, 1110, 80, 60, 120, '#FEF3C7', '#78350F', '#22C55E');

    // 10. End Oak Trees
    this._drawOakTree(ctx, 1200, 140);
    this._drawOakTree(ctx, 1245, 145);

    canvas.refresh();
  }

  _drawHouse(ctx, x, y, w, h, wallColor, roofColor, awningColor) {
    // Walls
    ctx.fillStyle = wallColor;
    ctx.fillRect(x, y + 25, w, h - 25);

    // Terracotta / Slate Roof
    ctx.fillStyle = roofColor;
    ctx.beginPath();
    ctx.moveTo(x - 6, y + 25);
    ctx.lineTo(x + w / 2, y);
    ctx.lineTo(x + w + 6, y + 25);
    ctx.closePath();
    ctx.fill();

    // Windows (white frames, blue glass)
    const winW = 12, winH = 16;
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(x + 10, y + 36, winW, winH);
    ctx.fillRect(x + w - 22, y + 36, winW, winH);
    ctx.fillRect(x + 10, y + 62, winW, winH);
    ctx.fillRect(x + w - 22, y + 62, winW, winH);

    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(x + 12, y + 38, winW - 4, winH - 4);
    ctx.fillRect(x + w - 20, y + 38, winW - 4, winH - 4);
    ctx.fillRect(x + 12, y + 64, winW - 4, winH - 4);
    ctx.fillRect(x + w - 20, y + 64, winW - 4, winH - 4);

    // Door & Awning
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(x + w / 2 - 8, y + h - 22, 16, 22);

    // Striped Awning
    ctx.fillStyle = awningColor;
    ctx.beginPath();
    ctx.roundRect(x + w / 2 - 14, y + h - 26, 28, 6, 2);
    ctx.fill();
  }

  _drawChurch(ctx, x, y, w, h) {
    // Main Hall
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(x + 35, y + 50, w - 35, h - 50);

    // Steeple Tower
    ctx.fillStyle = '#E2E8F0';
    ctx.fillRect(x, y + 30, 35, h - 30);

    // Tall Pointed Spire
    ctx.fillStyle = '#475569';
    ctx.beginPath();
    ctx.moveTo(x - 2, y + 30);
    ctx.lineTo(x + 17.5, y);
    ctx.lineTo(x + 37, y + 30);
    ctx.closePath();
    ctx.fill();

    // Brass Cross atop Spire
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(x + 16, y - 10, 3, 12);
    ctx.fillRect(x + 13, y - 6, 9, 3);

    // Church Rose Window
    ctx.fillStyle = '#38BDF8';
    ctx.beginPath();
    ctx.arc(x + 17.5, y + 55, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1.5;
    ctx.stroke();
  }

  _drawBarn(ctx, x, y, w, h) {
    // Gambrel Barn Body in Red (#DC2626)
    ctx.fillStyle = '#DC2626';
    ctx.fillRect(x, y + 30, w, h - 30);

    // Gambrel Barn Roof
    ctx.fillStyle = '#991B1B';
    ctx.beginPath();
    ctx.moveTo(x - 5, y + 30);
    ctx.lineTo(x + w * 0.2, y + 10);
    ctx.lineTo(x + w * 0.5, y);
    ctx.lineTo(x + w * 0.8, y + 10);
    ctx.lineTo(x + w + 5, y + 30);
    ctx.closePath();
    ctx.fill();

    // Barn Doors with White X-Trim
    ctx.fillStyle = '#7F1D1D';
    ctx.fillRect(x + w / 2 - 20, y + h - 35, 40, 35);
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.strokeRect(x + w / 2 - 20, y + h - 35, 40, 35);
    ctx.beginPath();
    ctx.moveTo(x + w / 2 - 20, y + h - 35);
    ctx.lineTo(x + w / 2 + 20, y + h);
    ctx.moveTo(x + w / 2 + 20, y + h - 35);
    ctx.lineTo(x + w / 2 - 20, y + h);
    ctx.stroke();
  }

  _drawSilo(ctx, x, y, w, h) {
    // Silver Cylindrical Silo
    const grad = ctx.createLinearGradient(x, 0, x + w, 0);
    grad.addColorStop(0, '#E2E8F0');
    grad.addColorStop(0.5, '#F8FAFC');
    grad.addColorStop(1, '#94A3B8');
    ctx.fillStyle = grad;
    ctx.fillRect(x, y + 18, w, h - 18);

    // Domed Cap
    ctx.fillStyle = '#CBD5E1';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 18, w / 2, Math.PI, 0, false);
    ctx.fill();

    // Silo bands
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    for (let sy = y + 35; sy < y + h; sy += 22) {
      ctx.beginPath();
      ctx.moveTo(x, sy);
      ctx.lineTo(x + w, sy);
      ctx.stroke();
    }
  }

  _drawWindmillTower(ctx, x, y, w, h) {
    // Tapered Wooden Windmill Tower
    ctx.fillStyle = '#D97706';
    ctx.beginPath();
    ctx.moveTo(x + 12, y + 20);
    ctx.lineTo(x + w - 12, y + 20);
    ctx.lineTo(x + w, y + h);
    ctx.lineTo(x, y + h);
    ctx.closePath();
    ctx.fill();

    // Roof cap
    ctx.fillStyle = '#78350F';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 20, w / 2 - 8, Math.PI, 0);
    ctx.fill();

    // Center hub pin
    ctx.fillStyle = '#1F2937';
    ctx.beginPath();
    ctx.arc(x + w / 2, y + 20, 5, 0, Math.PI * 2);
    ctx.fill();
  }

  _drawOakTree(ctx, cx, cy) {
    // Tree Trunk flush to ground line y=200
    ctx.fillStyle = '#5D4037';
    ctx.fillRect(cx - 5, cy + 18, 10, Math.max(10, 200 - (cy + 18)));

    // Fluffy Green Foliage Canopy
    ctx.fillStyle = '#15803D';
    ctx.beginPath();
    ctx.arc(cx - 12, cy + 8, 18, 0, Math.PI * 2);
    ctx.arc(cx + 12, cy + 8, 18, 0, Math.PI * 2);
    ctx.arc(cx, cy - 6, 22, 0, Math.PI * 2);
    ctx.fill();

    // Sunlit highlights
    ctx.fillStyle = '#22C55E';
    ctx.beginPath();
    ctx.arc(cx - 5, cy - 4, 15, 0, Math.PI * 2);
    ctx.fill();
  }

  createWindmillBladesTexture() {
    // 4-Blade Wooden Windmill Sail (Rotates in scene update!)
    // 140 x 140
    const canvas = this.textures.createCanvas('prop_windmill_blades', 140, 140);
    const ctx = canvas.getContext();

    ctx.save();
    ctx.translate(70, 70);

    for (let i = 0; i < 4; i++) {
      ctx.rotate(Math.PI / 2);

      // Wood spar
      ctx.strokeStyle = '#78350F';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(0, -58);
      ctx.stroke();

      // Canvas sail blade lattice
      ctx.fillStyle = '#FEF3C7';
      ctx.strokeStyle = '#B45309';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.roundRect(3, -56, 15, 44, 2);
      ctx.fill();
      ctx.stroke();
    }

    // Center brass hub
    ctx.fillStyle = '#F59E0B';
    ctx.beginPath();
    ctx.arc(0, 0, 7, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
    canvas.refresh();
  }

  createHangarTowerTexture() {
    // Airport Hangar & Control Tower (Rooted at 0-50 FT)
    // 380 x 220
    const canvas = this.textures.createCanvas('prop_hangar_tower', 380, 220);
    const ctx = canvas.getContext();

    // Hangar (Barrel curved roof)
    ctx.fillStyle = '#64748B';
    ctx.beginPath();
    ctx.arc(140, 150, 100, Math.PI, 0, false);
    ctx.fill();

    ctx.fillStyle = '#94A3B8';
    ctx.beginPath();
    ctx.arc(140, 150, 92, Math.PI, 0, false);
    ctx.fill();

    // Hangar Walls & Doors
    ctx.fillStyle = '#334155';
    ctx.fillRect(40, 150, 200, 70);

    // Yellow & Black Hazard Stripes on Hangar Doors
    ctx.fillStyle = '#F59E0B';
    ctx.fillRect(60, 160, 160, 60);
    ctx.fillStyle = '#0F172A';
    for (let hx = 65; hx < 215; hx += 20) {
      ctx.beginPath();
      ctx.moveTo(hx, 160);
      ctx.lineTo(hx + 10, 160);
      ctx.lineTo(hx - 5, 220);
      ctx.lineTo(hx - 15, 220);
      ctx.closePath();
      ctx.fill();
    }

    // Control Tower (Right of Hangar)
    // Concrete Tower Column
    const colGrad = ctx.createLinearGradient(270, 0, 310, 0);
    colGrad.addColorStop(0, '#E2E8F0');
    colGrad.addColorStop(1, '#94A3B8');
    ctx.fillStyle = colGrad;
    ctx.fillRect(275, 70, 36, 150);

    // Observation Deck Cab (Surrounded by glass)
    ctx.fillStyle = '#1E293B';
    ctx.fillRect(265, 45, 56, 26);
    ctx.fillStyle = '#38BDF8';
    ctx.fillRect(268, 48, 50, 16);

    // Tower Roof & Beacon
    ctx.fillStyle = '#E2E8F0';
    ctx.beginPath();
    ctx.roundRect(260, 38, 66, 8, 3);
    ctx.fill();

    // Red Aviation Beacon Light
    ctx.fillStyle = '#EF4444';
    ctx.beginPath();
    ctx.arc(293, 32, 5, 0, Math.PI * 2);
    ctx.fill();

    // Radar dish
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(293, 20, 10, Math.PI * 0.7, Math.PI * 1.8);
    ctx.stroke();

    canvas.refresh();
  }

  createWindsockTexture() {
    // Animated orange-and-white windsock
    // 64 x 36
    const canvas = this.textures.createCanvas('prop_windsock', 64, 36);
    const ctx = canvas.getContext();

    // Pole
    ctx.strokeStyle = '#94A3B8';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(10, 34);
    ctx.lineTo(10, 4);
    ctx.stroke();

    // Windsock body stripes (Orange & White)
    const stripes = ['#F97316', '#FFFFFF', '#F97316', '#FFFFFF', '#F97316'];
    let sx = 12;
    for (let i = 0; i < stripes.length; i++) {
      ctx.fillStyle = stripes[i];
      const h1 = 16 - i * 1.8;
      const h2 = 16 - (i + 1) * 1.8;
      ctx.beginPath();
      ctx.moveTo(sx, 6 + (16 - h1) / 2);
      ctx.lineTo(sx + 8, 6 + (16 - h2) / 2);
      ctx.lineTo(sx + 8, 6 + (16 + h2) / 2);
      ctx.lineTo(sx, 6 + (16 + h1) / 2);
      ctx.closePath();
      ctx.fill();
      sx += 8;
    }

    canvas.refresh();
  }

  createCloudTexture() {
    // Soft, small translucent cartoon cloud
    // 200 x 90
    const canvas = this.textures.createCanvas('big_cloud', 200, 90);
    const ctx = canvas.getContext();

    // Soft sky-blue underside tint
    ctx.fillStyle = 'rgba(219, 234, 254, 0.40)';
    ctx.beginPath();
    ctx.arc(55, 50, 32, 0, Math.PI * 2);
    ctx.arc(100, 42, 40, 0, Math.PI * 2);
    ctx.arc(145, 50, 32, 0, Math.PI * 2);
    ctx.roundRect(25, 42, 150, 36, 18);
    ctx.fill();

    // Soft white cloud puffs
    ctx.fillStyle = 'rgba(255, 255, 255, 0.85)';
    ctx.beginPath();
    ctx.arc(55, 46, 30, 0, Math.PI * 2);
    ctx.arc(100, 36, 38, 0, Math.PI * 2);
    ctx.arc(145, 46, 30, 0, Math.PI * 2);
    ctx.roundRect(24, 38, 152, 34, 17);
    ctx.fill();

    canvas.refresh();
  }

  /* ========================================================================
     3. RUNWAY & SLINGSHOT INFRASTRUCTURE
     ======================================================================== */

  createSlingshotTexture() {
    // 2X size: 120 x 220 (Displayed at 60 x 110)
    const canvas = this.textures.createCanvas('slingshot', 120, 220);
    const ctx = canvas.getContext();

    // 1. Concrete ground base anchored onto the runway pavement
    const baseGrad = ctx.createLinearGradient(20, 190, 100, 190);
    baseGrad.addColorStop(0, '#94A3B8');
    baseGrad.addColorStop(0.5, '#CBD5E1');
    baseGrad.addColorStop(1, '#64748B');
    ctx.fillStyle = baseGrad;
    ctx.beginPath();
    ctx.roundRect(16, 186, 88, 28, 6);
    ctx.fill();
    ctx.strokeStyle = '#3B2314';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // 2. Sturdy Y-shaped Wooden Catapult Post
    const woodGrad = ctx.createLinearGradient(35, 30, 85, 186);
    woodGrad.addColorStop(0, '#A16207');
    woodGrad.addColorStop(0.4, '#854D0E');
    woodGrad.addColorStop(1, '#713F12');
    ctx.fillStyle = woodGrad;

    // Upright central trunk (from y=100 down to base y=190)
    ctx.beginPath();
    ctx.roundRect(46, 100, 28, 90, 4);
    ctx.fill();
    ctx.strokeStyle = '#3B2314';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Wood grain texture ridges on trunk
    ctx.strokeStyle = 'rgba(69, 26, 3, 0.4)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(54, 115);
    ctx.lineTo(54, 175);
    ctx.moveTo(66, 125);
    ctx.lineTo(66, 180);
    ctx.stroke();

    // Symmetrical Y-Fork Branches splitting at y=105 up to tips at (24, 28) and (96, 28)
    // Left branch
    ctx.fillStyle = woodGrad;
    ctx.beginPath();
    ctx.moveTo(48, 116);
    ctx.bezierCurveTo(34, 90, 20, 60, 16, 28);
    ctx.lineTo(34, 26);
    ctx.bezierCurveTo(38, 55, 52, 85, 60, 106);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3B2314';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Right branch
    ctx.beginPath();
    ctx.moveTo(72, 116);
    ctx.bezierCurveTo(86, 90, 100, 60, 104, 28);
    ctx.lineTo(86, 26);
    ctx.bezierCurveTo(82, 55, 68, 85, 60, 106);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#3B2314';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Brass Anchor Brackets and Pegs at both fork tips
    const drawPeg = (px, py) => {
      // Golden brass peg
      const pegGrad = ctx.createRadialGradient(px, py, 2, px, py, 10);
      pegGrad.addColorStop(0, '#FEF08A');
      pegGrad.addColorStop(0.5, '#FACC15');
      pegGrad.addColorStop(1, '#B45309');
      ctx.fillStyle = pegGrad;
      ctx.beginPath();
      ctx.arc(px, py, 10, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#3B2314';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Inner rivet dot
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(px - 2, py - 2, 2.5, 0, Math.PI * 2);
      ctx.fill();
    };

    drawPeg(25, 27); // Left fork anchor peg
    drawPeg(95, 27); // Right fork anchor peg

    canvas.refresh();
  }

  createTrajectoryPip() {
    // 20 x 20 px high-contrast white trajectory pip with dark rim & glossy highlight
    const canvas = this.textures.createCanvas('trajectory_pip', 20, 20);
    const ctx = canvas.getContext();

    // Subtle dark rim for high contrast against white clouds or pale sky
    ctx.fillStyle = 'rgba(15, 23, 42, 0.55)';
    ctx.beginPath();
    ctx.arc(10, 10, 8.5, 0, Math.PI * 2);
    ctx.fill();

    // Solid bright white core
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(10, 10, 7.0, 0, Math.PI * 2);
    ctx.fill();

    // Tiny glossy highlight
    ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
    ctx.beginPath();
    ctx.arc(8.5, 8.5, 3.0, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  createRunwayGroundTexture() {
    // 560 x 225 px seamlessly repeating runway and ground tile
    // 560 px width aligns perfectly with 28px picket fence (20 pickets) and 80px runway dashes (7 dashes)
    const canvas = this.textures.createCanvas('runway_infinite_ground', 560, 225);
    const ctx = canvas.getContext();

    // 1. Grass verge underbody (above paved road: y = 0 to 40)
    ctx.fillStyle = '#74C043';
    ctx.fillRect(0, 0, 560, 40);

    // Subtle grass texture
    ctx.fillStyle = '#7ecb4b';
    for (let x = 4; x < 560; x += 16) {
      ctx.fillRect(x, 10, 6, 12);
    }

    // Darker green grass accent border (y = 36 to 40)
    ctx.fillStyle = '#4CAE2A';
    ctx.fillRect(0, 36, 560, 4);

    // 2. White wooden picket fence line along the grass verge (y = 10 to 34)
    // 20 pickets spaced every 28px
    ctx.strokeStyle = '#FFFFFF';
    ctx.fillStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    for (let x = 0; x < 560; x += 28) {
      // Picket post outline
      ctx.strokeRect(x, 19, 20, 14);
      // Center picket upright
      ctx.beginPath();
      ctx.moveTo(x + 10, 13);
      ctx.lineTo(x + 10, 33);
      ctx.stroke();
    }

    // 3. Paved asphalt/tan runway road surface (y = 40 to 170, 130px height, centered at y = 95)
    const roadGrad = ctx.createLinearGradient(0, 40, 0, 170);
    roadGrad.addColorStop(0, '#C9A982');
    roadGrad.addColorStop(0.5, '#D3B58D');
    roadGrad.addColorStop(1, '#BFA17A');
    ctx.fillStyle = roadGrad;
    ctx.fillRect(0, 40, 560, 130);

    // Subtle edge borders on road
    ctx.fillStyle = 'rgba(0, 0, 0, 0.12)';
    ctx.fillRect(0, 40, 560, 3);
    ctx.fillRect(0, 167, 560, 3);

    // 4. Asphalt centerline dashed stripes right along y = 92 to 98 (7 dashes every 80px)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.90)';
    for (let x = 20; x < 560; x += 80) {
      ctx.fillRect(x, 92, 48, 6);
    }

    // 5. Lower ground grass layer (y = 170 to 225)
    const lowerGrassGrad = ctx.createLinearGradient(0, 170, 0, 225);
    lowerGrassGrad.addColorStop(0, '#65AC38');
    lowerGrassGrad.addColorStop(1, '#4A8723');
    ctx.fillStyle = lowerGrassGrad;
    ctx.fillRect(0, 170, 560, 55);

    canvas.refresh();
  }

  createMilestoneMarker() {
    const canvas = this.textures.createCanvas('signpost_base', 64, 72);
    const ctx = canvas.getContext();

    // Post
    ctx.fillStyle = '#6D4C41';
    ctx.fillRect(28, 30, 8, 42);

    // Board
    ctx.fillStyle = '#FFF8E1';
    ctx.strokeStyle = '#8D6E63';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.roundRect(4, 6, 56, 32, 6);
    ctx.fill();
    ctx.stroke();

    canvas.refresh();
  }

  createBoosterBarTextures() {
    // 1. Frame: 280 x 28 px
    const frameCanvas = this.textures.createCanvas('booster_frame', 280, 28);
    const fctx = frameCanvas.getContext();
    fctx.fillStyle = '#0F172A';
    fctx.strokeStyle = '#F59E0B';
    fctx.lineWidth = 3.5;
    fctx.beginPath();
    fctx.roundRect(2, 2, 276, 24, 12);
    fctx.fill();
    fctx.stroke();
    frameCanvas.refresh();

    // 2. Fill: 244 x 18 px (4px padding inside frame)
    const fillCanvas = this.textures.createCanvas('booster_fill', 244, 18);
    const fillCtx = fillCanvas.getContext();
    const grad = fillCtx.createLinearGradient(0, 0, 0, 18);
    grad.addColorStop(0, '#FEF08A');
    grad.addColorStop(0.45, '#FDE047');
    grad.addColorStop(1, '#F59E0B');
    fillCtx.fillStyle = grad;
    fillCtx.beginPath();
    fillCtx.roundRect(0, 0, 244, 18, 9);
    fillCtx.fill();

    // Subtle specular glint
    fillCtx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
    fillCtx.lineWidth = 2;
    fillCtx.beginPath();
    fillCtx.moveTo(8, 3);
    fillCtx.lineTo(236, 3);
    fillCtx.stroke();
    fillCanvas.refresh();

    // 3. Bold Cartoon Lightning Emblem Medallion Cap on Left End: 40 x 40 px
    const emblemCanvas = this.textures.createCanvas('booster_emblem', 40, 40);
    const ectx = emblemCanvas.getContext();

    // Outer golden medallion
    const medGrad = ectx.createRadialGradient(16, 14, 2, 20, 20, 19);
    medGrad.addColorStop(0, '#FEF08A');
    medGrad.addColorStop(0.5, '#FACC15');
    medGrad.addColorStop(1, '#D97706');
    ectx.fillStyle = medGrad;
    ectx.beginPath();
    ectx.arc(20, 20, 18, 0, Math.PI * 2);
    ectx.fill();
    ectx.strokeStyle = '#3B2314';
    ectx.lineWidth = 3.5;
    ectx.stroke();

    // Inner rim
    ectx.strokeStyle = '#FEF08A';
    ectx.lineWidth = 1.5;
    ectx.beginPath();
    ectx.arc(20, 20, 14.5, 0, Math.PI * 2);
    ectx.stroke();

    // Bold Lightning Bolt Emblem
    ectx.fillStyle = '#0284C7';
    ectx.beginPath();
    ectx.moveTo(22, 6);
    ectx.lineTo(13, 20);
    ectx.lineTo(19, 20);
    ectx.lineTo(17, 34);
    ectx.lineTo(28, 18);
    ectx.lineTo(21, 18);
    ectx.closePath();
    ectx.fill();
    ectx.strokeStyle = '#3B2314';
    ectx.lineWidth = 2.5;
    ectx.lineJoin = 'round';
    ectx.stroke();

    // Inner neon-cyan lightning core
    ectx.fillStyle = '#38BDF8';
    ectx.beginPath();
    ectx.moveTo(22, 8);
    ectx.lineTo(15, 19);
    ectx.lineTo(20, 19);
    ectx.lineTo(18, 31);
    ectx.lineTo(26, 18);
    ectx.lineTo(21, 18);
    ectx.closePath();
    ectx.fill();

    // Specular highlight glint
    ectx.fillStyle = '#FFFFFF';
    ectx.beginPath();
    ectx.arc(14, 12, 2.5, 0, Math.PI * 2);
    ectx.fill();

    emblemCanvas.refresh();
  }

  /* ========================================================================
     4. SIX AUTHENTIC HIGH-CONTRAST COLLECTIBLES (2X SUPERSAMPLED, ZERO EMOJIS)
     ======================================================================== */

  createWingedStarTexture() {
    // 2X size: 104 x 104 (Displayed at 52 x 52 px)
    // Clean, simple, ultra-bright golden-yellow 5-pointed star (⭐ style, ZERO dark internal facet lines)
    const canvas = this.textures.createCanvas('winged_star', 104, 104);
    const ctx = canvas.getContext();

    const cx = 52, cy = 52;

    // 1. Bright outer golden-white glow halo
    const halo = ctx.createRadialGradient(cx, cy, 10, cx, cy, 48);
    halo.addColorStop(0, 'rgba(255, 255, 220, 0.85)');
    halo.addColorStop(0.35, 'rgba(255, 234, 0, 0.60)');
    halo.addColorStop(0.7, 'rgba(255, 179, 0, 0.25)');
    halo.addColorStop(1, 'rgba(255, 179, 0, 0.0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(cx, cy, 48, 0, Math.PI * 2);
    ctx.fill();

    // 2. 5-Pointed Star Vertices
    const outerR = 36, innerR = 15.5;
    const points = [];
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = (i % 2 === 0) ? outerR : innerR;
      points.push({ x: cx + Math.cos(angle) * r, y: cy + Math.sin(angle) * r });
    }

    const starPath = () => {
      ctx.beginPath();
      ctx.moveTo(points[0].x, points[0].y);
      for (let i = 1; i < 10; i++) {
        ctx.lineTo(points[i].x, points[i].y);
      }
      ctx.closePath();
    };

    // 3. Soft warm golden-yellow edge shading (#ffb300) backing
    const edgeGrad = ctx.createLinearGradient(cx, cy - 36, cx, cy + 36);
    edgeGrad.addColorStop(0, '#ffea00');
    edgeGrad.addColorStop(0.65, '#ffca28');
    edgeGrad.addColorStop(1, '#ffb300');
    ctx.fillStyle = edgeGrad;
    starPath();
    ctx.fill();

    // Clean warm golden-amber border outline (#f59e0b) - zero dark-brown lines!
    ctx.strokeStyle = '#d97706';
    ctx.lineWidth = 2.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // 4. Ultra-bright golden-yellow inner face (#ffea00) with top shine
    const innerFaceGrad = ctx.createRadialGradient(cx - 3, cy - 8, 4, cx, cy, 32);
    innerFaceGrad.addColorStop(0, '#ffffff');
    innerFaceGrad.addColorStop(0.35, '#fff740');
    innerFaceGrad.addColorStop(0.8, '#ffea00');
    innerFaceGrad.addColorStop(1, 'rgba(255, 234, 0, 0)');
    ctx.fillStyle = innerFaceGrad;
    starPath();
    ctx.fill();

    // 5. Crisp curved specular shine along top-left arm
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 3.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(cx - 2, cy - 28);
    ctx.quadraticCurveTo(cx - 10, cy - 14, cx - 22, cy - 7);
    ctx.stroke();

    // Top glint sparkle dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(cx - 2, cy - 26, 2.8, 0, Math.PI * 2);
    ctx.fill();

    canvas.refresh();
  }

  createBatteryCanisterTexture() {
    // 2X size: 112 x 128 (Displayed at 56 x 64)
    const canvas = this.textures.createCanvas('battery_canister', 112, 128);
    const ctx = canvas.getContext();

    // 1. Cyan/yellow energy glow halo
    const halo = ctx.createRadialGradient(56, 64, 12, 56, 64, 54);
    halo.addColorStop(0, 'rgba(34, 211, 238, 0.45)');
    halo.addColorStop(0.6, 'rgba(250, 204, 21, 0.20)');
    halo.addColorStop(1, 'rgba(34, 211, 238, 0.0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(56, 64, 54, 0, Math.PI * 2);
    ctx.fill();

    // 2. Brass Positive Terminal Cap
    const brassGrad = ctx.createLinearGradient(46, 8, 66, 8);
    brassGrad.addColorStop(0, '#FEF08A');
    brassGrad.addColorStop(0.5, '#F59E0B');
    brassGrad.addColorStop(1, '#B45309');
    ctx.fillStyle = brassGrad;
    ctx.beginPath();
    ctx.roundRect(45, 8, 22, 16, 4);
    ctx.fill();
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 3;
    ctx.stroke();

    // 3. Cylindrical Battery Casing (Turquoise & Dark Teal)
    const caseGrad = ctx.createLinearGradient(20, 22, 92, 22);
    caseGrad.addColorStop(0, '#22D3EE');
    caseGrad.addColorStop(0.2, '#06B6D4');
    caseGrad.addColorStop(0.7, '#0891B2');
    caseGrad.addColorStop(1, '#0E7490');
    ctx.fillStyle = caseGrad;
    ctx.beginPath();
    ctx.roundRect(20, 22, 72, 96, 14);
    ctx.fill();
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Left vertical specular highlight streak
    ctx.fillStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.beginPath();
    ctx.roundRect(26, 26, 6, 88, 3);
    ctx.fill();

    // 4. Neon Charge Window
    ctx.fillStyle = '#0F172A';
    ctx.beginPath();
    ctx.roundRect(30, 36, 52, 68, 8);
    ctx.fill();
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Glowing charge liquid level (lime/yellow)
    const neonGrad = ctx.createLinearGradient(30, 50, 30, 104);
    neonGrad.addColorStop(0, '#A3E635');
    neonGrad.addColorStop(0.5, '#FACC15');
    neonGrad.addColorStop(1, '#EAB308');
    ctx.fillStyle = neonGrad;
    ctx.beginPath();
    ctx.roundRect(32, 50, 48, 52, 6);
    ctx.fill();

    // Charge level ticks
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
    ctx.lineWidth = 2;
    for (let ty = 60; ty < 100; ty += 12) {
      ctx.beginPath();
      ctx.moveTo(34, ty);
      ctx.lineTo(44, ty);
      ctx.stroke();
    }

    // 5. Bold Lightning Bolt Emblem
    ctx.fillStyle = '#FFFFFF';
    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(63, 40);
    ctx.lineTo(44, 68);
    ctx.lineTo(58, 68);
    ctx.lineTo(46, 96);
    ctx.lineTo(68, 62);
    ctx.lineTo(55, 62);
    ctx.closePath();

    const boltGrad = ctx.createLinearGradient(44, 40, 68, 96);
    boltGrad.addColorStop(0, '#FFFFFF');
    boltGrad.addColorStop(0.4, '#FEF08A');
    boltGrad.addColorStop(1, '#F59E0B');
    ctx.fillStyle = boltGrad;
    ctx.fill();
    ctx.stroke();

    canvas.refresh();
  }

  createHorseshoeMagnetTexture() {
    // 2X size: 116 x 116 (Displayed at 58 x 58)
    const canvas = this.textures.createCanvas('horseshoe_magnet', 116, 116);
    const ctx = canvas.getContext();

    // 1. Soft red/cyan glow halo
    const halo = ctx.createRadialGradient(58, 58, 12, 58, 58, 54);
    halo.addColorStop(0, 'rgba(239, 68, 68, 0.35)');
    halo.addColorStop(0.6, 'rgba(56, 189, 248, 0.20)');
    halo.addColorStop(1, 'rgba(239, 68, 68, 0.0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(58, 58, 54, 0, Math.PI * 2);
    ctx.fill();

    // 2. Crimson U-Arch Magnet Body
    ctx.beginPath();
    // Outer arch: from (18, 56) up and around to (98, 56), then straight down to (98, 86)
    ctx.arc(58, 56, 40, Math.PI, 0, false);
    ctx.lineTo(98, 86);
    ctx.lineTo(76, 86);
    // Inner arch: from (76, 56) up and around to (40, 56), then straight down to (40, 86)
    ctx.lineTo(76, 56);
    ctx.arc(58, 56, 18, 0, Math.PI, true);
    ctx.lineTo(40, 86);
    ctx.lineTo(18, 86);
    ctx.closePath();

    const redGrad = ctx.createLinearGradient(18, 16, 98, 86);
    redGrad.addColorStop(0, '#EF4444');
    redGrad.addColorStop(0.4, '#DC2626');
    redGrad.addColorStop(0.8, '#B91C1C');
    redGrad.addColorStop(1, '#991B1B');
    ctx.fillStyle = redGrad;
    ctx.fill();

    ctx.strokeStyle = '#451A03';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Curved white glossy highlight along top curve
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(58, 56, 34, Math.PI * 1.1, Math.PI * 1.85, false);
    ctx.stroke();

    // 3. Two Silver/Chrome Pole Tip Shoes
    const drawShoe = (x, isNorth) => {
      ctx.fillStyle = '#E2E8F0';
      const shoeGrad = ctx.createLinearGradient(x, 82, x + 22, 82);
      shoeGrad.addColorStop(0, '#FFFFFF');
      shoeGrad.addColorStop(0.5, '#E2E8F0');
      shoeGrad.addColorStop(1, '#94A3B8');
      ctx.fillStyle = shoeGrad;
      ctx.beginPath();
      ctx.roundRect(x, 82, 22, 22, [0, 0, 4, 4]);
      ctx.fill();
      ctx.strokeStyle = '#451A03';
      ctx.lineWidth = 3;
      ctx.stroke();

      // Polarity stripe badge
      ctx.fillStyle = isNorth ? '#EF4444' : '#0284C7';
      ctx.beginPath();
      ctx.roundRect(x + 3, 98, 16, 4, 2);
      ctx.fill();
    };

    drawShoe(18, true);  // North pole (red stripe)
    drawShoe(76, false); // South pole (blue stripe)

    // 4. Electric Spark Accents
    const drawSpark = (sx, sy, color) => {
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.moveTo(sx, sy - 7);
      ctx.lineTo(sx + 2.5, sy - 2.5);
      ctx.lineTo(sx + 7, sy);
      ctx.lineTo(sx + 2.5, sy + 2.5);
      ctx.lineTo(sx, sy + 7);
      ctx.lineTo(sx - 2.5, sy + 2.5);
      ctx.lineTo(sx - 7, sy);
      ctx.lineTo(sx - 2.5, sy - 2.5);
      ctx.closePath();
      ctx.fill();
    };

    drawSpark(22, 108, '#38BDF8');
    drawSpark(94, 108, '#FACC15');
    drawSpark(58, 18, '#FEF08A');

    canvas.refresh();
  }

  createPartBoltTexture() {
    // 2X size: 108 x 108 (Displayed at 54 x 54)
    // Metallic silver/steel hex bolt encased inside a clear translucent glass bubble
    const canvas = this.textures.createCanvas('part_bolt', 108, 108);
    const ctx = canvas.getContext();

    // 1. Clear Translucent Glass Bubble Base Fill (alpha ~0.22)
    const bubbleBg = ctx.createRadialGradient(42, 38, 4, 54, 54, 46);
    bubbleBg.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
    bubbleBg.addColorStop(0.4, 'rgba(240, 249, 255, 0.22)');
    bubbleBg.addColorStop(0.8, 'rgba(186, 230, 253, 0.22)');
    bubbleBg.addColorStop(1, 'rgba(125, 211, 252, 0.32)');
    ctx.fillStyle = bubbleBg;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.fill();

    // 2. Bright Metallic Silver/Steel Hex Bolt (2.5D angled perspective)
    ctx.save();
    ctx.translate(54, 52);

    // Chunky Hex Head
    const hexGrad = ctx.createLinearGradient(-22, -26, 22, -8);
    hexGrad.addColorStop(0, '#f1f5f9');
    hexGrad.addColorStop(0.45, '#cbd5e1');
    hexGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = hexGrad;

    ctx.beginPath();
    ctx.moveTo(-18, -26);
    ctx.lineTo(18, -26);
    ctx.lineTo(26, -12);
    ctx.lineTo(16, 2);
    ctx.lineTo(-16, 2);
    ctx.lineTo(-26, -12);
    ctx.closePath();
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Recessed circular recess on bolt head
    ctx.fillStyle = '#64748b';
    ctx.beginPath();
    ctx.ellipse(0, -12, 8, 5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Cylindrical Threaded Shank
    const shankGrad = ctx.createLinearGradient(-11, 2, 11, 2);
    shankGrad.addColorStop(0, '#f1f5f9');
    shankGrad.addColorStop(0.45, '#cbd5e1');
    shankGrad.addColorStop(1, '#64748b');
    ctx.fillStyle = shankGrad;

    ctx.beginPath();
    ctx.roundRect(-10, 2, 20, 32, [0, 0, 6, 6]);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.stroke();

    // Thread ridges
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.2;
    for (let ty = 8; ty <= 28; ty += 5) {
      ctx.beginPath();
      ctx.moveTo(-9, ty);
      ctx.lineTo(9, ty + 2);
      ctx.stroke();
    }
    // Thread highlight lines in metallic silver (#f1f5f9)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 1.4;
    for (let ty = 7; ty <= 27; ty += 5) {
      ctx.beginPath();
      ctx.moveTo(-7, ty);
      ctx.lineTo(4, ty + 2);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Crisp White/Light-Blue Bubble Rim & Specular Highlights
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.90)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(54, 54, 48, 0, Math.PI * 2);
    ctx.stroke();

    // Curved White Specular Reflection Arc along upper-left
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 1.05, Math.PI * 1.62, false);
    ctx.stroke();

    // Secondary specular sparkle dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(32, 32, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft bottom-right counter-reflection arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 0.15, Math.PI * 0.45, false);
    ctx.stroke();

    canvas.refresh();
  }

  createPartCogTexture() {
    // 2X size: 108 x 108 (Displayed at 54 x 54)
    // Metallic silver/steel 8-tooth gear cog encased inside a clear translucent glass bubble
    const canvas = this.textures.createCanvas('part_cog', 108, 108);
    const ctx = canvas.getContext();

    // 1. Clear Translucent Glass Bubble Base Fill (alpha ~0.22)
    const bubbleBg = ctx.createRadialGradient(42, 38, 4, 54, 54, 46);
    bubbleBg.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
    bubbleBg.addColorStop(0.4, 'rgba(240, 249, 255, 0.22)');
    bubbleBg.addColorStop(0.8, 'rgba(186, 230, 253, 0.22)');
    bubbleBg.addColorStop(1, 'rgba(125, 211, 252, 0.32)');
    ctx.fillStyle = bubbleBg;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.fill();

    // 2. Bright Metallic Silver/Steel 8-Tooth Gear Cog
    const cx = 54, cy = 54;
    const teeth = 8;
    const outerR = 32, rootR = 24;

    ctx.beginPath();
    for (let i = 0; i < teeth; i++) {
      const angle = (i * 2 * Math.PI) / teeth;
      const halfTooth = Math.PI / teeth;

      const a1 = angle - halfTooth * 0.55;
      const a2 = angle - halfTooth * 0.32;
      const a3 = angle + halfTooth * 0.32;
      const a4 = angle + halfTooth * 0.55;

      if (i === 0) {
        ctx.moveTo(cx + Math.cos(a1) * rootR, cy + Math.sin(a1) * rootR);
      } else {
        ctx.lineTo(cx + Math.cos(a1) * rootR, cy + Math.sin(a1) * rootR);
      }
      ctx.lineTo(cx + Math.cos(a2) * outerR, cy + Math.sin(a2) * outerR);
      ctx.lineTo(cx + Math.cos(a3) * outerR, cy + Math.sin(a3) * outerR);
      ctx.lineTo(cx + Math.cos(a4) * rootR, cy + Math.sin(a4) * rootR);
    }
    ctx.closePath();

    const gearGrad = ctx.createRadialGradient(cx - 8, cy - 8, 4, cx, cy, 32);
    gearGrad.addColorStop(0, '#f1f5f9');
    gearGrad.addColorStop(0.45, '#cbd5e1');
    gearGrad.addColorStop(0.85, '#64748b');
    gearGrad.addColorStop(1, '#475569');
    ctx.fillStyle = gearGrad;
    ctx.fill();

    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 3.5;
    ctx.lineJoin = 'round';
    ctx.stroke();

    // Recessed circular bevel groove
    ctx.strokeStyle = '#64748b';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 17, 0, Math.PI * 2);
    ctx.stroke();

    // Central hollow axle hole
    ctx.fillStyle = '#334155';
    ctx.beginPath();
    ctx.arc(cx, cy, 9.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 2.5;
    ctx.stroke();

    // Specular highlight on top teeth (#f1f5f9)
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, 30, Math.PI * 1.15, Math.PI * 1.65, false);
    ctx.stroke();

    // 3. Crisp White/Light-Blue Bubble Rim & Specular Highlights
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.90)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(54, 54, 48, 0, Math.PI * 2);
    ctx.stroke();

    // Curved White Specular Reflection Arc along upper-left
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 1.05, Math.PI * 1.62, false);
    ctx.stroke();

    // Secondary specular sparkle dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(32, 32, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft bottom-right counter-reflection arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 0.15, Math.PI * 0.45, false);
    ctx.stroke();

    canvas.refresh();
  }

  createPartSpringTexture() {
    // 2X size: 108 x 108 (Displayed at 54 x 54)
    // Metallic silver/steel coil spring encased inside a clear translucent glass bubble
    const canvas = this.textures.createCanvas('part_spring', 108, 108);
    const ctx = canvas.getContext();

    // 1. Clear Translucent Glass Bubble Base Fill (alpha ~0.22)
    const bubbleBg = ctx.createRadialGradient(42, 38, 4, 54, 54, 46);
    bubbleBg.addColorStop(0, 'rgba(255, 255, 255, 0.40)');
    bubbleBg.addColorStop(0.4, 'rgba(240, 249, 255, 0.22)');
    bubbleBg.addColorStop(0.8, 'rgba(186, 230, 253, 0.22)');
    bubbleBg.addColorStop(1, 'rgba(125, 211, 252, 0.32)');
    ctx.fillStyle = bubbleBg;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.fill();

    // 2. Bright Metallic Silver/Steel Helical Suspension Spring
    ctx.save();
    ctx.translate(54, 54);

    const coils = 4;
    const springW = 30;
    const totalH = 50;
    const coilH = totalH / coils;

    // Draw dark outline behind coils (#1e293b)
    ctx.strokeStyle = '#1e293b';
    ctx.lineWidth = 8;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    for (let i = 0; i < coils; i++) {
      const topY = -totalH / 2 + i * coilH;
      const midY = topY + coilH * 0.5;
      const botY = topY + coilH;
      ctx.moveTo(-springW / 2, topY + 2);
      ctx.bezierCurveTo(springW / 2 + 4, topY - 2, springW / 2 + 4, midY + 4, -springW / 2, botY);
    }
    ctx.stroke();

    // Draw metallic silver/steel spring wire
    ctx.lineWidth = 5.2;
    for (let i = 0; i < coils; i++) {
      const topY = -totalH / 2 + i * coilH;
      const midY = topY + coilH * 0.5;
      const botY = topY + coilH;

      const coilGrad = ctx.createLinearGradient(-springW / 2, topY, springW / 2, botY);
      coilGrad.addColorStop(0, '#f1f5f9');
      coilGrad.addColorStop(0.45, '#cbd5e1');
      coilGrad.addColorStop(0.85, '#64748b');
      coilGrad.addColorStop(1, '#475569');
      ctx.strokeStyle = coilGrad;

      ctx.beginPath();
      ctx.moveTo(-springW / 2, topY + 2);
      ctx.bezierCurveTo(springW / 2 + 4, topY - 2, springW / 2 + 4, midY + 4, -springW / 2, botY);
      ctx.stroke();

      // Top specular highlight streak on each loop (#f1f5f9)
      ctx.strokeStyle = '#f1f5f9';
      ctx.lineWidth = 1.8;
      ctx.beginPath();
      ctx.moveTo(-springW / 2 + 4, topY + 2);
      ctx.quadraticCurveTo(0, topY, springW / 2 - 4, topY + 4);
      ctx.stroke();
    }
    ctx.restore();

    // 3. Crisp White/Light-Blue Bubble Rim & Specular Highlights
    ctx.strokeStyle = 'rgba(224, 242, 254, 0.90)';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(54, 54, 46, 0, Math.PI * 2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(56, 189, 248, 0.35)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(54, 54, 48, 0, Math.PI * 2);
    ctx.stroke();

    // Curved White Specular Reflection Arc along upper-left
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.95)';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 1.05, Math.PI * 1.62, false);
    ctx.stroke();

    // Secondary specular sparkle dot
    ctx.fillStyle = '#FFFFFF';
    ctx.beginPath();
    ctx.arc(32, 32, 3.5, 0, Math.PI * 2);
    ctx.fill();

    // Soft bottom-right counter-reflection arc
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(54, 54, 40, Math.PI * 0.15, Math.PI * 0.45, false);
    ctx.stroke();

    canvas.refresh();
  }

  createMagneticAuraTexture() {
    // 2X size: 280 x 280 (Displayed at 140 x 140, radius ~68 px)
    // Bright, clearly visible pulsing double-ring cyan/gold magnetic aura
    const canvas = this.textures.createCanvas('magnetic_aura', 280, 280);
    const ctx = canvas.getContext();

    const cx = 140, cy = 140;

    // Soft cyan/gold radial backdrop aura
    const grad = ctx.createRadialGradient(cx, cy, 30, cx, cy, 136);
    grad.addColorStop(0, 'rgba(0, 229, 255, 0.0)');
    grad.addColorStop(0.65, 'rgba(0, 229, 255, 0.28)');
    grad.addColorStop(0.85, 'rgba(250, 204, 21, 0.38)');
    grad.addColorStop(1, 'rgba(0, 229, 255, 0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, 136, 0, Math.PI * 2);
    ctx.fill();

    // Outer double-ring: electric cyan (#00E5FF) at radius ~136 px (displays at 68 px)
    ctx.strokeStyle = '#00E5FF';
    ctx.lineWidth = 5.5;
    ctx.setLineDash([16, 12]);
    ctx.beginPath();
    ctx.arc(cx, cy, 134, 0, Math.PI * 2);
    ctx.stroke();

    // Inner bright gold ring (#FDE047) at radius ~100 px (displays at 50 px)
    ctx.strokeStyle = '#FDE047';
    ctx.lineWidth = 4.5;
    ctx.setLineDash([12, 10]);
    ctx.beginPath();
    ctx.arc(cx, cy, 100, 0, Math.PI * 2);
    ctx.stroke();

    // 6 orbiting cyan/gold electric spark stars
    ctx.setLineDash([]);
    for (let i = 0; i < 6; i++) {
      const a = (i * Math.PI) / 3;
      const sx = cx + Math.cos(a) * 118;
      const sy = cy + Math.sin(a) * 118;
      ctx.fillStyle = (i % 2 === 0) ? '#00E5FF' : '#FEF08A';
      ctx.beginPath();
      ctx.arc(sx, sy, 5.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      ctx.beginPath();
      ctx.arc(sx, sy, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }

    canvas.refresh();
  }

  createStarSparkleTexture() {
    // 2X size: 32 x 32
    const canvas = this.textures.createCanvas('star_sparkle', 32, 32);
    const ctx = canvas.getContext();

    // 4-pointed radiant sparkle diamond
    const grad = ctx.createRadialGradient(16, 16, 1, 16, 16, 14);
    grad.addColorStop(0, '#FFFFFF');
    grad.addColorStop(0.4, '#FEF08A');
    grad.addColorStop(0.8, '#F59E0B');
    grad.addColorStop(1, 'rgba(245, 158, 11, 0)');
    ctx.fillStyle = grad;

    ctx.beginPath();
    ctx.moveTo(16, 2);
    ctx.lineTo(19, 13);
    ctx.lineTo(30, 16);
    ctx.lineTo(19, 19);
    ctx.lineTo(16, 30);
    ctx.lineTo(13, 19);
    ctx.lineTo(2, 16);
    ctx.lineTo(13, 13);
    ctx.closePath();
    ctx.fill();

    canvas.refresh();
  }

  /* ========================================================================
     5. 3-TIER VISUAL AIRCRAFT & SLINGSHOT EVOLUTION TEXTURES
     ======================================================================== */

  createEvolutionTierTextures() {
    // Tier 1 copies existing baseline textures
    // Tier 2: Reinforced silver-and-blue riveted metal hull (#3b82f6 royal blue & #cbd5e1 polished silver)
    // Fuselage Tier 2
    const canvasF2 = this.textures.createCanvas('plane_fuselage_t2', 240, 110);
    const ctxF2 = canvasF2.getContext();
    ctxF2.save();
    ctxF2.scale(2, 2);

    // Nozzle
    ctxF2.fillStyle = '#1e293b';
    ctxF2.beginPath();
    ctxF2.roundRect(4, 18, 12, 16, 3);
    ctxF2.fill();

    // Tail fin (Royal Blue with silver leading edge)
    ctxF2.fillStyle = '#2563eb';
    ctxF2.beginPath();
    ctxF2.moveTo(24, 22);
    ctxF2.lineTo(8, 2);
    ctxF2.lineTo(20, 2);
    ctxF2.lineTo(38, 20);
    ctxF2.closePath();
    ctxF2.fill();
    ctxF2.strokeStyle = '#1e293b';
    ctxF2.lineWidth = 2.5;
    ctxF2.stroke();

    // Main fuselage body (Silver upper, Royal Blue lower & racing stripes)
    const bodyGrad2 = ctxF2.createLinearGradient(16, 8, 16, 46);
    bodyGrad2.addColorStop(0, '#f1f5f9');
    bodyGrad2.addColorStop(0.35, '#cbd5e1');
    bodyGrad2.addColorStop(0.65, '#2563eb');
    bodyGrad2.addColorStop(1, '#1d4ed8');
    ctxF2.fillStyle = bodyGrad2;

    ctxF2.beginPath();
    ctxF2.moveTo(108, 26);
    ctxF2.bezierCurveTo(90, 8, 48, 10, 16, 22);
    ctxF2.bezierCurveTo(12, 26, 12, 30, 16, 32);
    ctxF2.bezierCurveTo(48, 44, 90, 44, 108, 28);
    ctxF2.closePath();
    ctxF2.fill();
    ctxF2.strokeStyle = '#1e293b';
    ctxF2.lineWidth = 3;
    ctxF2.stroke();

    // Steel rivets along hull
    ctxF2.fillStyle = '#ffffff';
    for (let rx = 30; rx <= 90; rx += 14) {
      ctxF2.beginPath();
      ctxF2.arc(rx, 26, 1.2, 0, Math.PI * 2);
      ctxF2.fill();
    }
    ctxF2.restore();
    canvasF2.refresh();

    // Fuselage Tier 3: Master crimson-and-gold aerodynamic racing hull
    const canvasF3 = this.textures.createCanvas('plane_fuselage_t3', 240, 110);
    const ctxF3 = canvasF3.getContext();
    ctxF3.save();
    ctxF3.scale(2, 2);

    // Gold Exhaust Nozzle
    ctxF3.fillStyle = '#b45309';
    ctxF3.beginPath();
    ctxF3.roundRect(4, 18, 12, 16, 3);
    ctxF3.fill();

    // Swept Crimson & Gold Tail Fin
    ctxF3.fillStyle = '#dc2626';
    ctxF3.beginPath();
    ctxF3.moveTo(24, 22);
    ctxF3.lineTo(8, 2);
    ctxF3.lineTo(20, 2);
    ctxF3.lineTo(38, 20);
    ctxF3.closePath();
    ctxF3.fill();
    ctxF3.strokeStyle = '#7f1d1d';
    ctxF3.lineWidth = 2.5;
    ctxF3.stroke();

    // Gold leading edge on tail fin
    ctxF3.fillStyle = '#f59e0b';
    ctxF3.beginPath();
    ctxF3.moveTo(8, 2);
    ctxF3.lineTo(13, 2);
    ctxF3.lineTo(26, 16);
    ctxF3.lineTo(21, 16);
    ctxF3.closePath();
    ctxF3.fill();

    // Crimson and Gold aerodynamic racing body
    const bodyGrad3 = ctxF3.createLinearGradient(16, 8, 16, 46);
    bodyGrad3.addColorStop(0, '#ef4444');
    bodyGrad3.addColorStop(0.38, '#b91c1c');
    bodyGrad3.addColorStop(0.68, '#f59e0b');
    bodyGrad3.addColorStop(1, '#78350f');
    ctxF3.fillStyle = bodyGrad3;

    ctxF3.beginPath();
    ctxF3.moveTo(108, 26);
    ctxF3.bezierCurveTo(90, 7, 48, 9, 16, 22);
    ctxF3.bezierCurveTo(12, 26, 12, 30, 16, 32);
    ctxF3.bezierCurveTo(48, 45, 90, 45, 108, 28);
    ctxF3.closePath();
    ctxF3.fill();
    ctxF3.strokeStyle = '#450a0a';
    ctxF3.lineWidth = 3;
    ctxF3.stroke();

    // Gold racing stripe
    ctxF3.strokeStyle = '#fef08a';
    ctxF3.lineWidth = 2;
    ctxF3.beginPath();
    ctxF3.moveTo(26, 26);
    ctxF3.lineTo(96, 26);
    ctxF3.stroke();
    ctxF3.restore();
    canvasF3.refresh();

    // Wings Tier 2: Royal Blue wings with silver leading edges
    const canvasW2 = this.textures.createCanvas('plane_wings_t2', 200, 150);
    const ctxW2 = canvasW2.getContext();
    ctxW2.save();
    ctxW2.scale(2, 2);
    ctxW2.fillStyle = '#2563eb';
    ctxW2.beginPath();
    ctxW2.roundRect(10, 6, 80, 16, [8, 4, 4, 8]);
    ctxW2.fill();
    ctxW2.fillStyle = '#f1f5f9';
    ctxW2.beginPath();
    ctxW2.roundRect(10, 6, 80, 5, [8, 4, 0, 0]);
    ctxW2.fill();
    ctxW2.strokeStyle = '#1e293b';
    ctxW2.lineWidth = 2.5;
    ctxW2.strokeRect(10, 6, 80, 16);
    // Lower wing
    ctxW2.fillStyle = '#1d4ed8';
    ctxW2.beginPath();
    ctxW2.roundRect(14, 52, 72, 14, [6, 4, 4, 6]);
    ctxW2.fill();
    ctxW2.strokeRect(14, 52, 72, 14);
    ctxW2.restore();
    canvasW2.refresh();

    // Wings Tier 3: Crimson racing wings with gold trims
    const canvasW3 = this.textures.createCanvas('plane_wings_t3', 200, 150);
    const ctxW3 = canvasW3.getContext();
    ctxW3.save();
    ctxW3.scale(2, 2);
    ctxW3.fillStyle = '#b91c1c';
    ctxW3.beginPath();
    ctxW3.roundRect(10, 6, 80, 16, [8, 4, 4, 8]);
    ctxW3.fill();
    ctxW3.fillStyle = '#f59e0b';
    ctxW3.beginPath();
    ctxW3.roundRect(10, 6, 80, 5, [8, 4, 0, 0]);
    ctxW3.fill();
    ctxW3.strokeStyle = '#450a0a';
    ctxW3.lineWidth = 2.5;
    ctxW3.strokeRect(10, 6, 80, 16);
    // Lower wing
    ctxW3.fillStyle = '#991b1b';
    ctxW3.beginPath();
    ctxW3.roundRect(14, 52, 72, 14, [6, 4, 4, 6]);
    ctxW3.fill();
    ctxW3.strokeRect(14, 52, 72, 14);
    ctxW3.restore();
    canvasW3.refresh();

    // Cowling Tier 2 & Tier 3
    const canvasC2 = this.textures.createCanvas('plane_cowling_t2', 80, 80);
    const ctxC2 = canvasC2.getContext();
    ctxC2.fillStyle = '#cbd5e1';
    ctxC2.beginPath();
    ctxC2.arc(40, 40, 32, 0, Math.PI * 2);
    ctxC2.fill();
    ctxC2.fillStyle = '#2563eb';
    ctxC2.beginPath();
    ctxC2.arc(40, 40, 16, 0, Math.PI * 2);
    ctxC2.fill();
    ctxC2.strokeStyle = '#1e293b';
    ctxC2.lineWidth = 4;
    ctxC2.stroke();
    canvasC2.refresh();

    const canvasC3 = this.textures.createCanvas('plane_cowling_t3', 80, 80);
    const ctxC3 = canvasC3.getContext();
    ctxC3.fillStyle = '#f59e0b';
    ctxC3.beginPath();
    ctxC3.arc(40, 40, 32, 0, Math.PI * 2);
    ctxC3.fill();
    ctxC3.fillStyle = '#dc2626';
    ctxC3.beginPath();
    ctxC3.arc(40, 40, 16, 0, Math.PI * 2);
    ctxC3.fill();
    ctxC3.strokeStyle = '#78350f';
    ctxC3.lineWidth = 4;
    ctxC3.stroke();
    canvasC3.refresh();

    // Slingshot Tier 2 (Steel braced) & Tier 3 (Titanium/Gold)
    const canvasS2 = this.textures.createCanvas('slingshot_t2', 120, 220);
    const ctxS2 = canvasS2.getContext();
    ctxS2.fillStyle = '#64748b';
    ctxS2.roundRect(16, 186, 88, 28, 6);
    ctxS2.fill();
    ctxS2.fillStyle = '#475569';
    ctxS2.roundRect(46, 95, 28, 95, 4);
    ctxS2.fill();
    // Steel branches
    ctxS2.strokeStyle = '#1e293b';
    ctxS2.lineWidth = 14;
    ctxS2.beginPath();
    ctxS2.moveTo(25, 27);
    ctxS2.lineTo(60, 110);
    ctxS2.lineTo(95, 27);
    ctxS2.stroke();
    ctxS2.strokeStyle = '#94a3b8';
    ctxS2.lineWidth = 8;
    ctxS2.stroke();
    canvasS2.refresh();

    const canvasS3 = this.textures.createCanvas('slingshot_t3', 120, 220);
    const ctxS3 = canvasS3.getContext();
    ctxS3.fillStyle = '#b45309';
    ctxS3.roundRect(16, 186, 88, 28, 6);
    ctxS3.fill();
    ctxS3.fillStyle = '#d97706';
    ctxS3.roundRect(46, 95, 28, 95, 4);
    ctxS3.fill();
    // Gold branches
    ctxS3.strokeStyle = '#78350f';
    ctxS3.lineWidth = 15;
    ctxS3.beginPath();
    ctxS3.moveTo(25, 27);
    ctxS3.lineTo(60, 110);
    ctxS3.lineTo(95, 27);
    ctxS3.stroke();
    ctxS3.strokeStyle = '#fde047';
    ctxS3.lineWidth = 9;
    ctxS3.stroke();
    canvasS3.refresh();
  }

  /* ========================================================================
     6. HIGH-DETAIL 120x120 UPGRADE COMPONENT ICONS
     ======================================================================== */

  createUpgradeComponentIcons() {
    // 1. Wings Icon: Red/cream biplane wing airfoil with struts
    const cWings = this.textures.createCanvas('upgrade_icon_wings', 120, 120);
    const ctxW = cWings.getContext();
    // Soft backdrop shine
    ctxW.fillStyle = '#ffffff';
    ctxW.beginPath();
    ctxW.arc(60, 60, 52, 0, Math.PI * 2);
    ctxW.fill();

    // Upper wing
    const wGrad = ctxW.createLinearGradient(15, 24, 105, 44);
    wGrad.addColorStop(0, '#ef4444');
    wGrad.addColorStop(0.5, '#dc2626');
    wGrad.addColorStop(1, '#991b1b');
    ctxW.fillStyle = wGrad;
    ctxW.beginPath();
    ctxW.roundRect(16, 26, 88, 22, [8, 4, 4, 8]);
    ctxW.fill();
    ctxW.fillStyle = '#fef3c7'; // Cream leading edge
    ctxW.beginPath();
    ctxW.roundRect(16, 26, 88, 7, [8, 4, 0, 0]);
    ctxW.fill();
    ctxW.strokeStyle = '#3b2314';
    ctxW.lineWidth = 3.5;
    ctxW.strokeRect(16, 26, 88, 22);

    // Struts
    ctxW.strokeStyle = '#a16207';
    ctxW.lineWidth = 4;
    ctxW.beginPath();
    ctxW.moveTo(34, 48);
    ctxW.lineTo(34, 76);
    ctxW.moveTo(86, 48);
    ctxW.lineTo(86, 76);
    ctxW.stroke();

    // Lower wing
    ctxW.fillStyle = wGrad;
    ctxW.beginPath();
    ctxW.roundRect(22, 74, 76, 18, [6, 4, 4, 6]);
    ctxW.fill();
    ctxW.strokeStyle = '#3b2314';
    ctxW.lineWidth = 3.5;
    ctxW.strokeRect(22, 74, 76, 18);
    cWings.refresh();

    // 2. Chassis Icon: Landing gear assembly with dual rubber wheels & axle
    const cChassis = this.textures.createCanvas('upgrade_icon_chassis', 120, 120);
    const ctxCh = cChassis.getContext();
    ctxCh.fillStyle = '#ffffff';
    ctxCh.beginPath();
    ctxCh.arc(60, 60, 52, 0, Math.PI * 2);
    ctxCh.fill();

    // V-strut
    ctxCh.strokeStyle = '#3b2314';
    ctxCh.lineWidth = 6;
    ctxCh.beginPath();
    ctxCh.moveTo(60, 24);
    ctxCh.lineTo(38, 72);
    ctxCh.moveTo(60, 24);
    ctxCh.lineTo(82, 72);
    ctxCh.stroke();

    ctxCh.strokeStyle = '#cbd5e1';
    ctxCh.lineWidth = 3.5;
    ctxCh.beginPath();
    ctxCh.moveTo(60, 24);
    ctxCh.lineTo(38, 72);
    ctxCh.moveTo(60, 24);
    ctxCh.lineTo(82, 72);
    ctxCh.stroke();

    // Axle bar
    ctxCh.strokeStyle = '#1e293b';
    ctxCh.lineWidth = 5;
    ctxCh.beginPath();
    ctxCh.moveTo(28, 72);
    ctxCh.lineTo(92, 72);
    ctxCh.stroke();

    // Wheels
    const drawWheel = (wx, wy) => {
      ctxCh.fillStyle = '#374151';
      ctxCh.beginPath();
      ctxCh.arc(wx, wy, 20, 0, Math.PI * 2);
      ctxCh.fill();
      ctxCh.strokeStyle = '#1e293b';
      ctxCh.lineWidth = 3.5;
      ctxCh.stroke();

      ctxCh.fillStyle = '#f8fafc';
      ctxCh.beginPath();
      ctxCh.arc(wx, wy, 9, 0, Math.PI * 2);
      ctxCh.fill();
      ctxCh.strokeStyle = '#64748b';
      ctxCh.lineWidth = 2;
      ctxCh.stroke();
    };
    drawWheel(34, 76);
    drawWheel(86, 76);
    cChassis.refresh();

    // 3. Propeller Icon: Golden cowling with spinner & propeller blades
    const cProp = this.textures.createCanvas('upgrade_icon_propeller', 120, 120);
    const ctxP = cProp.getContext();
    ctxP.fillStyle = '#ffffff';
    ctxP.beginPath();
    ctxP.arc(60, 60, 52, 0, Math.PI * 2);
    ctxP.fill();

    // Propeller blades
    ctxP.save();
    ctxP.translate(60, 60);
    ctxP.rotate(Math.PI / 4);

    const bladeGrad = ctxP.createLinearGradient(-10, -48, 10, 48);
    bladeGrad.addColorStop(0, '#f59e0b');
    bladeGrad.addColorStop(0.5, '#d97706');
    bladeGrad.addColorStop(1, '#92400e');
    ctxP.fillStyle = bladeGrad;

    ctxP.beginPath();
    ctxP.ellipse(0, -28, 11, 26, 0, 0, Math.PI * 2);
    ctxP.ellipse(0, 28, 11, 26, 0, 0, Math.PI * 2);
    ctxP.fill();
    ctxP.strokeStyle = '#3b2314';
    ctxP.lineWidth = 3;
    ctxP.stroke();

    // Red blade tips
    ctxP.fillStyle = '#dc2626';
    ctxP.beginPath();
    ctxP.arc(0, -44, 9, 0, Math.PI, true);
    ctxP.fill();
    ctxP.beginPath();
    ctxP.arc(0, 44, 9, 0, Math.PI, false);
    ctxP.fill();

    // Engine Cowling Hub
    ctxP.fillStyle = '#facc15';
    ctxP.beginPath();
    ctxP.arc(0, 0, 22, 0, Math.PI * 2);
    ctxP.fill();
    ctxP.strokeStyle = '#3b2314';
    ctxP.lineWidth = 3.5;
    ctxP.stroke();

    // Conical Spinner
    ctxP.fillStyle = '#b45309';
    ctxP.beginPath();
    ctxP.arc(0, 0, 11, 0, Math.PI * 2);
    ctxP.fill();
    ctxP.restore();
    cProp.refresh();

    // 4. Fuselage Icon: Streamlined fuselage with cockpit & racing stripe
    const cFuse = this.textures.createCanvas('upgrade_icon_fuselage', 120, 120);
    const ctxF = cFuse.getContext();
    ctxF.fillStyle = '#ffffff';
    ctxF.beginPath();
    ctxF.arc(60, 60, 52, 0, Math.PI * 2);
    ctxF.fill();

    // Teardrop fuselage
    const fGrad = ctxF.createLinearGradient(16, 35, 104, 75);
    fGrad.addColorStop(0, '#ef4444');
    fGrad.addColorStop(0.6, '#dc2626');
    fGrad.addColorStop(1, '#991b1b');
    ctxF.fillStyle = fGrad;

    ctxF.beginPath();
    ctxF.moveTo(102, 60);
    ctxF.bezierCurveTo(86, 36, 44, 38, 18, 54);
    ctxF.bezierCurveTo(14, 60, 14, 64, 18, 68);
    ctxF.bezierCurveTo(44, 82, 86, 82, 102, 62);
    ctxF.closePath();
    ctxF.fill();
    ctxF.strokeStyle = '#3b2314';
    ctxF.lineWidth = 3.5;
    ctxF.stroke();

    // Cream racing stripe
    ctxF.fillStyle = '#fef3c7';
    ctxF.beginPath();
    ctxF.moveTo(22, 60);
    ctxF.lineTo(98, 60);
    ctxF.lineTo(96, 68);
    ctxF.lineTo(24, 68);
    ctxF.closePath();
    ctxF.fill();

    // Cockpit windscreen
    ctxF.fillStyle = '#38bdf8';
    ctxF.beginPath();
    ctxF.arc(62, 48, 12, Math.PI, 0);
    ctxF.fill();
    ctxF.strokeStyle = '#0369a1';
    ctxF.lineWidth = 2;
    ctxF.stroke();
    cFuse.refresh();

    // 5. Slingshot Icon: Wooden Y-slingshot with golden pegs & bands
    const cSling = this.textures.createCanvas('upgrade_icon_slingshot', 120, 120);
    const ctxS = cSling.getContext();
    ctxS.fillStyle = '#ffffff';
    ctxS.beginPath();
    ctxS.arc(60, 60, 52, 0, Math.PI * 2);
    ctxS.fill();

    // Wooden Y post
    ctxS.fillStyle = '#854d0e';
    ctxS.roundRect(50, 65, 20, 42, 4);
    ctxS.fill();
    ctxS.strokeStyle = '#3b2314';
    ctxS.lineWidth = 3;
    ctxS.strokeRect(50, 65, 20, 42);

    // Left & Right branches
    ctxS.strokeStyle = '#854d0e';
    ctxS.lineWidth = 14;
    ctxS.lineCap = 'round';
    ctxS.beginPath();
    ctxS.moveTo(32, 28);
    ctxS.lineTo(60, 75);
    ctxS.lineTo(88, 28);
    ctxS.stroke();
    ctxS.strokeStyle = '#3b2314';
    ctxS.lineWidth = 3.5;
    ctxS.stroke();

    // Yellow elastic bands
    ctxS.strokeStyle = '#facc15';
    ctxS.lineWidth = 5;
    ctxS.beginPath();
    ctxS.moveTo(32, 28);
    ctxS.lineTo(60, 48);
    ctxS.lineTo(88, 28);
    ctxS.stroke();

    // Pouch
    ctxS.fillStyle = '#5d4037';
    ctxS.beginPath();
    ctxS.roundRect(53, 42, 14, 12, 3);
    ctxS.fill();
    cSling.refresh();
  }

  /* ========================================================================
     7. TOWNSHIP AIRFIELD UI SPRITES & BADGES
     ======================================================================== */

  createAirfieldUITextures() {
    // 1. Airfield tab icon (mini biplane)
    const cTabA = this.textures.createCanvas('ui_tab_airfield', 48, 48);
    const ctxTA = cTabA.getContext();
    ctxTA.fillStyle = '#dc2626';
    ctxTA.beginPath();
    ctxTA.roundRect(6, 20, 36, 10, 4);
    ctxTA.fill();
    ctxTA.fillStyle = '#fef08a';
    ctxTA.fillRect(14, 10, 20, 5);
    ctxTA.fillRect(16, 32, 16, 4);
    cTabA.refresh();

    // 2. Competition tab icon (golden trophy cup)
    const cTabC = this.textures.createCanvas('ui_tab_competition', 48, 48);
    const ctxTC = cTabC.getContext();
    ctxTC.fillStyle = '#f59e0b';
    ctxTC.beginPath();
    ctxTC.moveTo(14, 10);
    ctxTC.lineTo(34, 10);
    ctxTC.lineTo(30, 26);
    ctxTC.bezierCurveTo(30, 34, 18, 34, 18, 26);
    ctxTC.closePath();
    ctxTC.fill();
    ctxTC.strokeStyle = '#b45309';
    ctxTC.lineWidth = 2.5;
    ctxTC.stroke();
    // Base
    ctxTC.fillRect(20, 34, 8, 6);
    ctxTC.fillRect(14, 40, 20, 4);
    cTabC.refresh();

    // 3. Green Fuel Canister Icon
    const cFuel = this.textures.createCanvas('ui_fuel_canister', 48, 48);
    const ctxF = cFuel.getContext();
    ctxF.fillStyle = '#22c55e'; // Vibrant green
    ctxF.beginPath();
    ctxF.roundRect(10, 12, 28, 30, 5);
    ctxF.fill();
    ctxF.strokeStyle = '#15803d';
    ctxF.lineWidth = 3;
    ctxF.stroke();
    // Handle & spout
    ctxF.fillStyle = '#94a3b8';
    ctxF.fillRect(14, 6, 8, 7);
    ctxF.fillRect(26, 6, 8, 7);
    // White flame / drop emblem
    ctxF.fillStyle = '#ffffff';
    ctxF.beginPath();
    ctxF.arc(24, 28, 6, 0, Math.PI * 2);
    ctxF.fill();
    cFuel.refresh();

    // 4. Festive Red Gift Box with Yellow Ribbon
    const cGift = this.textures.createCanvas('ui_gift_box', 54, 54);
    const ctxG = cGift.getContext();
    ctxG.fillStyle = '#dc2626'; // Red box
    ctxG.beginPath();
    ctxG.roundRect(8, 16, 38, 34, 5);
    ctxG.fill();
    ctxG.strokeStyle = '#991b1b';
    ctxG.lineWidth = 2.5;
    ctxG.stroke();

    // Golden-yellow ribbon cross
    ctxG.fillStyle = '#facc15';
    ctxG.fillRect(23, 16, 8, 34);
    ctxG.fillRect(8, 30, 38, 7);

    // Fluffy bow on top
    ctxG.fillStyle = '#fde047';
    ctxG.beginPath();
    ctxG.ellipse(21, 14, 7, 5, -Math.PI / 4, 0, Math.PI * 2);
    ctxG.ellipse(33, 14, 7, 5, Math.PI / 4, 0, Math.PI * 2);
    ctxG.fill();
    cGift.refresh();

    // 5. Upgrade Up-Arrow Icon
    const cArr = this.textures.createCanvas('ui_upgrade_arrow', 36, 36);
    const ctxA = cArr.getContext();
    ctxA.fillStyle = '#ffffff';
    ctxA.beginPath();
    ctxA.moveTo(18, 7);
    ctxA.lineTo(29, 19);
    ctxA.lineTo(23, 19);
    ctxA.lineTo(23, 29);
    ctxA.lineTo(13, 29);
    ctxA.lineTo(13, 19);
    ctxA.lineTo(7, 19);
    ctxA.closePath();
    ctxA.fill();
    cArr.refresh();

    // 6. Pulsing Red Exclamation "!" Badge
    const cBadge = this.textures.createCanvas('ui_badge_exclamation', 28, 28);
    const ctxB = cBadge.getContext();
    ctxB.fillStyle = '#ef4444';
    ctxB.beginPath();
    ctxB.arc(14, 14, 12, 0, Math.PI * 2);
    ctxB.fill();
    ctxB.strokeStyle = '#ffffff';
    ctxB.lineWidth = 2.5;
    ctxB.stroke();
    // Exclamation Mark
    ctxB.fillStyle = '#ffffff';
    ctxB.fillRect(12.5, 6, 3, 9);
    ctxB.beginPath();
    ctxB.arc(14, 19.5, 2, 0, Math.PI * 2);
    ctxB.fill();
    cBadge.refresh();

    // 7. Gold Star Badge for Level 10+
    const cStarB = this.textures.createCanvas('ui_gold_star_badge', 32, 32);
    const ctxSB = cStarB.getContext();
    ctxSB.fillStyle = '#facc15';
    const cx = 16, cy = 16, outerR = 14, innerR = 6;
    ctxSB.beginPath();
    for (let i = 0; i < 10; i++) {
      const angle = -Math.PI / 2 + (i * Math.PI) / 5;
      const r = (i % 2 === 0) ? outerR : innerR;
      const px = cx + Math.cos(angle) * r;
      const py = cy + Math.sin(angle) * r;
      if (i === 0) ctxSB.moveTo(px, py);
      else ctxSB.lineTo(px, py);
    }
    ctxSB.closePath();
    ctxSB.fill();
    ctxSB.strokeStyle = '#b45309';
    ctxSB.lineWidth = 2;
    ctxSB.stroke();
    cStarB.refresh();

    // 8. Celebratory Wrench and Sparkle
    const cWrench = this.textures.createCanvas('ui_wrench_sparkle', 64, 64);
    const ctxWr = cWrench.getContext();
    ctxWr.save();
    ctxWr.translate(32, 32);
    ctxWr.rotate(-Math.PI / 4);
    ctxWr.fillStyle = '#f59e0b';
    ctxWr.fillRect(-6, -24, 12, 48);
    ctxWr.beginPath();
    ctxWr.arc(0, -22, 14, 0, Math.PI * 2);
    ctxWr.arc(0, 22, 14, 0, Math.PI * 2);
    ctxWr.fill();
    ctxWr.fillStyle = '#ffffff';
    ctxWr.beginPath();
    ctxWr.arc(0, -22, 6, 0, Math.PI * 2);
    ctxWr.arc(0, 22, 6, 0, Math.PI * 2);
    ctxWr.fill();
    ctxWr.restore();
    cWrench.refresh();

    // 9. Scenic Township Airfield Preview Backdrop (2X supersampled: 920 x 680)
    const cBackdrop = this.textures.createCanvas('airfield_preview_backdrop', 920, 680);
    const ctxBk = cBackdrop.getContext();

    // (a) Sky Gradient
    const skyGrad = ctxBk.createLinearGradient(0, 0, 0, 360);
    skyGrad.addColorStop(0, '#7ec8f8');
    skyGrad.addColorStop(0.7, '#bae6fd');
    skyGrad.addColorStop(1, '#fef9c3');
    ctxBk.fillStyle = skyGrad;
    ctxBk.fillRect(0, 0, 920, 360);

    // Fluffy cumulus clouds in sky
    ctxBk.fillStyle = 'rgba(255, 255, 255, 0.85)';
    const drawCloud = (cx, cy, s) => {
      ctxBk.beginPath();
      ctxBk.arc(cx, cy, 32 * s, 0, Math.PI * 2);
      ctxBk.arc(cx + 28 * s, cy - 10 * s, 26 * s, 0, Math.PI * 2);
      ctxBk.arc(cx + 56 * s, cy, 28 * s, 0, Math.PI * 2);
      ctxBk.arc(cx - 26 * s, cy + 6 * s, 22 * s, 0, Math.PI * 2);
      ctxBk.fill();
    };
    drawCloud(160, 90, 1.2);
    drawCloud(480, 70, 0.9);
    drawCloud(760, 100, 1.3);

    // (b) Distant Rolling Hills
    const hillGrad = ctxBk.createLinearGradient(0, 180, 0, 340);
    hillGrad.addColorStop(0, '#86efac');
    hillGrad.addColorStop(1, '#22c55e');
    ctxBk.fillStyle = hillGrad;
    ctxBk.beginPath();
    ctxBk.moveTo(0, 310);
    ctxBk.bezierCurveTo(220, 240, 480, 270, 700, 230);
    ctxBk.bezierCurveTo(800, 210, 880, 240, 920, 260);
    ctxBk.lineTo(920, 360);
    ctxBk.lineTo(0, 360);
    ctxBk.closePath();
    ctxBk.fill();

    // (c) Lush Tree Line (Pine trees and Rounded Cartoon Oaks)
    const drawPineTree = (tx, ty, scale) => {
      ctxBk.fillStyle = '#14532d';
      ctxBk.beginPath();
      ctxBk.moveTo(tx, ty - 65 * scale);
      ctxBk.lineTo(tx + 28 * scale, ty);
      ctxBk.lineTo(tx - 28 * scale, ty);
      ctxBk.closePath();
      ctxBk.fill();

      ctxBk.fillStyle = '#166534';
      ctxBk.beginPath();
      ctxBk.moveTo(tx, ty - 85 * scale);
      ctxBk.lineTo(tx + 22 * scale, ty - 28 * scale);
      ctxBk.lineTo(tx - 22 * scale, ty - 28 * scale);
      ctxBk.closePath();
      ctxBk.fill();
    };

    const drawDeciduousTree = (tx, ty, scale) => {
      // Trunk
      ctxBk.fillStyle = '#78350f';
      ctxBk.fillRect(tx - 6 * scale, ty - 25 * scale, 12 * scale, 30 * scale);

      // Foliage cluster
      ctxBk.fillStyle = '#15803d';
      ctxBk.beginPath();
      ctxBk.arc(tx, ty - 55 * scale, 36 * scale, 0, Math.PI * 2);
      ctxBk.arc(tx - 24 * scale, ty - 45 * scale, 28 * scale, 0, Math.PI * 2);
      ctxBk.arc(tx + 24 * scale, ty - 45 * scale, 28 * scale, 0, Math.PI * 2);
      ctxBk.fill();

      // Top highlight
      ctxBk.fillStyle = '#4ade80';
      ctxBk.beginPath();
      ctxBk.arc(tx - 10 * scale, ty - 65 * scale, 20 * scale, 0, Math.PI * 2);
      ctxBk.fill();
    };

    for (let x = 30; x <= 900; x += 65) {
      if ((x / 65) % 2 === 0) {
        drawPineTree(x, 340, 1.1);
      } else {
        drawDeciduousTree(x, 345, 1.05);
      }
    }

    // (d) Green Grass Verge
    ctxBk.fillStyle = '#4ade80';
    ctxBk.fillRect(0, 335, 920, 70);

    // Darker green grass border
    ctxBk.fillStyle = '#22c55e';
    ctxBk.fillRect(0, 395, 920, 8);

    // (e) White Wooden Picket Fence
    ctxBk.fillStyle = '#ffffff';
    ctxBk.strokeStyle = '#cbd5e1';
    ctxBk.lineWidth = 1.5;
    // Cross rails
    ctxBk.fillRect(0, 350, 920, 6);
    ctxBk.fillRect(0, 370, 920, 6);
    // Pickets
    for (let px = 8; px < 920; px += 28) {
      ctxBk.beginPath();
      ctxBk.moveTo(px, 385);
      ctxBk.lineTo(px, 340);
      ctxBk.lineTo(px + 7, 332);
      ctxBk.lineTo(px + 14, 340);
      ctxBk.lineTo(px + 14, 385);
      ctxBk.closePath();
      ctxBk.fill();
      ctxBk.stroke();
    }

    // (f) Warm Tan/Dirt Paved Runway Apron (Bottom Half: Y = 400 to 680)
    const runwayGrad = ctxBk.createLinearGradient(0, 400, 0, 680);
    runwayGrad.addColorStop(0, '#e5d7ba');
    runwayGrad.addColorStop(0.3, '#d4c4a3');
    runwayGrad.addColorStop(1, '#bfa882');
    ctxBk.fillStyle = runwayGrad;
    ctxBk.fillRect(0, 400, 920, 280);

    // Subtle runway shoulder bevel line
    ctxBk.fillStyle = '#92400e';
    ctxBk.fillRect(0, 400, 920, 4);

    // Dashed White Runway Markings
    ctxBk.fillStyle = 'rgba(255, 255, 255, 0.75)';
    for (let mx = 40; mx < 920; mx += 140) {
      ctxBk.beginPath();
      ctxBk.roundRect(mx, 550, 80, 10, 4);
      ctxBk.fill();
    }

    cBackdrop.refresh();
  }
}

