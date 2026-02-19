/**
 * ObstacleManager.ts
 *
 * Manages obstacle spawning, lifecycle, and patterns.
 */

import { Obstacle, EndlessRaceState } from '../../types/game';
import { v4 as uuidv4 } from 'uuid';

// Obstacle type definitions
interface ObstacleType {
  damage: 'ELIMINATE' | 'SLOW_50' | 'SLOW_30';
  size: { x: number; z: number };
  probability: number;
}

const OBSTACLE_TYPES: Record<string, ObstacleType> = {
  BARRIER: { damage: 'ELIMINATE', size: { x: 2, z: 1 }, probability: 0.3 },
  HAZARD: { damage: 'SLOW_50', size: { x: 1, z: 1 }, probability: 0.4 },
  SLOW_ZONE: { damage: 'SLOW_30', size: { x: 3, z: 2 }, probability: 0.3 },
};

const SPAWN_CONFIG = {
  interval: 2000, // ms between spawns
  minDistance: 50, // min distance from furthest player
  maxActive: 20, // max obstacles on track
  laneWidth: 5, // width of each lane
  laneCount: 3, // number of lanes
};

export class ObstacleManager {
  private lastSpawnTime: number = 0;

  /**
   * Spawn a new obstacle if conditions are met
   */
  public spawnObstacle(state: EndlessRaceState, currentTime: number): Obstacle | null {
    // Check if enough time has passed
    if (currentTime - this.lastSpawnTime < SPAWN_CONFIG.interval) {
      return null;
    }

    // Check if max obstacles reached
    if (state.obstacles.length >= SPAWN_CONFIG.maxActive) {
      return null;
    }

    // Find furthest player position
    const furthestZ = this.getFurthestPlayerPosition(state);

    // Spawn ahead of furthest player
    const spawnZ = furthestZ + SPAWN_CONFIG.minDistance;

    // Random obstacle type based on probability
    const obstacleType = this.selectRandomObstacleType();
    const typeConfig = OBSTACLE_TYPES[obstacleType];

    // Random lane
    const lane = Math.floor(Math.random() * SPAWN_CONFIG.laneCount);
    const laneX = (lane - 1) * SPAWN_CONFIG.laneWidth; // Center lane at x=0

    const obstacle: Obstacle = {
      id: uuidv4(),
      position: {
        x: laneX,
        y: 0,
        z: spawnZ,
      },
      type: obstacleType,
      size: {
        x: typeConfig.size.x,
        y: 1,
        z: typeConfig.size.z,
      },
    };

    this.lastSpawnTime = currentTime;
    return obstacle;
  }

  /**
   * Remove obstacles that are behind all players
   */
  public cleanupObstacles(state: EndlessRaceState): Obstacle[] {
    const furthestBackPlayer = this.getFurthestBackPlayerPosition(state);
    const cleanupThreshold = furthestBackPlayer - 20; // Keep some behind for safety

    return state.obstacles.filter((obstacle) => obstacle.position.z > cleanupThreshold);
  }

  /**
   * Select random obstacle type based on probability weights
   */
  private selectRandomObstacleType(): string {
    const rand = Math.random();
    let cumulative = 0;

    for (const [type, config] of Object.entries(OBSTACLE_TYPES)) {
      cumulative += config.probability;
      if (rand <= cumulative) {
        return type;
      }
    }

    return 'HAZARD'; // Fallback
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
   * Get obstacle damage type
   */
  public getObstacleDamage(obstacleType: string): string {
    return OBSTACLE_TYPES[obstacleType]?.damage || 'SLOW_30';
  }

  /**
   * Spawn multiple obstacles in a pattern
   */
  public spawnObstaclePattern(state: EndlessRaceState, pattern: 'WALL' | 'ZIGZAG' | 'RANDOM'): Obstacle[] {
    const obstacles: Obstacle[] = [];
    const furthestZ = this.getFurthestPlayerPosition(state);
    const spawnZ = furthestZ + SPAWN_CONFIG.minDistance;

    switch (pattern) {
      case 'WALL':
        // Spawn obstacles across all lanes with one gap
        const gapLane = Math.floor(Math.random() * SPAWN_CONFIG.laneCount);
        for (let lane = 0; lane < SPAWN_CONFIG.laneCount; lane++) {
          if (lane !== gapLane) {
            const laneX = (lane - 1) * SPAWN_CONFIG.laneWidth;
            obstacles.push({
              id: uuidv4(),
              position: { x: laneX, y: 0, z: spawnZ },
              type: 'BARRIER',
              size: { x: 2, y: 1, z: 1 },
            });
          }
        }
        break;

      case 'ZIGZAG':
        // Spawn obstacles in alternating lanes
        for (let i = 0; i < 3; i++) {
          const lane = i % SPAWN_CONFIG.laneCount;
          const laneX = (lane - 1) * SPAWN_CONFIG.laneWidth;
          obstacles.push({
            id: uuidv4(),
            position: { x: laneX, y: 0, z: spawnZ + i * 10 },
            type: 'HAZARD',
            size: { x: 1, y: 1, z: 1 },
          });
        }
        break;

      case 'RANDOM':
      default:
        // Spawn 1-2 random obstacles
        const count = 1 + Math.floor(Math.random() * 2);
        for (let i = 0; i < count; i++) {
          const lane = Math.floor(Math.random() * SPAWN_CONFIG.laneCount);
          const laneX = (lane - 1) * SPAWN_CONFIG.laneWidth;
          obstacles.push({
            id: uuidv4(),
            position: { x: laneX, y: 0, z: spawnZ + i * 5 },
            type: this.selectRandomObstacleType(),
            size: { x: 1, y: 1, z: 1 },
          });
        }
        break;
    }

    return obstacles;
  }

  /**
   * Reset spawn timer
   */
  public reset(): void {
    this.lastSpawnTime = 0;
  }
}
