/**
 * Township Aerial Challenge — FlightScene (Phase 2)
 * High-Res 2X Supersampled Modular Biplane Container,
 * Multi-Layer Parallax Township World, and Smooth Vertical Camera Tracking.
 */

import { SCALE, FLIGHT_PHYSICS, FLIGHT_STATE, COLORS, COLLECTIBLES_CONFIG, ECONOMY_AND_FUEL_CONFIG } from './Constants.js';
import { FlightPhysics } from './FlightPhysics.js';
import { gameState } from './GameState.js';
import { CollectibleManager } from './CollectibleManager.js';

export class FlightScene extends Phaser.Scene {
  constructor() {
    super({ key: 'FlightScene' });
  }

  create() {
    this.physicsEngine = new FlightPhysics();
    this.isDraggingSlingshot = false;
    this.isHoldingScreen = false;

    // Camera smoothing state
    this.cameraScrollX = 0;
    this.cameraScrollY = 0;

    // Animation state
    this.propellerAngle = 0;
    this.propellerSpeed = 250;
    this.smokeTimer = 0;

    // Milestone markers pool & tracking
    this.milestoneMarkers = new Map();

    // 1. Multi-Layer Parallax World
    this.createSkyBackdrop();
    this.createMountainsLayer();
    this.createHillsLayer();
    this.createTownPanoramaLayer();
    this.createCloudBanks();
    this.createAirportHangarAndTower();
    this.createRunway();

    // 2. Launch Catapult & Infrastructure
    this.createSlingshotStructure();
    this.createAimArcPips();

    // 3. High-Res 2X Supersampled Biplane Modular Container
    this.createBiplaneContainer();

    // 4. Collectibles Manager (Launch Arc, Mid-air ribbons, Ground parts, Batteries, Magnets)
    this.collectibleManager = new CollectibleManager(this);

    // 5. Setup Endless Camera Bounds (never cap horizontal width)
    this.cameras.main.setBounds(0, -100000, Number.MAX_SAFE_INTEGER, 200000);
    this.cameras.main.setScroll(0, 0);

    // 6. Setup Pointer Controls
    this.setupInputControls();

    // 7. Responsive Viewport Scaling Listener
    this.scale.on('resize', (gameSize) => {
      const w = Math.max(3000, gameSize.width);
      if (this.mountainsTile) this.mountainsTile.width = w;
      if (this.hillsTile) this.hillsTile.width = w;
      if (this.townTile) this.townTile.width = w;
      if (this.runwayTile) this.runwayTile.width = w + 1000;
      if (this.skyBackdrop) {
        this.skyBackdrop.clear();
        this.skyBackdrop.fillGradientStyle(
          COLORS.SKY_TOP, COLORS.SKY_TOP,
          COLORS.SKY_BOTTOM, COLORS.SKY_BOTTOM,
          1
        );
        this.skyBackdrop.fillRect(0, 0, w, SCALE.CANVAS_HEIGHT);
      }
    });

    // Listen to GameState resets
    gameState.on('resetFlight', () => this.resetRun());
    gameState.on('takeOffClicked', () => {
      this.physicsEngine.setUpgrades(gameState.upgrades);
      this.updateVisualTier();
      this.isHoldingScreen = false;
      this.isDraggingSlingshot = false;
    });
    gameState.on('upgradePurchased', () => {
      this.physicsEngine.setUpgrades(gameState.upgrades);
      this.updateVisualTier();
    });

    // Initial setup with active upgrades & visual tier
    this.physicsEngine.setUpgrades(gameState.upgrades);
    this.updateVisualTier();
  }

  /* ========================================================================
     1. MULTI-LAYER PARALLAX TOWNSHIP WORLD
     ======================================================================== */

  createSkyBackdrop() {
    // Parallax sky gradient covering full vertical flight bounds
    const w = Math.max(2500, this.scale.width || SCALE.CANVAS_WIDTH);
    this.skyBackdrop = this.add.graphics();
    this.skyBackdrop.setScrollFactor(0);
    this.skyBackdrop.fillGradientStyle(
      COLORS.SKY_TOP, COLORS.SKY_TOP,
      COLORS.SKY_BOTTOM, COLORS.SKY_BOTTOM,
      1
    );
    this.skyBackdrop.fillRect(0, 0, w, SCALE.CANVAS_HEIGHT);
    this.skyBackdrop.setDepth(-100);
  }

  createMountainsLayer() {
    // Layer 1: Distant pastel-blue snow-capped peaks (0.15x parallax)
    // 650px high tile anchored down to groundY + 350px (y=260 down to 910)
    const w = Math.max(2500, this.scale.width || SCALE.CANVAS_WIDTH);
    this.mountainsTile = this.add.tileSprite(0, 260, w, 650, 'bg_mountains');
    this.mountainsTile.setOrigin(0, 0);
    this.mountainsTile.setScrollFactor(0);
    this.mountainsTile.setDepth(-80);
  }

  createHillsLayer() {
    // Layer 2: Rolling green pastoral hills with trees (0.35x parallax)
    // 600px high tile anchored down to groundY + 350px (y=310 down to 910)
    const w = Math.max(2500, this.scale.width || SCALE.CANVAS_WIDTH);
    this.hillsTile = this.add.tileSprite(0, 310, w, 600, 'bg_hills');
    this.hillsTile.setOrigin(0, 0);
    this.hillsTile.setScrollFactor(0);
    this.hillsTile.setDepth(-60);
  }

  createTownPanoramaLayer() {
    // Layer 3: Vibrant Township Town and Farmland panorama (0.65x parallax)
    const w = Math.max(2500, this.scale.width || SCALE.CANVAS_WIDTH);
    const townBottomY = SCALE.RUNWAY_Y - 58;
    this.townTile = this.add.tileSprite(0, townBottomY, w, 200, 'bg_town_panorama');
    this.townTile.setOrigin(0, 1.0);
    this.townTile.setScrollFactor(0);
    this.townTile.setDepth(-40);

    // Animated spinning wooden windmill blades atop the panorama windmill tower (hub centered at X=975)
    this.windmillBlades = this.add.image(0, 0, 'prop_windmill_blades');
    this.windmillBlades.setOrigin(0.5, 0.5);
    this.windmillBlades.setScrollFactor(0);
    this.windmillBlades.setDepth(-39);
  }

  createCloudBanks() {
    // Distant small cumulus clouds rolling endlessly in distant background layer (depth -90)
    this.cloudsGroup = this.add.group();
    this.highestSpawnedCloudX = 200;
    this.updateRollingClouds();
  }

  updateRollingClouds() {
    const camX = (this.cameras && this.cameras.main) ? this.cameras.main.scrollX : 0;
    const viewWidth = (this.scale && this.scale.width) || SCALE.CANVAS_WIDTH;
    const targetX = camX + viewWidth + 2400;

    // Generate clouds ahead across multi-altitudes (85 FT to 220 FT)
    while (this.highestSpawnedCloudX < targetX) {
      const cloudX = this.highestSpawnedCloudX + Phaser.Math.Between(520, 960);
      const cloudFt = Phaser.Math.Between(85, 220);
      const cloudY = SCALE.RUNWAY_Y - (cloudFt * SCALE.PIXELS_PER_FT);

      const cloud = this.add.image(cloudX, cloudY, 'big_cloud');
      const scale = Phaser.Math.FloatBetween(0.24, 0.40);
      cloud.setScale(scale);
      cloud.setAlpha(Phaser.Math.FloatBetween(0.35, 0.55));
      cloud.setDepth(-90);
      this.cloudsGroup.add(cloud);

      this.highestSpawnedCloudX = cloudX;
    }

    // Prune clouds behind camera (< camX - 600)
    const pruneX = camX - 600;
    const children = this.cloudsGroup.getChildren();
    for (let i = children.length - 1; i >= 0; i--) {
      const child = children[i];
      if (child.x < pruneX) {
        child.destroy();
      }
    }
  }

  createAirportHangarAndTower() {
    // Airport Hangar & Control Tower (moved to X = -140, leaving clear space before slingshot at X = 260)
    this.hangarTower = this.add.image(-140, SCALE.RUNWAY_Y, 'prop_hangar_tower');
    this.hangarTower.setOrigin(0, 1.0);
    this.hangarTower.setDepth(-20);

    // Animated orange-and-white windsock (positioned behind hangar roof at X = 130)
    this.windsock = this.add.image(130, SCALE.RUNWAY_Y - 145, 'prop_windsock');
    this.windsock.setOrigin(0.18, 0.95);
    this.windsock.setDepth(-15);
  }

  createRunway() {
    // Endless camera-locked TileSprite for ground & runway
    const w = Math.max(3000, (this.scale && this.scale.width) || SCALE.CANVAS_WIDTH);
    this.runwayTile = this.add.tileSprite(0, SCALE.RUNWAY_Y - 95, w + 1000, 225, 'runway_infinite_ground');
    this.runwayTile.setOrigin(0, 0);
    this.runwayTile.setScrollFactor(0);
    this.runwayTile.setDepth(10);
  }

  /* ========================================================================
     2. LAUNCH CATAPULT & AIM ARC
     ======================================================================== */

  createSlingshotStructure() {
    // Left elastic band (depth 18, behind plane fuselage)
    this.elasticBandLeft = this.add.graphics().setDepth(18);

    // Sturdy Y-shaped wooden catapult post rooted at runway pavement
    this.slingshotSprite = this.add.image(SCALE.SLINGSHOT_X, SCALE.RUNWAY_Y + 4, 'slingshot');
    this.slingshotSprite.setOrigin(0.5, 0.95);
    this.slingshotSprite.setDepth(15);

    // Right elastic band (depth 25, in front of plane fuselage)
    this.elasticBandRight = this.add.graphics().setDepth(25);
  }

  createAimArcPips() {
    this.aimPips = [];
    // 28 trajectory projection dots for smooth long parabolic arc
    for (let i = 0; i < 28; i++) {
      const pip = this.add.image(0, 0, 'trajectory_pip');
      pip.setDepth(30);
      pip.setAlpha(0);
      this.aimPips.push(pip);
    }
    this.currentPullTension = 1.0;
    this.currentAimAngleRad = (FLIGHT_PHYSICS.OPTIMAL_AIM_ANGLE_DEG * Math.PI) / 180.0;
  }

  /* ========================================================================
     3. HIGH-RES 2X SUPERSAMPLED BIPLANE CONTAINER
     ======================================================================== */

  createBiplaneContainer() {
    // Base position in slingshot pouch at top Y-fork tips (visual offset of -33px matching airborne physics)
    const initialX = SCALE.SLINGSHOT_X;
    const initialY = SCALE.SLINGSHOT_Y - 33;

    this.biplane = this.add.container(initialX, initialY);
    this.biplane.setDepth(20);
    this.biplane.setAngle(-15);

    // (e) Pulsing Magnetic Aura Ring (during active 5.0s magnet pull)
    this.magneticAura = this.add.image(0, 0, 'magnetic_aura');
    this.magneticAura.setOrigin(0.5, 0.5);
    this.magneticAura.setScale(0.55);
    this.magneticAura.setVisible(false);

    // (g) Two-layer Yellow-Orange Booster Jet Flame at rear exhaust nozzle
    this.flameSprite = this.add.image(-48, 0, 'plane_flame');
    this.flameSprite.setOrigin(1.0, 0.5);
    this.flameSprite.setScale(0.5);
    this.flameSprite.setVisible(false);

    // (d) Angled Upper & Lower Red Wings with cream leading edges & struts
    this.wingsSprite = this.add.image(0, -2, 'plane_wings');
    this.wingsSprite.setOrigin(0.5, 0.5);
    this.wingsSprite.setScale(0.5);

    // (a) Chunky Teardrop Fuselage in Cherry-Red with Cream Belly & Racing Stripe
    this.fuselageSprite = this.add.image(0, 0, 'plane_fuselage');
    this.fuselageSprite.setOrigin(0.5, 0.5);
    this.fuselageSprite.setScale(0.5);

    // (e) Animated Fluttering White Scarf
    this.scarfSprite = this.add.image(-12, -8, 'plane_scarf');
    this.scarfSprite.setOrigin(0.9, 0.5);
    this.scarfSprite.setScale(0.5);

    // (e) Open Cockpit Pilot in Leather Helmet, Brass/Cyan Goggles & Windscreen
    this.pilotSprite = this.add.image(-4, -14, 'plane_pilot');
    this.pilotSprite.setOrigin(0.5, 0.5);
    this.pilotSprite.setScale(0.5);

    // (f) Sturdy V-Strut Landing Gear with Oversized Charcoal Tire & White Hubcap
    this.gearSprite = this.add.image(6, 18, 'plane_gear');
    this.gearSprite.setOrigin(0.5, 0.5);
    this.gearSprite.setScale(0.5);

    // (b) Golden-Yellow Radial Engine Cowling with Silver Ring & Conical Spinner
    this.cowlingSprite = this.add.image(44, 0, 'plane_cowling');
    this.cowlingSprite.setOrigin(0.5, 0.5);
    this.cowlingSprite.setScale(0.5);

    // (c) 360-degree Translucent Spinning Propeller Blur Disc
    this.propellerDisc = this.add.image(58, 0, 'plane_propeller');
    this.propellerDisc.setOrigin(0.5, 0.5);
    this.propellerDisc.setScale(0.5);

    // Add modular components to biplane container in correct visual depth order
    this.biplane.add([
      this.magneticAura,
      this.flameSprite,
      this.wingsSprite,
      this.fuselageSprite,
      this.scarfSprite,
      this.pilotSprite,
      this.gearSprite,
      this.cowlingSprite,
      this.propellerDisc
    ]);
  }

  /* ========================================================================
     4. INPUT HANDLING
     ======================================================================== */

  setupInputControls() {
    this.input.on('pointerdown', (pointer) => this.handlePointerDown(pointer));
    this.input.on('pointermove', (pointer) => this.handlePointerMove(pointer));
    this.input.on('pointerup', (pointer) => this.handlePointerUp(pointer));
    this.input.on('pointercancel', (pointer) => this.handlePointerCancel(pointer));
  }

  handlePointerDown(pointer) {
    if (gameState.isAirfieldMenuOpen) return;

    if (this.physicsEngine.state === FLIGHT_STATE.PRE_LAUNCH) {
      // Check if clicking near the biplane in slingshot or dragging from behind/around the fork
      const dist = Phaser.Math.Distance.Between(pointer.worldX, pointer.worldY, this.biplane.x, this.biplane.y);
      if (dist < 180 || (pointer.worldX <= SCALE.SLINGSHOT_X + 60 && pointer.worldY >= SCALE.SLINGSHOT_Y - 90)) {
        // MANDATORY FUEL ENFORCEMENT: Flight must be paid before pulling slingshot
        if (!gameState.isFlightPaidFor) {
          if (!gameState.consumeFlightFuel()) {
            this.isDraggingSlingshot = false;
            gameState.emit('fuelInsufficient', {
              current: gameState.fuel,
              required: ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT
            });
            return;
          }
        }
        this.isDraggingSlingshot = true;
        this.processSlingshotDrag(pointer.worldX, pointer.worldY);
      }
    } else if (this.physicsEngine.state === FLIGHT_STATE.LAUNCHING ||
               this.physicsEngine.state === FLIGHT_STATE.AIRBORNE_POWERED ||
               this.physicsEngine.state === FLIGHT_STATE.AIRBORNE_GLIDE) {
      // In flight: tapping/holding activates upward thrust immediately
      this.isHoldingScreen = true;
      gameState.setBoosterActive(true);
    }
  }

  handlePointerMove(pointer) {
    if (gameState.isAirfieldMenuOpen) return;

    if (this.isDraggingSlingshot && this.physicsEngine.state === FLIGHT_STATE.PRE_LAUNCH) {
      this.processSlingshotDrag(pointer.worldX, pointer.worldY);
    }
  }

  processSlingshotDrag(worldX, worldY) {
    const anchorX = SCALE.SLINGSHOT_X;
    const anchorY = SCALE.SLINGSHOT_Y;

    // Vector from anchor to pointer
    const rawDx = worldX - anchorX;
    const rawDy = worldY - anchorY;

    // Clamp pullback behind slingshot (dx <= 0) and within natural angles (dy between -35 and +110)
    const maxPull = FLIGHT_PHYSICS.MAX_PULL_DISTANCE || 135.0;
    const pullX = Phaser.Math.Clamp(rawDx, -maxPull, 0);
    const pullY = Phaser.Math.Clamp(rawDy, -35, 110);

    const pullDist = Math.hypot(pullX, pullY);
    let finalPullX = pullX;
    let finalPullY = pullY;
    if (pullDist > maxPull) {
      const factor = maxPull / pullDist;
      finalPullX = pullX * factor;
      finalPullY = pullY * factor;
    }

    this.biplane.x = anchorX + finalPullX;
    this.biplane.y = anchorY - 33 + finalPullY;

    // Effective pullback distance (min 20px)
    const effectivePullDist = Math.hypot(finalPullX, finalPullY);
    const tension = Phaser.Math.Clamp(effectivePullDist / maxPull, 0.20, 1.0);

    // Launch impulse points opposite to pull vector: (-finalPullX, -finalPullY)
    const launchDirX = Math.max(0.001, -finalPullX);
    const launchDirY = -finalPullY;
    const rawAngleRad = Math.atan2(launchDirY, launchDirX);

    // Clamp aim angle between MAX_AIM_ANGLE_DEG (-50°) and MIN_AIM_ANGLE_DEG (-10°)
    const minAngleRad = (FLIGHT_PHYSICS.MIN_AIM_ANGLE_DEG * Math.PI) / 180.0;
    const maxAngleRad = (FLIGHT_PHYSICS.MAX_AIM_ANGLE_DEG * Math.PI) / 180.0;
    const clampedAngleRad = Phaser.Math.Clamp(rawAngleRad, maxAngleRad, minAngleRad);

    this.currentPullTension = tension;
    this.currentAimAngleRad = clampedAngleRad;

    // Align biplane rotation with slingshot tension angle
    this.biplane.rotation = clampedAngleRad * 0.75;

    // Update real-time trajectory projection dots
    this.updateAimPreviewArc(tension, clampedAngleRad);
  }

  handlePointerUp(pointer) {
    if (gameState.isAirfieldMenuOpen) return;

    if (this.isDraggingSlingshot) {
      this.isDraggingSlingshot = false;
      this.hideAimArc();

      // MANDATORY FUEL ENFORCEMENT: Final release check
      if (!gameState.isFlightPaidFor) {
        if (!gameState.consumeFlightFuel()) {
          this.biplane.x = SCALE.SLINGSHOT_X;
          this.biplane.y = SCALE.SLINGSHOT_Y - 33;
          this.biplane.rotation = 0;
          gameState.emit('fuelInsufficient', {
            current: gameState.fuel,
            required: ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT
          });
          return;
        }
      }

      // Launch with dynamic tension and aim angle
      this.physicsEngine.launch({
        tension: this.currentPullTension,
        aimAngleRad: this.currentAimAngleRad
      });
      gameState.setFlightState(FLIGHT_STATE.LAUNCHING);
    }

    if (this.isHoldingScreen) {
      // Finger released on this exact frame: cut thrust immediately
      this.isHoldingScreen = false;
      gameState.setBoosterActive(false);
    }
  }

  handlePointerCancel(pointer) {
    this.handlePointerUp(pointer);
  }

  updateAimPreviewArc(tension, aimAngleRad) {
    const anchorX = SCALE.SLINGSHOT_X;
    const anchorY = SCALE.SLINGSHOT_Y;

    // (1) Progressive Slingshot Projection Scaling:
    // Read current slingshot upgrades count from GameState and scale:
    // - activePipCount: 10 pips at 0 upgrades (+2 pips per level) to 28 pips at 9+ upgrades
    // - maxPreviewTime: 0.48s (~175-210 px) at 0 upgrades to 1.65s (~650-700 px) at 9+ upgrades
    const slingshotUpgrades = (gameState.upgrades && gameState.upgrades.slingshot) || 0;
    const upgradeRatio = Math.min(1.0, Math.max(0, slingshotUpgrades) / 9);
    const activePipCount = Math.round(10 + 18 * upgradeRatio);
    const maxPreviewTime = 0.48 + (1.20 - 0.48) * upgradeRatio;

    // Base launch velocity calculation with slingshot upgrade multiplier
    const baseSpeed = Math.hypot(FLIGHT_PHYSICS.LAUNCH_BASE_VX0, FLIGHT_PHYSICS.LAUNCH_BASE_VY0);
    const slingMult = 1.0 + (FLIGHT_PHYSICS.SLINGSHOT_LAUNCH_STEP || 0.05) * Math.min(9, Math.max(0, slingshotUpgrades));
    const speed = baseSpeed * tension * slingMult;

    const vx0 = speed * Math.cos(aimAngleRad);
    const vy0 = speed * Math.sin(aimAngleRad);
    const gLaunch = FLIGHT_PHYSICS.LAUNCH_GRAVITY; // 240 px/s^2

    // (2) Smooth Pip Spacing & Tapering Per Level:
    // Distribute activePipCount dots evenly from t = 0.05s to maxPreviewTime along exact parabolic launch equation
    const tMin = 0.05;
    const totalPips = this.aimPips.length;

    for (let i = 0; i < totalPips; i++) {
      const pip = this.aimPips[i];

      // Hide pips beyond activePipCount
      if (i >= activePipCount) {
        pip.setAlpha(0);
        continue;
      }

      const progress = activePipCount > 1 ? i / (activePipCount - 1) : 0;
      const t = tMin + progress * (maxPreviewTime - tMin);

      // Parabolic flight trajectory: x(t) = anchorX + vx0*t, y(t) = anchorY + vy0*t + 0.5*g*t^2
      pip.x = anchorX + vx0 * t;
      pip.y = anchorY + vy0 * t + 0.5 * gLaunch * t * t;

      // Don't show dots that dip below runway pavement
      if (pip.y > SCALE.RUNWAY_Y - 8) {
        pip.setAlpha(0);
        continue;
      }

      // Smoothly tapering scale and alpha across activePipCount so the tip always looks polished
      const alpha = typeof Phaser !== 'undefined' && Phaser.Math && Phaser.Math.Clamp
        ? Phaser.Math.Clamp(1.0 - progress * 0.65, 0.30, 1.0)
        : Math.max(0.30, Math.min(1.0, 1.0 - progress * 0.65));
      const scale = 0.95 - progress * 0.40;
      pip.setAlpha(alpha);
      pip.setScale(scale);
    }
  }

  hideAimArc() {
    for (const pip of this.aimPips) {
      pip.setAlpha(0);
    }
  }

  /* ========================================================================
     5. SIMULATION & ANIMATION UPDATE LOOP
     ======================================================================== */

  update(time, delta) {
    const dt = Math.min(0.066, Math.max(0.001, delta / 1000));

    // 0. Continuous slingshot drag tracking
    if (this.isDraggingSlingshot && this.physicsEngine.state === FLIGHT_STATE.PRE_LAUNCH) {
      const activePointer = this.input.activePointer;
      if (activePointer && activePointer.isDown) {
        this.processSlingshotDrag(activePointer.worldX, activePointer.worldY);
      }
    }

    // 1. Advance deterministic physics engine
    this.physicsEngine.step(dt, this.isHoldingScreen);

    // 2. Sync state to GameState
    gameState.updateEnergy(this.physicsEngine.energy);
    gameState.updateDistance(this.physicsEngine.airborneDistanceFt, this.physicsEngine.taxiDistanceFt);

    // 3. Update biplane transform
    if (this.physicsEngine.state !== FLIGHT_STATE.PRE_LAUNCH) {
      this.biplane.x = this.physicsEngine.x;
      this.biplane.y = this.physicsEngine.y - 33;
      this.biplane.setAngle(this.physicsEngine.pitchDeg);

      // Booster VFX: Flame & World-Space Cartoon Smoke Puffs
      const isBoosting = (this.physicsEngine.state === FLIGHT_STATE.AIRBORNE_POWERED);
      this.flameSprite.setVisible(isBoosting);

      if (isBoosting) {
        // Flickering booster flame
        const flameScaleX = 0.5 * (0.85 + Math.sin(time * 0.04) * 0.25);
        const flameScaleY = 0.5 * (0.90 + Math.cos(time * 0.03) * 0.20);
        this.flameSprite.setScale(flameScaleX, flameScaleY);
        this.flameSprite.setAlpha(0.9 + Math.sin(time * 0.06) * 0.1);

        // Spawn world-space cartoon smoke puff circle every 40ms
        this.smokeTimer += dt;
        if (this.smokeTimer >= 0.040) {
          this.smokeTimer = 0;
          this.spawnSmokePuff();
        }
      } else {
        this.smokeTimer = 0;
      }

      // Landing gear suspension roll vibration during taxi
      if (this.physicsEngine.state === FLIGHT_STATE.RUNWAY_TAXI) {
        this.gearSprite.y = 18 + Math.sin(time * 0.04) * 0.6;
      }
    }

    // 4. Update Collectibles & Magnet Attraction Physics
    if (this.collectibleManager) {
      this.collectibleManager.update(dt, this.biplane.x, this.biplane.y, this.physicsEngine);

      // (e) Update pulsing cyan/gold magnetic aura ring around aircraft
      const isMag = this.collectibleManager.isMagnetActive;
      this.magneticAura.setVisible(isMag);
      if (isMag) {
        this.magneticAura.angle += 120 * dt;
        const auraScale = 0.55 * (1.0 + Math.sin(time * 0.009) * 0.12);
        this.magneticAura.setScale(auraScale);
        this.magneticAura.setAlpha(0.85 + Math.sin(time * 0.015) * 0.15);
      }
    }

    // 5. Update Propeller Speed & Animation
    this.updatePropellerAnimation(dt);

    // 6. Update Scarf Flutter Animation
    this.scarfSprite.angle = Math.sin(time * 0.018) * 10.0;
    this.scarfSprite.scaleY = 0.5 * (1.0 + Math.sin(time * 0.024) * 0.18);

    // 7. Update Slingshot Elastic Bands
    this.drawSlingshotBands();

    // 8. Update Windsock Flutter
    this.windsock.angle = Math.sin(time * 0.005) * 5.0;
    this.windsock.scaleY = 1.0 + Math.sin(time * 0.007) * 0.08;

    // 9. Update Camera & Multi-Layer Parallax Tracking
    this.updateCameraAndParallax(dt);

    // 10. Dynamic 100 FT Milestone Signposts
    this.updateMilestoneMarkers();

    // 11. Flight Completion Trigger
    if (this.physicsEngine.state === FLIGHT_STATE.FLIGHT_OVER &&
        gameState.flightState !== FLIGHT_STATE.FLIGHT_OVER) {
      gameState.completeFlight();
    }
  }

  updatePropellerAnimation(dt) {
    const state = this.physicsEngine.state;

    if (state === FLIGHT_STATE.PRE_LAUNCH) {
      this.propellerSpeed = 250;
    } else if (state === FLIGHT_STATE.LAUNCHING || state === FLIGHT_STATE.AIRBORNE_GLIDE) {
      this.propellerSpeed = 800;
    } else if (state === FLIGHT_STATE.AIRBORNE_POWERED) {
      this.propellerSpeed = 1600;
    } else if (state === FLIGHT_STATE.RUNWAY_TAXI) {
      const taxiRatio = Math.max(0, this.physicsEngine.vx / (FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX * FLIGHT_PHYSICS.TAXI_ENTRY_SPEED_RATIO));
      this.propellerSpeed = 800 * taxiRatio;
    } else if (state === FLIGHT_STATE.FLIGHT_OVER) {
      this.propellerSpeed = 0;
    }

    this.propellerAngle += this.propellerSpeed * dt;
    this.propellerDisc.angle = this.propellerAngle;
    this.propellerDisc.scaleY = 0.5 * (0.88 + 0.12 * Math.sin(this.propellerAngle * 0.05));
    this.propellerDisc.alpha = this.propellerSpeed > 50 ? 0.75 : 0.0;
  }

  spawnSmokePuff() {
    const rad = Phaser.Math.DegToRad(this.biplane.angle);
    // World coordinates of rear exhaust nozzle
    const tailX = this.biplane.x - Math.cos(rad) * 48;
    const tailY = this.biplane.y - Math.sin(rad) * 48;

    const puff = this.add.image(tailX, tailY, 'smoke_circle');
    puff.setDepth(18);
    puff.setScale(Phaser.Math.FloatBetween(0.25, 0.35));
    puff.setAlpha(0.85);

    const driftDist = Phaser.Math.FloatBetween(25, 45);
    const driftAngle = rad + Math.PI + Phaser.Math.FloatBetween(-0.25, 0.25);
    const targetX = tailX + Math.cos(driftAngle) * driftDist;
    const targetY = tailY + Math.sin(driftAngle) * driftDist - Phaser.Math.FloatBetween(8, 16);

    this.tweens.add({
      targets: puff,
      x: targetX,
      y: targetY,
      scale: Phaser.Math.FloatBetween(0.9, 1.25),
      alpha: 0,
      duration: 650,
      ease: 'Cubic.easeOut',
      onComplete: () => {
        puff.destroy();
      }
    });
  }

  updateCameraAndParallax(dt) {
    // 1. Horizontal Tracking: Keep plane at ~260 px from screen left (leaves >= 120 px margin when pulled back)
    const targetCamX = Math.max(0, this.biplane.x - SCALE.SLINGSHOT_X);

    // 2. Vertical Tracking:
    // When altitude <= 42 FT: ground and runway are comfortably locked at screen bottom
    // When climbing above 42 FT: scroll the ground smoothly off the bottom of the screen
    // When descending below 42 FT: bring the runway smoothly back into view
    let targetCamY = 0;
    if (this.physicsEngine.altitudeFt > 42.0) {
      const altAbove42 = this.physicsEngine.altitudeFt - 42.0;
      targetCamY = -altAbove42 * SCALE.PIXELS_PER_FT;
    }

    // Smooth exponential camera interpolation
    this.cameraScrollX += (targetCamX - this.cameraScrollX) * Math.min(1.0, dt * 6.0);
    this.cameraScrollY += (targetCamY - this.cameraScrollY) * Math.min(1.0, dt * 4.5);

    this.cameras.main.setScroll(this.cameraScrollX, this.cameraScrollY);

    const camX = this.cameras.main.scrollX;
    const camY = this.cameras.main.scrollY;

    // 3. Update Parallax Background Layers
    // Layer 1: Mountains (0.15x) — 650px tile anchored down to groundY + 350px (y=260 down to 910)
    this.mountainsTile.tilePositionX = camX * 0.15;
    this.mountainsTile.y = 260 - camY * 0.08;

    // Layer 2: Hills (0.35x) — 600px tile anchored down to groundY + 350px (y=310 down to 910)
    this.hillsTile.tilePositionX = camX * 0.35;
    this.hillsTile.y = 310 - camY * 0.20;

    // Layer 3: Town Panorama (0.65x)
    this.townTile.tilePositionX = camX * 0.65;
    this.townTile.y = (SCALE.RUNWAY_Y - 58) - camY * 0.45;

    // Animated Windmill Blades matching the town panorama windmill tower (hub centered at X=975 in tile)
    const tileOffset = (camX * 0.65) % 1280;
    let windmillScreenX = 975 - tileOffset;
    if (windmillScreenX < -70) windmillScreenX += 1280;
    if (windmillScreenX > (this.scale.width || SCALE.CANVAS_WIDTH) + 70) windmillScreenX -= 1280;

    this.windmillBlades.setPosition(windmillScreenX, this.townTile.y - 130);
    this.windmillBlades.angle += 35 * dt;

    // Layer 4: Infinite Runway TileSprite
    if (this.runwayTile) {
      this.runwayTile.tilePositionX = camX;
      this.runwayTile.y = (SCALE.RUNWAY_Y - 95) - camY;
    }

    // Layer 5: Dynamic Rolling Clouds
    this.updateRollingClouds();
  }

  drawSlingshotBands() {
    // Slingshot Y-fork tips: exact top left and right brass pegs at height RUNWAY_Y - 178
    const leftPeg = { x: SCALE.SLINGSHOT_X - 35, y: SCALE.RUNWAY_Y - 178 };
    const rightPeg = { x: SCALE.SLINGSHOT_X + 35, y: SCALE.RUNWAY_Y - 178 };
    const pouch = { x: this.biplane.x - 30, y: this.biplane.y + 33 };

    this.elasticBandLeft.clear();
    this.elasticBandRight.clear();

    if (this.physicsEngine.state === FLIGHT_STATE.PRE_LAUNCH) {
      // Left band (depth 18, behind biplane fuselage)
      // Thick dark-brown outline
      this.elasticBandLeft.lineStyle(7, 0x3b2314, 1);
      this.elasticBandLeft.lineBetween(leftPeg.x, leftPeg.y, pouch.x, pouch.y);
      // Bright golden-yellow inner core (#fde047)
      this.elasticBandLeft.lineStyle(3.5, 0xfde047, 1);
      this.elasticBandLeft.lineBetween(leftPeg.x, leftPeg.y, pouch.x, pouch.y);

      // Leather pouch at plane tail
      this.elasticBandRight.fillStyle(0x3b2314, 1);
      this.elasticBandRight.fillRoundedRect(pouch.x - 5, pouch.y - 10, 10, 20, 3);
      this.elasticBandRight.fillStyle(0x5d4037, 1);
      this.elasticBandRight.fillRoundedRect(pouch.x - 4, pouch.y - 8, 8, 16, 2);
      this.elasticBandRight.fillStyle(0xfde047, 1);
      this.elasticBandRight.fillCircle(pouch.x, pouch.y, 2);

      // Right band (depth 25, in front of biplane fuselage)
      // Thick dark-brown outline
      this.elasticBandRight.lineStyle(7, 0x3b2314, 1);
      this.elasticBandRight.lineBetween(rightPeg.x, rightPeg.y, pouch.x, pouch.y);
      // Bright golden-yellow inner core (#fde047)
      this.elasticBandRight.lineStyle(3.5, 0xfde047, 1);
      this.elasticBandRight.lineBetween(rightPeg.x, rightPeg.y, pouch.x, pouch.y);
    } else {
      // Resting elastic bands after launch at top Y-fork
      const restPouch = { x: SCALE.SLINGSHOT_X, y: SCALE.SLINGSHOT_Y };

      // Left band outline & inner
      this.elasticBandLeft.lineStyle(5, 0x3b2314, 0.85);
      this.elasticBandLeft.lineBetween(leftPeg.x, leftPeg.y, restPouch.x, restPouch.y);
      this.elasticBandLeft.lineStyle(2.5, 0xfde047, 0.85);
      this.elasticBandLeft.lineBetween(leftPeg.x, leftPeg.y, restPouch.x, restPouch.y);

      // Resting pouch
      this.elasticBandRight.fillStyle(0x3b2314, 0.85);
      this.elasticBandRight.fillRoundedRect(restPouch.x - 4, restPouch.y - 6, 8, 12, 2);

      // Right band outline & inner
      this.elasticBandRight.lineStyle(5, 0x3b2314, 0.85);
      this.elasticBandRight.lineBetween(rightPeg.x, rightPeg.y, restPouch.x, restPouch.y);
      this.elasticBandRight.lineStyle(2.5, 0xfde047, 0.85);
      this.elasticBandRight.lineBetween(rightPeg.x, rightPeg.y, restPouch.x, restPouch.y);
    }
  }

  updateMilestoneMarkers() {
    const camX = this.cameras.main.scrollX;
    const viewWidth = (this.scale && this.scale.width) || SCALE.CANVAS_WIDTH;
    const minFt = Math.max(100, Math.floor((camX - 200) / (SCALE.PIXELS_PER_FT * 100)) * 100);
    const maxFt = Math.floor((camX + viewWidth + 2400) / (SCALE.PIXELS_PER_FT * 100)) * 100;

    for (let ft = minFt; ft <= maxFt; ft += 100) {
      if (!this.milestoneMarkers.has(ft)) {
        const markerX = SCALE.SLINGSHOT_X + ft * SCALE.PIXELS_PER_FT;
        const container = this.add.container(markerX, SCALE.RUNWAY_Y - 80);
        container.setDepth(12);

        const sprite = this.add.image(0, 0, 'signpost_base');
        const text = this.add.text(0, -14, `${ft} FT`, {
          fontSize: '13px',
          fontStyle: 'bold',
          color: '#5D4037',
          fontFamily: 'sans-serif'
        }).setOrigin(0.5, 0.5);

        container.add([sprite, text]);
        this.milestoneMarkers.set(ft, container);
      }
    }

    // Prune milestone markers behind camera (< camX - 600)
    const pruneX = camX - 600;
    for (const [ft, container] of this.milestoneMarkers.entries()) {
      if (container.x < pruneX) {
        container.destroy();
        this.milestoneMarkers.delete(ft);
      }
    }
  }

  updateVisualTier() {
    const tier = gameState.getTier();
    const suffix = tier === 1 ? '' : (tier === 2 ? '_t2' : '_t3');
    if (this.slingshotSprite) this.slingshotSprite.setTexture('slingshot' + suffix);
    if (this.fuselageSprite) this.fuselageSprite.setTexture('plane_fuselage' + suffix);
    if (this.wingsSprite) this.wingsSprite.setTexture('plane_wings' + suffix);
    if (this.cowlingSprite) this.cowlingSprite.setTexture('plane_cowling' + suffix);
  }

  resetRun() {
    this.isDraggingSlingshot = false;
    this.isHoldingScreen = false;
    this.physicsEngine.reset();
    this.physicsEngine.setUpgrades(gameState.upgrades);
    this.updateVisualTier();
    gameState.reset();
    if (this.collectibleManager) {
      this.collectibleManager.initWorld();
    }
    if (this.magneticAura) {
      this.magneticAura.setVisible(false);
    }
    for (const container of this.milestoneMarkers.values()) {
      if (container && container.destroy) container.destroy();
    }
    this.milestoneMarkers.clear();
    this.highestSpawnedCloudX = 200;
    this.biplane.setPosition(SCALE.SLINGSHOT_X, SCALE.SLINGSHOT_Y - 33);
    this.biplane.setAngle(-15);
    this.flameSprite.setVisible(false);
    this.hideAimArc();
    this.cameraScrollX = 0;
    this.cameraScrollY = 0;
    this.cameras.main.setScroll(0, 0);
  }
}
