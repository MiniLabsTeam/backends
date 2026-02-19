/**
 * PhysicsEngine.ts
 *
 * Simple arcade-style physics for racing game.
 * Not realistic simulation - optimized for fast, fun gameplay.
 */

import { Vector3, PlayerState, GameAction } from '../../types/game';

export class PhysicsEngine {
  // Physics constants
  private static readonly FRICTION = 0.95;
  private static readonly BRAKE_FORCE = 0.8;
  // private static readonly DRIFT_FACTOR = 0.7; // TODO: Implement drift mechanics
  private static readonly MIN_SPEED = 0.01;
  private static readonly TURN_SPEED_FACTOR = 0.05;

  /**
   * Update player velocity based on input and car stats
   */
  public static updateVelocity(
    player: PlayerState,
    input: GameAction | null,
    deltaTime: number
  ): Vector3 {
    let velocity = { ...player.velocity };

    // Apply input acceleration
    if (input === GameAction.ACCELERATE) {
      const accelForce = player.stats.acceleration * deltaTime;
      const forwardX = Math.cos(player.rotation);
      const forwardZ = Math.sin(player.rotation);

      velocity.x += forwardX * accelForce;
      velocity.z += forwardZ * accelForce;

      // Cap at max speed
      const currentSpeed = this.getSpeed(velocity);
      if (currentSpeed > player.stats.speed) {
        const scale = player.stats.speed / currentSpeed;
        velocity.x *= scale;
        velocity.z *= scale;
      }
    }

    // Apply braking
    if (input === GameAction.BRAKE) {
      velocity.x *= this.BRAKE_FORCE;
      velocity.z *= this.BRAKE_FORCE;
    }

    // Apply friction (natural slowdown)
    velocity.x *= this.FRICTION;
    velocity.z *= this.FRICTION;

    // Stop if too slow
    if (this.getSpeed(velocity) < this.MIN_SPEED) {
      velocity.x = 0;
      velocity.z = 0;
    }

    return velocity;
  }

  /**
   * Update player position based on velocity
   */
  public static updatePosition(
    player: PlayerState,
    deltaTime: number
  ): Vector3 {
    return {
      x: player.position.x + player.velocity.x * deltaTime,
      y: player.position.y + player.velocity.y * deltaTime,
      z: player.position.z + player.velocity.z * deltaTime,
    };
  }

  /**
   * Update player rotation based on input and handling stat
   */
  public static updateRotation(
    player: PlayerState,
    input: GameAction | null,
    deltaTime: number
  ): number {
    let rotation = player.rotation;

    // Only turn if moving
    const currentSpeed = this.getSpeed(player.velocity);
    if (currentSpeed < this.MIN_SPEED) {
      return rotation;
    }

    const turnSpeed = player.stats.handling * this.TURN_SPEED_FACTOR * deltaTime;
    const speedFactor = Math.min(currentSpeed / player.stats.speed, 1);

    if (input === GameAction.TURN_LEFT) {
      rotation -= turnSpeed * speedFactor;
    } else if (input === GameAction.TURN_RIGHT) {
      rotation += turnSpeed * speedFactor;
    }

    // Apply drift mechanics
    if (input === GameAction.DRIFT) {
      const driftBonus = player.stats.drift * 0.01;
      rotation *= (1 + driftBonus);
    }

    // Normalize rotation to 0-2π
    while (rotation < 0) rotation += Math.PI * 2;
    while (rotation >= Math.PI * 2) rotation -= Math.PI * 2;

    return rotation;
  }

  /**
   * Check AABB (Axis-Aligned Bounding Box) collision
   */
  public static checkCollision(
    pos1: Vector3,
    size1: Vector3,
    pos2: Vector3,
    size2: Vector3
  ): boolean {
    return (
      pos1.x < pos2.x + size2.x &&
      pos1.x + size1.x > pos2.x &&
      pos1.z < pos2.z + size2.z &&
      pos1.z + size1.z > pos2.z
    );
  }

  /**
   * Calculate speed from velocity vector
   */
  public static getSpeed(velocity: Vector3): number {
    return Math.sqrt(velocity.x ** 2 + velocity.z ** 2);
  }

  /**
   * Apply friction to velocity
   */
  public static applyFriction(velocity: Vector3, factor: number = this.FRICTION): Vector3 {
    return {
      x: velocity.x * factor,
      y: velocity.y * factor,
      z: velocity.z * factor,
    };
  }

  /**
   * Calculate distance between two points
   */
  public static distance(pos1: Vector3, pos2: Vector3): number {
    return Math.sqrt(
      (pos2.x - pos1.x) ** 2 +
      (pos2.y - pos1.y) ** 2 +
      (pos2.z - pos1.z) ** 2
    );
  }

  /**
   * Apply boost to velocity
   */
  public static applyBoost(velocity: Vector3, boostMultiplier: number): Vector3 {
    return {
      x: velocity.x * boostMultiplier,
      y: velocity.y * boostMultiplier,
      z: velocity.z * boostMultiplier,
    };
  }

  /**
   * Apply slow effect to velocity
   */
  public static applySlow(velocity: Vector3, slowMultiplier: number): Vector3 {
    return {
      x: velocity.x * slowMultiplier,
      y: velocity.y * slowMultiplier,
      z: velocity.z * slowMultiplier,
    };
  }

  /**
   * Clamp value between min and max
   */
  // TODO: Use this when implementing boundary checks
  // private static clamp(value: number, min: number, max: number): number {
  //   return Math.max(min, Math.min(max, value));
  // }
}
