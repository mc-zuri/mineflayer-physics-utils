import type { Effect, Entity } from "prismarine-entity";
import type { Vec3 } from "vec3";
import type { AABB } from "@nxg-org/mineflayer-util-plugin";
import type { ControlStateHandler } from "../player/playerControls";
import type { PlayerPoses } from "./poses";

export interface IEntityState {
  age: number;
  height: number;
  halfWidth: number;
  pos: Vec3;
  vel: Vec3;
  pitch: number;
  yaw: number;
  pose: PlayerPoses;
  control: ControlStateHandler;
  onGround: boolean;
  onClimbable: boolean;

  attributes: Entity["attributes"];

  isUsingItem: boolean;
  isInWater: boolean;
  isInLava: boolean;
  isInWeb: boolean;
  fallFlying: boolean;
  elytraFlying: boolean;
  validElytraEquipped: boolean;
  fireworkRocketDuration: number;
  sneakCollision: boolean;
  isCollidedHorizontally: boolean;
  isCollidedVertically: boolean;

  effects: Effect[];
  jumpBoost: number;
  speed: number;
  slowness: number;
  dolphinsGrace: number;
  slowFalling: number;
  levitation: number;
  depthStrider: number;

  jumpTicks: number;
  jumpQueued: boolean;

  supportingBlockPos: Vec3 | null;

  clone(): IEntityState;

  getBB(): AABB;
}

/**
 * Another entity near the player, as the client holds it when the player ticks: its vanilla type name ("cow",
 * "oak_boat"; "boat" before 1.21.2), whether it is a LivingEntity (mobs and other players), its position and its
 * bounding box.
 */
export interface NearbyEntity {
  name: string;
  living: boolean;
  position: Vec3;
  boundingBox: AABB;
  /** It ticks before the local player (the client's entity order, 1.14 - 1.16), so its push comes before the player's tick. */
  ticksBeforePlayer?: boolean;
  /** Where its own tick of this client tick leaves it (the next step of its interpolation), the place it pushes from. */
  afterTick?: { position: Vec3; boundingBox: AABB };
  /** A baby (its synced baby flag). */
  baby?: boolean;
  /** A happy ghast's synced stays_still (HappyGhast.staysStill, 1.21.6+): on its still timeout. */
  staysStill?: boolean;
}
