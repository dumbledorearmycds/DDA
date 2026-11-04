/**
 * Township Aerial Challenge — Flight Physics Engine
 * Pure mathematical simulation running deterministically at 60Hz.
 * Decoupled from rendering for 100% test coverage and zero display drift.
 * All transitions use continuous vertical acceleration (ay) with zero hard-coded distance overrides.
 * Aircraft pitch angle continuously tracks instantaneous vy via atan2(vy, vx) for smooth parabolic curves.
 */

import { SCALE, FLIGHT_PHYSICS, FLIGHT_STATE } from './Constants.js';

export class FlightPhysics {
  constructor(options = {}) {
    this.scale = options.scale || SCALE.PIXELS_PER_FT;
    this.runwayY = options.runwayY || SCALE.RUNWAY_Y;
    this.slingshotX = options.slingshotX || SCALE.SLINGSHOT_X;
    this.slingshotY = options.slingshotY || SCALE.SLINGSHOT_Y;
    this.upgrades = options.upgrades || {
      wings: 0,
      chassis: 0,
      propeller: 0,
      fuselage: 0,
      slingshot: 0
    };

    this._applyUpgrades();
    this.reset();
  }

  _applyUpgrades() {
    const wingsU = this.upgrades.wings || 0;
    const chassisU = this.upgrades.chassis || 0;
    const propU = this.upgrades.propeller || 0;
    const slingU = this.upgrades.slingshot || 0;

    // (a) WINGS: 9 equal steps of -4.0 px/s per level (from 112.0 at L0 to 76.0 at L9)
    // w = min(9, max(0, wingsUpgrades))
    // glideSinkRate = 112.0 - 4.0 * w
    // glideGravity = 210.0 - 8.0 * w
    // glidePitch = 12.0 - 0.4 * w
    const w = Math.min(9, Math.max(0, wingsU));
    const baseSink = FLIGHT_PHYSICS.BASE_GLIDE_SINK_RATE || 112.0;
    const sinkStep = FLIGHT_PHYSICS.WINGS_SINK_STEP || 4.0;
    const baseGravity = FLIGHT_PHYSICS.BASE_GLIDE_GRAVITY || 210.0;
    const gravityStep = FLIGHT_PHYSICS.WINGS_GRAVITY_STEP || 8.0;
    const basePitch = FLIGHT_PHYSICS.BASE_GLIDE_PITCH_DEG || 12.0;
    const pitchStep = FLIGHT_PHYSICS.WINGS_PITCH_STEP || 0.4;

    this.glideSinkVy = baseSink - sinkStep * w;
    this.glideGravity = baseGravity - gravityStep * w;
    this.glidePitchDeg = basePitch - pitchStep * w;

    // (b) CHASSIS (+12% taxi roll distance per level)
    const chassisStep = FLIGHT_PHYSICS.CHASSIS_TAXI_STEP || 0.12;
    this.taxiDuration = FLIGHT_PHYSICS.TAXI_DECELERATION_TIME * (1.0 + chassisStep * chassisU);

    // (c) PROPELLER (+6% Energy per upgrade) increases booster burn duration: 4.76s * (1 + 0.06 * propU)
    const baseBurnTime = FLIGHT_PHYSICS.LEVEL_1_TANK_BURN_TIME_SEC || 4.76;
    const propStep = FLIGHT_PHYSICS.PROPELLER_DURATION_STEP || 0.06;
    this.boosterBurnDuration = baseBurnTime * (1.0 + propStep * propU);
    this.boosterDrainRate = FLIGHT_PHYSICS.BOOSTER_MAX_ENERGY / this.boosterBurnDuration;
    // Increases upward booster climb speed by +3% per upgrade
    this.boosterClimbVy = FLIGHT_PHYSICS.BOOST_MAX_CLIMB_VY * (1.0 + 0.03 * propU);

    // (e) SLINGSHOT: +5% launch speed and +2.5% cruise speed per level
    const slingLaunchStep = FLIGHT_PHYSICS.SLINGSHOT_LAUNCH_STEP || 0.05;
    const slingCruiseStep = FLIGHT_PHYSICS.SLINGSHOT_CRUISE_STEP || 0.025;
    this.slingshotUpgradeMult = (1.0 + slingLaunchStep * slingU);
    this.launchVx = Math.round((FLIGHT_PHYSICS.LAUNCH_BASE_VX0 || 390.0) * this.slingshotUpgradeMult * 100) / 100;
    this.cruiseVx = Math.round(FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX * (1.0 + slingCruiseStep * slingU) * 100) / 100;
  }

  setUpgrades(upgrades) {
    this.upgrades = { ...upgrades };
    this._applyUpgrades();
  }

  reset() {
    this.state = FLIGHT_STATE.PRE_LAUNCH;
    this.x = this.slingshotX;
    this.y = this.slingshotY;
    this.vx = 0.0;
    this.vy = 0.0;
    this.pitchDeg = -15.0; // Rest angle in slingshot
    this.energy = FLIGHT_PHYSICS.BOOSTER_MAX_ENERGY;
    this.altitudeFt = Math.max(0, (this.runwayY - this.y) / this.scale);

    // Timers & tracking
    this.launchTime = 0.0;
    this.totalFlightTime = 0.0;
    this.taxiTime = 0.0;
    this.airborneDistanceFt = 0.0;
    this.taxiDistanceFt = 0.0;
    this.totalDistanceFt = 0.0;
    this.touchdownX = 0.0;

    // Control flags
    this.isHoldingBoost = false;
    this.timeSinceBoostRelease = 999.0;
  }

  /**
   * Triggers slingshot launch with dynamic tension and aim angle
   * @param {Object} [options={}] Launch options
   * @param {number} [options.tension=1.0] Pullback tension (0.20 to 1.0)
   * @param {number} [options.aimAngleRad] Aim angle in radians (negative for upward trajectory)
   */
  launch(options = {}) {
    if (this.state !== FLIGHT_STATE.PRE_LAUNCH) return;
    this.state = FLIGHT_STATE.LAUNCHING;
    this.launchTime = 0.0;

    const tension = (typeof options.tension === 'number')
      ? Math.min(1.0, Math.max(0.2, options.tension))
      : 1.0;

    const slingU = (this.upgrades && this.upgrades.slingshot) || 0;
    const upgradeMult = 1.0 + ((FLIGHT_PHYSICS.SLINGSHOT_LAUNCH_STEP || 0.05) * slingU);

    if (typeof options.aimAngleRad === 'number') {
      const minAngle = (FLIGHT_PHYSICS.MIN_AIM_ANGLE_DEG * Math.PI) / 180.0; // -10 deg
      const maxAngle = (FLIGHT_PHYSICS.MAX_AIM_ANGLE_DEG * Math.PI) / 180.0; // -50 deg
      const clampedAngle = Math.max(maxAngle, Math.min(minAngle, options.aimAngleRad));
      const baseSpeed = Math.hypot(FLIGHT_PHYSICS.LAUNCH_BASE_VX0, FLIGHT_PHYSICS.LAUNCH_BASE_VY0);
      const speed = baseSpeed * tension * upgradeMult;
      this.vx = speed * Math.cos(clampedAngle);
      this.vy = speed * Math.sin(clampedAngle);
    } else {
      this.vx = FLIGHT_PHYSICS.LAUNCH_BASE_VX0 * tension * upgradeMult;
      this.vy = FLIGHT_PHYSICS.LAUNCH_BASE_VY0 * tension * upgradeMult;
    }

    // Initial pitch tracking launch velocity
    this._updatePitch(1.0);
  }

  /**
   * Advances the physics simulation by dt seconds
   * @param {number} dt Frame time delta in seconds (nominal 1/60s)
   * @param {boolean} isHoldingBoost User touch input state
   */
  step(dt, isHoldingBoost = false) {
    if (this.state === FLIGHT_STATE.PRE_LAUNCH || this.state === FLIGHT_STATE.FLIGHT_OVER) {
      return;
    }

    // Safety clamp dt
    const delta = Math.min(0.05, Math.max(0.001, dt));
    this.totalFlightTime += delta;

    // Track user booster input transition
    if (isHoldingBoost && this.energy > 0) {
      this.isHoldingBoost = true;
      this.timeSinceBoostRelease = 0.0;
    } else {
      if (this.isHoldingBoost) {
        this.timeSinceBoostRelease = 0.0;
      } else {
        this.timeSinceBoostRelease += delta;
      }
      this.isHoldingBoost = false;
    }

    // Process State with continuous acceleration (ay)
    switch (this.state) {
      case FLIGHT_STATE.LAUNCHING:
        this._updateLaunching(delta);
        break;

      case FLIGHT_STATE.AIRBORNE_POWERED:
      case FLIGHT_STATE.AIRBORNE_GLIDE:
        this._updateAirborne(delta);
        break;

      case FLIGHT_STATE.RUNWAY_TAXI:
        this._updateTaxi(delta);
        break;
    }

    // Update positions via continuous integration (zero hard-coded snaps)
    this.x += this.vx * delta;
    this.y += this.vy * delta;

    // Update dynamic pitch tracking instantaneous vy via atan2(vy, vx)
    if (this.state !== FLIGHT_STATE.RUNWAY_TAXI && this.state !== FLIGHT_STATE.FLIGHT_OVER) {
      this._updatePitch(delta);
    }

    // Altitude calculation
    this.altitudeFt = Math.max(0.0, (this.runwayY - this.y) / this.scale);

    // Ground collision check while airborne
    if ((this.state === FLIGHT_STATE.LAUNCHING ||
         this.state === FLIGHT_STATE.AIRBORNE_POWERED ||
         this.state === FLIGHT_STATE.AIRBORNE_GLIDE) &&
        this.y >= this.runwayY) {
      this._handleTouchdown();
    }

    // Update total distance
    if (this.state === FLIGHT_STATE.RUNWAY_TAXI) {
      this.taxiDistanceFt = Math.max(0.0, (this.x - this.touchdownX) / this.scale);
      this.totalDistanceFt = this.airborneDistanceFt + this.taxiDistanceFt;
    } else if (this.state !== FLIGHT_STATE.FLIGHT_OVER) {
      this.airborneDistanceFt = Math.max(0.0, (this.x - this.slingshotX) / this.scale);
      this.totalDistanceFt = this.airborneDistanceFt;
    }
  }

  _updateLaunching(dt) {
    this.launchTime += dt;

    // Natural parabolic launch gravity
    this.vy += FLIGHT_PHYSICS.LAUNCH_GRAVITY * dt;

    // Gradual air drag blending vx from initial launch impulse toward sustained cruise speed
    const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
    if (this.vx > cruiseVx) {
      this.vx = Math.max(cruiseVx, this.vx - (FLIGHT_PHYSICS.LAUNCH_AIR_DRAG_K * (this.vx - cruiseVx) * 2.5 * dt));
      if (this.vx - cruiseVx < 0.6) this.vx = cruiseVx;
    }

    if (this.vy >= 0.0) {
      this.vy = 0.0;
      this.state = (this.isHoldingBoost && this.energy > 0)
        ? FLIGHT_STATE.AIRBORNE_POWERED
        : FLIGHT_STATE.AIRBORNE_GLIDE;
    }
  }

  _updateAirborne(dt) {
    // Horizontal speed smoothly tracks upgraded cruise airspeed
    const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
    if (this.vx > cruiseVx) {
      this.vx = Math.max(cruiseVx, this.vx - (FLIGHT_PHYSICS.LAUNCH_AIR_DRAG_K * (this.vx - cruiseVx) * 2.5 * dt));
      if (this.vx - cruiseVx < 0.6) this.vx = cruiseVx;
    } else {
      this.vx = cruiseVx;
    }

    if (this.isHoldingBoost && this.energy > 0) {
      // UPWARD POWERED THRUST (Continuous upward acceleration ay)
      this.state = FLIGHT_STATE.AIRBORNE_POWERED;

      // Drain booster tank based on upgraded propeller duration
      const drain = (this.boosterDrainRate || FLIGHT_PHYSICS.BOOSTER_DRAIN_RATE_L1) * dt;
      this.energy = Math.max(0.0, this.energy - drain);

      // Accelerate upward continuously toward upgraded max climb speed
      const maxClimb = this.boosterClimbVy || FLIGHT_PHYSICS.BOOST_MAX_CLIMB_VY;
      this.vy = Math.max(
        maxClimb,
        this.vy - FLIGHT_PHYSICS.BOOST_THRUST_ACCEL * dt
      );

      if (this.energy <= 0) {
        this.isHoldingBoost = false;
        this.state = FLIGHT_STATE.AIRBORNE_GLIDE;
      }
    } else {
      // UNPOWERED GLIDE & RECOVERY DAMPING
      this.state = FLIGHT_STATE.AIRBORNE_GLIDE;

      if (this.vy < 0.0) {
        // Continuous upward damping deceleration: brings vy >= 0 within <= 0.28s
        this.vy += FLIGHT_PHYSICS.RELEASE_DAMPING_ACCEL * dt;
        if (this.vy > 0.0) this.vy = 0.0;
      } else {
        // Continuous gravity acceleration: smoothly transitions into upgraded wings glide sink rate
        const sinkVy = this.glideSinkVy || FLIGHT_PHYSICS.BASE_GLIDE_SINK_RATE || 112.0;
        const gravity = this.glideGravity || FLIGHT_PHYSICS.BASE_GLIDE_GRAVITY || 210.0;
        this.vy = Math.min(
          sinkVy,
          this.vy + gravity * dt
        );
      }
    }
  }

  /**
   * Smoothly aligns aircraft pitch with instantaneous velocity vector atan2(vy, vx)
   * Carves a smooth rounded parabolic curve through every apex and pull-up.
   */
  _updatePitch(dt) {
    // Flight path angle in degrees
    const trajectoryAngleDeg = (Math.atan2(this.vy, this.vx) * 180.0) / Math.PI;

    let targetPitchDeg;
    if (this.vy <= 0) {
      const maxClimb = this.boosterClimbVy || -125.0;
      const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
      const climbRatio = Math.atan2(maxClimb, cruiseVx);
      const expectedAngleDeg = (climbRatio * 180.0) / Math.PI;
      targetPitchDeg = trajectoryAngleDeg * (FLIGHT_PHYSICS.BOOST_PITCH_DEG / expectedAngleDeg);
    } else {
      const sinkVy = this.glideSinkVy || FLIGHT_PHYSICS.BASE_GLIDE_SINK_RATE || 112.0;
      const glidePitch = this.glidePitchDeg || FLIGHT_PHYSICS.BASE_GLIDE_PITCH_DEG || 12.0;
      const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
      const sinkRatio = Math.atan2(sinkVy, cruiseVx);
      const expectedAngleDeg = (sinkRatio * 180.0) / Math.PI;
      targetPitchDeg = trajectoryAngleDeg * (glidePitch / expectedAngleDeg);
    }

    // Smooth rotational damping toward target
    const smoothingSpeed = dt > 0.1 ? 1.0 : dt * 8.0;
    this.pitchDeg += (targetPitchDeg - this.pitchDeg) * Math.min(1.0, smoothingSpeed);
  }

  _handleTouchdown() {
    this.y = this.runwayY;
    this.altitudeFt = 0.0;
    this.vy = 0.0;
    this.pitchDeg = 0.0;

    // Save exact airborne landing distance
    this.touchdownX = this.x;
    this.airborneDistanceFt = Math.max(0.0, (this.touchdownX - this.slingshotX) / this.scale);

    // Touchdown transitions to runway taxi:
    // vx_taxi = vx * 0.90 (never jumps upward)
    const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
    this.vx = cruiseVx * FLIGHT_PHYSICS.TAXI_ENTRY_SPEED_RATIO;
    this.state = FLIGHT_STATE.RUNWAY_TAXI;
    this.taxiTime = 0.0;
  }

  _updateTaxi(dt) {
    this.taxiTime += dt;
    this.y = this.runwayY;
    this.vy = 0.0;
    this.pitchDeg = 0.0;

    // Ground rolling friction: deceleration scaled by upgraded chassis efficiency
    const taxiDuration = this.taxiDuration || FLIGHT_PHYSICS.TAXI_DECELERATION_TIME;
    if (this.taxiTime >= taxiDuration) {
      this.vx = 0.0;
      this.state = FLIGHT_STATE.FLIGHT_OVER;
    } else {
      const cruiseVx = this.cruiseVx || FLIGHT_PHYSICS.HORIZONTAL_SPEED_VX;
      const entrySpeed = cruiseVx * FLIGHT_PHYSICS.TAXI_ENTRY_SPEED_RATIO;
      const progress = Math.min(1.0, this.taxiTime / taxiDuration);
      this.vx = Math.max(0.0, entrySpeed * (1.0 - Math.pow(progress, FLIGHT_PHYSICS.TAXI_POWER_LAW)));

      // Snap taxi velocity vx to 0 (and trigger flight over) as soon as taxi vx drops below 10 px/s
      if (this.vx < (FLIGHT_PHYSICS.TAXI_CUTOFF_SPEED || 10.0)) {
        this.vx = 0.0;
        this.state = FLIGHT_STATE.FLIGHT_OVER;
      }
    }
  }
}
