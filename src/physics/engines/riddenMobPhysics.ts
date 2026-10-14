import { world } from "prismarine-world";
import * as math from "../info/math";
import { EPhysicsCtx } from "../settings/entityPhysicsCtx";
import { RiddenMobState } from "../states/riddenMobState";
import { BotcraftPhysics } from "./botcraft";

type World = { getBlock: world.WorldSync["getBlock"] };

/** What the riding player gives its mount each tick. */
export interface RiderInput {
  /** the rider's yaw and pitch in float degrees, as vanilla holds them */
  yawDegrees: number;
  pitchDegrees: number;
}

/**
 * The client side of a mob the local player rides and steers (pig, strider, camel): the vehicle ticks before its
 * passenger, and as the local player controls it, the client moves it with LivingEntity.aiStep and travelRidden, the
 * same LivingEntity.travel a player moves with, at the speed and with the input the mob takes from its rider.
 */
export class RiddenMobPhysics extends BotcraftPhysics {
  /** One client tick of the ridden mob in ctx (a RiddenMobState). */
  simulateRidden(ctx: EPhysicsCtx, world: World, rider: RiderInput): RiddenMobState {
    const mob = ctx.state as RiddenMobState;
    this.collider = mob;
    try {
      this.tickRiddenMob(ctx, world, rider);
    } finally {
      this.collider = null;
    }
    mob.lastOnGround = mob.onGround;
    mob.age++;
    return mob;
  }

  private tickRiddenMob(ctx: EPhysicsCtx, world: World, rider: RiderInput) {
    const mob = ctx.state as RiddenMobState;
    // Entity.baseTick: the water and lava contact the move starts from
    this.fluidPhysics(ctx, world, true);
    this.fluidPhysics(ctx, world, false);

    // LivingEntity.aiStep. Before 1.21.5 the client damps every mob it does not run the AI of (!isEffectiveAi) by
    // 0.98, its own mount included; since, only those it does not move (!canSimulateMovement).
    if (this.verLessThan("1.21.5")) mob.vel.scale(0.98);
    const negligible = this.verLessThan("1.9") ? 0.005 : 0.003;
    if (Math.abs(mob.vel.x) < negligible) mob.vel.x = 0;
    if (Math.abs(mob.vel.y) < negligible) mob.vel.y = 0;
    if (Math.abs(mob.vel.z) < negligible) mob.vel.z = 0;

    // LivingEntity.travelRidden: tickRidden, then the ridden speed and input. Before 1.19.4 (ItemSteerable.travel)
    // the air speed was set from the speed of the tick before, since from the new one (getFlyingSpeed).
    const speedBefore = mob.riddenSpeed;
    this.tickRidden(mob, rider);
    const airSpeed = Math.fround((this.verLessThan("1.19.4") ? speedBefore : mob.riddenSpeed) * Math.fround(0.1));
    this.travelRiddenMob(ctx, world, airSpeed);
  }

  /**
   * The mob's own part of travelRidden (tickRidden, getRiddenInput, getRiddenSpeed): it turns to its rider, ticks its
   * boost and takes its input and speed from it.
   */
  protected tickRidden(mob: RiddenMobState, rider: RiderInput) {
    const f32 = Math.fround;
    switch (mob.type) {
      case "pig": {
        // Pig.tickRidden: setRot(rider yaw, rider pitch * 0.5F) (Entity.setRot keeps the yaw within 360)
        mob.yawDegrees = f32(f32(rider.yawDegrees) % 360);
        this.tickBoost(mob);
        // Pig.getRiddenInput: straight on; getRiddenSpeed: MOVEMENT_SPEED * 0.225 * the boost factor (before
        // 1.19.4 ItemSteerable.travel's float speed + speed * 1.15F * sin)
        mob.heading = { forward: 1, strafe: 0 };
        if (this.verLessThan("1.19.4")) {
          const speed = f32(f32(mob.movementSpeed) * f32(0.225));
          mob.riddenSpeed = mob.boosting ? f32(speed + f32(f32(speed * f32(1.15)) * this.boostSin(mob))) : speed;
        } else {
          mob.riddenSpeed = f32(mob.movementSpeed * 0.225 * this.boostFactor(mob));
        }
        return;
      }
      default:
        throw new Error(`RiddenMobPhysics: ${mob.type} is not simulated yet`);
    }
  }

  /** ItemBasedSteering.tickBoost: the boost ends once its time has run out. */
  protected tickBoost(mob: RiddenMobState) {
    if (mob.boosting && mob.boostTime++ > mob.boostTimeTotal) mob.boosting = false;
  }

  /** ItemBasedSteering.boostFactor: 1 + 1.15F * sin of how far into the boost, while it runs. */
  protected boostFactor(mob: RiddenMobState): number {
    if (!mob.boosting) return 1;
    return Math.fround(1 + Math.fround(Math.fround(1.15) * this.boostSin(mob)));
  }

  /** Mth.sin of how far into the boost it is, in float: boostTime / boostTimeTotal * 3.1415927F. */
  protected boostSin(mob: RiddenMobState): number {
    const f32 = Math.fround;
    return this.mth.sin(f32(f32(f32(mob.boostTime) / f32(mob.boostTimeTotal)) * f32(3.1415927)));
  }

  /**
   * LivingEntity.travel for a mob steered by a player: in a fluid as any living entity (BotcraftPhysics' own
   * water and lava travel), else on the ground with the ridden speed or in the air with airSpeed (0.1F of it).
   */
  protected travelRiddenMob(ctx: EPhysicsCtx, world: World, airSpeed: number) {
    const mob = ctx.state as RiddenMobState;
    // the ridden step height: at least 1 (LivingEntity.maxUpStep with a player in control)
    ctx.stepHeight = 1;
    if (mob.isInWater || mob.isInLava) {
      this.movePlayer(ctx, world);
      return;
    }

    const f32 = Math.fround;
    const blockBelow = world.getBlock(this.getBlockBelowAffectingMovement(mob, world));
    const friction = (blockBelow ? this.blockSlipperiness[blockBelow.type] : undefined) ?? ctx.worldSettings.defaultSlipperiness;
    const inertia = mob.onGround ? f32(f32(friction) * f32(0.91)) : f32(0.91);
    const inputStrength = mob.onGround ? this.getFrictionInfluencedSpeed(mob.riddenSpeed, friction) : airSpeed;
    this.applyInputs(inputStrength, mob);

    // LivingEntity.handleOnClimbable
    mob.onClimbable = this.isInClimbable(mob, world);
    if (mob.onClimbable) {
      mob.fallDistance = 0;
      mob.vel.x = math.clamp(-0.15000000596046448, mob.vel.x, 0.15000000596046448);
      mob.vel.z = math.clamp(-0.15000000596046448, mob.vel.z, 0.15000000596046448);
      mob.vel.y = Math.max(this.verLessThan("1.14") ? -0.15 : -0.15000000596046448, mob.vel.y);
    }

    this.applyMovement(ctx, world);
    mob.onClimbable = this.isInClimbable(mob, world);
    if (mob.isCollidedHorizontally && mob.onClimbable) mob.vel.y = 0.2;

    mob.vel.y -= 0.08; // LivingEntity.getEffectiveGravity (the mobs' gravity attribute keeps its default)
    mob.vel.x *= inertia;
    mob.vel.z *= inertia;
    mob.vel.y *= 0.9800000190734863;
  }
}
