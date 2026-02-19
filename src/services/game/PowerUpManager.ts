/**
 * PowerUpManager.ts
 *
 * Manages power-up spawning, collection, and effects.
 */

import { PowerUp, EndlessRaceState, PlayerState } from '../../types/game';
import { v4 as uuidv4 } from 'uuid';

// Power-up effect durations (in milliseconds)
const POWERUP_DURATIONS = {
  BOOST: 5000, // 5 seconds
  SHIELD: 0, // Lasts until hit
  SLOW_OTHERS: 3000, // 3 seconds
};

// Power-up effect multipliers
const POWERUP_EFFECTS = {
  BOOST: 1.5, // +50% speed
  SHIELD: 1.0, // No speed change, just immunity
  SLOW_OTHERS: 0.7, // -30% speed for others
};

const SPAWN_CONFIG = {
  interval: 5000, // ms between spawns (less frequent than obstacles)
  minDistance: 60, // min distance from furthest player
  maxActive: 10, // max power-ups on track
  probability: 0.3, // 30% chance to spawn when interval passes
  laneWidth: 5,
  laneCount: 3,
};

interface ActivePowerUpEffect {
  playerId: string;
  type: 'BOOST' | 'SHIELD' | 'SLOW_OTHERS';
  startTime: number;
  duration: number;
}

export class PowerUpManager {
  private lastSpawnTime: number = 0;
  private activePowerUpEffects: Map<string, ActivePowerUpEffect[]> = new Map();

  /**
   * Spawn a new power-up if conditions are met
   */
  public spawnPowerUp(state: EndlessRaceState, currentTime: number): PowerUp | null {
    // Check if enough time has passed
    if (currentTime - this.lastSpawnTime < SPAWN_CONFIG.interval) {
      return null;
    }

    // Probability check
    if (Math.random() > SPAWN_CONFIG.probability) {
      this.lastSpawnTime = currentTime;
      return null;
    }

    // Check if max power-ups reached
    const activePowerUps = state.powerUps.filter((p) => !p.collected);
    if (activePowerUps.length >= SPAWN_CONFIG.maxActive) {
      return null;
    }

    // Find furthest player position
    const furthestZ = this.getFurthestPlayerPosition(state);

    // Spawn ahead of furthest player
    const spawnZ = furthestZ + SPAWN_CONFIG.minDistance;

    // Random power-up type
    const powerUpType = this.selectRandomPowerUpType();

    // Random lane (center of lane)
    const lane = Math.floor(Math.random() * SPAWN_CONFIG.laneCount);
    const laneX = (lane - 1) * SPAWN_CONFIG.laneWidth;

    const powerUp: PowerUp = {
      id: uuidv4(),
      position: {
        x: laneX,
        y: 0.5, // Slightly elevated
        z: spawnZ,
      },
      type: powerUpType,
      collected: false,
    };

    this.lastSpawnTime = currentTime;
    return powerUp;
  }

  /**
   * Apply power-up effect to player
   */
  public applyPowerUp(
    player: PlayerState,
    powerUp: PowerUp,
    state: EndlessRaceState,
    currentTime: number
  ): void {
    const effect: ActivePowerUpEffect = {
      playerId: player.playerId,
      type: powerUp.type,
      startTime: currentTime,
      duration: POWERUP_DURATIONS[powerUp.type],
    };

    // Get or create player's active effects
    if (!this.activePowerUpEffects.has(player.playerId)) {
      this.activePowerUpEffects.set(player.playerId, []);
    }

    const playerEffects = this.activePowerUpEffects.get(player.playerId)!;

    // Handle different power-up types
    switch (powerUp.type) {
      case 'BOOST':
        // Remove existing boost (don't stack)
        const existingBoost = playerEffects.findIndex((e) => e.type === 'BOOST');
        if (existingBoost !== -1) {
          playerEffects.splice(existingBoost, 1);
        }
        playerEffects.push(effect);
        break;

      case 'SHIELD':
        // Shield lasts until hit (managed by collision system)
        playerEffects.push(effect);
        break;

      case 'SLOW_OTHERS':
        // Apply slow effect to all other players
        for (const otherPlayer of state.players) {
          if (otherPlayer.playerId !== player.playerId) {
            if (!this.activePowerUpEffects.has(otherPlayer.playerId)) {
              this.activePowerUpEffects.set(otherPlayer.playerId, []);
            }
            this.activePowerUpEffects.get(otherPlayer.playerId)!.push({
              playerId: otherPlayer.playerId,
              type: 'SLOW_OTHERS',
              startTime: currentTime,
              duration: POWERUP_DURATIONS.SLOW_OTHERS,
            });
          }
        }
        break;
    }
  }

  /**
   * Update active power-up effects and remove expired ones
   */
  public updatePowerUpEffects(currentTime: number): void {
    for (const [playerId, effects] of this.activePowerUpEffects.entries()) {
      // Filter out expired effects
      const activeEffects = effects.filter((effect) => {
        if (effect.duration === 0) return true; // Shield lasts until removed manually
        return currentTime - effect.startTime < effect.duration;
      });

      if (activeEffects.length > 0) {
        this.activePowerUpEffects.set(playerId, activeEffects);
      } else {
        this.activePowerUpEffects.delete(playerId);
      }
    }
  }

  /**
   * Get active speed multiplier for player
   */
  public getSpeedMultiplier(playerId: string): number {
    const effects = this.activePowerUpEffects.get(playerId) || [];
    let multiplier = 1.0;

    for (const effect of effects) {
      if (effect.type === 'BOOST') {
        multiplier *= POWERUP_EFFECTS.BOOST;
      } else if (effect.type === 'SLOW_OTHERS') {
        multiplier *= POWERUP_EFFECTS.SLOW_OTHERS;
      }
    }

    return multiplier;
  }

  /**
   * Check if player has shield active
   */
  public hasShield(playerId: string): boolean {
    const effects = this.activePowerUpEffects.get(playerId) || [];
    return effects.some((e) => e.type === 'SHIELD');
  }

  /**
   * Remove shield from player
   */
  public removeShield(playerId: string): void {
    const effects = this.activePowerUpEffects.get(playerId);
    if (effects) {
      const shieldIndex = effects.findIndex((e) => e.type === 'SHIELD');
      if (shieldIndex !== -1) {
        effects.splice(shieldIndex, 1);
      }
    }
  }

  /**
   * Clean up collected power-ups
   */
  public cleanupPowerUps(state: EndlessRaceState): PowerUp[] {
    const furthestBackPlayer = this.getFurthestBackPlayerPosition(state);
    const cleanupThreshold = furthestBackPlayer - 20;

    return state.powerUps.filter(
      (powerUp) => !powerUp.collected && powerUp.position.z > cleanupThreshold
    );
  }

  /**
   * Select random power-up type with equal probability
   */
  private selectRandomPowerUpType(): 'BOOST' | 'SHIELD' | 'SLOW_OTHERS' {
    const types: ('BOOST' | 'SHIELD' | 'SLOW_OTHERS')[] = ['BOOST', 'SHIELD', 'SLOW_OTHERS'];
    return types[Math.floor(Math.random() * types.length)];
  }

  /**
   * Get the Z position of the furthest player
   */
  private getFurthestPlayerPosition(state: EndlessRaceState): number {
    if (state.players.length === 0) return 0;
    return Math.max(...state.players.map((p) => p.position.z));
  }

  /**
   * Get the Z position of the furthest back player
   */
  private getFurthestBackPlayerPosition(state: EndlessRaceState): number {
    if (state.players.length === 0) return 0;
    return Math.min(...state.players.map((p) => p.position.z));
  }

  /**
   * Get all active effects for a player
   */
  public getActiveEffects(playerId: string): ActivePowerUpEffect[] {
    return this.activePowerUpEffects.get(playerId) || [];
  }

  /**
   * Reset all power-up effects
   */
  public reset(): void {
    this.lastSpawnTime = 0;
    this.activePowerUpEffects.clear();
  }
}
