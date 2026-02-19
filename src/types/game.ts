// Game-related types

export interface PlayerInput {
  playerId: string;
  action: GameAction;
  timestamp: number;
}

export enum GameAction {
  ACCELERATE = 'ACCELERATE',
  BRAKE = 'BRAKE',
  TURN_LEFT = 'TURN_LEFT',
  TURN_RIGHT = 'TURN_RIGHT',
  DRIFT = 'DRIFT',
  BOOST = 'BOOST',
}

export interface GameState {
  roomId: string;
  gameMode: string;
  players: PlayerState[];
  timestamp: number;
  gameTime: number;
  status: 'WAITING' | 'COUNTDOWN' | 'RACING' | 'FINISHED';
}

export interface PlayerState {
  playerId: string;
  carUid: string;
  position: Vector3;
  velocity: Vector3;
  rotation: number;
  speed: number;
  lane?: number; // For lane-based games (0=left, 1=middle, 2=right)
  stats: {
    speed: number;
    acceleration: number;
    handling: number;
    drift: number;
  };
  lap?: number;
  checkpoints?: number;
  finishTime?: number;
  isFinished: boolean;
  rank?: number;
}

export interface Vector3 {
  x: number;
  y: number;
  z: number;
}

export interface GameConfig {
  mode: string;
  trackLength?: number;
  lapCount?: number;
  checkpointCount?: number;
  timeLimit?: number;
  maxPlayers: number;
}

export interface DragRaceState extends GameState {
  finishLine: number;
  leaderboard: {
    playerId: string;
    distance: number;
    finishTime?: number;
  }[];
}

export interface EndlessRaceState extends GameState {
  trackSection: number;
  obstacles: Obstacle[];
  powerUps: PowerUp[];
}

export interface Obstacle {
  id: string;
  position: Vector3;
  type: string;
  size: Vector3;
}

export interface PowerUp {
  id: string;
  position: Vector3;
  type: 'BOOST' | 'SHIELD' | 'SLOW_OTHERS';
  collected: boolean;
}

export interface RoyalRumbleState extends GameState {
  safeZone: {
    center: Vector3;
    radius: number;
  };
  eliminatedPlayers: string[];
  survivalTime: number;
}

export interface GameResult {
  roomId: string;
  winner: string;
  rankings: {
    rank: number;
    playerId: string;
    carUid: string;
    finishTime: number;
    stats: any;
  }[];
  gameData: any;
}

export interface WebSocketMessage {
  type: WebSocketMessageType;
  data: any;
  timestamp: number;
}

export enum WebSocketMessageType {
  // Client -> Server
  PLAYER_JOIN = 'PLAYER_JOIN',
  PLAYER_READY = 'PLAYER_READY',
  PLAYER_INPUT = 'PLAYER_INPUT',
  PLAYER_LEAVE = 'PLAYER_LEAVE',

  // Server -> Client
  GAME_STATE = 'GAME_STATE',
  GAME_START = 'GAME_START',
  GAME_END = 'GAME_END',
  PLAYER_JOINED = 'PLAYER_JOINED',
  PLAYER_LEFT = 'PLAYER_LEFT',
  ERROR = 'ERROR',

  // Spectator
  SPECTATE_JOIN = 'SPECTATE_JOIN',
  SPECTATE_STATE = 'SPECTATE_STATE',
}
