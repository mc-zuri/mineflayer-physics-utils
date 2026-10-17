import type { Entity } from "prismarine-entity";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { Vec3 } from "vec3";
import type { IPhysics } from "../engines";
import { resolveBoatDimensions } from "../settings/boatSettings";
import { ControlStateHandler } from "../player/playerControls";
import { EntityState } from "./entityState";

export enum BoatStatus {
  IN_WATER,
  UNDER_WATER,
  UNDER_FLOWING_WATER,
  ON_LAND,
  IN_AIR,
}

export class BoatState extends EntityState {
  status: BoatStatus = BoatStatus.IN_AIR;
  previousStatus: BoatStatus = BoatStatus.IN_AIR;

  waterLevel = -Infinity;
  landFriction = 0;
  /** Boat.deltaRotation: the yaw it turns by each tick, float degrees. */
  yawVelocity = 0;
  /** The yaw as vanilla holds it (Entity.yRot): float degrees, whole turns kept. */
  yawDegrees: number;
  /** Before 1.17 the entity's own box, which moves and places the boat (unset: the box around the position). */
  box?: AABB;
  lastVerticalVelocity = 0;
  controllingPlayer = false;
  /** 1.8's EntityBoat.speedMultiplier: how hard its rider's input pushes it, 0.07 to 0.35. */
  speedMultiplier = 0.07;

  worldReady = true;

  constructor(
    ctx: IPhysics,
    height: number,
    halfWidth: number,
    pos: Vec3,
    vel: Vec3,
    onGround: boolean,
    yaw: number,
    pitch: number,
    control: ControlStateHandler = ControlStateHandler.DEFAULT(),
  ) {
    super(ctx, height, halfWidth, pos, vel, onGround, yaw, pitch, control);
    this.yawDegrees = BoatState.degreesOf(yaw);
  }

  /** Float degrees from mineflayer's radians (whole turns lost), for an entity that does not keep its own. */
  private static degreesOf(yaw: number): number {
    return Math.fround(((Math.PI - yaw) * 180) / Math.PI);
  }

  /** Takes the entity's float degrees (yawDegrees) when it keeps them, else derives them from its radians. */
  private takeYaw(entity: Entity): void {
    const degrees = (entity as Entity & { yawDegrees?: unknown }).yawDegrees;
    this.yaw = entity.yaw;
    this.yawDegrees = degrees == null ? BoatState.degreesOf(entity.yaw) : Math.fround(Number(degrees));
  }

  /** Turns the boat to float degrees, keeping mineflayer's radians in step. */
  public setYawDegrees(degrees: number): void {
    this.yawDegrees = Math.fround(degrees);
    this.yaw = Math.PI - (this.yawDegrees * Math.PI) / 180;
  }

  public static CREATE_FROM_ENTITY(
    ctx: IPhysics,
    entity: Entity,
    control: ControlStateHandler = ControlStateHandler.DEFAULT(),
  ): BoatState {
    const dims = resolveBoatDimensions(ctx.data, entity.name);
    const state = new BoatState(
      ctx,
      dims.height,
      dims.width / 2,
      entity.position.clone(),
      entity.velocity.clone(),
      entity.onGround ?? false,
      entity.yaw,
      entity.pitch,
      control.clone(),
    );
    state.takeYaw(entity);
    return state;
  }

  public updateControls(control: ControlStateHandler): BoatState {
    this.control = control.clone();
    return this;
  }

  public rebaseFromEntity(entity: Entity, options?: { replaceVelocity?: boolean }): BoatState {
    this.pos.set(entity.position.x, entity.position.y, entity.position.z);
    this.box = undefined;
    if (options?.replaceVelocity !== false) {
      this.vel.set(entity.velocity.x, entity.velocity.y, entity.velocity.z);
    }
    this.takeYaw(entity);
    this.pitch = entity.pitch;
    this.onGround = entity.onGround ?? false;
    const entityExtras = entity as Entity & {
      isCollidedHorizontally?: boolean;
      isCollidedVertically?: boolean;
    };
    this.isCollidedHorizontally = entityExtras.isCollidedHorizontally ?? false;
    this.isCollidedVertically = entityExtras.isCollidedVertically ?? false;
    return this;
  }

  public applyToEntity(entity: Entity) {
    entity.position.set(this.pos.x, this.pos.y, this.pos.z);
    entity.velocity.set(this.vel.x, this.vel.y, this.vel.z);
    entity.yaw = this.yaw;
    (entity as Entity & { yawDegrees?: number }).yawDegrees = this.yawDegrees;
    entity.pitch = this.pitch;
    entity.onGround = this.onGround;
    const entityExtras = entity as Entity & {
      isCollidedHorizontally?: boolean;
      isCollidedVertically?: boolean;
    };
    entityExtras.isCollidedHorizontally = this.isCollidedHorizontally;
    entityExtras.isCollidedVertically = this.isCollidedVertically;
    return this;
  }

  public clone(): BoatState {
    const other = new BoatState(
      this.ctx,
      this.height,
      this.halfWidth,
      this.pos.clone(),
      this.vel.clone(),
      this.onGround,
      this.yaw,
      this.pitch,
      this.control.clone(),
    );
    other.status = this.status;
    other.previousStatus = this.previousStatus;
    other.waterLevel = this.waterLevel;
    other.landFriction = this.landFriction;
    other.yawVelocity = this.yawVelocity;
    other.yawDegrees = this.yawDegrees;
    other.box = this.box?.clone();
    other.lastVerticalVelocity = this.lastVerticalVelocity;
    other.controllingPlayer = this.controllingPlayer;
    other.speedMultiplier = this.speedMultiplier;
    other.worldReady = this.worldReady;
    other.age = this.age;
    other.isCollidedHorizontally = this.isCollidedHorizontally;
    other.isCollidedVertically = this.isCollidedVertically;
    return other;
  }
}
