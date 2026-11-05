/**
 * Township Aerial Challenge — Master Physics & Engine Constants
 * Ground truth calibrated against empirical video analysis.
 */

export const SCALE = {
  CANVAS_WIDTH: 1280,
  CANVAS_HEIGHT: 720,
  PIXELS_PER_FT: 8.0, // 8 Canvas Pixels = 1 Foot (FT)
  RUNWAY_Y: 620,       // Centerline of paved asphalt runway road (altitude = 0 FT)
  SLINGSHOT_X: 280,     // Launch slingshot X position (leaves ample visible margin when pulled back)
  SLINGSHOT_Y: 442      // Launch slingshot top Y-fork tips (RUNWAY_Y - 178 px)
};

export const FLIGHT_PHYSICS = {
  // Powerful Slingshot Catapult Launch Impulse
  LAUNCH_BASE_VX0: 390.0,            // Base forward catapult impulse at full pull (px/s)
  LAUNCH_BASE_VY0: -290.0,           // Base upward catapult impulse at optimal angle (px/s)
  LAUNCH_GRAVITY: 240.0,             // Natural parabolic launch gravity (px/s^2)
  LAUNCH_AIR_DRAG_K: 0.65,           // Gradual air drag blending vx from 390 into cruise speed
  MIN_AIM_ANGLE_DEG: -10.0,          // Shallow pullback angle
  MAX_AIM_ANGLE_DEG: -50.0,          // Steep pullback angle
  OPTIMAL_AIM_ANGLE_DEG: -36.63,     // Optimal launch angle atan2(-290, 390)

  // Progressive Slingshot Trajectory Projection Scaling
  TRAJECTORY_MIN_PIPS: 10,           // Base pips at 0 upgrades
  TRAJECTORY_MAX_PIPS: 28,           // Full pips at 9+ upgrades
  TRAJECTORY_MIN_TIME_SEC: 0.48,     // Base preview time horizon (~175-210 px) at 0 upgrades
  TRAJECTORY_MAX_TIME_SEC: 1.20,     // Full preview time horizon (~650-700 px) at 9+ upgrades
  TRAJECTORY_START_TIME_SEC: 0.05,   // Initial dot offset time
  MAX_SLINGSHOT_UPGRADE_LEVEL: 9,    // Final slingshot upgrade level for max projection

  // Horizontal Velocity: Steady 250 px/s sustained cruise speed
  HORIZONTAL_SPEED_VX: 250.0,

  // Slingshot Pullback
  MAX_PULL_DISTANCE: 135.0,          // 135px pullback

  // Launch Apex & Trajectory (42-50 FT / ~340-400 px above ground)
  LAUNCH_APEX_ALT_FT: 44.15,         // ~44.15 FT apex altitude above runway
  LAUNCH_CLIMB_DURATION_SEC: 1.2083, // Natural climb duration to apex (290 / 240 s)

  // Base Unpowered Aerodynamic Glide (Wings Level 0)
  BASE_GLIDE_GRAVITY: 210.0,         // Base unpowered downward gravity acceleration at Level 0 (px/s^2)
  BASE_GLIDE_SINK_RATE: 112.0,       // Base equilibrium glide sink speed at Level 0 (px/s)
  BASE_GLIDE_PITCH_DEG: 12.0,        // Natural base nose-down glide pitch (+12.0 deg) at Level 0

  // Strictly Equal Linear Wings Improvements Across All 9 Levels (-4.0 px/s per level)
  WINGS_SINK_STEP: 4.0,              // -4.0 px/s sink reduction per level (112.0 at L0 to 76.0 at L9)
  WINGS_GRAVITY_STEP: 8.0,           // -8.0 px/s^2 gravity reduction per level (210.0 at L0 to 138.0 at L9)
  WINGS_PITCH_STEP: 0.4,             // -0.4 deg glide pitch reduction per level (+12.0 at L0 to +8.4 at L9)

  // Upgrade Progression Multipliers
  PROPELLER_DURATION_STEP: 0.06,     // +6% base energy duration per level
  SLINGSHOT_LAUNCH_STEP: 0.05,       // +5% launch speed per level
  SLINGSHOT_CRUISE_STEP: 0.025,      // +2.5% cruise speed per level
  CHASSIS_TAXI_STEP: 0.12,           // +12% taxi roll distance per level

  // Legacy compatibility aliases
  GLIDE_SINK_VELOCITY_VY: 112.0,     // Base Level 0 sink velocity
  GLIDE_PITCH_DEG: 12.0,             // Base Level 0 pitch angle
  GRAVITY_TRANSITION_ACCEL: 210.0,   // Base Level 0 gravity transition acceleration

  // Upward Booster Thrust (Hold/Tap)
  BOOST_MAX_CLIMB_VY: -125.0,        // Max upward velocity (-125 px/s)
  BOOST_PITCH_DEG: -15.0,            // -15° nose up attitude during boost
  BOOST_THRUST_ACCEL: 550.0,         // Quick response upward acceleration
  BOOSTER_MAX_ENERGY: 100.0,         // 100% capacity
  BOOSTER_DRAIN_RATE_L1: 100.0 / 4.76, // Drains Level 1 tank in exactly 4.76s (~21.008%/s)

  // Cutoff Damping on Pointer Release
  // Releasing finger immediately cuts thrust; strong damping brings vy >= 0 within <= 0.28s
  RELEASE_DAMPING_ACCEL: 480.0,      // Damps -125 px/s to 0 in ~0.26s
  MAX_CUTOFF_DAMPING_TIME: 0.28,

  // Runway Touchdown & Ground Taxi Roll
  TAXI_ENTRY_SPEED_RATIO: 0.90,      // vx_taxi = vx * 0.90 = 225.0 px/s (never jumps upward)
  TAXI_DECELERATION_TIME: 2.95,      // Complete stop over 2.2 to 3.0s
  TAXI_POWER_LAW: 4.0,               // Deceleration curvature rolling 55-80 FT
  TAXI_CUTOFF_SPEED: 10.0,           // Snap vx to 0 as soon as vx drops below 10 px/s

  // Total Flight Calibrations (Pure slingshot launch glides ~170-250 FT total; boosted 400-580 FT)
  CALIBRATED_NO_BOOSTER_MIN_FT: 170.0,
  CALIBRATED_NO_BOOSTER_MAX_FT: 250.0,
  CALIBRATED_FULL_BOOSTER_MIN_FT: 400.0,
  CALIBRATED_FULL_BOOSTER_MAX_FT: 580.0
};

export const ECONOMY_AND_FUEL_CONFIG = {
  INITIAL_STARTING_FUEL: 25,
  STARTING_FUEL: 25,
  MAX_FUEL: 25,
  FUEL_COST_PER_FLIGHT: 5,
  FLIGHT_FUEL_COST: 5,
  FUEL_REGEN_INTERVAL_SEC: 180, // 1 fuel every 3 minutes (180s)
  DEFAULT_PERSONAL_BEST_FT: 524.0,
  STAR_MILESTONE_GOALS: [150, 300, 500, 800, 1200],
  STAR_MILESTONE_COIN_REWARDS: [100, 300, 500, 700, 1000],
  INITIAL_STARS_PROGRESS: 49,
  INITIAL_STARS_TARGET: 150,
  COIN_MILESTONE_REWARDS: [
    { targetDistanceFt: 150, rewardCoins: 100 },
    { targetDistanceFt: 300, rewardCoins: 300 },
    { targetDistanceFt: 500, rewardCoins: 500 },
    { targetDistanceFt: 800, rewardCoins: 700 },
    { targetDistanceFt: 1200, rewardCoins: 1000 }
  ],
  // Test Mode toggle: all coin grants and costs evaluate to 1 coin in wallet
  TEST_MODE: true,
  GAS_CAN_COIN_COST: 1, // 1 gas can = 1 coin
  // Weekly Tournament Grand Prizes (resets Sunday 2:30 PM)
  WEEKLY_RESET_DAY: 0, // Sunday
  WEEKLY_RESET_HOUR: 14, // 2 PM
  WEEKLY_RESET_MINUTE: 30, // 30 min (2:30 PM IST)
  WEEKLY_GRAND_PRIZES: [
    { rank: 1, label: '1st Place', coins: 5000, testCoins: 1 },
    { rank: 2, label: '2nd Place', coins: 3000, testCoins: 1 },
    { rank: 3, label: '3rd Place', coins: 1500, testCoins: 1 },
    { rank: 4, label: '4th Place', coins: 1000, testCoins: 1 },
    { rank: 5, label: '5th Place', coins: 500, testCoins: 1 }
  ]
};

/**
 * Calculates the active tournament cycle ID and next Sunday 2:30 PM reset timestamp.
 * Resets every Sunday at 14:30 (2:30 PM).
 */
export function getAerialWeeklyCycle(date = new Date()) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const hour = d.getHours();
  const minute = d.getMinutes();

  let daysUntilSunday = (7 - day) % 7;
  if (day === 0) {
    if (hour > 14 || (hour === 14 && minute >= 30)) {
      daysUntilSunday = 7;
    } else {
      daysUntilSunday = 0;
    }
  }

  const nextReset = new Date(d);
  nextReset.setDate(d.getDate() + daysUntilSunday);
  nextReset.setHours(14, 30, 0, 0);

  const yyyy = nextReset.getFullYear();
  const mm = String(nextReset.getMonth() + 1).padStart(2, '0');
  const dd = String(nextReset.getDate()).padStart(2, '0');
  const cycleId = `cycle_${yyyy}-${mm}-${dd}_1430`;
  const msRemaining = Math.max(0, nextReset.getTime() - d.getTime());

  return {
    cycleId,
    nextResetTime: nextReset.getTime(),
    nextResetDate: nextReset,
    msRemaining
  };
}

export const UPGRADE_CATEGORIES = ['wings', 'chassis', 'propeller', 'fuselage', 'slingshot'];

export const UPGRADE_CONFIG = {
  wings: {
    key: 'wings',
    title: 'WINGS',
    statName: 'LIFT',
    baseStat: 100,
    statStep: 10,
    unit: '%',
    description: 'CAUSES THE PLANE TO DESCEND MORE SLOWLY',
    iconKey: 'upgrade_icon_wings',
    part1: 'bolt',
    part2: 'spring',
    baseCost: { bolts: 2, springs: 1 },
    physics: {
      baseSinkRate: 112.0,
      sinkStep: 4.0,
      baseGravity: 210.0,
      gravityStep: 8.0,
      basePitch: 12.0,
      pitchStep: 0.4,
      glideMultiplierPerLevel: 0.08
    }
  },
  chassis: {
    key: 'chassis',
    title: 'CHASSIS',
    statName: 'EFFICIENCY',
    baseStat: 0,
    statStep: 10,
    unit: '%',
    description: 'ALLOWS THE PLANE TO TAXI FARTHER ON THE GROUND',
    iconKey: 'upgrade_icon_chassis',
    part1: 'bolt',
    part2: 'cog',
    baseCost: { bolts: 2, cogs: 2 },
    physics: { taxiMultiplierPerLevel: 0.12 }
  },
  propeller: {
    key: 'propeller',
    title: 'PROPELLER',
    statName: 'ENERGY',
    baseStat: 100,
    statStep: 10,
    unit: '%',
    description: 'THE ALTITUDE-INCREASE ACCELERATOR WILL WORK LONGER',
    iconKey: 'upgrade_icon_propeller',
    part1: 'cog',
    part2: 'spring',
    baseCost: { cogs: 3, springs: 1 },
    physics: { energyMultiplierPerLevel: 0.06, climbMultiplierPerLevel: 0.03 }
  },
  fuselage: {
    key: 'fuselage',
    title: 'FUSELAGE',
    statName: 'RADIUS',
    baseStat: 100,
    statStep: 10,
    unit: '%',
    description: 'INCREASES THE RADIUS FOR COLLECTING TOKENS, BONUSES, AND PARTS',
    iconKey: 'upgrade_icon_fuselage',
    part1: 'bolt',
    part2: 'cog',
    baseCost: { bolts: 3, cogs: 2 },
    physics: {
      baseRadius: 56.0,
      radiusStepPx: 14.0,
      radiusMultiplierPerLevel: 0.25
    }
  },
  slingshot: {
    key: 'slingshot',
    title: 'SLINGSHOT',
    statName: 'SPEED',
    baseStat: 100,
    statStep: 10,
    unit: '%',
    description: 'INCREASES TAKEOFF SPEED',
    iconKey: 'upgrade_icon_slingshot',
    part1: 'cog',
    part2: 'spring',
    baseCost: { cogs: 2, springs: 2 },
    physics: { launchSpeedMultiplierPerLevel: 0.05, cruiseSpeedMultiplierPerLevel: 0.025 }
  }
};

export const FLIGHT_STATE = {
  PRE_LAUNCH: 'PRE_LAUNCH',
  LAUNCHING: 'LAUNCHING',
  AIRBORNE_POWERED: 'AIRBORNE_POWERED',
  AIRBORNE_GLIDE: 'AIRBORNE_GLIDE',
  RUNWAY_TAXI: 'RUNWAY_TAXI',
  FLIGHT_OVER: 'FLIGHT_OVER'
};

export const COLLECTIBLE_TYPES = {
  STAR: 'star',
  BATTERY: 'battery',
  MAGNET: 'magnet',
  BOLT: 'bolt',
  COG: 'cog',
  SPRING: 'spring'
};

export const COLLECTIBLES_CONFIG = {
  // Visual scaling (increased size for clear mobile readability and tactile presence)
  COLLECTIBLE_BASE_SCALE: 0.62,

  // Hitboxes & Magnet attraction physics
  NORMAL_COLLECTION_RADIUS: 56.0,     // Base Fuselage pickup radius: 56 px (112 px diameter at Level 0)
  FUSELAGE_RADIUS_STEP_PX: 14.0,      // +14 px radius (+28 px diameter) per Fuselage upgrade level (56 px at L0 to 182 px at L9+)
  FUSELAGE_RADIUS_MULTIPLIER_PER_LEVEL: 0.25, // +25% per level: 56 * (1 + 0.25 * level)
  VACUUM_SNAP_DURATION_SEC: 0.12,     // 0.12s smooth passive edge-vacuum snap
  MAGNET_DURATION_SEC: 4.5,           // Horseshoe Magnet active duration: 4.5s
  MAGNET_RADIUS_PX: 145.0,            // Horseshoe Magnet pull radius: 145 px
  MAGNET_PULL_ACCEL: 2400.0,          // Snappy magnetic acceleration
  MAGNET_MAX_SPEED: 850.0,            // Snappy 850 px/s homing speed
  MAGNET_PICKUP_RADIUS: 52.0,         // Snappy 52px pickup threshold for homing items

  // (1) Abundant & Continuous Winged Star Scattering (Scattered all around sky)
  STAR_START_X: 240.0,                // Continuous starting right from launch arc at x = 240 px
  STAR_MIN_SPACING_PX: 110.0,         // 110 px to 220 px horizontal spacing
  STAR_MAX_SPACING_PX: 220.0,
  STAR_LOW_MIN_OFFSET_PX: 75.0,       // Low altitude layer: 75 to 170 px above runway
  STAR_LOW_MAX_OFFSET_PX: 170.0,
  STAR_MID_MIN_OFFSET_PX: 180.0,      // Mid altitude layer: 180 to 360 px above runway
  STAR_MID_MAX_OFFSET_PX: 360.0,
  STAR_HIGH_MIN_OFFSET_PX: 370.0,     // High altitude layer: 370 to 560 px above runway
  STAR_HIGH_MAX_OFFSET_PX: 560.0,

  // (2a) Air Upgrade Tools (Bolts, Cogs, Springs at long strategic distance)
  AIR_TOOL_START_X_OFFSET_PX: 800.0,  // First air tool at SLINGSHOT_X + 800 px
  AIR_TOOL_MIN_SPACING_PX: 800.0,     // 800 to 1200 px horizontal spacing
  AIR_TOOL_MAX_SPACING_PX: 1200.0,
  AIR_TOOL_LOW_MIN_OFFSET_PX: 85.0,   // Low: 85 to 165 px
  AIR_TOOL_LOW_MAX_OFFSET_PX: 165.0,
  AIR_TOOL_MID_MIN_OFFSET_PX: 220.0,  // Mid: 220 to 340 px
  AIR_TOOL_MID_MAX_OFFSET_PX: 340.0,
  AIR_TOOL_HIGH_MIN_OFFSET_PX: 400.0, // High: 400 to 520 px
  AIR_TOOL_HIGH_MAX_OFFSET_PX: 520.0,

  // Legacy aliases for backward compatibility
  GROUP_MIN_SPACING_PX: 800.0,
  GROUP_MAX_SPACING_PX: 1200.0,
  CORRIDOR_LOW_MIN_OFFSET_PX: 85.0,
  CORRIDOR_LOW_MAX_OFFSET_PX: 165.0,
  CORRIDOR_MID_MIN_OFFSET_PX: 220.0,
  CORRIDOR_MID_MAX_OFFSET_PX: 340.0,
  CORRIDOR_HIGH_MIN_OFFSET_PX: 400.0,
  CORRIDOR_HIGH_MAX_OFFSET_PX: 520.0,

  // (2b) Horseshoe Magnets (2600 to 3600 px in low-to-mid corridor)
  MAGNET_MIN_SPACING_PX: 2600.0,
  MAGNET_MAX_SPACING_PX: 3600.0,
  MAGNET_LOW_MIN_OFFSET_PX: 95.0,     // Low-to-mid corridor: 95 to 240 px above ground
  MAGNET_LOW_MAX_OFFSET_PX: 240.0,

  // (2c) Battery Canister Spacing & Altitude
  BATTERY_FIRST_X_PX: 1450.0,         // First battery placed farther from launch pad at world x = 1450 px
  BATTERY_FIRST_X_OFFSET_PX: 1170.0,  // Offset from SLINGSHOT_X (280 + 1170 = 1450 px)
  BATTERY_GAP_BASE_PX: 1200.0,        // gap_px = 1200 + (batterySpawnCount * 350) px
  BATTERY_GAP_GROWTH_PX: 350.0,
  BATTERY_FIRST_MIN_OFFSET_PX: 210.0, // First battery at mid altitude: 210 to 260 px above ground
  BATTERY_FIRST_MAX_OFFSET_PX: 260.0,
  BATTERY_LOW_MIN_OFFSET_PX: 95.0,    // Tricky low band: 95 to 160 px
  BATTERY_LOW_MAX_OFFSET_PX: 160.0,
  BATTERY_HIGH_MIN_OFFSET_PX: 420.0,  // Tricky high band: 420 to 550 px
  BATTERY_HIGH_MAX_OFFSET_PX: 550.0,
  BATTERY_ENERGY_RESTORE_UNITS: 30.0, // Fixed +30 energy units (+30% of base tank)

  // Ground Runway Tarmac Upgrade Tools (spaced 550 to 750 px along runway)
  GROUND_PART_START_OFFSET_PX: 1200.0,
  GROUND_PART_MIN_SPACING_PX: 550.0,
  GROUND_PART_MAX_SPACING_PX: 750.0,
  GROUND_PART_Y_OFFSET_PX: 18.0       // y = RUNWAY_Y - 18 px directly on tarmac
};

export const COLORS = {
  SKY_TOP: 0x3d9bf3,
  SKY_BOTTOM: 0x9be2ff,
  GRASS: 0x5cb834,
  DIRT_RUNWAY: 0xd6b176,
  RUNWAY_MARKING: 0xf5f1e9,
  BIPLANE_CREAM: 0xfff6df,
  BIPLANE_RED: 0xd93829,
  BIPLANE_GOLD: 0xffb800,
  WOOD_BROWN: 0x7a431d,
  HUD_GOLD: 0xfbc02d,
  HUD_DARK_BLUE: 0x1c3144,
  TEXT_WHITE: 0xffffff
};

export const SLINGSHOT_PROJECTION = {
  MIN_PIPS: 10,
  MAX_PIPS: 28,
  MIN_TIME_SEC: 0.48,
  MAX_TIME_SEC: 1.20,
  START_TIME_SEC: 0.05,
  MAX_UPGRADE_LEVEL: 9
};

/**
 * Calculates progressive slingshot trajectory preview parameters and pip points.
 * Used by FlightScene and automated unit verification suites.
 *
 * @param {number} [slingshotUpgrades=0] Current slingshot upgrades count (0 through 9+)
 * @param {number} [tension=1.0] Pullback tension (0.20 to 1.0)
 * @param {number} [aimAngleRad] Aim launch angle in radians (default: OPTIMAL_AIM_ANGLE_DEG)
 * @param {number} [anchorX] Slingshot launch anchor X coordinate (default: SLINGSHOT_X)
 * @param {number} [anchorY] Slingshot launch anchor Y coordinate (default: SLINGSHOT_Y)
 * @returns {Object} { upgradeRatio, activePipCount, maxPreviewTime, vx0, vy0, pips, horizontalReachPx, arcLengthPx }
 */
export function getSlingshotTrajectoryPreview(
  slingshotUpgrades = 0,
  tension = 1.0,
  aimAngleRad = (FLIGHT_PHYSICS.OPTIMAL_AIM_ANGLE_DEG * Math.PI) / 180.0,
  anchorX = SCALE.SLINGSHOT_X,
  anchorY = SCALE.SLINGSHOT_Y
) {
  const upgradeRatio = Math.min(1.0, Math.max(0, slingshotUpgrades) / SLINGSHOT_PROJECTION.MAX_UPGRADE_LEVEL);
  const activePipCount = Math.round(
    SLINGSHOT_PROJECTION.MIN_PIPS +
    (SLINGSHOT_PROJECTION.MAX_PIPS - SLINGSHOT_PROJECTION.MIN_PIPS) * upgradeRatio
  );
  const maxPreviewTime =
    SLINGSHOT_PROJECTION.MIN_TIME_SEC +
    (SLINGSHOT_PROJECTION.MAX_TIME_SEC - SLINGSHOT_PROJECTION.MIN_TIME_SEC) * upgradeRatio;

  const slingMult = 1.0 + (FLIGHT_PHYSICS.SLINGSHOT_LAUNCH_STEP || 0.05) * Math.min(9, Math.max(0, slingshotUpgrades));
  const baseSpeed = Math.hypot(FLIGHT_PHYSICS.LAUNCH_BASE_VX0, FLIGHT_PHYSICS.LAUNCH_BASE_VY0);
  const speed = baseSpeed * tension * slingMult;

  const vx0 = speed * Math.cos(aimAngleRad);
  const vy0 = speed * Math.sin(aimAngleRad);
  const gLaunch = FLIGHT_PHYSICS.LAUNCH_GRAVITY;
  const tMin = SLINGSHOT_PROJECTION.START_TIME_SEC;

  const pips = [];
  for (let i = 0; i < activePipCount; i++) {
    const progress = activePipCount > 1 ? i / (activePipCount - 1) : 0;
    const t = tMin + progress * (maxPreviewTime - tMin);
    const x = anchorX + vx0 * t;
    const y = anchorY + vy0 * t + 0.5 * gLaunch * t * t;
    const alpha = Math.max(0.30, Math.min(1.0, 1.0 - progress * 0.65));
    const scale = 0.95 - progress * 0.40;
    pips.push({ x, y, alpha, scale, t, progress });
  }

  const lastPip = pips[pips.length - 1];
  const horizontalReachPx = lastPip ? lastPip.x - anchorX : 0;

  let arcLengthPx = 0;
  for (let i = 1; i < pips.length; i++) {
    arcLengthPx += Math.hypot(pips[i].x - pips[i - 1].x, pips[i].y - pips[i - 1].y);
  }

  return {
    slingshotUpgrades,
    upgradeRatio,
    activePipCount,
    maxPreviewTime,
    vx0,
    vy0,
    pips,
    horizontalReachPx,
    arcLengthPx
  };
}

/**
 * Calculates the Fuselage grab radius in pixels based on upgrade level.
 * Base Level 0 is 56.0 px (112 px diameter), gaining +14.0 px (+28 px diameter) per level.
 * Scales from 56 px at L0 to 70 px at L1, 84 px at L2, 98 px at L3, 112 px at L4,
 * 126 px at L5, and 182 px at L9+.
 *
 * @param {number|string} fuselageLevel
 * @returns {number} Radius in pixels
 */
export function getFuselagePickupRadius(fuselageLevel) {
  const num = Number(fuselageLevel);
  return 56.0 + 14.0 * Math.max(0, num ? num : 0);
}

