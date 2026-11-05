/**
 * Township Aerial Challenge — CollectibleManager (Decoupled Abundant Star Architecture)
 * High-performance spatial collectible manager matching authentic Township layout:
 * - (1) Dedicated independent star spawner scattering Winged Stars continuously & abundantly
 *   across the entire sky (every 110-220 px horizontally, across low 75-170 px, mid 180-360 px,
 *   and high 370-560 px altitude layers, frequently with dual vertical tiers in the same slice).
 * - (2) Long strategic distances for rare challenge items:
 *   (a) Air Upgrade Tools: single/pair spaced 800-1200 px horizontally (low, mid, high).
 *   (b) Ground Runway Tools: spaced 550-750 px along tarmac (y = RUNWAY_Y - 18 px).
 *   (c) Horseshoe Magnets: spaced 2600-3600 px horizontally in low-to-mid corridor (95-240 px).
 *   (d) Battery Canisters: single canisters with widening gap (gap_px = 1900 + count * 500 px)
 *       in tricky low (95-160 px) or high (420-550 px) altitudes, restoring fixed +20 energy.
 * - Fuselage pickup radius: 34 px base + 3.0 px/level.
 * - Horseshoe Magnet: 145 px pull radius, 4.5s duration.
 */

import { SCALE, COLLECTIBLE_TYPES, COLLECTIBLES_CONFIG, FLIGHT_STATE, getFuselagePickupRadius } from './Constants.js';
import { gameState } from './GameState.js';
import { soundManager } from './SoundManager.js';

export class CollectibleManager {
  /**
   * @param {Phaser.Scene|null} scene The Phaser FlightScene instance (or null in headless tests)
   * @param {Object} [options={}] Optional configuration (e.g. { seed: 12345 })
   */
  constructor(scene = null, options = {}) {
    this.scene = scene;
    this.options = options;
    this.items = [];
    this.nextId = 1;

    // Magnet state
    this.isMagnetActive = false;
    this.magnetTimeRemaining = 0.0;
    soundManager.stopMagnetHum();
    this.hasSpawnedTaxiRolloutParts = false;

    // Spatial chunk generator tracking
    this.highestSpawnedChunkX = 0;
    this.chunkSizePx = 800;

    // Initialize world collectibles with fresh randomized seed and pattern order
    this.initWorld(options.seed);
  }

  _nextRandom() {
    this.rngState = (this.rngState * 1664525 + 1013904223) % 4294967296;
    return this.rngState / 4294967296;
  }

  _shufflePatternPool() {
    const pool = [0, 1, 2, 3, 4];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(this._nextRandom() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    return pool;
  }

  initWorld(seed = null) {
    this.clear(seed);
    // Pre-generate procedural corridors ahead up to 3200 px
    this.generateChunksUpTo(3200);
  }

  clear(seed = null) {
    for (const item of this.items) {
      if (item.sprite && item.sprite.destroy) {
        item.sprite.destroy();
      }
    }
    this.items = [];
    this.isMagnetActive = false;
    this.magnetTimeRemaining = 0.0;
    soundManager.stopMagnetHum();
    this.hasSpawnedTaxiRolloutParts = false;
    this.highestSpawnedChunkX = 0;

    // Randomized run seed: guarantees fresh procedural patterns across flights
    this.runSeed = (typeof seed === 'number')
      ? seed
      : ((this.options && typeof this.options.seed === 'number')
          ? this.options.seed
          : Math.floor(Math.random() * 999999) + 1);
    this.rngState = this.runSeed;
    this.patternSequence = this._shufflePatternPool();
    this.patternSequenceIndex = 0;

    // Reset independent generation cursors
    this.nextStarX = COLLECTIBLES_CONFIG.STAR_START_X || 240.0;
    this.starCycle = 0;

    this.nextAirToolX = SCALE.SLINGSHOT_X + (COLLECTIBLES_CONFIG.AIR_TOOL_START_X_OFFSET_PX || 800.0);
    this.airToolCycle = 0;

    this.nextGroundPartX = SCALE.SLINGSHOT_X + (COLLECTIBLES_CONFIG.GROUND_PART_START_OFFSET_PX || 1200.0);
    this.groundPartCycle = 0;

    this.nextMagnetX = SCALE.SLINGSHOT_X + 2400.0;
    this.magnetCycle = 0;

    // First battery canister placed farther from launch pad
    this.nextBatteryX = COLLECTIBLES_CONFIG.BATTERY_FIRST_X_PX || 1450.0;
    this.batterySpawnCount = 0;
  }

  /**
   * Procedurally generates collectibles in chunks ahead of aircraft
   * @param {number} targetX Maximum world X coordinate required
   */
  generateChunksUpTo(targetX) {
    const bufferTarget = targetX + 1600;
    while (this.highestSpawnedChunkX < bufferTarget) {
      const chunkStartX = this.highestSpawnedChunkX;
      const chunkEndX = chunkStartX + this.chunkSizePx;
      this._generateChunk(chunkStartX, chunkEndX);
      this.highestSpawnedChunkX = chunkEndX;
    }
  }

  /**
   * Generates a single spatial chunk spanning [startX, endX]
   */
  _generateChunk(startX, endX) {
    // ------------------------------------------------------------------------
    // (1) DEDICATED INDEPENDENT STAR SPAWNER (CONTINUOUS & ABUNDANT)
    // Starting right from launch arc (x = 240 px onward to infinity)
    // 5 Randomized procedural patterns deployed in randomized/shuffled order:
    //   Pattern 0: "The Swooping Arc" (curved parabolic arc across layers + dual tier)
    //   Pattern 1: "The Slalom Wave" (serpentine undulating wave)
    //   Pattern 2: "The Twin Corridors" (parallel dual-layer stream of star pairs)
    //   Pattern 3: "The Staircase Step" (diagonal climbing / diving steps)
    //   Pattern 4: "The Constellation Cluster" (diamond / diamond cluster)
    // Spaced every 110 px to 220 px horizontally in natural variety.
    // Frequently places 2 vertical tiers in the same horizontal slice.
    // ------------------------------------------------------------------------
    while (this.nextStarX <= endX) {
      const x = this.nextStarX;
      const rAlt = this._nextRandom();
      const rVar = this._nextRandom();

      const getLayerY = (layer, p) => {
        if (layer === 0) {
          // Low layer: 75 to 170 px above runway
          const offset = (COLLECTIBLES_CONFIG.STAR_LOW_MIN_OFFSET_PX || 75.0) +
            p * ((COLLECTIBLES_CONFIG.STAR_LOW_MAX_OFFSET_PX || 170.0) - (COLLECTIBLES_CONFIG.STAR_LOW_MIN_OFFSET_PX || 75.0));
          return SCALE.RUNWAY_Y - offset;
        } else if (layer === 1) {
          // Mid layer: 180 to 360 px above runway
          const offset = (COLLECTIBLES_CONFIG.STAR_MID_MIN_OFFSET_PX || 180.0) +
            p * ((COLLECTIBLES_CONFIG.STAR_MID_MAX_OFFSET_PX || 360.0) - (COLLECTIBLES_CONFIG.STAR_MID_MIN_OFFSET_PX || 180.0));
          return SCALE.RUNWAY_Y - offset;
        } else {
          // High layer: 370 to 560 px above runway
          const offset = (COLLECTIBLES_CONFIG.STAR_HIGH_MIN_OFFSET_PX || 370.0) +
            p * ((COLLECTIBLES_CONFIG.STAR_HIGH_MAX_OFFSET_PX || 560.0) - (COLLECTIBLES_CONFIG.STAR_HIGH_MIN_OFFSET_PX || 370.0));
          return SCALE.RUNWAY_Y - offset;
        }
      };

      // Select randomized pattern from shuffled patternSequence
      if (!this.patternSequence || this.patternSequence.length === 0) {
        this.patternSequence = this._shufflePatternPool();
        this.patternSequenceIndex = 0;
      }
      const patId = this.patternSequence[this.patternSequenceIndex];
      this.patternSequenceIndex++;
      if (this.patternSequenceIndex >= this.patternSequence.length) {
        this.patternSequence = this._shufflePatternPool();
        this.patternSequenceIndex = 0;
      }

      // Base layer cycles across low(0), mid(1), high(2) with procedural variation
      const baseLayer = (this.starCycle + Math.floor(rVar * 3)) % 3;
      const baseY = getLayerY(baseLayer, rAlt);
      let patternStepWidth = 110.0;

      if (patId === 0) {
        // Pattern 0: The Swooping Arc (4 stars in parabolic arc + dual tier)
        const isArch = (rVar > 0.5);
        const arcSign = isArch ? -1 : 1;
        const xOffsets = [0, 32.0, 64.0, 96.0];
        const yOffsets = [0, arcSign * 16.0, arcSign * 24.0, arcSign * 14.0];
        for (let i = 0; i < 4; i++) {
          this._createItem({
            type: COLLECTIBLE_TYPES.STAR,
            x: x + xOffsets[i],
            y: baseY + yOffsets[i],
            baseY: baseY + yOffsets[i],
            bobPhase: i * 0.3,
            partType: null
          });
        }
        // Dual-tier companion pair at distinct vertical altitude layer
        const secLayer = (baseLayer + 1 + Math.floor(rAlt * 2)) % 3;
        const secY = getLayerY(secLayer, rVar);
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 16.0,
          y: secY,
          baseY: secY,
          bobPhase: 0.7,
          partType: null
        });
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 48.0,
          y: secY,
          baseY: secY,
          bobPhase: 1.1,
          partType: null
        });
        patternStepWidth = 96.0 + 110.0 + rAlt * 70.0;
      } else if (patId === 1) {
        // Pattern 1: The Slalom Wave (4 stars weaving in sinusoidal S-curve)
        const waveY = [0, -22.0, 0, 22.0];
        for (let i = 0; i < 4; i++) {
          this._createItem({
            type: COLLECTIBLE_TYPES.STAR,
            x: x + i * 30.0,
            y: baseY + waveY[i],
            baseY: baseY + waveY[i],
            bobPhase: i * 0.4,
            partType: null
          });
        }
        // Dual-tier companion star
        const secLayer = (baseLayer + (rVar > 0.5 ? 1 : 2)) % 3;
        const secY = getLayerY(secLayer, rAlt);
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 15.0,
          y: secY,
          baseY: secY,
          bobPhase: 0.9,
          partType: null
        });
        patternStepWidth = 90.0 + 110.0 + rAlt * 80.0;
      } else if (patId === 2) {
        // Pattern 2: The Twin Corridors (parallel dual-layer stream of 3 pairs)
        const secLayer = (baseLayer + 1 + (rVar > 0.5 ? 1 : 0)) % 3;
        const secY = getLayerY(secLayer, rVar);
        for (let i = 0; i < 3; i++) {
          this._createItem({
            type: COLLECTIBLE_TYPES.STAR,
            x: x + i * 36.0,
            y: baseY,
            baseY: baseY,
            bobPhase: i * 0.5,
            partType: null
          });
          this._createItem({
            type: COLLECTIBLE_TYPES.STAR,
            x: x + i * 36.0,
            y: secY,
            baseY: secY,
            bobPhase: i * 0.5 + 0.3,
            partType: null
          });
        }
        patternStepWidth = 72.0 + 120.0 + rAlt * 60.0;
      } else if (patId === 3) {
        // Pattern 3: The Staircase Step (4 diagonal climbing or diving steps)
        const dir = (rVar > 0.5) ? -1 : 1;
        for (let i = 0; i < 4; i++) {
          this._createItem({
            type: COLLECTIBLE_TYPES.STAR,
            x: x + i * 32.0,
            y: baseY + dir * i * 18.0,
            baseY: baseY + dir * i * 18.0,
            bobPhase: i * 0.3,
            partType: null
          });
        }
        const secLayer = (baseLayer + 2) % 3;
        const secY = getLayerY(secLayer, rAlt);
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 16.0,
          y: secY,
          baseY: secY,
          bobPhase: 0.8,
          partType: null
        });
        patternStepWidth = 96.0 + 115.0 + rAlt * 75.0;
      } else {
        // Pattern 4: The Constellation Cluster (diamond formation of 4 stars + companion)
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x,
          y: baseY,
          baseY: baseY,
          bobPhase: 0.1,
          partType: null
        });
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 26.0,
          y: baseY - 24.0,
          baseY: baseY - 24.0,
          bobPhase: 0.4,
          partType: null
        });
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 26.0,
          y: baseY + 24.0,
          baseY: baseY + 24.0,
          bobPhase: 0.7,
          partType: null
        });
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 52.0,
          y: baseY,
          baseY: baseY,
          bobPhase: 1.0,
          partType: null
        });
        const secLayer = (baseLayer + 1) % 3;
        const secY = getLayerY(secLayer, rAlt);
        this._createItem({
          type: COLLECTIBLE_TYPES.STAR,
          x: x + 26.0,
          y: secY,
          baseY: secY,
          bobPhase: 0.6,
          partType: null
        });
        patternStepWidth = 52.0 + 130.0 + rAlt * 70.0;
      }

      this.nextStarX += patternStepWidth;
      this.starCycle++;
    }

    // ------------------------------------------------------------------------
    // (2a) AIR UPGRADE TOOLS (Bolts, Cogs, Springs at long strategic distance)
    // Spaced 800 px to 1200 px horizontally, staggered across low, mid, high.
    // Minimum clearance from Magnets and Batteries.
    // ------------------------------------------------------------------------
    while (this.nextAirToolX <= endX) {
      let x = this.nextAirToolX;

      // Minimum clearance: maintain separation from upcoming Magnet or Battery
      if (Math.abs(x - this.nextMagnetX) < 220.0) {
        x = this.nextMagnetX + 280.0;
      }
      if (Math.abs(x - this.nextBatteryX) < 220.0) {
        x = this.nextBatteryX + 280.0;
      }

      const pseudoAlt = (Math.sin(x * 0.0071 + 3.1) * 0.5 + 0.5);
      // Weight air upgrade tools: 65% low (85-165 px), 25% mid (220-340 px), 10% high (400-520 px)
      const roll = (Math.sin(x * 0.0137 + this.airToolCycle * 2.39) * 0.5 + 0.5);
      let yOffset;
      if (roll < 0.65) {
        // Low corridor (65%): 85 to 165 px
        yOffset = (COLLECTIBLES_CONFIG.AIR_TOOL_LOW_MIN_OFFSET_PX || 85.0) +
          pseudoAlt * ((COLLECTIBLES_CONFIG.AIR_TOOL_LOW_MAX_OFFSET_PX || 165.0) - (COLLECTIBLES_CONFIG.AIR_TOOL_LOW_MIN_OFFSET_PX || 85.0));
      } else if (roll < 0.90) {
        // Mid corridor (25%): 220 to 340 px
        yOffset = (COLLECTIBLES_CONFIG.AIR_TOOL_MID_MIN_OFFSET_PX || 220.0) +
          pseudoAlt * ((COLLECTIBLES_CONFIG.AIR_TOOL_MID_MAX_OFFSET_PX || 340.0) - (COLLECTIBLES_CONFIG.AIR_TOOL_MID_MIN_OFFSET_PX || 220.0));
      } else {
        // High corridor (10%): 400 to 520 px
        yOffset = (COLLECTIBLES_CONFIG.AIR_TOOL_HIGH_MIN_OFFSET_PX || 400.0) +
          pseudoAlt * ((COLLECTIBLES_CONFIG.AIR_TOOL_HIGH_MAX_OFFSET_PX || 520.0) - (COLLECTIBLES_CONFIG.AIR_TOOL_HIGH_MIN_OFFSET_PX || 400.0));
      }
      const y = SCALE.RUNWAY_Y - yOffset;

      const partTypes = [COLLECTIBLE_TYPES.BOLT, COLLECTIBLE_TYPES.COG, COLLECTIBLE_TYPES.SPRING];
      const p1Type = partTypes[this.airToolCycle % 3];
      const isPair = (this.airToolCycle % 4 === 3); // at most 2 tools
      this.airToolCycle++;

      this._createItem({
        type: p1Type,
        x,
        y,
        baseY: y,
        bobPhase: 1.2,
        partType: p1Type
      });

      if (isPair) {
        const p2Type = partTypes[this.airToolCycle % 3];
        this._createItem({
          type: p2Type,
          x: x + 36.0,
          y: y,
          baseY: y,
          bobPhase: 1.8,
          partType: p2Type
        });
      }

      const pseudoStep = (Math.cos(x * 0.0053 + 1.9) * 0.5 + 0.5);
      const step = (COLLECTIBLES_CONFIG.AIR_TOOL_MIN_SPACING_PX || 800.0) +
        pseudoStep * ((COLLECTIBLES_CONFIG.AIR_TOOL_MAX_SPACING_PX || 1200.0) - (COLLECTIBLES_CONFIG.AIR_TOOL_MIN_SPACING_PX || 800.0));
      this.nextAirToolX = x + step;
    }

    // ------------------------------------------------------------------------
    // (2b) GROUND RUNWAY TARMAC TOOLS (550 to 750 px along runway)
    // Placed at y = RUNWAY_Y - 18 px, starting at SLINGSHOT_X + 1200 px
    // ------------------------------------------------------------------------
    while (this.nextGroundPartX <= endX) {
      const x = this.nextGroundPartX;
      const y = SCALE.RUNWAY_Y - (COLLECTIBLES_CONFIG.GROUND_PART_Y_OFFSET_PX || 18.0);
      const partTypes = [COLLECTIBLE_TYPES.BOLT, COLLECTIBLE_TYPES.COG, COLLECTIBLE_TYPES.SPRING];
      const partType = partTypes[this.groundPartCycle % 3];
      this.groundPartCycle++;

      this._createItem({
        type: partType,
        x,
        y,
        baseY: y,
        isGround: true,
        partType
      });

      const pseudo = (Math.sin(x * 0.0073 + 1.2) * 0.5 + 0.5);
      const step = (COLLECTIBLES_CONFIG.GROUND_PART_MIN_SPACING_PX || 550.0) +
        pseudo * ((COLLECTIBLES_CONFIG.GROUND_PART_MAX_SPACING_PX || 750.0) - (COLLECTIBLES_CONFIG.GROUND_PART_MIN_SPACING_PX || 550.0));
      this.nextGroundPartX += step;
    }

    // ------------------------------------------------------------------------
    // (2c) HORSESHOE MAGNETS (spaced 2600 to 3600 px horizontally)
    // Placed in low-to-mid corridor (95 to 240 px above ground) surrounded by stars
    // ------------------------------------------------------------------------
    while (this.nextMagnetX <= endX) {
      let x = this.nextMagnetX;

      // Clearance from upcoming battery
      if (Math.abs(x - this.nextBatteryX) < 250.0) {
        x = this.nextBatteryX + 350.0;
      }

      const pseudoAlt = (Math.cos(x * 0.0042 + 3.1) * 0.5 + 0.5);
      const yOffset = (COLLECTIBLES_CONFIG.MAGNET_LOW_MIN_OFFSET_PX || 95.0) +
        pseudoAlt * ((COLLECTIBLES_CONFIG.MAGNET_LOW_MAX_OFFSET_PX || 240.0) - (COLLECTIBLES_CONFIG.MAGNET_LOW_MIN_OFFSET_PX || 95.0));
      const y = SCALE.RUNWAY_Y - yOffset;

      this._createItem({
        type: COLLECTIBLE_TYPES.MAGNET,
        x,
        y,
        baseY: y,
        bobPhase: 1.8,
        partType: null
      });

      this.magnetCycle++;

      const pseudoStep = (Math.sin(x * 0.0033 + 1.7) * 0.5 + 0.5);
      const step = (COLLECTIBLES_CONFIG.MAGNET_MIN_SPACING_PX || 2600.0) +
        pseudoStep * ((COLLECTIBLES_CONFIG.MAGNET_MAX_SPACING_PX || 3600.0) - (COLLECTIBLES_CONFIG.MAGNET_MIN_SPACING_PX || 2600.0));
      this.nextMagnetX = x + step;
    }

    // ------------------------------------------------------------------------
    // (2d) BATTERY CANISTERS (Single canisters with balanced cadence)
    // First battery at x = 800 px (mid altitude GROUND_Y - 210 px to GROUND_Y - 260 px)
    // directly along natural launch glide path; subsequent gap = 1100 + count * 350 px
    // Restores fixed +30 energy units (+30% of base tank)
    // ------------------------------------------------------------------------
    while (this.nextBatteryX <= endX) {
      const x = this.nextBatteryX;
      const pseudoAlt = (Math.sin(x * 0.0051 + 2.7) * 0.5 + 0.5);

      let yOffset;
      if (this.batterySpawnCount === 0) {
        // First battery: mid altitude GROUND_Y - 210 px to GROUND_Y - 260 px
        // along natural launch descent curve
        const minOff = COLLECTIBLES_CONFIG.BATTERY_FIRST_MIN_OFFSET_PX || 210.0;
        const maxOff = COLLECTIBLES_CONFIG.BATTERY_FIRST_MAX_OFFSET_PX || 260.0;
        yOffset = minOff + pseudoAlt * (maxOff - minOff);
      } else {
        const isTrickyHigh = (this.batterySpawnCount % 2 === 1);
        if (isTrickyHigh) {
          yOffset = (COLLECTIBLES_CONFIG.BATTERY_HIGH_MIN_OFFSET_PX || 420.0) +
            pseudoAlt * ((COLLECTIBLES_CONFIG.BATTERY_HIGH_MAX_OFFSET_PX || 550.0) - (COLLECTIBLES_CONFIG.BATTERY_HIGH_MIN_OFFSET_PX || 420.0));
        } else {
          yOffset = (COLLECTIBLES_CONFIG.BATTERY_LOW_MIN_OFFSET_PX || 95.0) +
            pseudoAlt * ((COLLECTIBLES_CONFIG.BATTERY_LOW_MAX_OFFSET_PX || 160.0) - (COLLECTIBLES_CONFIG.BATTERY_LOW_MIN_OFFSET_PX || 95.0));
        }
      }
      const y = SCALE.RUNWAY_Y - yOffset;

      this._createItem({
        type: COLLECTIBLE_TYPES.BATTERY,
        x,
        y,
        baseY: y,
        bobPhase: 0.8,
        partType: null
      });

      const gap = (COLLECTIBLES_CONFIG.BATTERY_GAP_BASE_PX || 1200.0) +
        (this.batterySpawnCount * (COLLECTIBLES_CONFIG.BATTERY_GAP_GROWTH_PX || 350.0));
      this.batterySpawnCount++;
      this.nextBatteryX = x + gap;
    }
  }

  _createItem(config) {
    // Upper-Sky Ceiling Rule: Zero Magnets or Upgrade Parts above 95 FT altitude (760 px above runway)
    const altPx = SCALE.RUNWAY_Y - config.y;
    const isPartOrMagnet = (
      config.type === COLLECTIBLE_TYPES.MAGNET ||
      config.type === COLLECTIBLE_TYPES.BOLT ||
      config.type === COLLECTIBLE_TYPES.COG ||
      config.type === COLLECTIBLE_TYPES.SPRING ||
      !!config.partType
    );
    if (isPartOrMagnet && altPx > (COLLECTIBLES_CONFIG.CEILING_MAX_ALT_FT || 95.0) * SCALE.PIXELS_PER_FT) {
      return null;
    }

    const item = {
      id: this.nextId++,
      type: config.type,
      x: config.x,
      y: config.y,
      baseY: config.baseY,
      vx: 0,
      vy: 0,
      bobPhase: config.bobPhase || 0,
      isGround: !!config.isGround,
      isFixed: !!config.isFixed,
      partType: config.partType || null,
      isBeingVacuumed: false,
      isBeingMagnetPulled: false,
      collected: false,
      sprite: null
    };

    // If running in active Phaser scene, create visual sprite
    if (this.scene && this.scene.add) {
      const textureKey = this._getTextureKey(item.type);
      const sprite = this.scene.add.image(item.x, item.y, textureKey);
      sprite.setOrigin(0.5, 0.5);
      const baseScale = COLLECTIBLES_CONFIG.COLLECTIBLE_BASE_SCALE || 0.62;
      sprite.setScale(baseScale); // Supersampled texture displayed at calibrated scale
      sprite.setDepth(15);
      item.sprite = sprite;
      item.baseScale = baseScale;
    }

    this.items.push(item);
    return item;
  }

  _getTextureKey(type) {
    switch (type) {
      case COLLECTIBLE_TYPES.STAR: return 'winged_star';
      case COLLECTIBLE_TYPES.BATTERY: return 'battery_canister';
      case COLLECTIBLE_TYPES.MAGNET: return 'horseshoe_magnet';
      case COLLECTIBLE_TYPES.BOLT: return 'part_bolt';
      case COLLECTIBLE_TYPES.COG: return 'part_cog';
      case COLLECTIBLE_TYPES.SPRING: return 'part_spring';
      default: return 'winged_star';
    }
  }

  /**
   * Main update step: Handles gentle mid-air bobbing, magnet countdown & attraction,
   * collection collisions, and spatial streaming.
   *
   * @param {number} dt Frame delta time in seconds
   * @param {number} biplaneX Current aircraft center X in world coordinates
   * @param {number} biplaneY Current aircraft center Y in world coordinates
   * @param {object} flightPhysics FlightPhysics instance
   */
  update(dt, biplaneX, biplaneY, flightPhysics) {
    // 0. Runway taxi / flight over: deactivate magnet upon touchdown
    const isOnRunway = flightPhysics && (
      flightPhysics.state === FLIGHT_STATE.RUNWAY_TAXI ||
      flightPhysics.state === FLIGHT_STATE.FLIGHT_OVER
    );
    if (isOnRunway && this.isMagnetActive) {
      this.isMagnetActive = false;
      this.magnetTimeRemaining = 0.0;
      soundManager.stopMagnetHum();
    }

    // 1. Advance magnet timer
    if (this.isMagnetActive) {
      this.magnetTimeRemaining -= dt;
      if (this.magnetTimeRemaining <= 0) {
        this.isMagnetActive = false;
        this.magnetTimeRemaining = 0;
        soundManager.stopMagnetHum();
      }
    }

    // 2. Procedural chunk generation ahead of aircraft
    this.generateChunksUpTo(biplaneX);

    // 2b. Guaranteed taxi rollout ground parts (+110 px, +240 px, +380 px, +530 px) ahead of touchdown
    if (flightPhysics && flightPhysics.state === FLIGHT_STATE.RUNWAY_TAXI && !this.hasSpawnedTaxiRolloutParts) {
      this.hasSpawnedTaxiRolloutParts = true;
      const touchdownX = flightPhysics.touchdownX || biplaneX;
      // Check if any active ground runway parts already exist in rollout window [touchdownX, touchdownX + 600]
      const hasRolloutGroundPart = this.items.some(
        it => it.isGround && !it.collected && it.x >= touchdownX && it.x <= touchdownX + 600
      );
      if (!hasRolloutGroundPart) {
        const offsets = [110.0, 240.0, 380.0, 530.0];
        const partTypes = [COLLECTIBLE_TYPES.BOLT, COLLECTIBLE_TYPES.COG, COLLECTIBLE_TYPES.SPRING];
        offsets.forEach((off, idx) => {
          const px = touchdownX + off;
          const py = SCALE.RUNWAY_Y - (COLLECTIBLES_CONFIG.GROUND_PART_Y_OFFSET_PX || 18.0);
          const pType = partTypes[(this.groundPartCycle + idx) % 3];
          this._createItem({
            type: pType,
            x: px,
            y: py,
            baseY: py,
            isFixed: true,
            isGround: true,
            partType: pType
          });
        });
        this.groundPartCycle += offsets.length;
      }
    }

    // 3. (1) Live Base Fuselage Pickup Radius (Active at all times, independent of magnet)
    // Base 36 px at L0 (72 px diameter) growing by +4.0 px per level (+8 px diameter) up to 72 px at L9+
    const fuselageLevel = Math.max(
      0,
      Number(gameState.upgrades && gameState.upgrades.fuselage) || 0,
      Number(flightPhysics && flightPhysics.upgrades && flightPhysics.upgrades.fuselage) || 0
    );
    const currentPickupRadius = getFuselagePickupRadius(fuselageLevel);
    this.currentPickupRadius = currentPickupRadius;
    const currentPickupRadiusSq = currentPickupRadius * currentPickupRadius;

    // (3) Cleanly Separated Magnet Attraction Radius (stacked on top of Fuselage radius: currentPickupRadius + 75 px)
    const magnetPullRadius = currentPickupRadius + (COLLECTIBLES_CONFIG.MAGNET_RADIUS_OFFSET_PX || 75.0);
    const magnetPullRadiusSq = magnetPullRadius * magnetPullRadius;

    // Time for floating bobbing
    const nowSec = (typeof performance !== 'undefined' ? performance.now() : Date.now()) * 0.001;

    for (let i = 0; i < this.items.length; i++) {
      const item = this.items[i];
      if (item.collected) continue;

      // Runway taxi restriction: aircraft rolling on runway only collects ground tools,
      // and cannot grab mid-air batteries or magnets hanging in the sky
      if (isOnRunway && (item.type === COLLECTIBLE_TYPES.BATTERY || item.type === COLLECTIBLE_TYPES.MAGNET)) {
        continue;
      }

      // Distance to aircraft center and nose/propeller (24 px forward)
      const dx = biplaneX - item.x;
      const dy = biplaneY - item.y;
      const distSq = dx * dx + dy * dy;

      // When flightPhysics has pitch orientation, orient the nose offset along pitch angle
      let noseX = biplaneX + 24.0;
      let noseY = biplaneY;
      if (flightPhysics && typeof flightPhysics.pitchDeg === 'number' && flightPhysics.pitchDeg !== 0) {
        const pitchRad = (flightPhysics.pitchDeg * Math.PI) / 180.0;
        noseX = biplaneX + 24.0 * Math.cos(pitchRad);
        noseY = biplaneY + 24.0 * Math.sin(pitchRad);
      }
      const dxNose = noseX - item.x;
      const dyNose = noseY - item.y;
      const distNoseSq = dxNose * dxNose + dyNose * dyNose;
      const effectiveDistSq = Math.min(distSq, distNoseSq);

      // ----------------------------------------------------------------------
      // (2) Active Smooth Vacuum Attraction Pull:
      // While being vacuumed, smoothly and visibly zips the item into the biplane center
      // ----------------------------------------------------------------------
      if (item.isBeingVacuumed) {
        item.vacuumElapsed = (item.vacuumElapsed || 0) + dt;
        const vacuumDuration = COLLECTIBLES_CONFIG.VACUUM_SNAP_DURATION_SEC || 0.12;
        const distToCenter = Math.hypot(dx, dy);

        // Attractive suction speed: scales with aircraft forward velocity so high-speed flight
        // (350-500 px/s) never leaves vacuuming items behind
        const currentFlightVx = flightPhysics ? Math.abs(flightPhysics.vx || 0) : 0;
        const pullSpeed = Math.max(750.0, currentFlightVx + 350.0);
        const stepDist = pullSpeed * dt;

        // If item reached cockpit center within 14 px or step completes or timeout, collect!
        if (distToCenter <= stepDist || distToCenter <= 14.0 || item.vacuumElapsed >= vacuumDuration) {
          item.x = biplaneX;
          item.y = biplaneY;
          if (item.sprite) {
            item.sprite.setPosition(item.x, item.y);
          }
          this._collectItem(item, flightPhysics);
          continue;
        }

        // Actively pull item directly toward biplane center
        const dirX = dx / distToCenter;
        const dirY = dy / distToCenter;
        item.x += dirX * stepDist;
        item.y += dirY * stepDist;

        // Visual sprite sync with gentle inward scale squeeze
        if (item.sprite) {
          const currentBaseScale = item.baseScale || COLLECTIBLES_CONFIG.COLLECTIBLE_BASE_SCALE || 0.62;
          const scaleRatio = Math.max(0.40, Math.min(1.0, distToCenter / currentPickupRadius));
          item.sprite.setPosition(item.x, item.y);
          item.sprite.setScale(currentBaseScale * scaleRatio);
        }
        continue;
      }

      // Direct contact with cockpit center (instant pickup only when actually touching cockpit)
      if (distSq <= 144.0) {
        this._collectItem(item, flightPhysics);
        continue;
      }

      // ----------------------------------------------------------------------
      // Check Fuselage Grab Radius: directly detects & vacuums items from wider distance
      // Completely independent of whether a Horseshoe Magnet is active!
      // ----------------------------------------------------------------------
      if (effectiveDistSq <= currentPickupRadiusSq) {
        item.isBeingVacuumed = true;
        item.vacuumElapsed = 0;
        item.isFixed = false;
        item.isGround = false;
        item.isBeingMagnetPulled = false;

        const currentFlightVx = flightPhysics ? Math.abs(flightPhysics.vx || 0) : 0;
        const pullSpeed = Math.max(750.0, currentFlightVx + 350.0);
        const distToCenter = Math.hypot(dx, dy);
        const stepDist = pullSpeed * dt;
        const vacuumDuration = COLLECTIBLES_CONFIG.VACUUM_SNAP_DURATION_SEC || 0.12;

        // If step is larger than remaining distance (or single large test step dt >= 0.12s), collect immediately
        if (distToCenter <= stepDist || distToCenter <= 14.0 || dt >= vacuumDuration) {
          item.x = biplaneX;
          item.y = biplaneY;
          if (item.sprite) {
            item.sprite.setPosition(item.x, item.y);
          }
          this._collectItem(item, flightPhysics);
          continue;
        }

        const dirX = dx / distToCenter;
        const dirY = dy / distToCenter;
        item.x += dirX * stepDist;
        item.y += dirY * stepDist;
        if (item.sprite) {
          const currentBaseScale = item.baseScale || COLLECTIBLES_CONFIG.COLLECTIBLE_BASE_SCALE || 0.62;
          const scaleRatio = Math.max(0.40, Math.min(1.0, distToCenter / currentPickupRadius));
          item.sprite.setPosition(item.x, item.y);
          item.sprite.setScale(currentBaseScale * scaleRatio);
        }
        continue;
      }

      // ----------------------------------------------------------------------
      // (3) Horseshoe Magnet Active Attraction (ONLY when magnet is active)
      // Smoothly accelerates nearby items within 145 px toward biplane into the vacuum radius
      // ----------------------------------------------------------------------
      if (this.isMagnetActive && distSq <= magnetPullRadiusSq && distSq > 0) {
        item.isBeingMagnetPulled = true;
        item.isFixed = false;
        item.isGround = false;

        const dist = Math.sqrt(distSq);
        const maxPullSpeed = COLLECTIBLES_CONFIG.MAGNET_MAX_SPEED || 850.0;
        const pullAccel = COLLECTIBLES_CONFIG.MAGNET_PULL_ACCEL || 2400.0;

        item.vx += (dx / dist) * pullAccel * dt;
        item.vy += (dy / dist) * pullAccel * dt;

        const speed = Math.hypot(item.vx, item.vy);
        if (speed > maxPullSpeed) {
          const ratio = maxPullSpeed / speed;
          item.vx *= ratio;
          item.vy *= ratio;
        }

        item.x += item.vx * dt;
        item.y += item.vy * dt;
      } else if (!item.isBeingMagnetPulled && !item.isGround && !item.isFixed) {
        // Idle gentle floating bobbing (if not pulled by magnet and not on ground)
        item.y = item.baseY + Math.sin(nowSec * 3.0 + item.bobPhase) * 5.0;
      }

      // Sync visual sprite position
      if (item.sprite) {
        item.sprite.setPosition(item.x, item.y);
      }
    }

    // 4. Prune collected items and items scrolled far behind aircraft
    const pruneX = biplaneX - 600;
    this.items = this.items.filter(item => {
      if (item.collected || item.x < pruneX) {
        if (item.sprite && item.sprite.destroy) {
          item.sprite.destroy();
          item.sprite = null;
        }
        return false;
      }
      return true;
    });
  }

  /**
   * Triggers collection effects, GameState updates, and energy/magnet actions
   */
  _collectItem(item, flightPhysics) {
    if (item.collected) return;
    item.collected = true;
    item.isBeingVacuumed = false;
    item.isBeingMagnetPulled = false;

    // 1. GameState and Physics resolution
    switch (item.type) {
      case COLLECTIBLE_TYPES.STAR:
        gameState.addStar(1);
        soundManager.playStarCollect();
        if (this.scene) {
          this._playStarCollectFX(item.x, item.y);
        }
        break;

      case COLLECTIBLE_TYPES.BATTERY:
        // Immediately restore fixed +30 energy units (capped to 100 max energy)
        if (flightPhysics) {
          const restoreUnits = COLLECTIBLES_CONFIG.BATTERY_ENERGY_RESTORE_UNITS || 30.0;
          flightPhysics.energy = Math.min(100.0, flightPhysics.energy + restoreUnits);
          gameState.updateEnergy(flightPhysics.energy);
        }
        soundManager.playBatteryCollect();
        if (this.scene) {
          this._playBatteryCollectFX(item.x, item.y);
        }
        break;

      case COLLECTIBLE_TYPES.MAGNET:
        // Activate 4.5s magnetic pull state
        this.activateMagnet(COLLECTIBLES_CONFIG.MAGNET_DURATION_SEC || 4.5);
        soundManager.playMagnetActivate();
        if (this.scene) {
          this._playMagnetCollectFX(item.x, item.y);
        }
        break;

      case COLLECTIBLE_TYPES.BOLT:
      case COLLECTIBLE_TYPES.COG:
      case COLLECTIBLE_TYPES.SPRING:
        gameState.addPart(item.partType || item.type, 1);
        soundManager.playToolCollect(item.partType || item.type);
        if (this.scene) {
          this._playPartCollectFX(item.x, item.y, item.partType || item.type);
        }
        break;
    }

    // Hide/destroy collected sprite with quick pop animation
    if (item.sprite) {
      if (this.scene && this.scene.tweens) {
        const popScale = (item.baseScale || COLLECTIBLES_CONFIG.COLLECTIBLE_BASE_SCALE || 0.62) * 1.25;
        this.scene.tweens.add({
          targets: item.sprite,
          scaleX: popScale,
          scaleY: popScale,
          alpha: 0,
          duration: 180,
          ease: 'Back.easeIn',
          onComplete: () => {
            if (item.sprite && item.sprite.destroy) item.sprite.destroy();
            item.sprite = null;
          }
        });
      } else {
        if (item.sprite.destroy) item.sprite.destroy();
        item.sprite = null;
      }
    }
  }

  activateMagnet(duration = 4.5) {
    this.isMagnetActive = true;
    this.magnetTimeRemaining = duration;
    gameState.emit('magnetActivated', { duration });
  }

  /* ========================================================================
     VISUAL FX & POPUPS (Active when scene is available)
     ======================================================================== */

  _playStarCollectFX(x, y) {
    if (!this.scene) return;

    // Small burst of 4 radiant golden sparkle pips
    for (let i = 0; i < 4; i++) {
      const angle = (i * Math.PI) / 2 + (Math.random() - 0.5) * 0.4;
      const spark = this.scene.add.image(x, y, 'star_sparkle');
      spark.setDepth(28);
      spark.setScale(0.6);

      const targetX = x + Math.cos(angle) * 32;
      const targetY = y + Math.sin(angle) * 32;

      this.scene.tweens.add({
        targets: spark,
        x: targetX,
        y: targetY,
        scale: 0.1,
        alpha: 0,
        duration: 380,
        ease: 'Cubic.easeOut',
        onComplete: () => spark.destroy()
      });
    }

    // Flying star particle that arcs toward top-left star counter
    const flyingStar = this.scene.add.image(x, y, 'winged_star');
    flyingStar.setDepth(35);
    flyingStar.setScale(0.5);

    const camX = this.scene.cameras.main.scrollX;
    const camY = this.scene.cameras.main.scrollY;
    const targetScreenX = 64;
    const targetScreenY = 48;

    this.scene.tweens.add({
      targets: flyingStar,
      x: camX + targetScreenX,
      y: camY + targetScreenY,
      scale: 0.25,
      alpha: 0.2,
      duration: 520,
      ease: 'Quad.easeInOut',
      onComplete: () => flyingStar.destroy()
    });
  }

  _playBatteryCollectFX(x, y) {
    if (!this.scene) return;

    const restoreUnits = Math.round(COLLECTIBLES_CONFIG.BATTERY_ENERGY_RESTORE_UNITS || 30.0);
    const popup = this.scene.add.text(x, y - 20, `+${restoreUnits} ENERGY`, {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#A3E635',
      fontFamily: 'sans-serif',
      stroke: '#0F172A',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5).setDepth(35);

    this.scene.tweens.add({
      targets: popup,
      y: y - 65,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy()
    });
  }

  _playMagnetCollectFX(x, y) {
    if (!this.scene) return;

    const popup = this.scene.add.text(x, y - 20, 'MAGNET!', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#38BDF8',
      fontFamily: 'sans-serif',
      stroke: '#0F172A',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5).setDepth(35);

    this.scene.tweens.add({
      targets: popup,
      y: y - 65,
      scaleX: 1.15,
      scaleY: 1.15,
      alpha: 0,
      duration: 850,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy()
    });
  }

  _playPartCollectFX(x, y, partType) {
    if (!this.scene) return;

    const label = `+1 ${partType.toUpperCase()}`;
    const popup = this.scene.add.text(x, y - 20, label, {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#FBBF24',
      fontFamily: 'sans-serif',
      stroke: '#451A03',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5).setDepth(35);

    this.scene.tweens.add({
      targets: popup,
      y: y - 60,
      scaleX: 1.1,
      scaleY: 1.1,
      alpha: 0,
      duration: 800,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy()
    });
  }
}
