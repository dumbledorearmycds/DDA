/**
 * Township Aerial Challenge — UIScene
 * Parallel HUD overlay, Township Airfield Main Menu Modal,
 * Dedicated Airplane Upgrades Modal, and Results Dialog.
 */

import {
  SCALE,
  FLIGHT_STATE,
  COLORS,
  UPGRADE_CONFIG,
  UPGRADE_CATEGORIES,
  ECONOMY_AND_FUEL_CONFIG,
  getAerialWeeklyCycle
} from './Constants.js';
import { gameState } from './GameState.js';
import { triggerFullscreenAndLandscape } from './OrientationManager.js';

export class UIScene extends Phaser.Scene {
  constructor() {
    super({ key: 'UIScene' });
  }

  create() {
    // 1. In-Flight HUD Overlays
    this.createDistanceHUD();
    this.createStarCounterHUD();
    this.createFuelHUD();
    this.createHomeButton();
    this.createBoosterBar();
    this.createInstructionBanner();
    this.createResultsDialog();

    // 2. Modals (Township Airfield Starting Menu, Airplane Upgrades, Refuel Dialog)
    this.createAirfieldModal();
    this.createUpgradesModal();
    this.createRefuelModal();

    // 3. Responsive HUD resize layout listener
    this.scale.on('resize', (gameSize) => {
      this.layoutHUD(gameSize.width, gameSize.height);
    });

    // 4. Passive Fuel Regeneration Loop (1-sec tick)
    this.time.addEvent({
      delay: 1000,
      loop: true,
      callback: () => {
        gameState.updateFuelRegen(1);
        this.updateFuelHUD();
      }
    });

    // 5. Subscribe to GameState events
    gameState.on('distanceUpdate', (dist) => this.onDistanceUpdate(dist));
    gameState.on('energyChange', (energy) => this.onEnergyChange(energy));
    gameState.on('stateChange', (change) => this.onStateChange(change));
    gameState.on('flightComplete', (results) => this.showFlightResults(results));
    gameState.on('starCollected', (data) => this.onStarCollected(data));
    gameState.on('partCollected', () => this.refreshAllUI());
    gameState.on('fuelChange', () => this.updateFuelHUD());
    gameState.on('fuelInsufficient', () => this.onFuelInsufficient());
    gameState.on('inventoryUpdated', () => this.refreshAllUI());
    gameState.on('upgradePurchased', () => this.refreshAllUI());

    // Initial Layout & Startup Menu
    const screenW = this.scale.width || SCALE.CANVAS_WIDTH;
    const screenH = this.scale.height || SCALE.CANVAS_HEIGHT;
    this.layoutHUD(screenW, screenH);

    // Initial state: Show the authentic Township Airfield Start Menu and hide in-flight HUD
    this.showAirfieldModal();
  }

  /* ========================================================================
     IN-FLIGHT HUD VISIBILITY TOGGLE
     ======================================================================== */

  setInFlightHUDVisible(visible) {
    if (this.distanceContainer) this.distanceContainer.setVisible(visible);
    if (this.instructionText) this.instructionText.setVisible(visible);
    if (this.boosterContainer) this.boosterContainer.setVisible(visible);
    if (this.starContainer) this.starContainer.setVisible(visible);
    if (this.fuelContainer) this.fuelContainer.setVisible(visible);
    if (this.homeContainer) this.homeContainer.setVisible(visible);
  }

  layoutHUD(width, height) {
    if (this.distanceContainer) {
      this.distanceContainer.setPosition(width / 2, 48);
    }
    if (this.starContainer) {
      this.starContainer.setPosition(74, 48);
    }
    if (this.fuelContainer) {
      this.fuelContainer.setPosition(200, 48);
    }
    if (this.homeContainer) {
      this.homeContainer.setPosition(width - 44, 44);
    }
    if (this.boosterContainer) {
      this.boosterContainer.setPosition(width / 2, height - 36);
    }
    if (this.instructionText) {
      this.instructionText.setPosition(width / 2, 110);
    }
    if (this.resultsContainer) {
      this.resultsContainer.setPosition(width / 2, height / 2);
    }
    if (this.airfieldContainer) {
      this.airfieldContainer.setPosition(width / 2, height / 2);
    }
    if (this.upgradesContainer) {
      this.upgradesContainer.setPosition(width / 2, height / 2);
      this.updateUpgradesMask();
    }
  }

  /* ========================================================================
     IN-FLIGHT HUD OVERLAYS
     ======================================================================== */

  createDistanceHUD() {
    this.distanceContainer = this.add.container(SCALE.CANVAS_WIDTH / 2, 48);
    this.distanceContainer.setDepth(20);

    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0x1a3854, 0.9);
    badgeBg.lineStyle(3, 0xfbc02d, 1);
    badgeBg.fillRoundedRect(-110, -22, 220, 44, 22);
    badgeBg.strokeRoundedRect(-110, -22, 220, 44, 22);

    this.distanceText = this.add.text(0, 0, '0 FT', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#4E342E',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    this.distanceContainer.add([badgeBg, this.distanceText]);
  }

  createStarCounterHUD() {
    this.starContainer = this.add.container(74, 48);
    this.starContainer.setDepth(20);

    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0x1a3854, 0.9);
    badgeBg.lineStyle(3, 0xfbc02d, 1);
    badgeBg.fillRoundedRect(-52, -22, 104, 44, 22);
    badgeBg.strokeRoundedRect(-52, -22, 104, 44, 22);

    const starIcon = this.add.image(-25, 0, 'winged_star');
    starIcon.setScale(0.35);

    this.starText = this.add.text(12, 0, '0', {
      fontSize: '22px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#4E342E',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);

    this.starContainer.add([badgeBg, starIcon, this.starText]);
  }

  createFuelHUD() {
    this.fuelContainer = this.add.container(200, 48);
    this.fuelContainer.setDepth(20);

    const badgeBg = this.add.graphics();
    badgeBg.fillStyle(0x1a3854, 0.9);
    badgeBg.lineStyle(3, 0x22c55e, 1);
    badgeBg.fillRoundedRect(-58, -22, 116, 44, 22);
    badgeBg.strokeRoundedRect(-58, -22, 116, 44, 22);

    const fuelIcon = this.add.image(-30, 0, 'ui_fuel_canister');
    fuelIcon.setScale(0.48);

    this.fuelText = this.add.text(12, -4, `${gameState.fuel}/25`, {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#166534',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);

    this.fuelTimerText = this.add.text(12, 12, 'FULL', {
      fontSize: '11px',
      fontStyle: 'bold',
      color: '#86efac',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const fuelClickZone = this.add.zone(0, 0, 116, 44).setInteractive({ useHandCursor: true });
    fuelClickZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.showRefuelModal();
    });

    this.fuelContainer.add([badgeBg, fuelIcon, this.fuelText, this.fuelTimerText, fuelClickZone]);
    this.updateFuelHUD();
  }

  updateFuelHUD() {
    if (!this.fuelText) return;
    this.fuelText.setText(`${gameState.fuel}/${ECONOMY_AND_FUEL_CONFIG.MAX_FUEL}`);

    if (gameState.fuel >= ECONOMY_AND_FUEL_CONFIG.MAX_FUEL) {
      this.fuelTimerText.setText('FULL');
      this.fuelTimerText.setColor('#86efac');
    } else {
      const remainingSec = Math.max(0, Math.ceil(ECONOMY_AND_FUEL_CONFIG.FUEL_REGEN_INTERVAL_SEC - gameState.fuelRegenTimer));
      const mins = Math.floor(remainingSec / 60);
      const secs = remainingSec % 60;
      this.fuelTimerText.setText(`+1 in ${mins}:${secs < 10 ? '0' : ''}${secs}`);
      this.fuelTimerText.setColor('#fef08a');
    }

    if (this.toFuelCostText) {
      this.toFuelCostText.setText(`${gameState.fuel}/5`);
    }
  }

  createHomeButton() {
    const initX = (this.scale.width || SCALE.CANVAS_WIDTH) - 44;
    const initY = 44;

    this.homeContainer = this.add.container(initX, initY);
    this.homeContainer.setDepth(150);

    const btnBg = this.add.graphics();
    // 3D bottom drop shadow
    btnBg.fillStyle(0x0f172a, 0.45);
    btnBg.fillCircle(1, 2, 22);

    // Deep slate chassis body
    btnBg.fillStyle(0x1a3854, 0.95);
    btnBg.lineStyle(3, 0xfbc02d, 1);
    btnBg.fillCircle(0, 0, 22);
    btnBg.strokeCircle(0, 0, 22);

    // Inner gold ring accent
    btnBg.lineStyle(1.5, 0xfef08a, 0.6);
    btnBg.strokeCircle(0, 0, 18);

    // Procedural 3D Cartoon Township Home Icon
    const homeIconGfx = this.add.graphics();

    // Chimney (dark brick red #991b1b)
    homeIconGfx.fillStyle(0xb91c1c, 1);
    homeIconGfx.fillRect(5, -12, 4, 7);
    homeIconGfx.fillStyle(0x7f1d1d, 1);
    homeIconGfx.fillRect(4, -13, 6, 2);

    // Peaked Roof (vibrant cherry red #ef4444 with #7f1d1d stroke)
    homeIconGfx.fillStyle(0xef4444, 1);
    homeIconGfx.lineStyle(2, 0x7f1d1d, 1);
    homeIconGfx.beginPath();
    homeIconGfx.moveTo(0, -12); // roof peak
    homeIconGfx.lineTo(13, 0);  // right eaves
    homeIconGfx.lineTo(-13, 0); // left eaves
    homeIconGfx.closePath();
    homeIconGfx.fill();
    homeIconGfx.stroke();

    // House Walls (warm cream #fffbeb with #78350f stroke)
    homeIconGfx.fillStyle(0xfffbeb, 1);
    homeIconGfx.lineStyle(2, 0x78350f, 1);
    homeIconGfx.fillRect(-9, 0, 18, 11);
    homeIconGfx.strokeRect(-9, 0, 18, 11);

    // Front Door (warm wood #92400e)
    homeIconGfx.fillStyle(0x92400e, 1);
    homeIconGfx.fillRoundedRect(-3, 3, 6, 8, { tl: 3, tr: 3, bl: 0, br: 0 });

    // Door knob (gold dot)
    homeIconGfx.fillStyle(0xfde047, 1);
    homeIconGfx.fillCircle(1.5, 7, 0.9);

    const hitZone = this.add.zone(0, 0, 48, 48).setInteractive({ useHandCursor: true });
    hitZone.on('pointerdown', (pointer) => {
      pointer.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.handleHomeClick();
    });

    this.homeContainer.add([btnBg, homeIconGfx, hitZone]);
  }

  handleHomeClick() {
    triggerFullscreenAndLandscape();

    // 1. Hide results modal if open
    if (this.resultsContainer) this.resultsContainer.setVisible(false);

    // 2. Hide upgrades modal if open
    if (this.upgradesContainer) this.upgradesContainer.setVisible(false);

    // 3. Reset flight state & park biplane safely back at slingshot
    gameState.reset();
    if (this.starText) this.starText.setText('0');
    gameState.emit('resetFlight');

    // 4. Open the authentic Township Airfield Start Menu!
    this.showAirfieldModal();
  }

  createBoosterBar() {
    const screenW = this.scale.width || SCALE.CANVAS_WIDTH;
    const screenH = this.scale.height || SCALE.CANVAS_HEIGHT;
    this.boosterContainer = this.add.container(screenW / 2, screenH - 36);
    this.boosterContainer.setDepth(20);

    this.boosterFrame = this.add.image(0, 0, 'booster_frame');
    this.boosterFill = this.add.image(-120, 0, 'booster_fill');
    this.boosterFill.setOrigin(0, 0.5);

    this.boosterEmblem = this.add.image(-135, 0, 'booster_emblem');
    this.boosterEmblem.setOrigin(0.5, 0.5);

    this.boosterContainer.add([this.boosterFrame, this.boosterFill, this.boosterEmblem]);
  }

  createInstructionBanner() {
    this.instructionText = this.add.text(SCALE.CANVAS_WIDTH / 2, 110, '👈 DRAG SLINGSHOT BACK & RELEASE TO LAUNCH', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#0D1B2A',
      strokeThickness: 4,
      backgroundColor: 'rgba(13, 27, 42, 0.65)',
      padding: { x: 16, y: 8 }
    }).setOrigin(0.5, 0.5);
    this.instructionText.setDepth(20);

    this.tweens.add({
      targets: this.instructionText,
      scaleX: 1.05,
      scaleY: 1.05,
      duration: 800,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });
  }

  /* ========================================================================
     (3) ENLARGED AUTHENTIC TOWNSHIP "AIRFIELD" STARTING MENU
     ======================================================================== */

  createAirfieldModal() {
    const sw = this.scale.width || SCALE.CANVAS_WIDTH;
    const sh = this.scale.height || SCALE.CANVAS_HEIGHT;
    this.airfieldContainer = this.add.container(sw / 2, sh / 2);
    this.airfieldContainer.setDepth(90);
    this.airfieldContainer.setVisible(false);

    // 1. Semi-transparent dark background scrim (absorbs pointer events)
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.68);
    overlay.fillRect(-2000, -1200, 4000, 2400);
    const scrimZone = this.add.zone(0, 0, 4000, 2400).setInteractive();
    scrimZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
    });

    // 2. Large Township Steel-Blue Chassis Frame: 1040 x 605
    const mw = 1040, mh = 605;
    const frameGfx = this.add.graphics();

    // Outer frame drop shadow
    frameGfx.fillStyle(0x0a192f, 0.55);
    frameGfx.fillRoundedRect(-mw / 2 + 8, -mh / 2 + 10, mw, mh, 24);

    // Steel-blue chassis body (#7ba6c2)
    frameGfx.fillStyle(0x7ba6c2, 1);
    frameGfx.lineStyle(6, 0x243e54, 1);
    frameGfx.fillRoundedRect(-mw / 2, -mh / 2, mw, mh, 20);
    frameGfx.strokeRoundedRect(-mw / 2, -mh / 2, mw, mh, 20);

    // Inner 3D steel bevel
    frameGfx.lineStyle(2.5, 0xbfe3f7, 0.85);
    frameGfx.strokeRoundedRect(-mw / 2 + 5, -mh / 2 + 5, mw - 10, mh - 10, 18);

    // Steel rivets spaced around the frame border
    frameGfx.fillStyle(0xe2e8f0, 0.95);
    for (let x = -mw / 2 + 25; x <= mw / 2 - 25; x += 38) {
      frameGfx.fillCircle(x, -mh / 2 + 11, 3);
      frameGfx.fillCircle(x, mh / 2 - 11, 3);
    }
    for (let y = -mh / 2 + 30; y <= mh / 2 - 30; y += 38) {
      frameGfx.fillCircle(-mw / 2 + 11, y, 3);
      frameGfx.fillCircle(mw / 2 - 11, y, 3);
    }

    // 3. Top Roof Bar & Tabs (sitting seamlessly on top of frame)
    const tabY = -mh / 2 - 6;

    // (a) Warm cream/sand arched roof bar underlay
    const roofGfx = this.add.graphics();
    roofGfx.fillStyle(0xfde6be, 1);
    roofGfx.lineStyle(3, 0x243e54, 1);
    roofGfx.fillRoundedRect(-240, tabY - 26, 480, 52, { tl: 14, tr: 14, bl: 0, br: 0 });
    roofGfx.strokeRoundedRect(-240, tabY - 26, 480, 52, { tl: 14, tr: 14, bl: 0, br: 0 });

    // (b) Left '?' Help Button
    const helpBtn = this.add.graphics();
    helpBtn.fillStyle(0xbae0f5, 1);
    helpBtn.lineStyle(3.5, 0x243e54, 1);
    helpBtn.fillCircle(-mw / 2 + 45, tabY + 4, 20);
    helpBtn.strokeCircle(-mw / 2 + 45, tabY + 4, 20);

    const helpTxt = this.add.text(-mw / 2 + 45, tabY + 4, '?', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#3b2314',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const helpZone = this.add.zone(-mw / 2 + 45, tabY + 4, 44, 44).setInteractive({ useHandCursor: true });
    helpZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.showHelpAlert();
    });

    // (c) Center Active Cream "AIRFIELD" Tab
    this.tabAirBg = this.add.graphics();
    this.tabAirBg.fillStyle(0xfff8e1, 1);
    this.tabAirBg.lineStyle(3.5, 0x243e54, 1);
    this.tabAirBg.fillRoundedRect(-215, tabY - 22, 205, 48, { tl: 12, tr: 12, bl: 0, br: 0 });
    this.tabAirBg.strokeRoundedRect(-215, tabY - 22, 205, 48, { tl: 12, tr: 12, bl: 0, br: 0 });

    const tabAirIcon = this.add.image(-185, tabY + 2, 'ui_tab_airfield').setScale(0.72);
    this.tabAirTxt = this.add.text(-100, tabY + 2, 'AIRFIELD', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#451a03',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const airZone = this.add.zone(-105, tabY + 4, 205, 48).setInteractive({ useHandCursor: true });
    airZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.switchAirfieldTab('airfield');
    });

    // (d) Center Inactive Tan "COMPETITION" Tab
    this.tabCompBg = this.add.graphics();
    this.tabCompBg.fillStyle(0xcbd5e1, 1);
    this.tabCompBg.lineStyle(3, 0x475569, 1);
    this.tabCompBg.fillRoundedRect(5, tabY - 18, 210, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
    this.tabCompBg.strokeRoundedRect(5, tabY - 18, 210, 44, { tl: 12, tr: 12, bl: 0, br: 0 });

    const tabCompIcon = this.add.image(35, tabY + 4, 'ui_tab_competition').setScale(0.68);
    this.tabCompTxt = this.add.text(125, tabY + 4, 'COMPETITION', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#334155',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const compZone = this.add.zone(110, tabY + 4, 210, 44).setInteractive({ useHandCursor: true });
    compZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.switchAirfieldTab('competition');
    });

    // (e) Right Circular Brown/Orange 'X' Close Button
    const closeBtnGfx = this.add.graphics();
    closeBtnGfx.fillStyle(0xc2410c, 1);
    closeBtnGfx.lineStyle(3.5, 0x7c2d12, 1);
    closeBtnGfx.fillCircle(mw / 2 - 45, tabY + 4, 20);
    closeBtnGfx.strokeCircle(mw / 2 - 45, tabY + 4, 20);

    const closeTxt = this.add.text(mw / 2 - 45, tabY + 3, '✕', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const closeZone = this.add.zone(mw / 2 - 45, tabY + 4, 44, 44).setInteractive({ useHandCursor: true });
    closeZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.exitGame();
    });

    // 4. Left Panel: #bae0f5 Light-Blue Card (Width 486, Height 480)
    const lpW = 486, lpH = 480;
    const lpX = -mw / 2 + 16 + lpW / 2; // -261
    const lpY = 8;

    const leftPanelGfx = this.add.graphics();
    leftPanelGfx.fillStyle(0xbae0f5, 1);
    leftPanelGfx.lineStyle(3.5, 0x47708d, 1);
    leftPanelGfx.fillRoundedRect(lpX - lpW / 2, lpY - lpH / 2, lpW, lpH, 14);
    leftPanelGfx.strokeRoundedRect(lpX - lpW / 2, lpY - lpH / 2, lpW, lpH, 14);

    this.airfieldProgressGfx = this.add.graphics();
    this.airfieldRowsContainer = this.add.container(lpX, lpY);

    // Left Panel: Large 3D Glossy Blue "UPGRADE" Button with pulsing red '!' badge
    const upBtnY = lpY + lpH / 2 - 40;
    this.airfieldUpgradeBtn = this.add.container(lpX, upBtnY);

    const upBtnBg = this.add.graphics();
    // 3D bottom bevel
    upBtnBg.fillStyle(0x0c4a6e, 1);
    upBtnBg.fillRoundedRect(-165, -23, 330, 52, 26);
    // Glossy blue body
    upBtnBg.fillStyle(0x0284c7, 1);
    upBtnBg.lineStyle(3.5, 0x075985, 1);
    upBtnBg.fillRoundedRect(-165, -27, 330, 48, 24);
    upBtnBg.strokeRoundedRect(-165, -27, 330, 48, 24);
    // Top shine highlight
    upBtnBg.fillStyle(0x38bdf8, 0.45);
    upBtnBg.fillRoundedRect(-160, -24, 320, 20, { tl: 20, tr: 20, bl: 0, br: 0 });

    const upBtnArrow = this.add.image(-100, -3, 'ui_upgrade_arrow').setScale(0.85);
    const upBtnTxt = this.add.text(12, -3, 'UPGRADE', {
      fontSize: '21px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#0c4a6e',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    this.airfieldBadge = this.add.image(155, -24, 'ui_badge_exclamation').setScale(1.05);

    const upBtnZone = this.add.zone(0, 0, 330, 52).setInteractive({ useHandCursor: true });
    upBtnZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.showUpgradesModal();
    });

    this.airfieldUpgradeBtn.add([upBtnBg, upBtnArrow, upBtnTxt, this.airfieldBadge, upBtnZone]);

    // 5. Right Panel: Scenic Airfield Preview Card (Width 486, Height 480)
    const rpW = 486, rpH = 480;
    const rpX = mw / 2 - 16 - rpW / 2; // +261
    const rpY = 8;

    this.rightPanelContainer = this.add.container(rpX, rpY);

    // Illustrated Backdrop Image inside Right Panel
    const previewBackdrop = this.add.image(0, 0, 'airfield_preview_backdrop');
    previewBackdrop.setDisplaySize(rpW - 6, rpH - 6);

    // Right Panel 3D Border
    const rightBorderGfx = this.add.graphics();
    rightBorderGfx.lineStyle(3.5, 0x47708d, 1);
    rightBorderGfx.strokeRoundedRect(-rpW / 2, -rpH / 2, rpW, rpH, 14);

    // Top-Right: RECORD Label + Dark-Slate Pill Badge
    const recLabelTxt = this.add.text(rpW / 2 - 145, -rpH / 2 + 28, 'RECORD', {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#1e3a5f',
      fontFamily: 'sans-serif',
      stroke: '#FFFFFF',
      strokeThickness: 3
    }).setOrigin(1.0, 0.5);

    const recPillGfx = this.add.graphics();
    recPillGfx.fillStyle(0x1e3a5f, 0.95);
    recPillGfx.lineStyle(2, 0x38bdf8, 1);
    recPillGfx.fillRoundedRect(rpW / 2 - 135, -rpH / 2 + 13, 115, 30, 15);
    recPillGfx.strokeRoundedRect(rpW / 2 - 135, -rpH / 2 + 13, 115, 30, 15);

    this.airfieldRecordText = this.add.text(rpW / 2 - 78, -rpH / 2 + 28, `${Math.floor(gameState.personalBestFt)} FT`, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#FEF08A',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    // Center: Large 2.2x-Scaled 3D-Shaded Angled Cartoon Biplane Sitting on the Runway
    this.previewPlaneContainer = this.add.container(-25, 32);
    this.createPreviewBiplane();

    // Idle bobbing animation
    this.tweens.add({
      targets: this.previewPlaneContainer,
      y: 26,
      duration: 1200,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    // Bottom: Large Glossy 3D Yellow-Orange "TAKE OFF!" Button
    const toBtnY = rpH / 2 - 40;
    this.takeOffBtn = this.add.container(0, toBtnY);

    const toBtnBg = this.add.graphics();
    // 3D bottom bevel
    toBtnBg.fillStyle(0x78350f, 1);
    toBtnBg.fillRoundedRect(-195, -25, 390, 56, 28);
    // 3D glossy orange body
    toBtnBg.fillStyle(0xf59e0b, 1);
    toBtnBg.lineStyle(4, 0x78350f, 1);
    toBtnBg.fillRoundedRect(-195, -29, 390, 52, 26);
    toBtnBg.strokeRoundedRect(-195, -29, 390, 52, 26);
    // Top shine highlight
    toBtnBg.fillStyle(0xfef08a, 0.45);
    toBtnBg.fillRoundedRect(-190, -26, 380, 22, { tl: 22, tr: 22, bl: 0, br: 0 });

    const toTxt = this.add.text(-60, -3, 'TAKE OFF!', {
      fontSize: '23px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#78350f',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    const toFuelIcon = this.add.image(55, -3, 'ui_fuel_canister').setScale(0.85);

    this.toFuelCostText = this.add.text(125, -3, `${gameState.fuel}/5`, {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#FEF08A',
      fontFamily: 'sans-serif',
      stroke: '#78350f',
      strokeThickness: 3.5
    }).setOrigin(0.5, 0.5);

    const toBtnZone = this.add.zone(0, 0, 390, 56).setInteractive({ useHandCursor: true });
    toBtnZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.handleTakeOffClick();
    });

    this.takeOffBtn.add([toBtnBg, toTxt, toFuelIcon, this.toFuelCostText, toBtnZone]);

    this.rightPanelContainer.add([
      previewBackdrop,
      rightBorderGfx,
      recLabelTxt,
      recPillGfx,
      this.airfieldRecordText,
      this.previewPlaneContainer,
      this.takeOffBtn
    ]);

    // 6. Bottom Footer Bar: Thick Recessed Blue Progress Bar
    const footerY = mh / 2 - 28;
    const footerBarW = mw - 40, footerBarH = 34;

    this.footerBarBg = this.add.graphics();
    this.footerBarBg.fillStyle(0x1e3a5f, 0.96);
    this.footerBarBg.lineStyle(3, 0x38bdf8, 1);
    this.footerBarBg.fillRoundedRect(-footerBarW / 2, footerY - footerBarH / 2, footerBarW, footerBarH, 17);
    this.footerBarBg.strokeRoundedRect(-footerBarW / 2, footerY - footerBarH / 2, footerBarW, footerBarH, 17);

    this.footerBarFill = this.add.graphics();

    const footerStarIcon = this.add.image(-footerBarW / 2 + 24, footerY, 'winged_star').setScale(0.42);

    this.footerGoalText = this.add.text(0, footerY, '', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#0f172a',
      strokeThickness: 3
    }).setOrigin(0.5, 0.5);

    // Large 3D Red Gift Box with Yellow Ribbon Overlapping the Right End
    this.footerGiftBox = this.add.image(footerBarW / 2 - 18, footerY, 'ui_gift_box').setScale(0.85);
    this.tweens.add({
      targets: this.footerGiftBox,
      angle: { from: -6, to: 6 },
      duration: 600,
      yoyo: true,
      repeat: -1,
      ease: 'Sine.easeInOut'
    });

    this.footerGiftBox.setInteractive({ useHandCursor: true });
    this.footerGiftBox.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      if (gameState.persistentStars >= gameState.starGoalTarget) {
        const stageIdx = gameState.starGoalIndex;
        const rewardCoins = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_COIN_REWARDS[stageIdx] || 100;
        if (gameState.claimStarReward(stageIdx)) {
          gameState.starGoalIndex++;
          const nextTarget = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_GOALS[gameState.starGoalIndex];
          if (nextTarget) gameState.starGoalTarget = nextTarget;
          this.updateAirfieldFooter();
          this.showToast(`🌟 Milestone Claimed! +${rewardCoins} 🪙 credited!`);
        }
      } else {
        const remaining = gameState.starGoalTarget - gameState.persistentStars;
        this.showToast(`🌟 Collect ${remaining} more stars to unlock this reward!`);
      }
    });

    // 7. Containers for Dual HANGAR vs COMPETITION Tabs
    this.airfieldHangarContainer = this.add.container(0, 0);
    this.airfieldHangarContainer.add([
      leftPanelGfx, this.airfieldProgressGfx, this.airfieldRowsContainer, this.airfieldUpgradeBtn,
      this.rightPanelContainer
    ]);

    this.competitionContainer = this.add.container(0, 0);
    this.competitionContainer.setVisible(false);
    this.createCompetitionView();

    // Assemble Airfield Modal container
    this.airfieldContainer.add([
      overlay, scrimZone, frameGfx,
      roofGfx, helpBtn, helpTxt, helpZone,
      this.tabAirBg, tabAirIcon, this.tabAirTxt, airZone,
      this.tabCompBg, tabCompIcon, this.tabCompTxt, compZone,
      closeBtnGfx, closeTxt, closeZone,
      this.airfieldHangarContainer,
      this.competitionContainer,
      this.footerBarBg, this.footerBarFill, footerStarIcon, this.footerGoalText, this.footerGiftBox
    ]);

    this.renderAirfieldLeftPanel();
    this.updateAirfieldFooter();
  }

  createPreviewBiplane() {
    this.previewPlaneContainer.removeAll(true);

    const tier = gameState.getTier();
    const suffix = tier === 1 ? '' : (tier === 2 ? '_t2' : '_t3');

    // Large 2.2x-scaled biplane components (scale = 1.05)
    const s = 1.05;
    const wings = this.add.image(0, -4, 'plane_wings' + suffix).setScale(s);
    const fuselage = this.add.image(0, 0, 'plane_fuselage' + suffix).setScale(s);
    const scarf = this.add.image(-22, -16, 'plane_scarf').setScale(s);
    const pilot = this.add.image(-8, -28, 'plane_pilot').setScale(s);
    const gear = this.add.image(12, 36, 'plane_gear').setScale(s);
    const cowling = this.add.image(88, 0, 'plane_cowling' + suffix).setScale(s);
    const propeller = this.add.image(116, 0, 'plane_propeller').setScale(s);

    this.previewPlaneContainer.add([wings, fuselage, scarf, pilot, gear, cowling, propeller]);

    // Spin preview propeller
    this.tweens.add({
      targets: propeller,
      angle: 360,
      duration: 800,
      repeat: -1,
      ease: 'Linear'
    });
  }

  renderAirfieldLeftPanel() {
    if (!this.airfieldProgressGfx || !this.airfieldRowsContainer) return;
    this.airfieldProgressGfx.clear();
    this.airfieldRowsContainer.removeAll(true);

    const rowStartY = -170;
    const rowGap = 64;
    const barWidth = 380;
    const barHeight = 16;
    const segmentWidth = 38;
    const segmentGap = 4.2;
    const slant = 4;

    UPGRADE_CATEGORIES.forEach((catKey, index) => {
      const cfg = UPGRADE_CONFIG[catKey];
      const level = (gameState.upgrades && gameState.upgrades[catKey]) || 0;
      const rowY = rowStartY + index * rowGap;

      // 1. Centered Title (NO "LVL X" text!)
      const titleTxt = this.add.text(0, rowY, cfg.title, {
        fontSize: '15px',
        fontStyle: 'bold',
        color: '#1e293b',
        fontFamily: 'sans-serif'
      }).setOrigin(0.5, 0.5);

      this.airfieldRowsContainer.add(titleTxt);

      // 2. Wide, Chunky 9-Segment Angled Parallelogram Progress Bar
      const startX = -barWidth / 2 + this.airfieldRowsContainer.x + 2;
      const barY = rowY + 16 + this.airfieldRowsContainer.y;

      for (let s = 0; s < 9; s++) {
        const sx = startX + s * (segmentWidth + segmentGap);
        const isFilled = s < level;
        const isMaster = level >= 9;

        const fillColor = isMaster ? 0xfacc15 : (isFilled ? 0x4cd92b : 0x476982);
        const strokeColor = isMaster ? 0xb45309 : (isFilled ? 0x15803d : 0x243e54);

        // Segment body
        this.airfieldProgressGfx.fillStyle(fillColor, 1);
        this.airfieldProgressGfx.lineStyle(2, strokeColor, 1);

        this.airfieldProgressGfx.beginPath();
        this.airfieldProgressGfx.moveTo(sx + slant, barY);
        this.airfieldProgressGfx.lineTo(sx + segmentWidth + slant, barY);
        this.airfieldProgressGfx.lineTo(sx + segmentWidth - slant, barY + barHeight);
        this.airfieldProgressGfx.lineTo(sx - slant, barY + barHeight);
        this.airfieldProgressGfx.closePath();
        this.airfieldProgressGfx.fill();
        this.airfieldProgressGfx.stroke();

        // Top glossy bevel on filled segments
        if (isFilled || isMaster) {
          this.airfieldProgressGfx.fillStyle(0xffffff, 0.40);
          this.airfieldProgressGfx.beginPath();
          this.airfieldProgressGfx.moveTo(sx + slant, barY);
          this.airfieldProgressGfx.lineTo(sx + segmentWidth + slant, barY);
          this.airfieldProgressGfx.lineTo(sx + segmentWidth - slant * 0.5, barY + barHeight * 0.45);
          this.airfieldProgressGfx.lineTo(sx - slant * 0.5, barY + barHeight * 0.45);
          this.airfieldProgressGfx.closePath();
          this.airfieldProgressGfx.fill();
        }
      }

      // If Level 10+ (Master), attach gold star badge at right
      if (level >= 9) {
        const starBadge = this.add.image(startX + 9 * (segmentWidth + segmentGap) + 14 - this.airfieldRowsContainer.x, rowY + 24, 'ui_gold_star_badge');
        starBadge.setScale(0.72);
        this.airfieldRowsContainer.add(starBadge);
      }
    });

    // Update notification badge on "UPGRADE" button
    const hasAffordable = gameState.hasAnyAffordableUpgrade();
    this.airfieldBadge.setVisible(hasAffordable);
    if (hasAffordable) {
      this.tweens.add({
        targets: this.airfieldBadge,
        scaleX: 1.15,
        scaleY: 1.15,
        duration: 400,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut'
      });
    }
  }

  updateAirfieldFooter() {
    if (!this.footerBarFill || !this.footerGoalText) return;

    const current = gameState.persistentStars;
    const target = gameState.starGoalTarget;
    const pct = Phaser.Math.Clamp(current / target, 0, 1);

    const mw = 1040, mh = 605;
    const footerY = mh / 2 - 28;
    const footerBarW = mw - 40, footerBarH = 34;

    this.footerBarFill.clear();
    if (pct > 0) {
      this.footerBarFill.fillStyle(0x38bdf8, 1);
      this.footerBarFill.fillRoundedRect(-footerBarW / 2 + 4, footerY - footerBarH / 2 + 3, (footerBarW - 8) * pct, footerBarH - 6, 14);

      // Top Shimmer
      this.footerBarFill.fillStyle(0xffffff, 0.4);
      this.footerBarFill.fillRoundedRect(-footerBarW / 2 + 4, footerY - footerBarH / 2 + 3, (footerBarW - 8) * pct, 8, 4);
    }

    if (current >= target) {
      const stageIdx = gameState.starGoalIndex;
      const rewardCoins = ECONOMY_AND_FUEL_CONFIG.STAR_MILESTONE_COIN_REWARDS[stageIdx] || 100;
      this.footerGoalText.setText(`🌟 GOAL REACHED! TAP GIFT TO CLAIM ${rewardCoins} 🪙`);
      this.footerGoalText.setColor('#FEF08A');
    } else {
      this.footerGoalText.setText(`${current} / ${target}`);
      this.footerGoalText.setColor('#FFFFFF');
    }
    if (this.airfieldRecordText) {
      this.airfieldRecordText.setText(`${Math.floor(gameState.personalBestFt)} FT`);
    }
  }

  onFuelInsufficient() {
    if (this.fuelContainer) {
      this.tweens.add({
        targets: this.fuelContainer,
        x: this.fuelContainer.x + 8,
        duration: 50,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut'
      });
    }
    if (this.takeOffBtn) {
      this.tweens.add({
        targets: this.takeOffBtn,
        x: this.takeOffBtn.x + 8,
        duration: 50,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut'
      });
    }
    this.showToast('⛽ Not enough fuel! Costs 5 Fuel to take off.');
    this.showRefuelModal();
    if (!gameState.isAirfieldMenuOpen) {
      this.showAirfieldModal();
    }
  }

  handleTakeOffClick() {
    if (gameState.consumeFlightFuel()) {
      this.hideAirfieldModal();
      gameState.isAirfieldMenuOpen = false;
      gameState.emit('takeOffClicked');

      // Re-enable in-flight HUD
      this.setInFlightHUDVisible(true);
      this.instructionText.setText('👈 DRAG SLINGSHOT BACK & RELEASE TO LAUNCH');
      this.instructionText.setVisible(true);
      this.instructionText.setAlpha(1);
    } else {
      this.tweens.add({
        targets: this.takeOffBtn,
        x: this.takeOffBtn.x + 8,
        duration: 60,
        yoyo: true,
        repeat: 4,
        ease: 'Sine.easeInOut'
      });
      this.showToast('⛽ Not enough fuel! Costs 5 Fuel to take off.');
    }
  }

  showAirfieldModal() {
    this.tweens.killTweensOf(this.airfieldContainer);
    gameState.isAirfieldMenuOpen = true;
    this.setInFlightHUDVisible(false);
    this.refreshAllUI();
    this.airfieldContainer.setVisible(true);
    this.airfieldContainer.setAlpha(1);
    this.airfieldContainer.setScale(0.85);
    this.tweens.add({
      targets: this.airfieldContainer,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 300,
      ease: 'Back.easeOut'
    });
  }

  hideAirfieldModal() {
    this.tweens.killTweensOf(this.airfieldContainer);
    this.tweens.add({
      targets: this.airfieldContainer,
      scaleX: 0.85,
      scaleY: 0.85,
      alpha: 0,
      duration: 200,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.airfieldContainer.setVisible(false);
        this.airfieldContainer.setAlpha(1);
        gameState.isAirfieldMenuOpen = false;
        this.setInFlightHUDVisible(true);
        if (this.instructionText) {
          if (gameState.isFlightPaidFor) {
            this.instructionText.setText('👈 DRAG SLINGSHOT BACK & RELEASE TO LAUNCH');
          } else if (gameState.fuel >= ECONOMY_AND_FUEL_CONFIG.FUEL_COST_PER_FLIGHT) {
            this.instructionText.setText('👈 DRAG SLINGSHOT TO TAKE OFF (COSTS 5 ⛽)');
          } else {
            this.instructionText.setText('⛽ NEED 5 FUEL TO FLY (REGENERATING...)');
          }
          this.instructionText.setVisible(true);
          this.instructionText.setAlpha(1);
        }
      }
    });
  }

  /* ========================================================================
     (4) ENLARGED AUTHENTIC TOWNSHIP "AIRPLANE UPGRADES" MODAL
     ======================================================================== */

  updateUpgradesMask() {
    if (!this.upgradesMaskGfx || !this.upgradesContainer) return;
    const wellW = 1000;
    const wellH = 430;
    const wellY = 6;
    const cx = this.upgradesContainer.x;
    const cy = this.upgradesContainer.y + wellY;
    this.upgradesMaskGfx.clear();
    this.upgradesMaskGfx.fillStyle(0xffffff);
    this.upgradesMaskGfx.fillRect(
      cx - wellW / 2 + 2,
      cy - wellH / 2 + 2,
      wellW - 4,
      wellH - 4
    );
  }

  createUpgradesModal() {
    const sw = this.scale.width || SCALE.CANVAS_WIDTH;
    const sh = this.scale.height || SCALE.CANVAS_HEIGHT;
    this.upgradesContainer = this.add.container(sw / 2, sh / 2);
    this.upgradesContainer.setDepth(110);
    this.upgradesContainer.setVisible(false);

    // 1. Semi-transparent dark background scrim
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.75);
    overlay.fillRect(-2000, -1200, 4000, 2400);
    const scrimZone = this.add.zone(0, 0, 4000, 2400).setInteractive();
    scrimZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
    });

    // 2. Large Steel-Blue Chassis Frame: 1040 x 615
    const mw = 1040, mh = 615;
    const frameGfx = this.add.graphics();

    frameGfx.fillStyle(0x0a192f, 0.55);
    frameGfx.fillRoundedRect(-mw / 2 + 8, -mh / 2 + 10, mw, mh, 24);

    frameGfx.fillStyle(0x7ba6c2, 1);
    frameGfx.lineStyle(6, 0x243e54, 1);
    frameGfx.fillRoundedRect(-mw / 2, -mh / 2, mw, mh, 20);
    frameGfx.strokeRoundedRect(-mw / 2, -mh / 2, mw, mh, 20);

    // (a) Top Header: Full-Width Warm Cream/Peach Rounded Roof Cap (#fde6be)
    frameGfx.fillStyle(0xfde6be, 1);
    frameGfx.lineStyle(3.5, 0x243e54, 1);
    frameGfx.fillRoundedRect(-mw / 2 + 8, -mh / 2 + 8, mw - 16, 54, 14);
    frameGfx.strokeRoundedRect(-mw / 2 + 8, -mh / 2 + 8, mw - 16, 54, 14);

    const titleTxt = this.add.text(0, -mh / 2 + 35, 'AIRPLANE UPGRADES', {
      fontSize: '25px',
      fontStyle: 'bold',
      color: '#451a03',
      fontFamily: 'sans-serif',
      stroke: '#FFFFFF',
      strokeThickness: 3.5
    }).setOrigin(0.5, 0.5);

    // Red/Orange Circular 'X' Close Button
    const closeBtnGfx = this.add.graphics();
    closeBtnGfx.fillStyle(0xc2410c, 1);
    closeBtnGfx.lineStyle(3.5, 0x7c2d12, 1);
    closeBtnGfx.fillCircle(mw / 2 - 40, -mh / 2 + 35, 19);
    closeBtnGfx.strokeCircle(mw / 2 - 40, -mh / 2 + 35, 19);

    const closeTxt = this.add.text(mw / 2 - 40, -mh / 2 + 34, '✕', {
      fontSize: '19px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const closeZone = this.add.zone(mw / 2 - 40, -mh / 2 + 35, 42, 42).setInteractive({ useHandCursor: true });
    closeZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.exitGame();
    });

    // (b) 3-Card Visible Scrollable Viewport with Geometry Mask
    const wellW = mw - 40; // 1000
    const wellH = 430;
    const wellY = 6;

    const scrollWellBg = this.add.graphics();
    scrollWellBg.fillStyle(0x4c748f, 0.95);
    scrollWellBg.lineStyle(3, 0x243e54, 1);
    scrollWellBg.fillRoundedRect(-wellW / 2, wellY - wellH / 2, wellW, wellH, 14);
    scrollWellBg.strokeRoundedRect(-wellW / 2, wellY - wellH / 2, wellW, wellH, 14);

    // Scrollable container for cards
    this.scrollContainer = this.add.container(0, wellY);

    // Geometry Mask for the scroll viewport
    this.upgradesMaskGfx = this.make.graphics();
    this.updateUpgradesMask();
    this.scrollContainer.setMask(this.upgradesMaskGfx.createGeometryMask());

    // Scroll Limits: 5 cards of height 106 + 12 gap = 578 px
    const cardH = 106;
    const cardGap = 12;
    const totalContentHeight = 5 * (cardH + cardGap) - cardGap;
    const maxScroll = (totalContentHeight - wellH) / 2 + 10;
    this.minScrollY = -maxScroll;
    this.maxScrollY = maxScroll;
    this.scrollContainer.y = wellY + this.maxScrollY;

    // Drag-scrolling without blocking interactive buttons
    this.upgradesIsDragging = false;
    this.upgradesHasDragged = false;
    let dragStartY = 0;
    let startContainerY = 0;

    this.input.on('pointerdown', (p) => {
      if (!this.upgradesContainer || !this.upgradesContainer.visible) return;
      const cx = this.upgradesContainer.x;
      const cy = this.upgradesContainer.y + wellY;
      if (Math.abs(p.x - cx) <= wellW / 2 && Math.abs(p.y - cy) <= wellH / 2) {
        this.upgradesIsDragging = true;
        this.upgradesHasDragged = false;
        dragStartY = p.y;
        startContainerY = this.scrollContainer.y;
      }
    });

    this.input.on('pointermove', (p) => {
      if (this.upgradesIsDragging && this.upgradesContainer && this.upgradesContainer.visible) {
        const delta = p.y - dragStartY;
        if (Math.abs(delta) > 6) {
          this.upgradesHasDragged = true;
        }
        this.scrollContainer.y = Phaser.Math.Clamp(
          startContainerY + delta,
          wellY + this.minScrollY,
          wellY + this.maxScrollY
        );
      }
    });

    const stopDrag = () => {
      this.upgradesIsDragging = false;
    };
    this.input.on('pointerup', stopDrag);
    this.input.on('pointercancel', stopDrag);

    // Mouse wheel support
    this.input.on('wheel', (pointer, gameObjects, deltaX, deltaY) => {
      if (this.upgradesContainer && this.upgradesContainer.visible) {
        this.scrollContainer.y = Phaser.Math.Clamp(
          this.scrollContainer.y - deltaY * 0.7,
          wellY + this.minScrollY,
          wellY + this.maxScrollY
        );
      }
    });

    // (d) Bottom Inventory Bar: 3 Large Recessed Dark-Blue Pill Counters (#4f7894)
    const footY = mh / 2 - 28;
    const pillW = 280, pillH = 46;

    const footPillGfx = this.add.graphics();
    const pillXs = [-300, 0, 300];

    pillXs.forEach((px) => {
      footPillGfx.fillStyle(0x1e3a5f, 0.95);
      footPillGfx.lineStyle(2.5, 0x38bdf8, 1);
      footPillGfx.fillRoundedRect(px - pillW / 2, footY - pillH / 2, pillW, pillH, 23);
      footPillGfx.strokeRoundedRect(px - pillW / 2, footY - pillH / 2, pillW, pillH, 23);
    });

    // 42x42 3D Metallic Icons overlapping left edge of pills
    const boltIcon = this.add.image(pillXs[0] - pillW / 2 + 28, footY, 'part_bolt').setDisplaySize(42, 42);
    this.boltCountText = this.add.text(pillXs[0] + 16, footY, '0', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const cogIcon = this.add.image(pillXs[1] - pillW / 2 + 28, footY, 'part_cog').setDisplaySize(42, 42);
    this.cogCountText = this.add.text(pillXs[1] + 16, footY, '0', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const springIcon = this.add.image(pillXs[2] - pillW / 2 + 28, footY, 'part_spring').setDisplaySize(42, 42);
    this.springCountText = this.add.text(pillXs[2] + 16, footY, '0', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    this.upgradesContainer.add([
      overlay, scrimZone, frameGfx, titleTxt,
      closeBtnGfx, closeTxt, closeZone,
      scrollWellBg, this.scrollContainer,
      footPillGfx,
      boltIcon, this.boltCountText,
      cogIcon, this.cogCountText,
      springIcon, this.springCountText
    ]);

    this.renderUpgradeCards();
  }

  renderUpgradeCards() {
    if (!this.scrollContainer) return;
    this.scrollContainer.removeAll(true);

    const cardW = 960, cardH = 106, cardGap = 12;
    const startY = -((5 * (cardH + cardGap) - cardGap) / 2) + cardH / 2;

    UPGRADE_CATEGORIES.forEach((catKey, index) => {
      const cfg = UPGRADE_CONFIG[catKey];
      const level = (gameState.upgrades && gameState.upgrades[catKey]) || 0;
      const cardY = startY + index * (cardH + cardGap);

      const card = this.add.container(0, cardY);

      // 1. Glossy Light-Blue Body (#bfe3f7) with 3D Border
      const bg = this.add.graphics();
      bg.fillStyle(0xbfe3f7, 1);
      bg.lineStyle(3, 0x7ba6c2, 1);
      bg.fillRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);
      bg.strokeRoundedRect(-cardW / 2, -cardH / 2, cardW, cardH, 14);

      // Top shine
      bg.fillStyle(0xffffff, 0.35);
      bg.fillRoundedRect(-cardW / 2 + 3, -cardH / 2 + 3, cardW - 6, 20, { tl: 12, tr: 12, bl: 0, br: 0 });

      // 2. Left: 78x78 Recessed Blue-Grey Icon Box (#8ab4d0)
      const iconSlot = this.add.graphics();
      iconSlot.fillStyle(0x8ab4d0, 1);
      iconSlot.lineStyle(2.5, 0x5985a3, 1);
      iconSlot.fillRoundedRect(-cardW / 2 + 14, -cardH / 2 + 14, 78, 78, 12);
      iconSlot.strokeRoundedRect(-cardW / 2 + 14, -cardH / 2 + 14, 78, 78, 12);

      const iconImg = this.add.image(-cardW / 2 + 53, 0, cfg.iconKey).setDisplaySize(70, 70);

      // 3. Middle: Title, Stat Line, Description (NO "LVL" text!)
      const textX = -cardW / 2 + 105;

      // Line 1: Bold White Title (22px font, dark-blue drop shadow)
      const titleTxt = this.add.text(textX, -28, cfg.title, {
        fontSize: '22px',
        fontStyle: 'bold',
        color: '#FFFFFF',
        fontFamily: 'sans-serif',
        stroke: '#1e3a5f',
        strokeThickness: 3.5
      }).setOrigin(0, 0.5);

      // Line 2: Dark-Blue Stat Name (#1e3a5f) + Bright Green Bold Upgrade Math (#15803d) (16px font)
      const statData = this.getStatData(catKey, level);
      const statPrefixTxt = this.add.text(textX, -4, statData.prefix, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#1e3a5f',
        fontFamily: 'sans-serif'
      }).setOrigin(0, 0.5);

      const statGainTxt = this.add.text(textX + statPrefixTxt.width + 4, -4, statData.gain, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#15803d',
        fontFamily: 'sans-serif'
      }).setOrigin(0, 0.5);

      // Line 3/4: Bold 13px Uppercase Dark-Blue Description
      const descTxt = this.add.text(textX, 24, cfg.description, {
        fontSize: '12px',
        fontStyle: 'bold',
        color: '#1e3a5f',
        fontFamily: 'sans-serif',
        wordWrap: { width: 490 }
      }).setOrigin(0, 0.5);

      // Attach Master Gold Star Badge if component level >= 9
      let starBadge = null;
      if (level >= 9) {
        starBadge = this.add.image(-cardW / 2 + 84, -cardH / 2 + 18, 'ui_gold_star_badge').setScale(0.85);
      }

      // 4. Right: 210x46 Glossy 3D Green Button + Wide 210px 9-Segment Progress Bar
      const btnX = cardW / 2 - 135;
      const cost = gameState.getUpgradeCost(catKey);
      const canAfford = gameState.canAffordUpgrade(catKey);

      const btnContainer = this.add.container(btnX, -14);
      const btnBg = this.add.graphics();
      const btnW = 210, btnH = 46;

      const btnFill = canAfford ? 0x4cd92b : 0x64748b;
      const btnStroke = canAfford ? 0x15803d : 0x334155;

      btnBg.fillStyle(btnFill, 1);
      btnBg.lineStyle(3, btnStroke, 1);
      btnBg.fillRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 23);
      btnBg.strokeRoundedRect(-btnW / 2, -btnH / 2, btnW, btnH, 23);

      // Top shine highlight
      btnBg.fillStyle(0xffffff, 0.35);
      btnBg.fillRoundedRect(-btnW / 2 + 4, -btnH / 2 + 3, btnW - 8, 16, { tl: 16, tr: 16, bl: 0, br: 0 });

      btnContainer.add(btnBg);

      const partsEntries = Object.entries(cost);
      let partOffsetX = -55;

      partsEntries.forEach(([partName, count]) => {
        const iconKey = `part_${partName.replace(/s$/, '')}`;
        const pIcon = this.add.image(partOffsetX, 0, iconKey).setDisplaySize(34, 34);
        const pTxt = this.add.text(partOffsetX + 24, 0, `${count}`, {
          fontSize: '20px',
          fontStyle: 'bold',
          color: '#FFFFFF',
          fontFamily: 'sans-serif',
          stroke: '#1e293b',
          strokeThickness: 3.5
        }).setOrigin(0, 0.5);

        btnContainer.add([pIcon, pTxt]);
        partOffsetX += 62;
      });

      // Pulsing red '!' badge if affordable
      if (canAfford) {
        const badge = this.add.image(btnW / 2 - 4, -btnH / 2 + 4, 'ui_badge_exclamation').setScale(0.9);
        btnContainer.add(badge);
      }

      const btnZone = this.add.zone(0, 0, btnW, btnH).setInteractive({ useHandCursor: true });
      let downPos = { x: 0, y: 0 };
      btnZone.on('pointerdown', (p) => {
        downPos = { x: p.x, y: p.y };
        btnContainer.setScale(0.96);
        triggerFullscreenAndLandscape();
      });
      btnZone.on('pointerup', (p) => {
        btnContainer.setScale(1.0);
        const dist = Math.hypot(p.x - downPos.x, p.y - downPos.y);
        if (!this.upgradesHasDragged && dist < 14) {
          triggerFullscreenAndLandscape();
          this.handlePurchaseUpgrade(catKey, card);
        }
      });
      btnZone.on('pointerout', () => {
        btnContainer.setScale(1.0);
      });
      btnContainer.add(btnZone);

      // Wide 210px 9-Segment Angled Progress Bar directly beneath green button
      // Level < 9: fills 1..8 in green (0x4cd92b) over dark slate (0x476982)
      // Level 9: all 9 green
      // Level >= 10: restarts filling the 9 segments from segment 1 in bright yellow (#facc15) over dark slate (#476982)
      const pGfx = this.add.graphics();
      const pStartX = btnX - 105;
      const pBarY = 24;
      const segW = 19, segH = 12, segGap = 3, slant = 3;

      for (let s = 0; s < 9; s++) {
        const sx = pStartX + s * (segW + segGap);
        let fColor, sColor;

        if (level >= 10) {
          // Restart filling segments in bright yellow over dark slate
          const yellowSegmentsCount = ((level - 9 - 1) % 9) + 1;
          const isYellow = (s < yellowSegmentsCount);
          fColor = isYellow ? 0xfacc15 : 0x476982;
          sColor = isYellow ? 0xb45309 : 0x243e54;
        } else if (level === 9) {
          // Level 9: all 9 segments completed
          fColor = 0x4cd92b;
          sColor = 0x15803d;
        } else {
          // Level 0..8: standard green progression
          const isFilled = s < level;
          fColor = isFilled ? 0x4cd92b : 0x476982;
          sColor = isFilled ? 0x15803d : 0x243e54;
        }

        pGfx.fillStyle(fColor, 1);
        pGfx.lineStyle(1.5, sColor, 1);
        pGfx.beginPath();
        pGfx.moveTo(sx + slant, pBarY);
        pGfx.lineTo(sx + segW + slant, pBarY);
        pGfx.lineTo(sx + segW - slant, pBarY + segH);
        pGfx.lineTo(sx - slant, pBarY + segH);
        pGfx.closePath();
        pGfx.fill();
        pGfx.stroke();
      }

      const cardElements = [bg, iconSlot, iconImg, titleTxt, statPrefixTxt, statGainTxt, descTxt, btnContainer, pGfx];
      if (starBadge) cardElements.push(starBadge);
      card.add(cardElements);
      this.scrollContainer.add(card);
    });

    // Update bottom footer counts
    this.boltCountText.setText(`${gameState.persistentParts.bolts || 0}`);
    this.cogCountText.setText(`${gameState.persistentParts.cogs || 0}`);
    this.springCountText.setText(`${gameState.persistentParts.springs || 0}`);
  }

  getStatData(category, currentLevel) {
    const nextLevel = currentLevel + 1;
    const cfg = UPGRADE_CONFIG[category];
    const statName = cfg ? cfg.statName : 'PERFORMANCE';
    let curPct, nextPct;
    if (category === 'chassis') {
      curPct = currentLevel * 10;
      nextPct = nextLevel * 10;
    } else {
      curPct = 100 + currentLevel * 10;
      nextPct = 100 + nextLevel * 10;
    }
    return {
      prefix: `${statName}: ${curPct}%`,
      gain: ` ➔ ${nextPct}% (+10%)`
    };
  }

  handlePurchaseUpgrade(category, cardContainer) {
    if (gameState.purchaseUpgrade(category)) {
      this.hideUpgradesModal();
      this.showAirfieldModal();
      this.renderAirfieldLeftPanel();
      this.createPreviewBiplane();
      this.playUpgradeCeremony(category);
    } else {
      this.showToast('⚠️ Not enough parts to upgrade!');
    }
  }

  playUpgradeCeremony(category) {
    if (!this.previewPlaneContainer) return;

    // Anchor wrench sparkle directly in preview biplane container
    const wrench = this.add.image(0, 0, 'ui_wrench_sparkle');
    wrench.setScale(0.3);
    wrench.setDepth(150);
    this.previewPlaneContainer.add(wrench);

    this.tweens.add({
      targets: wrench,
      scaleX: 1.4,
      scaleY: 1.4,
      angle: 360,
      alpha: { from: 1, to: 0 },
      duration: 700,
      ease: 'Back.easeOut',
      onComplete: () => wrench.destroy()
    });

    for (let i = 0; i < 10; i++) {
      const angle = (i * Math.PI) / 5;
      const dist = Phaser.Math.Between(40, 85);
      const spark = this.add.image(
        Math.cos(angle) * dist,
        Math.sin(angle) * dist,
        'star_sparkle'
      ).setScale(0.9).setDepth(150);
      this.previewPlaneContainer.add(spark);

      this.tweens.add({
        targets: spark,
        scaleX: 1.6,
        scaleY: 1.6,
        alpha: { from: 1, to: 0 },
        duration: 600,
        delay: i * 35,
        ease: 'Quad.easeOut',
        onComplete: () => spark.destroy()
      });
    }

    this.tweens.add({
      targets: this.previewPlaneContainer,
      scaleX: 1.2,
      scaleY: 1.2,
      duration: 180,
      yoyo: true,
      ease: 'Sine.easeInOut'
    });
  }

  showUpgradesModal() {
    this.setInFlightHUDVisible(false);
    if (this.airfieldContainer) this.airfieldContainer.setVisible(false);
    this.refreshAllUI();
    this.updateUpgradesMask();
    this.upgradesContainer.setVisible(true);
    this.upgradesContainer.setScale(0.85);
    this.tweens.add({
      targets: this.upgradesContainer,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 280,
      ease: 'Back.easeOut'
    });
  }

  hideUpgradesModal() {
    this.tweens.add({
      targets: this.upgradesContainer,
      scaleX: 0.85,
      scaleY: 0.85,
      alpha: 0,
      duration: 180,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.upgradesContainer.setVisible(false);
        this.upgradesContainer.setAlpha(1);
        if (gameState.isAirfieldMenuOpen) {
          this.showAirfieldModal();
        } else {
          this.setInFlightHUDVisible(true);
        }
      }
    });
  }

  /* ========================================================================
     HELP & COMPETITION POPUP ALERTS & MODAL MANAGEMENT
     ======================================================================== */

  showHelpAlert() {
    this.showToast('✈️ Upgrade your biplane parts to fly farther! Collect tokens and parts during flight.');
  }

  switchAirfieldTab(tab) {
    this.activeAirfieldTab = tab;
    const tabY = -605 / 2 - 6;

    if (tab === 'airfield') {
      if (this.tabAirBg) {
        this.tabAirBg.clear();
        this.tabAirBg.fillStyle(0xfff8e1, 1);
        this.tabAirBg.lineStyle(3.5, 0x243e54, 1);
        this.tabAirBg.fillRoundedRect(-215, tabY - 22, 205, 48, { tl: 12, tr: 12, bl: 0, br: 0 });
        this.tabAirBg.strokeRoundedRect(-215, tabY - 22, 205, 48, { tl: 12, tr: 12, bl: 0, br: 0 });
      }
      if (this.tabAirTxt) this.tabAirTxt.setColor('#451a03');

      if (this.tabCompBg) {
        this.tabCompBg.clear();
        this.tabCompBg.fillStyle(0xcbd5e1, 1);
        this.tabCompBg.lineStyle(3, 0x475569, 1);
        this.tabCompBg.fillRoundedRect(5, tabY - 18, 210, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
        this.tabCompBg.strokeRoundedRect(5, tabY - 18, 210, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
      }
      if (this.tabCompTxt) this.tabCompTxt.setColor('#334155');

      if (this.airfieldHangarContainer) this.airfieldHangarContainer.setVisible(true);
      if (this.competitionContainer) this.competitionContainer.setVisible(false);
    } else {
      if (this.tabAirBg) {
        this.tabAirBg.clear();
        this.tabAirBg.fillStyle(0xcbd5e1, 1);
        this.tabAirBg.lineStyle(3, 0x475569, 1);
        this.tabAirBg.fillRoundedRect(-215, tabY - 18, 205, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
        this.tabAirBg.strokeRoundedRect(-215, tabY - 18, 205, 44, { tl: 12, tr: 12, bl: 0, br: 0 });
      }
      if (this.tabAirTxt) this.tabAirTxt.setColor('#334155');

      if (this.tabCompBg) {
        this.tabCompBg.clear();
        this.tabCompBg.fillStyle(0xfff8e1, 1);
        this.tabCompBg.lineStyle(3.5, 0x243e54, 1);
        this.tabCompBg.fillRoundedRect(5, tabY - 22, 210, 48, { tl: 12, tr: 12, bl: 0, br: 0 });
        this.tabCompBg.strokeRoundedRect(5, tabY - 22, 210, 48, { tl: 12, tr: 12, bl: 0, br: 0 });
      }
      if (this.tabCompTxt) this.tabCompTxt.setColor('#451a03');

      if (this.airfieldHangarContainer) this.airfieldHangarContainer.setVisible(false);
      if (this.competitionContainer) {
        this.competitionContainer.setVisible(true);
        this.renderCompetitionView();
      }
    }
  }

  createCompetitionView() {
    this.competitionContainer.removeAll(true);
    const mw = 1040, mh = 605;
    const cw = mw - 32, ch = 480;
    const cy = 8;

    // Background card (#bae0f5 with dark blue border)
    const cardBg = this.add.graphics();
    cardBg.fillStyle(0xbae0f5, 1);
    cardBg.lineStyle(3.5, 0x243e54, 1);
    cardBg.fillRoundedRect(-cw / 2, cy - ch / 2, cw, ch, 14);
    cardBg.strokeRoundedRect(-cw / 2, cy - ch / 2, cw, ch, 14);

    // Inner header banner
    const headBg = this.add.graphics();
    headBg.fillStyle(0x1e3a5f, 0.95);
    headBg.lineStyle(2, 0x38bdf8, 1);
    headBg.fillRoundedRect(-cw / 2 + 16, cy - ch / 2 + 12, cw - 32, 54, 10);
    headBg.strokeRoundedRect(-cw / 2 + 16, cy - ch / 2 + 12, cw - 32, 54, 10);

    const headTitle = this.add.text(-cw / 2 + 36, cy - ch / 2 + 28, '🏆 WEEKLY TOURNAMENT', {
      fontSize: '20px',
      fontStyle: 'bold',
      color: '#FEF08A',
      fontFamily: 'sans-serif'
    }).setOrigin(0, 0.5);

    this.compCountdownText = this.add.text(cw / 2 - 36, cy - ch / 2 + 28, '⏰ Resets Sunday at 2:30 PM', {
      fontSize: '14px',
      fontStyle: 'bold',
      color: '#86EFAC',
      fontFamily: 'sans-serif'
    }).setOrigin(1, 0.5);

    const headSub = this.add.text(-cw / 2 + 36, cy - ch / 2 + 50, 'Farthest flight distance wins! Upgrades & parts reset every Sunday at 2:30 PM.', {
      fontSize: '12px',
      color: '#E0F2FE',
      fontFamily: 'sans-serif'
    }).setOrigin(0, 0.5);

    // Grand Prizes Row (5 slots)
    const prizeY = cy - ch / 2 + 94;
    const prizeBg = this.add.graphics();
    prizeBg.fillStyle(0xfff8e1, 0.95);
    prizeBg.lineStyle(2, 0xd97706, 1);
    prizeBg.fillRoundedRect(-cw / 2 + 16, prizeY - 18, cw - 32, 52, 10);
    prizeBg.strokeRoundedRect(-cw / 2 + 16, prizeY - 18, cw - 32, 52, 10);

    const prizeSlots = [
      { rank: '🥇 1st Place', coins: '5,000 🪙' },
      { rank: '🥈 2nd Place', coins: '3,000 🪙' },
      { rank: '🥉 3rd Place', coins: '1,500 🪙' },
      { rank: '🎖️ 4th Place', coins: '1,000 🪙' },
      { rank: '🎖️ 5th Place', coins: '500 🪙' }
    ];

    const slotW = (cw - 48) / prizeSlots.length;
    const prizeTexts = [];
    prizeSlots.forEach((p, idx) => {
      const px = -cw / 2 + 24 + idx * slotW + slotW / 2;
      const rankTxt = this.add.text(px, prizeY - 4, p.rank, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#78350f',
        fontFamily: 'sans-serif'
      }).setOrigin(0.5, 0.5);
      const coinTxt = this.add.text(px, prizeY + 14, p.coins, {
        fontSize: '13px',
        fontStyle: 'bold',
        color: '#15803d',
        fontFamily: 'sans-serif'
      }).setOrigin(0.5, 0.5);
      prizeTexts.push(rankTxt, coinTxt);
    });

    // Player personal best highlight bar
    const pbY = cy - ch / 2 + 154;
    const pbBg = this.add.graphics();
    pbBg.fillStyle(0x0284c7, 0.92);
    pbBg.lineStyle(2, 0xbae0f5, 1);
    pbBg.fillRoundedRect(-cw / 2 + 16, pbY - 14, cw - 32, 38, 8);
    pbBg.strokeRoundedRect(-cw / 2 + 16, pbY - 14, cw - 32, 38, 8);

    this.compUserBestText = this.add.text(-cw / 2 + 36, pbY + 5, `👤 Your Best: ${Math.floor(gameState.personalBestFt)} FT`, {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0, 0.5);

    this.compUserRankText = this.add.text(cw / 2 - 36, pbY + 5, 'Current Rank: --', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#FEF08A',
      fontFamily: 'sans-serif'
    }).setOrigin(1, 0.5);

    // Leaderboard entries list container
    this.compEntriesContainer = this.add.container(0, pbY + 30);

    this.competitionContainer.add([
      cardBg, headBg, headTitle, this.compCountdownText, headSub,
      prizeBg, ...prizeTexts, pbBg, this.compUserBestText, this.compUserRankText,
      this.compEntriesContainer
    ]);
  }

  renderCompetitionView() {
    if (!this.compEntriesContainer) return;
    this.compEntriesContainer.removeAll(true);

    const cycle = getAerialWeeklyCycle();
    const hoursRemaining = Math.floor(cycle.msRemaining / (1000 * 60 * 60));
    const days = Math.floor(hoursRemaining / 24);
    const hrs = hoursRemaining % 24;
    const mins = Math.floor((cycle.msRemaining % (1000 * 60 * 60)) / (1000 * 60));
    if (this.compCountdownText) {
      this.compCountdownText.setText(`⏰ Resets Sunday 2:30 PM (${days}d ${hrs}h ${mins}m left)`);
    }

    if (this.compUserBestText) {
      this.compUserBestText.setText(`👤 Your Best Distance: ${Math.floor(gameState.personalBestFt)} FT`);
    }

    let entries = [];
    if (typeof window !== 'undefined') {
      entries = (window.parent && window.parent._aerialLeaderboard) || window._aerialLeaderboard || [];
    }

    if (!entries || entries.length === 0) {
      entries = [
        { rank: 1, name: 'Ron Weasley', avatar: '🧙', townName: 'Hogwarts', bestDistanceFt: 1450 },
        { rank: 2, name: 'Hermione Granger', avatar: '✨', townName: 'Hogwarts', bestDistanceFt: 1220 },
        { rank: 3, name: 'Harry Potter', avatar: '⚡', townName: 'Godric', bestDistanceFt: 980 },
        { rank: 4, name: 'Neville Longbottom', avatar: '🌱', townName: 'Hogwarts', bestDistanceFt: 750 },
        { rank: 5, name: 'Luna Lovegood', avatar: '🦅', townName: 'Ravenclaw', bestDistanceFt: 580 }
      ];
    }

    const userFt = Math.floor(gameState.personalBestFt);
    let userRank = 1;
    entries.forEach((e) => {
      if ((e.bestDistanceFt || 0) > userFt) userRank++;
    });
    if (this.compUserRankText) {
      this.compUserRankText.setText(`Current Rank: #${userRank}`);
    }

    const rowH = 44;
    const cw = 1040 - 32;

    entries.slice(0, 5).forEach((entry, i) => {
      const rowY = i * (rowH + 6);
      const rowGfx = this.add.graphics();
      const isTop3 = i < 3;
      rowGfx.fillStyle(isTop3 ? 0xffffff : 0xf1f5f9, 0.95);
      rowGfx.lineStyle(1.5, isTop3 ? 0x0284c7 : 0x94a3b8, 1);
      rowGfx.fillRoundedRect(-cw / 2 + 16, rowY, cw - 32, rowH, 8);
      rowGfx.strokeRoundedRect(-cw / 2 + 16, rowY, cw - 32, rowH, 8);

      const rankMedals = ['🥇', '🥈', '🥉', '4️⃣', '5️⃣'];
      const rankIcon = rankMedals[i] || `#${i + 1}`;

      const rankTxt = this.add.text(-cw / 2 + 36, rowY + rowH / 2, rankIcon, {
        fontSize: '20px'
      }).setOrigin(0, 0.5);

      const avatarTxt = this.add.text(-cw / 2 + 76, rowY + rowH / 2, entry.avatar || '🧙', {
        fontSize: '20px'
      }).setOrigin(0, 0.5);

      const nameTxt = this.add.text(-cw / 2 + 115, rowY + rowH / 2, `${entry.name || 'Player'} (${entry.townName || 'Town'})`, {
        fontSize: '16px',
        fontStyle: 'bold',
        color: '#1e293b',
        fontFamily: 'sans-serif'
      }).setOrigin(0, 0.5);

      const distTxt = this.add.text(cw / 2 - 36, rowY + rowH / 2, `${Math.floor(entry.bestDistanceFt || 0)} FT`, {
        fontSize: '17px',
        fontStyle: 'bold',
        color: '#0369a1',
        fontFamily: 'sans-serif'
      }).setOrigin(1, 0.5);

      this.compEntriesContainer.add([rowGfx, rankTxt, avatarTxt, nameTxt, distTxt]);
    });
  }

  createRefuelModal() {
    const sw = this.scale.width || SCALE.CANVAS_WIDTH;
    const sh = this.scale.height || SCALE.CANVAS_HEIGHT;
    this.refuelContainer = this.add.container(sw / 2, sh / 2);
    this.refuelContainer.setDepth(150);
    this.refuelContainer.setVisible(false);

    // Scrim
    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.72);
    overlay.fillRect(-2000, -1200, 4000, 2400);
    const scrimZone = this.add.zone(0, 0, 4000, 2400).setInteractive();
    scrimZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
    });

    const rw = 520, rh = 340;
    const boxGfx = this.add.graphics();
    boxGfx.fillStyle(0x1e293b, 1);
    boxGfx.lineStyle(4, 0x38bdf8, 1);
    boxGfx.fillRoundedRect(-rw / 2, -rh / 2, rw, rh, 18);
    boxGfx.strokeRoundedRect(-rw / 2, -rh / 2, rw, rh, 18);

    const titleTxt = this.add.text(0, -rh / 2 + 40, '⛽ REFUEL BIPLANE', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#FEF08A',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const descTxt = this.add.text(0, -rh / 2 + 82, 'Each flight costs 5 Gas Cans.\n1 Gas Can costs 1 Coin.', {
      fontSize: '15px',
      align: 'center',
      color: '#E2E8F0',
      fontFamily: 'sans-serif',
      lineSpacing: 4
    }).setOrigin(0.5, 0.5);

    this.refuelStatusText = this.add.text(0, -rh / 2 + 135, '', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#86EFAC',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    // Close '✕' Button
    const closeGfx = this.add.graphics();
    closeGfx.fillStyle(0xc2410c, 1);
    closeGfx.lineStyle(2, 0x7c2d12, 1);
    closeGfx.fillCircle(rw / 2 - 28, -rh / 2 + 28, 16);
    closeGfx.strokeCircle(rw / 2 - 28, -rh / 2 + 28, 16);
    const closeTxt = this.add.text(rw / 2 - 28, -rh / 2 + 28, '✕', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);
    const closeZone = this.add.zone(rw / 2 - 28, -rh / 2 + 28, 36, 36).setInteractive({ useHandCursor: true });
    closeZone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      this.hideRefuelModal();
    });

    // Button 1: Buy 5 Gas Cans (5 🪙)
    const btn1 = this.add.container(0, 30);
    const btn1Gfx = this.add.graphics();
    btn1Gfx.fillStyle(0x0284c7, 1);
    btn1Gfx.lineStyle(2.5, 0x075985, 1);
    btn1Gfx.fillRoundedRect(-180, -22, 360, 44, 12);
    btn1Gfx.strokeRoundedRect(-180, -22, 360, 44, 12);
    const btn1Txt = this.add.text(0, 0, 'Buy 5 Gas Cans (5 🪙)', {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);
    const btn1Zone = this.add.zone(0, 0, 360, 44).setInteractive({ useHandCursor: true });
    btn1Zone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      gameState.buyGasCans(5);
      this.hideRefuelModal();
      this.showToast('⛽ Purchasing 5 Gas Cans...');
    });
    btn1.add([btn1Gfx, btn1Txt, btn1Zone]);

    // Button 2: Fill Tank to 25 Gas Cans
    const btn2 = this.add.container(0, 95);
    const btn2Gfx = this.add.graphics();
    btn2Gfx.fillStyle(0x16a34a, 1);
    btn2Gfx.lineStyle(2.5, 0x14532d, 1);
    btn2Gfx.fillRoundedRect(-180, -22, 360, 44, 12);
    btn2Gfx.strokeRoundedRect(-180, -22, 360, 44, 12);
    this.refuelBtn2Text = this.add.text(0, 0, 'Fill Tank to 25 Cans', {
      fontSize: '17px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);
    const btn2Zone = this.add.zone(0, 0, 360, 44).setInteractive({ useHandCursor: true });
    btn2Zone.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      const needed = Math.max(1, 25 - gameState.fuel);
      gameState.buyGasCans(needed);
      this.hideRefuelModal();
      this.showToast(`⛽ Filling Tank (+${needed} Gas Cans)...`);
    });
    btn2.add([btn2Gfx, this.refuelBtn2Text, btn2Zone]);

    this.refuelContainer.add([
      overlay, scrimZone, boxGfx, titleTxt, descTxt,
      this.refuelStatusText, closeGfx, closeTxt, closeZone,
      btn1, btn2
    ]);
  }

  showRefuelModal() {
    if (!this.refuelContainer) return;
    const needed = Math.max(1, 25 - gameState.fuel);
    if (this.refuelStatusText) {
      this.refuelStatusText.setText(`Current Fuel: ${gameState.fuel} / 25 Gas Cans`);
    }
    if (this.refuelBtn2Text) {
      this.refuelBtn2Text.setText(`Fill Tank (+${needed} Cans • ${needed} 🪙)`);
    }
    this.refuelContainer.setVisible(true);
    this.refuelContainer.setScale(0.85);
    this.tweens.add({
      targets: this.refuelContainer,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 250,
      ease: 'Back.easeOut'
    });
  }

  hideRefuelModal() {
    if (!this.refuelContainer) return;
    this.tweens.add({
      targets: this.refuelContainer,
      scaleX: 0.85,
      scaleY: 0.85,
      duration: 150,
      ease: 'Sine.easeIn',
      onComplete: () => {
        this.refuelContainer.setVisible(false);
      }
    });
  }

  exitGame() {
    if (typeof window !== 'undefined') {
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({ type: 'EXIT_AERIAL_GAME' }, '*');
      }
      if (typeof window.exitAerialGame === 'function') {
        window.exitAerialGame();
      }
    }
  }

  showToast(message) {
    if (this.toastText) this.toastText.destroy();

    const screenW = this.scale.width || SCALE.CANVAS_WIDTH;
    this.toastText = this.add.text(screenW / 2, 85, message, {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif',
      stroke: '#0F172A',
      strokeThickness: 3.5,
      backgroundColor: 'rgba(15, 23, 42, 0.92)',
      padding: { x: 20, y: 12 }
    }).setOrigin(0.5, 0.5).setDepth(200);

    this.time.delayedCall(2500, () => {
      if (this.toastText) {
        this.tweens.add({
          targets: this.toastText,
          alpha: 0,
          duration: 400,
          onComplete: () => {
            this.toastText?.destroy();
            this.toastText = null;
          }
        });
      }
    });
  }

  refreshAllUI() {
    this.updateFuelHUD();
    this.renderAirfieldLeftPanel();
    this.updateAirfieldFooter();
    this.renderUpgradeCards();
  }

  /* ========================================================================
     RESULTS DIALOG & FLIGHT COMPLETION
     ======================================================================== */

  createResultsDialog() {
    this.resultsContainer = this.add.container(SCALE.CANVAS_WIDTH / 2, SCALE.CANVAS_HEIGHT / 2);
    this.resultsContainer.setVisible(false);
    this.resultsContainer.setDepth(100);

    const overlay = this.add.graphics();
    overlay.fillStyle(0x000000, 0.65);
    overlay.fillRect(-SCALE.CANVAS_WIDTH / 2, -SCALE.CANVAS_HEIGHT / 2, SCALE.CANVAS_WIDTH, SCALE.CANVAS_HEIGHT);

    const card = this.add.graphics();
    card.fillStyle(0xfff8e1, 1);
    card.lineStyle(5, 0x5d4037, 1);
    card.fillRoundedRect(-220, -150, 440, 300, 20);
    card.strokeRoundedRect(-220, -150, 440, 300, 20);

    this.resultsTitle = this.add.text(0, -110, 'YOUR FLIGHT IS OVER!', {
      fontSize: '24px',
      fontStyle: 'bold',
      color: '#D93829',
      fontFamily: 'sans-serif',
      stroke: '#FFFFFF',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    this.resultsAirborne = this.add.text(0, -60, 'Touchdown: 0 FT', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#37474F',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    this.resultsTaxi = this.add.text(0, -30, 'Taxi Roll: +0 FT', {
      fontSize: '18px',
      fontStyle: 'bold',
      color: '#5D4037',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    this.resultsTotal = this.add.text(0, 10, 'TOTAL: 0 FT', {
      fontSize: '26px',
      fontStyle: 'bold',
      color: '#F57F17',
      fontFamily: 'sans-serif',
      stroke: '#5D4037',
      strokeThickness: 4
    }).setOrigin(0.5, 0.5);

    this.resultsItems = this.add.text(0, 42, 'Stars: 0   Parts: 0', {
      fontSize: '15px',
      fontStyle: 'bold',
      color: '#5D4037',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const btnBg = this.add.graphics();
    btnBg.fillStyle(0x4caf50, 1);
    btnBg.lineStyle(3, 0x2e7d32, 1);
    btnBg.fillRoundedRect(-110, 72, 220, 46, 23);
    btnBg.strokeRoundedRect(-110, 72, 220, 46, 23);

    const btnText = this.add.text(0, 95, 'COLLECT & UPGRADE', {
      fontSize: '16px',
      fontStyle: 'bold',
      color: '#FFFFFF',
      fontFamily: 'sans-serif'
    }).setOrigin(0.5, 0.5);

    const hitArea = this.add.zone(0, 95, 220, 46).setInteractive({ useHandCursor: true });
    hitArea.on('pointerdown', (p) => {
      p.event?.stopPropagation?.();
      triggerFullscreenAndLandscape();
      this.resultsContainer.setVisible(false);
      gameState.reset();
      this.starText.setText('0');
      gameState.emit('resetFlight');
      this.showAirfieldModal();
    });

    this.resultsContainer.add([
      overlay, card, this.resultsTitle,
      this.resultsAirborne, this.resultsTaxi, this.resultsTotal, this.resultsItems,
      btnBg, btnText, hitArea
    ]);
  }

  showFlightResults(results) {
    this.resultsAirborne.setText(`Touchdown: ${Math.floor(results.airborneFt)} FT`);
    this.resultsTaxi.setText(`Taxi Roll: +${Math.floor(results.taxiFt)} FT`);
    this.resultsTotal.setText(`TOTAL: ${Math.floor(results.totalDistanceFt)} FT`);

    const parts = results.parts || gameState.parts || {};
    const totalParts = (parts.bolts || 0) + (parts.cogs || 0) + (parts.springs || 0);
    this.resultsItems.setText(`Stars: ${results.tokens !== undefined ? results.tokens : gameState.sessionStars}   Parts: ${totalParts}`);

    if (results.isNewRecord) {
      this.resultsTitle.setText('NEW RECORD!');
    } else {
      this.resultsTitle.setText('YOUR FLIGHT IS OVER!');
    }

    this.resultsContainer.setVisible(true);
    this.resultsContainer.setScale(0.8);
    this.tweens.add({
      targets: this.resultsContainer,
      scaleX: 1.0,
      scaleY: 1.0,
      duration: 350,
      ease: 'Back.easeOut'
    });
  }

  onDistanceUpdate(dist) {
    this.distanceText.setText(`${Math.floor(dist.total)} FT`);
  }

  onEnergyChange(energy) {
    const scale = Phaser.Math.Clamp(energy / 100, 0, 1);
    this.boosterFill.setScale(scale, 1);

    if (energy < 18 && energy > 0) {
      this.boosterFill.setTint(0xff5722);
    } else {
      this.boosterFill.clearTint();
    }
  }

  onStateChange({ oldState, newState }) {
    if (newState === FLIGHT_STATE.LAUNCHING) {
      this.instructionText.setText('👆 HOLD / TAP SCREEN TO BOOST ALTITUDE');
      this.time.delayedCall(3000, () => {
        this.tweens.add({
          targets: this.instructionText,
          alpha: 0,
          duration: 600,
          onComplete: () => this.instructionText.setVisible(false)
        });
      });
    }
  }

  onStarCollected(data) {
    this.starText.setText(`${data.stars}`);
    this.tweens.add({
      targets: this.starContainer,
      scaleX: 1.25,
      scaleY: 1.25,
      duration: 140,
      yoyo: true,
      ease: 'Sine.easeInOut'
    });
  }
}
