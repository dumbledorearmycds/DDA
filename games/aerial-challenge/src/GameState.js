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
  UPGRADE_CATEGORIES
} from './Constants.js';

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
    this.loadPersistence();
    this.reset();
  }

  reset() {
    this.flightState = FLIGHT_STATE.PRE_LAUNCH;
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

        const fuel = localStorage.getItem('aerial_challenge_fuel');
        if (fuel) this.fuel = parseInt(fuel, 10);
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
      }
    } catch {
      // Ignore storage errors
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, []);
    }
    this.listeners.get(event).push(callback);
    return () => {
      const arr = this.listeners.get(event);
      if (arr) {
        const idx = arr.indexOf(callback);
        if (idx !== -1) arr.splice(idx, 1);
      }
    };
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

  spendFuel(amount = ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT) {
    if (this.fuel < amount) {
      this.emit('fuelInsufficient', { current: this.fuel, required: amount });
      return false;
    }
    this.fuel -= amount;
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

    // Check Star Milestone Goal
    if (this.persistentStars >= this.starGoalTarget) {
      this.emit('starGoalReached', {
        goalTarget: this.starGoalTarget,
        stars: this.persistentStars
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

