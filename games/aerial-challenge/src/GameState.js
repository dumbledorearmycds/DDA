/**
 * Township Aerial Challenge — Centralized Game State
 * Reactive state management decoupled from rendering.
 * Manages persistent inventory, upgrade levels, fuel regen, and active run telemetry.
 */

import {
  FLIGHT_STATE,
  ECONOMY_AND_FUEL_CONFIG,
  FLIGHT_PHYSICS,
  UPGRADE_CONFIG,
  UPGRADE_CATEGORIES,
  getAerialWeeklyCycle
} from './Constants.js';
import { soundManager } from './SoundManager.js';

class GameState {
  constructor() {
    this.listeners = new Map();

    // Persistent player inventory & progression
    this.fuel = ECONOMY_AND_FUEL_CONFIG.INITIAL_STARTING_FUEL;
    this.fuelRegenTimer = 0.0;
    this.personalBestFt = this.loadPersonalBest() || ECONOMY_AND_FUEL_CONFIG.DEFAULT_PERSONAL_BEST_FT;
    this.persistentStars = ECONOMY_AND_FUEL_CONFIG.INITIAL_STARS_PROGRESS || 49;
    this.starGoalIndex = 0;
    this.starGoalTarget = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS[0] || 150;
    this.claimedStarMilestones = [];

    // Workshop parts inventory (starts with enough for testing / immediate progression)
    this.persistentParts = {
      bolts: 4,
      cogs: 4,
      springs: 3
    };

    // Component upgrades (0 upgrades = Base Level 1; 1 upgrade = Level 2, etc.)
    this.upgrades = {
      wings: 0,
      chassis: 0,
      propeller: 0,
      fuselage: 0,
      slingshot: 0
    };

    this.isAirfieldMenuOpen = true;
    this.isUpgradesMenuOpen = false;
    this.isExitConfirmOpen = false;
    this.isFlightPaidFor = false;
    this.currentCycleId = getAerialWeeklyCycle().cycleId;
    this.loadPersistence();
    this.checkWeeklyReset();
    this.setupMessageBridge();
    this.reset();
  }

  reset() {
    this.flightState = FLIGHT_STATE.PRE_LAUNCH;
    this.isFlightPaidFor = false;
    this.energy = FLIGHT_PHYSICS.BOOSTER_MAX_ENERGY;
    this.isBoosterActive = false;
    this.airborneDistanceFt = 0;
    this.taxiDistanceFt = 0;
    this.totalDistanceFt = 0;
    this.sessionStars = 0;
    this.tokensCollected = 0;

    // Session parts collected during flight
    this.parts = { bolts: 0, cogs: 0, springs: 0, bolt: 0, cog: 0, spring: 0 };
    this.partsCollected = this.parts;
    this.isNewRecord = false;
  }

  loadPersonalBest() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = localStorage.getItem('aerial_challenge_record_ft');
        return val ? parseFloat(val) : ECONOMY_AND_FUEL_CONFIG.DEFAULT_PERSONAL_BEST_FT;
      }
    } catch {
      // LocalStorage access fallback
    }
    return ECONOMY_AND_FUEL_CONFIG.DEFAULT_PERSONAL_BEST_FT;
  }

  savePersonalBest(dist) {
    this.personalBestFt = dist;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('aerial_challenge_record_ft', dist.toFixed(1));
      }
    } catch {
      // Ignore storage errors
    }
  }

  loadPersistence() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const upgrades = localStorage.getItem('aerial_challenge_upgrades');
        if (upgrades) this.upgrades = Object.assign(this.upgrades, JSON.parse(upgrades));

        const parts = localStorage.getItem('aerial_challenge_parts');
        if (parts) this.persistentParts = Object.assign(this.persistentParts, JSON.parse(parts));

        const stars = localStorage.getItem('aerial_challenge_stars');
        if (stars) this.persistentStars = parseInt(stars, 10);

        const claimed = localStorage.getItem('aerial_challenge_claimed_milestones');
        if (claimed) {
          try { this.claimedStarMilestones = JSON.parse(claimed); } catch {}
        }

        const starGoalIdx = localStorage.getItem('aerial_challenge_star_goal_index');
        if (starGoalIdx !== null) {
          this.starGoalIndex = parseInt(starGoalIdx, 10);
          this.starGoalTarget = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS[this.starGoalIndex] || 1200;
        } else {
          const goals = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS;
          for (let i = 0; i < goals.length; i++) {
            if (this.persistentStars < goals[i]) {
              this.starGoalIndex = i;
              this.starGoalTarget = goals[i];
              break;
            }
          }
        }

        const fuel = localStorage.getItem('aerial_challenge_fuel');
        if (fuel !== null) this.fuel = parseInt(fuel, 10);

        const lastFuelTime = localStorage.getItem('aerial_challenge_fuel_timestamp');
        if (lastFuelTime && this.fuel < ECONOMY_AND_FUEL_CONFIG.MAX_FUEL) {
          const elapsedSec = Math.max(0, (Date.now() - parseInt(lastFuelTime, 10)) / 1000);
          const interval = ECONOMY_AND_FUEL_CONFIG.FUEL_REGEN_INTERVAL_SEC;
          if (elapsedSec >= interval) {
            const added = Math.floor(elapsedSec / interval);
            this.fuel = Math.min(ECONOMY_AND_FUEL_CONFIG.MAX_FUEL, this.fuel + added);
            this.fuelRegenTimer = elapsedSec % interval;
          }
        }
      }
    } catch {
      // Ignore storage errors
    }
  }

  savePersistence() {
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('aerial_challenge_upgrades', JSON.stringify(this.upgrades));
        localStorage.setItem('aerial_challenge_parts', JSON.stringify(this.persistentParts));
        localStorage.setItem('aerial_challenge_stars', this.persistentStars.toString());
        localStorage.setItem('aerial_challenge_fuel', this.fuel.toString());
        localStorage.setItem('aerial_challenge_fuel_timestamp', Date.now().toString());
        localStorage.setItem('aerial_challenge_star_goal_index', this.starGoalIndex.toString());
        localStorage.setItem('aerial_challenge_claimed_milestones', JSON.stringify(this.claimedStarMilestones));
        localStorage.setItem('aerial_challenge_weekly_cycle', this.currentCycleId);
      }
    } catch {
      // Ignore storage errors
    }
  }

  checkWeeklyReset(now = new Date()) {
    const cycle = getAerialWeeklyCycle(now);
    this.currentCycleId = cycle.cycleId;
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const lastCycle = localStorage.getItem('aerial_challenge_weekly_cycle');
        if (lastCycle && lastCycle !== cycle.cycleId) {
          this.performWeeklyReset(cycle.cycleId);
          return true;
        } else if (!lastCycle) {
          localStorage.setItem('aerial_challenge_weekly_cycle', cycle.cycleId);
        }
      }
    } catch {
      // Ignore storage errors
    }
    return false;
  }

  performWeeklyReset(newCycleId) {
    // With weekly leaderboard reset, all upgrades and upgrade items reset to base!
    this.upgrades = {
      wings: 0,
      chassis: 0,
      propeller: 0,
      fuselage: 0,
      slingshot: 0
    };
    this.persistentParts = {
      bolts: 0,
      cogs: 0,
      springs: 0
    };
    this.personalBestFt = 0;
    this.currentCycleId = newCycleId;
    this.starGoalIndex = 0;
    this.starGoalTarget = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS[0] || 150;
    this.claimedStarMilestones = [];

    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        localStorage.setItem('aerial_challenge_weekly_cycle', newCycleId);
        localStorage.setItem('aerial_challenge_record_ft', '0');
        localStorage.setItem('aerial_challenge_upgrades', JSON.stringify(this.upgrades));
        localStorage.setItem('aerial_challenge_parts', JSON.stringify(this.persistentParts));
        localStorage.setItem('aerial_challenge_star_goal_index', '0');
        localStorage.setItem('aerial_challenge_claimed_milestones', JSON.stringify([]));
      }
    } catch {
      // Ignore storage errors
    }

    this.savePersistence();
    this.emit('weeklyReset', { cycleId: newCycleId });
    this.emit('inventoryUpdated', {
      stars: this.persistentStars,
      parts: { ...this.persistentParts },
      fuel: this.fuel
    });
  }

  setupMessageBridge() {
    if (typeof window === 'undefined') return;
    window.addEventListener('message', (event) => {
      const data = event.data;
      if (!data || typeof data !== 'object') return;
      if (data.type === 'BUY_GAS_CANS_SUCCESS') {
        const added = Number(data.amount) || 1;
        if (typeof data.coinsRemaining === 'number') {
          this.userCoins = data.coinsRemaining;
        }
        this.addFuel(added);
        this.emit('fuelPurchaseSuccess', {
          amount: added,
          fuel: this.fuel,
          maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL
        });
      } else if (data.type === 'BUY_GAS_CANS_FAILED') {
        if (typeof data.currentCoins === 'number') {
          this.userCoins = data.currentCoins;
        }
        this.emit('fuelPurchaseFailed', {
          reason: data.reason,
          coinsNeeded: data.coinsNeeded,
          currentCoins: data.currentCoins
        });
      } else if (data.type === 'USER_PROFILE_SYNC') {
        if (data.profile) {
          this.userProfile = data.profile;
          if (typeof data.profile.coins === 'number') {
            this.userCoins = data.profile.coins;
          }
        }
        if (data.testMode !== undefined) {
          this.isTestMode = Boolean(data.testMode);
        }
        if (data.cycleInfo && data.cycleInfo.cycleId && data.cycleInfo.cycleId !== this.currentCycleId) {
          this.performWeeklyReset(data.cycleInfo.cycleId);
        }
        this.emit('profileSync', { profile: this.userProfile, userCoins: this.userCoins });
      } else if (data.type === 'WEEKLY_CYCLE_SYNC') {
        if (data.cycleId && data.cycleId !== this.currentCycleId) {
          this.performWeeklyReset(data.cycleId);
        }
      }
    });

    try {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'AERIAL_GAME_READY' }, '*');
      }
    } catch {
      // Cross-origin fallback
    }
  }

  buyGasCans(amount = 1) {
    const cost = amount * ECONOMY_AND_FUEL_CONFIG.GAS_CAN_COIN_COST;
    if (typeof window !== 'undefined') {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'BUY_GAS_CANS',
          amount,
          cost
        }, '*');
      } else if (typeof window.buyAerialGasCans === 'function') {
        window.buyAerialGasCans(amount, cost);
      } else {
        // Standalone / headless / direct play fallback so refueling works without parent wrapper
        this.addFuel(amount);
        this.emit('fuelPurchaseSuccess', {
          amount,
          fuel: this.fuel,
          maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL
        });
      }
    } else {
      this.addFuel(amount);
      this.emit('fuelPurchaseSuccess', {
        amount,
        fuel: this.fuel,
        maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL
      });
    }
  }

  addFuel(amount) {
    this.fuel = Math.min(ECONOMY_AND_FUEL_CONFIG.MAX_FUEL, this.fuel + amount);
    this.savePersistence();
    this.emit('fuelChange', { fuel: this.fuel, maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL });
  }

  getClaimableMilestone() {
    const goals = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS;
    const rewards = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_COIN_REWARDS;
    for (let i = 0; i < goals.length; i++) {
      if (!this.claimedStarMilestones.includes(i) && this.persistentStars >= goals[i]) {
        return {
          index: i,
          target: goals[i],
          rewardCoins: rewards[i] || 100
        };
      }
    }
    return null;
  }

  getNextMilestone() {
    const goals = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS;
    const rewards = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_COIN_REWARDS;
    for (let i = 0; i < goals.length; i++) {
      if (!this.claimedStarMilestones.includes(i)) {
        return {
          index: i,
          target: goals[i],
          rewardCoins: rewards[i] || 100,
          isUnlocked: this.persistentStars >= goals[i],
          allCompleted: false
        };
      }
    }
    return {
      index: goals.length - 1,
      target: goals[goals.length - 1],
      rewardCoins: 1000,
      isUnlocked: false,
      allCompleted: true
    };
  }

  getCurrentStarMilestone() {
    return this.getNextMilestone();
  }

  claimStarReward(stageIdx) {
    const goals = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS;
    const rewards = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_COIN_REWARDS;

    let targetIdx = stageIdx;
    if (targetIdx === undefined || targetIdx === null) {
      const claimable = this.getClaimableMilestone();
      if (!claimable) return false;
      targetIdx = claimable.index;
    }

    if (this.claimedStarMilestones.includes(targetIdx)) return false;
    if (targetIdx < 0 || targetIdx >= goals.length) return false;
    if (this.persistentStars < goals[targetIdx]) return false;

    const coins = rewards[targetIdx] || 100;
    this.claimedStarMilestones.push(targetIdx);
    this.savePersistence();

    if (typeof window !== 'undefined') {
      const payload = {
        type: 'CLAIM_STAR_REWARD',
        stageIndex: targetIdx,
        coins
      };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      } else if (typeof window.claimAerialStarReward === 'function') {
        window.claimAerialStarReward(targetIdx, coins);
      }
    }

    this.emit('starRewardClaimed', { stageIndex: targetIdx, coins });
    return true;
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      this.off(event, callback);
    };
  }

  off(event, callback) {
    const arr = this.listeners.get(event);
    if (arr) {
      const idx = arr.indexOf(callback);
      if (idx !== -1) arr.splice(idx, 1);
    }
  }

  emit(event, data) {
    const list = this.listeners.get(event);
    if (list) {
      for (const cb of list) {
        try {
          cb(data);
        } catch (err) {
          console.error(`Error in event listener for ${event}:`, err);
        }
      }
    }
  }

  get isMuted() {
    return soundManager.isMuted;
  }

  toggleMute() {
    const muted = soundManager.toggleMute();
    this.emit('muteChange', muted);
    return muted;
  }

  setMuted(muted) {
    soundManager.setMuted(muted);
    this.emit('muteChange', soundManager.isMuted);
  }

  setFlightState(newState) {
    if (this.flightState === newState) return;
    const oldState = this.flightState;
    this.flightState = newState;
    this.emit('stateChange', { oldState, newState });
  }

  setBoosterActive(active) {
    if (this.isBoosterActive === active) return;
    this.isBoosterActive = active;
    this.emit('boosterToggle', active);
  }

  updateEnergy(newEnergy) {
    this.energy = Math.max(0, Math.min(FLIGHT_PHYSICS.BOOSTER_MAX_ENERGY, newEnergy));
    this.emit('energyChange', this.energy);
    if (this.energy <= 0 && this.isBoosterActive) {
      this.setBoosterActive(false);
    }
  }

  addStar(amount = 1) {
    this.sessionStars += amount;
    this.tokensCollected = this.sessionStars;
    this.emit('starCollected', { stars: this.sessionStars, amount });
  }

  addPart(type, amount = 1) {
    const key = type.endsWith('s') ? type : `${type}s`;
    const singular = key.slice(0, -1);
    this.parts[key] = (this.parts[key] || 0) + amount;
    this.parts[singular] = this.parts[key];
    this.partsCollected = this.parts;
    this.emit('partCollected', { type: key, amount, count: this.parts[key], parts: { ...this.parts } });
  }

  restoreEnergy(pct = 38.0) {
    const newEnergy = Math.min(FLIGHT_PHYSICS.BOOSTER_MAX_ENERGY, this.energy + pct);
    this.updateEnergy(newEnergy);
    this.emit('energyRestored', { amount: pct, energy: this.energy });
  }

  updateDistance(airborneFt, taxiFt = 0) {
    this.airborneDistanceFt = airborneFt;
    this.taxiDistanceFt = taxiFt;
    this.totalDistanceFt = airborneFt + taxiFt;
    this.emit('distanceUpdate', {
      airborne: this.airborneDistanceFt,
      taxi: this.taxiDistanceFt,
      total: this.totalDistanceFt
    });
  }

  /* ========================================================================
     ECONOMY & FUEL MANAGEMENT
     ======================================================================== */

  consumeFlightFuel(amount = ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT) {
    if (this.isFlightPaidFor) return true;
    if (this.spendFuel(amount)) {
      this.isFlightPaidFor = true;
      return true;
    }
    return false;
  }

  spendFuel(amount = ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT) {
    if (this.fuel < amount) {
      this.emit('fuelInsufficient', { current: this.fuel, required: amount });
      return false;
    }
    this.fuel -= amount;
    this.isFlightPaidFor = true;
    this.savePersistence();
    this.emit('fuelChange', { fuel: this.fuel, maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL });
    return true;
  }

  updateFuelRegen(dtSec) {
    if (this.fuel >= ECONOMY_AND_FUEL_CONFIG.MAX_FUEL) {
      this.fuelRegenTimer = 0;
      return;
    }
    this.fuelRegenTimer += dtSec;
    const interval = ECONOMY_AND_FUEL_CONFIG.FUEL_REGEN_INTERVAL_SEC;
    if (this.fuelRegenTimer >= interval) {
      const added = Math.floor(this.fuelRegenTimer / interval);
      this.fuelRegenTimer %= interval;
      this.fuel = Math.min(ECONOMY_AND_FUEL_CONFIG.MAX_FUEL, this.fuel + added);
      this.savePersistence();
      this.emit('fuelChange', { fuel: this.fuel, maxFuel: ECONOMY_AND_FUEL_CONFIG.MAX_FUEL });
    }
  }

  bankRunRewards() {
    // Bank session stars into persistent Star Goal
    this.persistentStars += this.sessionStars;

    // Bank session parts into persistent inventory
    this.persistentParts.bolts += (this.parts.bolts || 0);
    this.persistentParts.cogs += (this.parts.cogs || 0);
    this.persistentParts.springs += (this.parts.springs || 0);

    // Check if star goal reached
    if (this.persistentStars >= this.starGoalTarget) {
      const stageIdx = this.starGoalIndex;
      this.emit('starGoalReached', {
        goalTarget: this.starGoalTarget,
        stars: this.persistentStars,
        stageIndex: stageIdx
      });
      this.starGoalIndex++;
      const nextTarget = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS[this.starGoalIndex];
      if (nextTarget) {
        this.starGoalTarget = nextTarget;
      }
    }

    this.savePersistence();
    this.emit('inventoryUpdated', {
      stars: this.persistentStars,
      parts: { ...this.persistentParts },
      fuel: this.fuel
    });
  }

  completeFlight() {
    if (this.totalDistanceFt > this.personalBestFt) {
      this.isNewRecord = true;
      this.savePersonalBest(this.totalDistanceFt);
    } else {
      this.isNewRecord = false;
    }

    this.bankRunRewards();

    this.setFlightState(FLIGHT_STATE.FLIGHT_OVER);
    this.emit('flightComplete', {
      airborneFt: this.airborneDistanceFt,
      taxiFt: this.taxiDistanceFt,
      totalDistanceFt: this.totalDistanceFt,
      tokens: this.sessionStars,
      parts: { ...this.parts },
      isNewRecord: this.isNewRecord
    });

    if (typeof window !== 'undefined') {
      const payload = {
        type: 'RECORD_DISTANCE',
        distanceFt: this.totalDistanceFt,
        isNewRecord: this.isNewRecord
      };
      if (window.parent && window.parent !== window) {
        window.parent.postMessage(payload, '*');
      } else if (typeof window.submitAerialDistance === 'function') {
        window.submitAerialDistance(this.totalDistanceFt);
      }
    }
  }

  /* ========================================================================
     AIRPLANE UPGRADES LOGIC & COUPLING
     ======================================================================== */

  getTier() {
    const total = Object.values(this.upgrades).reduce((a, b) => a + b, 0);
    if (total < 5) return 1; // Tier 1: vintage red-and-cream biplane (0-4 upgrades)
    if (total < 9) return 2; // Tier 2: reinforced silver-and-blue metal hull (5-8 upgrades)
    return 3;                // Tier 3: master crimson-and-gold aerodynamic racer (9+ upgrades)
  }

  getUpgradeCost(category) {
    const cfg = UPGRADE_CONFIG[category];
    if (!cfg) return { bolts: 1, cogs: 1, springs: 1 };
    const u = this.upgrades[category] || 0;

    const cost = {};
    for (const [part, baseQty] of Object.entries(cfg.baseCost)) {
      // Cost increases smoothly with upgrade count
      cost[part] = baseQty + Math.floor(u * 0.7);
    }
    return cost;
  }

  canAffordUpgrade(category) {
    const cost = this.getUpgradeCost(category);
    for (const [part, required] of Object.entries(cost)) {
      const key = part.endsWith('s') ? part : `${part}s`;
      if ((this.persistentParts[key] || 0) < required) {
        return false;
      }
    }
    return true;
  }

  hasAnyAffordableUpgrade() {
    return UPGRADE_CATEGORIES.some(cat => this.canAffordUpgrade(cat));
  }

  purchaseUpgrade(category) {
    if (!this.canAffordUpgrade(category)) return false;

    const cost = this.getUpgradeCost(category);
    for (const [part, required] of Object.entries(cost)) {
      const key = part.endsWith('s') ? part : `${part}s`;
      this.persistentParts[key] -= required;
    }

    this.upgrades[category] = (this.upgrades[category] || 0) + 1;
    const newTier = this.getTier();
    this.savePersistence();

    this.emit('upgradePurchased', {
      category,
      level: this.upgrades[category],
      tier: newTier,
      upgrades: { ...this.upgrades },
      parts: { ...this.persistentParts }
    });

    return true;
  }
}

export const gameState = new GameState();

