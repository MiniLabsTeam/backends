/**
 * EndlessRaceEngine.ts
 *
 * Game logic for Endless Race mode.
 * Players race on an infinite track, avoiding obstacles and collecting power-ups.
 * Winner is determined by who survives longest or travels furthest.
 */

import {
  EndlessRaceState,
  PlayerState,
  PlayerInput,
} from '../../types/game';
import { PhysicsEngine } from './PhysicsEngine';
import { ObstacleManager } from './ObstacleManager';
import { PowerUpManager } from './PowerUpManager';
import logger from '../../config/logger';

const GAME_CONFIG = {
  maxDuration: 300000, // 5 minutes max
  trackWidth: 15, // 3 lanes x 5 units
  playerCollisionSize: { x: 2, y: 1, z: 2 }, // Player bounding box
  powerUpCollisionSize: { x: 1, y: 1, z: 1 }, // Power-up collection radius
  eliminationPenalty: -100, // Z position when eliminated
};

export class EndlessRaceEngine {
  private obstacleManager: ObstacleManager;
  private powerUpManager: PowerUpManager;
  private startTime: number = 0;

  constructor() {
    this.obstacleManager = new ObstacleManager();
    this.powerUpManager = new PowerUpManager();
  }

  /**
   * Initialize game state
   */
  public initializeState(roomId: string, players: PlayerState[]): EndlessRaceState {
    this.startTime = Date.now();
    this.obstacleManager.reset();
    this.powerUpManager.reset();

    return {
      roomId,
      gameMode: 'ENDLESS_RACE',
      players: players.map((p) => ({
        ...p,
        position: { x: 0, y: 0, z: 0 },
        velocity: { x: 0, y: 0, z: 0 },
        rotation: 0,
        speed: 0,
        lane: 1, // Start in middle lane (0=left, 1=middle, 2=right)
        checkpoints: 0,
        isFinished: false,
      })),
      timestamp: Date.now(),
      gameTime: 0,
      status: 'RACING',
      trackSection: 0,
      obstacles: [],
      powerUps: [],
    };
  }

  /**
   * Main game loop update - called every tick
   */
  public update(state: EndlessRaceState, deltaTime: number): EndlessRaceState {
    const currentTime = Date.now();
    state.gameTime = currentTime - this.startTime;
    state.timestamp = currentTime;

    // Update power-up effects (remove expired)
    this.powerUpManager.updatePowerUpEffects(currentTime);

    // Update each player
    for (const player of state.players) {
      if (!player.isFinished) {
        this.updatePlayer(player, state, deltaTime, currentTime);
      }
    }

    // Spawn obstacles
    const newObstacle = this.obstacleManager.spawnObstacle(state, currentTime);
    if (newObstacle) {
      state.obstacles.push(newObstacle);
    }

    // Spawn power-ups
    const newPowerUp = this.powerUpManager.spawnPowerUp(state, currentTime);
    if (newPowerUp) {
      state.powerUps.push(newPowerUp);
    }

    // Cleanup old obstacles and power-ups
    state.obstacles = this.obstacleManager.cleanupObstacles(state);
    state.powerUps = this.powerUpManager.cleanupPowerUps(state);

    // Check collisions
    this.checkAllCollisions(state, currentTime);

    // Update track section based on furthest player
    const furthestZ = Math.max(...state.players.map((p) => p.position.z));
    state.trackSection = Math.floor(furthestZ / 100);

    // Update rankings
    this.updateRankings(state);

    return state;
  }

  /**
   * Process player input
   */
  public processInput(state: EndlessRaceState, input: PlayerInput): void {
    const player = state.players.find((p) => p.playerId === input.playerId);
    if (!player || player.isFinished) return;

    const currentLane = player.lane ?? 1;
    const LANE_WIDTH = 5;

    if (input.action === 'TURN_LEFT' && currentLane > 0) {
      player.lane = currentLane - 1;
      player.position.x = (player.lane - 1) * LANE_WIDTH;
    } else if (input.action === 'TURN_RIGHT' && currentLane < 2) {
      player.lane = currentLane + 1;
      player.position.x = (player.lane - 1) * LANE_WIDTH;
    }
  }

  /**
   * Update single player state
   */
  private updatePlayer(
    player: PlayerState,
    _state: EndlessRaceState,
    deltaTime: number,
    _currentTime: number
  ): void {
    // Get active power-up speed multiplier
    const speedMultiplier = this.powerUpManager.getSpeedMultiplier(player.playerId);

    // Update velocity (apply physics)
    const baseVelocity = PhysicsEngine.updateVelocity(player, null, deltaTime / 1000);

    // Apply speed multiplier from power-ups
    player.velocity = {
      x: baseVelocity.x * speedMultiplier,
      y: baseVelocity.y * speedMultiplier,
      z: baseVelocity.z * speedMultiplier,
    };

    // Always accelerate forward in Endless Race (auto-run)
    const forwardForce = player.stats.acceleration * (deltaTime / 1000) * speedMultiplier;
    player.velocity.z += forwardForce;

    // Cap at max speed
    const currentSpeed = PhysicsEngine.getSpeed(player.velocity);
    const maxSpeed = player.stats.speed * speedMultiplier;
    if (currentSpeed > maxSpeed) {
      const scale = maxSpeed / currentSpeed;
      player.velocity.x *= scale;
      player.velocity.z *= scale;
    }

    // Update position
    player.position = PhysicsEngine.updatePosition(player, deltaTime / 1000);

    // Update speed
    player.speed = PhysicsEngine.getSpeed(player.velocity);

    // Update checkpoints (distance traveled)
    player.checkpoints = Math.floor(player.position.z / 10);

    // Keep player within track bounds
    const maxX = GAME_CONFIG.trackWidth / 2 - 1;
    player.position.x = Math.max(-maxX, Math.min(maxX, player.position.x));
  }

  /**
   * Check all collisions in the game
   */
  private checkAllCollisions(state: EndlessRaceState, currentTime: number): void {
    for (const player of state.players) {
      if (player.isFinished) continue;

      // Check obstacle collisions
      for (const obstacle of state.obstacles) {
        if (
          PhysicsEngine.checkCollision(
            player.position,
            GAME_CONFIG.playerCollisionSize,
            obstacle.position,
            obstacle.size
          )
        ) {
          this.handleObstacleCollision(player, obstacle, state);
        }
      }

      // Check power-up collisions
      for (const powerUp of state.powerUps) {
        if (
          !powerUp.collected &&
          PhysicsEngine.checkCollision(
            player.position,
            GAME_CONFIG.playerCollisionSize,
            powerUp.position,
            GAME_CONFIG.powerUpCollisionSize
          )
        ) {
          this.handlePowerUpCollection(player, powerUp, state, currentTime);
        }
      }
    }
  }

  /**
   * Handle collision with obstacle
   */
  private handleObstacleCollision(
    player: PlayerState,
    obstacle: any,
    _state: EndlessRaceState
  ): void {
    // Check if player has shield
    if (this.powerUpManager.hasShield(player.playerId)) {
      this.powerUpManager.removeShield(player.playerId);
      logger.info(`Player ${player.playerId} used shield to block obstacle`);
      return;
    }

    const damageType = this.obstacleManager.getObstacleDamage(obstacle.type);

    switch (damageType) {
      case 'ELIMINATE':
        // Player is eliminated
        player.isFinished = true;
        player.finishTime = Date.now() - this.startTime;
        player.position.z = GAME_CONFIG.eliminationPenalty; // Move back to indicate elimination
        logger.info(`Player ${player.playerId} eliminated by ${obstacle.type}`);
        break;

      case 'SLOW_50':
        // Apply 50% slow for 2 seconds
        player.velocity = PhysicsEngine.applySlow(player.velocity, 0.5);
        logger.info(`Player ${player.playerId} slowed by 50% from ${obstacle.type}`);
        break;

      case 'SLOW_30':
        // Apply 30% slow for 2 seconds
        player.velocity = PhysicsEngine.applySlow(player.velocity, 0.7);
        logger.info(`Player ${player.playerId} slowed by 30% from ${obstacle.type}`);
        break;
    }
  }

  /**
   * Handle power-up collection
   */
  private handlePowerUpCollection(
    player: PlayerState,
    powerUp: any,
    state: EndlessRaceState,
    currentTime: number
  ): void {
    powerUp.collected = true;
    this.powerUpManager.applyPowerUp(player, powerUp, state, currentTime);
    logger.info(`Player ${player.playerId} collected power-up ${powerUp.type}`);
  }

  /**
   * Update player rankings based on distance
   */
  private updateRankings(state: EndlessRaceState): void {
    // Sort players by distance (z position), furthest first
    const sortedPlayers = [...state.players].sort((a, b) => {
      // Finished players (eliminated) go to bottom
      if (a.isFinished && !b.isFinished) return 1;
      if (!a.isFinished && b.isFinished) return -1;
      // Compare by distance
      return b.position.z - a.position.z;
    });

    // Assign ranks
    sortedPlayers.forEach((player, index) => {
      player.rank = index + 1;
    });
  }

  /**
   * Check if game is over
   */
  public isGameOver(state: EndlessRaceState): boolean {
    // Game over if max duration reached
    if (state.gameTime >= GAME_CONFIG.maxDuration) {
      return true;
    }

    // Game over if only one player remains
    const activePlayers = state.players.filter((p) => !p.isFinished);
    if (activePlayers.length <= 1 && state.players.length > 1) {
      return true;
    }

    // Game over if all players eliminated
    if (activePlayers.length === 0) {
      return true;
    }

    return false;
  }

  /**
   * Calculate final winner
   */
  public calculateWinner(state: EndlessRaceState): PlayerState {
    // Winner is player with furthest distance
    const sortedPlayers = [...state.players].sort((a, b) => b.position.z - a.position.z);
    return sortedPlayers[0];
  }

  /**
   * Get game statistics
   */
  public getGameStats(state: EndlessRaceState): any {
    return {
      duration: state.gameTime,
      trackSections: state.trackSection,
      totalObstacles: state.obstacles.length,
      totalPowerUps: state.powerUps.length,
      activePlayers: state.players.filter((p) => !p.isFinished).length,
      eliminatedPlayers: state.players.filter((p) => p.isFinished).length,
    };
  }

  /**
   * Reset engine state
   */
  public reset(): void {
    this.startTime = 0;
    this.obstacleManager.reset();
    this.powerUpManager.reset();
  }
}
