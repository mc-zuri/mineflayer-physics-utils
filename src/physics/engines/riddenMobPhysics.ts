import { Block } from "prismarine-block";
import { world } from "prismarine-world";
import { Vec3 } from "vec3";
import * as math from "../info/math";
import { EPhysicsCtx } from "../settings/entityPhysicsCtx";
import { HORSE_TYPES, NAUTILUS_TYPES, RiddenMobState } from "../states/riddenMobState";
import { PlayerState } from "../states/playerState";
import { floatRadians } from "../../util/mth";
import { BotcraftPhysics } from "./botcraft";

type World = { getBlock: world.WorldSync["getBlock"] };
type AABBPoints = [number, number, number, number, number, number];

/** Mth.wrapDegrees of a float: within [-180, 180). */
function wrapDegreesF(degrees: number): number {
  let wrapped = Math.fround(degrees % 360);
  if (wrapped >= 180) wrapped = Math.fround(wrapped - 360);
  if (wrapped < -180) wrapped = Math.fround(wrapped + 360);
  return wrapped;
}

/** Mth.wrapDegrees of a double: within [-180, 180). */
function wrapDegreesD(degrees: number): number {
  let wrapped = degrees % 360;
  if (wrapped >= 180) wrapped -= 360;
  if (wrapped < -180) wrapped += 360;
  return wrapped;
}

/** AbstractHorse.canPerformRearing: a llama never rears (Llama.canPerformRearing). */
function canPerformRearing(mob: RiddenMobState): boolean {
  return mob.type !== "llama" && mob.type !== "trader_llama";
}

/** LiquidBlock.SHAPE_STABLE: the lower half of a fluid block, what a strider stands on. */
const STABLE_FLUID_SHAPE: AABBPoints = [0, 0, 0, 1, 0.5, 1];

/** What the riding player gives its mount each tick. */
export interface RiderInput {
  /** the rider's yaw and pitch in float degrees, as vanilla holds them */
  yawDegrees: number;
  pitchDegrees: number;
  /** the rider's xxa and zza (strafe and forward input after its last aiStep) and sprinting: what a camel reads */
  xxa?: number;
  zza?: number;
  sprinting?: boolean;
  /** the rider's jumping after its last aiStep (LivingEntity.isJumping): what a happy ghast rises on */
  jumping?: boolean;
}

/**
 * The client side of a mob the local player rides and steers (pig, strider, camel, horses, happy ghast): the vehicle ticks before its
 * passenger, and as the local player controls it, the client moves it with LivingEntity.aiStep and travelRidden, the
 * same LivingEntity.travel a player moves with, at the speed and with the input the mob takes from its rider.
 */
export class RiddenMobPhysics extends BotcraftPhysics {
  /** the world of the mob simulated, for the collision shapes that depend on the blocks around */
  private colliderWorld: World | null = null;
  private colliderCtx: EPhysicsCtx | null = null;

  /** One client tick of the ridden mob in ctx (a RiddenMobState). */
  simulateRidden(ctx: EPhysicsCtx, world: World, rider: RiderInput): RiddenMobState {
    const mob = ctx.state as RiddenMobState;
    this.collider = mob;
    this.colliderWorld = world;
    this.colliderCtx = ctx;
    try {
      this.tickRiddenMob(ctx, world, rider);
    } finally {
      this.collider = null;
      this.colliderWorld = null;
      this.colliderCtx = null;
    }
    mob.lastOnGround = mob.onGround;
    mob.age++;
    return mob;
  }

  private tickRiddenMob(ctx: EPhysicsCtx, world: World, rider: RiderInput) {
    const mob = ctx.state as RiddenMobState;
    // Strider.tick: the strider suffocates off the warm blocks (lava, by the fluid contact of the tick before)
    if (mob.type === "strider" && !mob.noAi) mob.suffocating = !this.isWarmForStrider(mob, world);

    // Entity.baseTick: the water and lava contact the move starts from
    this.fluidPhysics(ctx, world, true);
    this.fluidPhysics(ctx, world, false);

    // LivingEntity.aiStep: a step toward where a server teleport put the mob (Mth.lerp of 1 / the steps left from
    // 1.20.2, a division before); else, before 1.21.5 the client damps every mob it does not run the AI of
    // (!isEffectiveAi) by 0.98, its own mount included; since, only those it does not move (!canSimulateMovement).
    if (mob.lerpSteps > 0 && mob.lerpTarget) {
      const t = mob.lerpTarget;
      const n = mob.lerpSteps;
      const p = mob.pos;
      // InterpolationHandler.interpolate (1.21.5+): the mob's own move since the last step goes with the target
      if (!this.verLessThan("1.21.5") && mob.lerpPrevious) {
        const moved = p.minus(mob.lerpPrevious);
        t.add(moved);
        mob.lerpStart?.add(moved);
      }
      // and so does its own turn since (adjustInterpolationTargetFromDeltas: InterpolationData.addRotation, in float)
      const f32 = Math.fround;
      const turning = mob.lerpYaw !== null;
      if (turning && !this.verLessThan("1.21.5") && mob.lerpPreviousRotation) {
        const yawTurn = f32((mob.yawDegrees ?? 0) - mob.lerpPreviousRotation.yaw);
        const pitchTurn = f32(mob.pitchDegrees - mob.lerpPreviousRotation.pitch);
        mob.lerpYaw = f32(mob.lerpYaw! + yawTurn);
        mob.lerpPitch = f32(mob.lerpPitch + pitchTurn);
        if (mob.lerpStartRotation) {
          mob.lerpStartRotation.yaw = f32(mob.lerpStartRotation.yaw + yawTurn);
          mob.lerpStartRotation.pitch = f32(mob.lerpStartRotation.pitch + pitchTurn);
        }
      }
      if (!this.verLessThan("26.3") && mob.lerpStart) {
        // SteppedInterpolationHandler (26.3+): along the step from where it started by a float share of its ticks
        // (getNewPositionAndRotation's Vec3.lerp, the float Mth.rotLerp and lerp), at the target once they are all gone
        const s = mob.lerpStart;
        const a = Math.fround(mob.lerpTicks / 3);
        if (mob.lerpTicks < 3) {
          p.set(s.x + (t.x - s.x) * a, s.y + (t.y - s.y) * a, s.z + (t.z - s.z) * a);
          if (turning && mob.lerpStartRotation) {
            const from = mob.lerpStartRotation;
            this.setRidden(mob, f32(from.yaw + f32(a * wrapDegreesF(f32(mob.lerpYaw! - from.yaw)))), f32(from.pitch + f32(a * f32(mob.lerpPitch - from.pitch))));
          }
        } else {
          p.set(t.x, t.y, t.z);
          if (turning) this.setRidden(mob, mob.lerpYaw!, mob.lerpPitch);
        }
        mob.lerpTicks++;
      } else if (this.verLessThan("1.20.2")) {
        p.set(p.x + (t.x - p.x) / n, p.y + (t.y - p.y) / n, p.z + (t.z - p.z) / n);
        // LivingEntity.aiStep: yRot + (float) Mth.wrapDegrees(lerpYRot - yRot) / steps, xRot + (lerpXRot - xRot) / steps
        if (turning) this.setRidden(mob, f32((mob.yawDegrees ?? 0) + f32(f32(wrapDegreesD(mob.lerpYaw! - (mob.yawDegrees ?? 0))) / n)), f32(mob.pitchDegrees + f32((mob.lerpPitch - mob.pitchDegrees) / n)));
      } else {
        p.set(p.x + (1 / n) * (t.x - p.x), p.y + (1 / n) * (t.y - p.y), p.z + (1 / n) * (t.z - p.z));
        // lerpPositionAndRotationStep / InterpolationHandler.interpolate: the double Mth.rotLerp and lerp of 1 / steps
        if (turning) this.setRidden(mob, f32((mob.yawDegrees ?? 0) + (1 / n) * wrapDegreesD(mob.lerpYaw! - (mob.yawDegrees ?? 0))), f32(mob.pitchDegrees + (1 / n) * (mob.lerpPitch - mob.pitchDegrees)));
      }
      mob.lerpSteps--;
      mob.lerpPrevious = p.clone();
      mob.lerpPreviousRotation = { yaw: mob.yawDegrees ?? 0, pitch: mob.pitchDegrees };
      if (mob.lerpSteps <= 0) mob.lerpYaw = null;
      mob.keptBoundingBox = null;
    } else if (this.verLessThan("1.21.5")) {
      mob.vel.scale(0.98);
    }
    const negligible = this.verLessThan("1.9") ? 0.005 : 0.003;
    if (Math.abs(mob.vel.x) < negligible) mob.vel.x = 0;
    if (Math.abs(mob.vel.y) < negligible) mob.vel.y = 0;
    if (Math.abs(mob.vel.z) < negligible) mob.vel.z = 0;

    // LivingEntity.travelRidden: tickRidden, then the ridden speed and input. Before 1.19.4 (ItemSteerable.travel)
    // the air speed was set from the speed of the tick before, since from the new one (getFlyingSpeed).
    const speedBefore = mob.riddenSpeed;
    this.tickRidden(mob, rider);
    // 1.21.5 moves the mob only where it runs its AI (travelRidden: isEffectiveAi, false for a mob without AI; before,
    // isControlledByLocalInstance, since canSimulateMovement): a mob without AI turns to its rider and stops
    if (mob.noAi && !this.verLessThan("1.21.5") && this.verLessThan("1.21.6")) {
      mob.vel.set(0, 0, 0);
    } else {
      const airSpeed = Math.fround((this.verLessThan("1.19.4") ? this.legacyFlyingBase(mob, speedBefore) : mob.riddenSpeed) * Math.fround(0.1));
      this.travelRiddenMob(ctx, world, airSpeed);
    }

    // AbstractHorse.travel before 1.19.4: once on the ground after the move, a pending jump is dropped and the jump
    // ends
    if (HORSE_TYPES.has(mob.type) && this.verLessThan("1.19.4") && mob.onGround) {
      mob.jumpPendingScale = 0;
      mob.horseJumping = false;
    }
    if (HORSE_TYPES.has(mob.type)) {
      // AbstractHorse.tick, after the move: the rearing it started itself ends after 20 ticks (counted up when the
      // client runs the horse's AI, until 1.21.6; down since), and a horse that does not rear no longer lets the
      // rider's jump move it rearing
      if (!this.verLessThan("1.21.6")) {
        if (mob.standCounter > 0 && --mob.standCounter <= 0) {
          mob.standCounter = 0;
          mob.standing = false;
        }
      } else if (this.horseStandsLocally() && mob.standCounter > 0 && ++mob.standCounter > 20) {
        mob.standCounter = 0;
        mob.standing = false;
      }
      // its stand animation (which seats its rider back and up): toward 1 while it rears, back toward 0 after
      const f32 = Math.fround;
      mob.standAnimO = mob.standAnim;
      if (mob.standing) {
        mob.standAnim = f32(mob.standAnim + f32(f32(f32(1 - mob.standAnim) * f32(0.4)) + f32(0.05)));
        if (mob.standAnim > 1) mob.standAnim = 1;
      } else {
        mob.allowStandSliding = false;
        const cube = f32(f32(f32(f32(0.8) * mob.standAnim) * mob.standAnim) * mob.standAnim);
        mob.standAnim = f32(mob.standAnim + f32(f32(f32(cube - mob.standAnim) * f32(0.6)) - f32(0.05)));
        if (mob.standAnim < 0) mob.standAnim = 0;
      }
    }

    // AbstractNautilus.tick, after the move: the dash ends 5 ticks in, its cooldown runs down
    if (NAUTILUS_TYPES.has(mob.type)) {
      if (mob.dashing && mob.dashCooldown < 35) mob.dashing = false;
      if (mob.dashCooldown > 0) mob.dashCooldown--;
    }

    // Camel.tick, after the move: the dash ends on landing, its cooldown runs down
    if (mob.type === "camel") {
      if (mob.dashing && mob.dashCooldown < 50 && (mob.onGround || mob.isInWater || mob.isInLava)) mob.dashing = false;
      if (mob.dashCooldown > 0) mob.dashCooldown--;
      mob.poseTime++;
    }

    // Strider.floatStrider: in lava it stands on a still surface (STABLE_SHAPE) or floats up
    if (mob.type === "strider" && mob.isInLava) {
      const feet = mob.pos.floored();
      if (this.isAboveStableFluid(mob, feet) && !this.isLava(world.getBlock(feet.offset(0, 1, 0)))) {
        mob.onGround = true;
      } else {
        mob.vel.scale(0.5);
        mob.vel.y += 0.05;
      }
    }
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
        mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
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
      case "strider": {
        // Strider.tickRidden: as the pig; getRiddenSpeed: MOVEMENT_SPEED (less 34% of its base while suffocating)
        // * 0.55F, or 0.35F suffocating, * the boost factor. Before 1.19.4 ItemBasedSteering.travel's float
        // getSteeringSpeed() + speed * 1.15F * sin, where the steering speed is MOVEMENT_SPEED (the client adds no
        // suffocating modifier) * 0.55F, or 0.23F suffocating
        mob.yawDegrees = f32(f32(rider.yawDegrees) % 360);
        mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
        this.tickBoost(mob);
        mob.heading = { forward: 1, strafe: 0 };
        if (this.verLessThan("1.19.4")) {
          const speed = f32(f32(mob.movementSpeed) * f32(mob.suffocating ? 0.23 : 0.55));
          mob.riddenSpeed = mob.boosting ? f32(speed + f32(f32(speed * f32(1.15)) * this.boostSin(mob))) : speed;
          return;
        }
        const movementSpeed = mob.suffocating ? mob.movementSpeed + mob.movementSpeed * -0.3400000035762787 : mob.movementSpeed;
        mob.riddenSpeed = f32(movementSpeed * f32(mob.suffocating ? 0.35 : 0.55) * this.boostFactor(mob));
        return;
      }
      case "camel":
        this.tickRiddenCamel(mob, rider);
        return;
      case "happy_ghast":
        this.tickRiddenHappyGhast(mob, rider);
        return;
      case "nautilus":
      case "zombie_nautilus":
        this.tickRiddenNautilus(mob, rider);
        return;
    }
    if (HORSE_TYPES.has(mob.type)) this.tickRiddenHorse(mob, rider);
  }

  /**
   * A harnessed happy ghast's part of its ridden travel (1.21.6+). HappyGhast.getRiddenInput: the rider's strafe as it
   * is; with a forward or back input, along the rider's pitch (cos forward, -sin up), half of it and reversed backwards;
   * 0.5 more up while the rider jumps; all of it scaled by 3.9F * FLYING_SPEED (in double). Then tickRidden: it turns
   * 0.08F of the way to its rider's yaw (Mth.wrapDegrees) and takes half the rider's pitch (Entity.setRot keeps both
   * within 360). getRiddenSpeed is unused: HappyGhast.travel flies at FLYING_SPEED * 5.0F / 3.0F.
   */
  private tickRiddenHappyGhast(mob: RiddenMobState, rider: RiderInput) {
    const f32 = Math.fround;
    const strafe = f32(rider.xxa ?? 0);
    const zza = f32(rider.zza ?? 0);
    let forward = 0;
    let up = 0;
    if (zza !== 0) {
      const pitch = floatRadians(rider.pitchDegrees);
      let forwardLook = this.mth.cos(pitch);
      let upLook = -this.mth.sin(pitch);
      if (zza < 0) {
        forwardLook = f32(forwardLook * f32(-0.5));
        upLook = f32(upLook * f32(-0.5));
      }
      up = upLook;
      forward = forwardLook;
    }
    if (rider.jumping) up = f32(up + f32(0.5));
    const scale = 3.9000000953674316 * mob.flyingSpeed;
    mob.riddenInput = new Vec3(strafe * scale, up * scale, forward * scale);

    let yRot = f32(mob.yawDegrees ?? 0);
    const diff = wrapDegreesF(f32(f32(rider.yawDegrees) - yRot));
    yRot = f32(yRot + f32(diff * f32(0.08)));
    mob.yawDegrees = f32(yRot % 360);
    mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
    mob.pitch = -mob.pitchDegrees * (Math.PI / 180);
    mob.riddenSpeed = f32(f32(f32(mob.flyingSpeed) * 5) / 3);
  }

  /**
   * A saddled nautilus's part of its ridden travel (26.1+, AbstractNautilus). getRiddenInput: the rider's strafe as it
   * is; with a forward or back input, along the rider's pitch (cos forward, -sin up), half of it and reversed
   * backwards. tickRidden: it turns half the way to its rider's yaw (Mth.wrapDegrees) and takes half the rider's pitch
   * (Entity.setRot keeps both within 360); the dash the rider asked for goes off (executeRidersJump). getRiddenSpeed:
   * 0.0325F * MOVEMENT_SPEED in water, 0.02F * it out of water.
   */
  private tickRiddenNautilus(mob: RiddenMobState, rider: RiderInput) {
    const f32 = Math.fround;
    const strafe = f32(rider.xxa ?? 0);
    const zza = f32(rider.zza ?? 0);
    let forward = 0;
    let up = 0;
    if (zza !== 0) {
      const pitch = floatRadians(rider.pitchDegrees);
      let forwardLook = this.mth.cos(pitch);
      let upLook = -this.mth.sin(pitch);
      if (zza < 0) {
        forwardLook = f32(forwardLook * f32(-0.5));
        upLook = f32(upLook * f32(-0.5));
      }
      up = upLook;
      forward = forwardLook;
    }
    mob.riddenInput = new Vec3(strafe, up, forward);

    let yRot = f32(mob.yawDegrees ?? 0);
    const diff = wrapDegreesF(f32(f32(rider.yawDegrees) - yRot));
    yRot = f32(yRot + f32(diff * f32(0.5)));
    mob.yawDegrees = f32(yRot % 360);
    mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
    mob.pitch = -mob.pitchDegrees * (Math.PI / 180);
    // (the client never makes its mount jump itself: isJumping is false)
    if (mob.jumpPendingScale > 0) this.nautilusDash(mob, mob.jumpPendingScale, rider);
    mob.jumpPendingScale = 0;
    mob.riddenSpeed = f32(f32(mob.isInWater ? 0.0325 : 0.02) * f32(mob.movementSpeed));
  }

  /**
   * AbstractNautilus.executeRidersJump: a push along the rider's look (Entity.calculateViewVector), (1.2F in water,
   * 0.5F out of it) * the charge * MOVEMENT_SPEED * the block's speed factor; the dash and its 40-tick cooldown start.
   */
  private nautilusDash(mob: RiddenMobState, scale: number, rider: RiderInput) {
    const f32 = Math.fround;
    const look = this.riderLook(rider);
    const momentum = f32(f32(mob.isInWater ? 1.2 : 0.5) * scale) * mob.movementSpeed * this.getBlockSpeedFactor(mob, this.colliderWorld!);
    mob.vel.translate(look.x * momentum, look.y * momentum, look.z * momentum);
    mob.dashCooldown = 40;
    mob.dashing = true;
  }

  /** Entity.calculateViewVector of the rider's look (getLookAngle), in float. */
  private riderLook(rider: RiderInput): { x: number; y: number; z: number } {
    const f32 = Math.fround;
    const pitch = floatRadians(rider.pitchDegrees);
    const yaw = f32(f32(-f32(rider.yawDegrees)) * f32(0.017453292));
    const yCos = this.mth.cos(yaw);
    const ySin = this.mth.sin(yaw);
    const xCos = this.mth.cos(pitch);
    const xSin = this.mth.sin(pitch);
    return { x: f32(ySin * xCos), y: -xSin, z: f32(yCos * xCos) };
  }

  /**
   * The DASH flag the server synced (onSyncedDataUpdated): a nautilus whose cooldown had run out starts it again.
   */
  syncDash(mob: RiddenMobState, dashing: boolean) {
    mob.dashing = dashing;
    if (NAUTILUS_TYPES.has(mob.type) && mob.dashCooldown === 0) mob.dashCooldown = 40;
  }

  /**
   * HappyGhast.travel: LivingEntity.travelFlying at FLYING_SPEED * 5.0F / 3.0F in water, lava and air alike: no
   * gravity, the ridden input added along the ghast's yaw (Entity.moveRelative), the move, then 0.8F of the motion kept
   * in water, 0.5 in lava, 0.91F in the air.
   */
  private travelHappyGhast(ctx: EPhysicsCtx, world: World) {
    const mob = ctx.state as RiddenMobState;
    this.moveRelative3d(mob.riddenSpeed, mob.riddenInput, mob);
    this.applyMovement(ctx, world);
    if (mob.isInWater) mob.vel.scale(0.800000011920929);
    else if (mob.isInLava) mob.vel.scale(0.5);
    else mob.vel.scale(0.9100000262260437);
  }

  /**
   * Entity.moveRelative with a vertical input (getInputVector): the input normalized when longer than 1, scaled by the
   * speed, turned by Mth.sin / cos of the yaw; its y added as it is.
   */
  private moveRelative3d(speed: number, input: Vec3, mob: RiddenMobState) {
    let { x, y, z } = input;
    const lengthSqr = x * x + y * y + z * z;
    if (lengthSqr < 1.0e-7) {
      mob.vel.translate(0, 0, 0);
      return;
    }
    if (lengthSqr > 1) {
      // Vec3.normalize
      const length = Math.sqrt(lengthSqr);
      if (length < 1.0e-5) {
        x = y = z = 0;
      } else {
        x /= length;
        y /= length;
        z /= length;
      }
    }
    x *= speed;
    y *= speed;
    z *= speed;
    const yaw = floatRadians(mob.yawDegrees ?? 0);
    const sin = this.mth.sin(yaw);
    const cos = this.mth.cos(yaw);
    mob.vel.translate(x * cos - z * sin, y, z * cos + x * sin);
  }

  /**
   * A saddled horse's part of its ridden travel: the input it takes from its rider (xxa * 0.5F, zza, a quarter of it
   * backwards; none while it rears on the ground, unless the rider's jump let it), its rotation (the rider's yaw, half
   * its pitch), the jump the rider charged when it stands on the ground, and its speed (MOVEMENT_SPEED). Before 1.19.4
   * all of it is AbstractHorse.travel, since tickRidden, getRiddenInput and getRiddenSpeed.
   */
  private tickRiddenHorse(mob: RiddenMobState, rider: RiderInput) {
    const f32 = Math.fround;
    const xxa = f32(f32(rider.xxa ?? 0) * f32(0.5));
    let zza = f32(rider.zza ?? 0);
    if (zza <= 0) zza = f32(zza * f32(0.25));
    const rearing = mob.onGround && mob.jumpPendingScale === 0 && mob.standing && !mob.allowStandSliding;
    mob.heading = rearing ? { forward: 0, strafe: 0 } : { forward: zza, strafe: xxa };
    mob.yawDegrees = f32(f32(rider.yawDegrees) % 360);
    mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
    mob.pitch = -mob.pitchDegrees * (Math.PI / 180);
    if (this.verLessThan("1.19.4")) {
      if (mob.jumpPendingScale > 0 && !mob.horseJumping && mob.onGround) {
        this.horseJump(mob, mob.jumpPendingScale, zza);
        mob.jumpPendingScale = 0;
      }
    } else if (mob.onGround) {
      mob.horseJumping = false;
      if (mob.jumpPendingScale > 0 && !mob.horseJumping) this.horseJump(mob, mob.jumpPendingScale, zza);
      mob.jumpPendingScale = 0;
    }
    mob.riddenSpeed = f32(mob.movementSpeed);
  }

  /**
   * The rider's jump (AbstractHorse.executeRidersJump, in travel before 1.19.4): up by JUMP_STRENGTH * the charge (times
   * the block's jump factor from 1.15; in float from 1.20.5, LivingEntity.getJumpPower) and, moving forward, 0.4F * the
   * charge along its yaw.
   */
  private horseJump(mob: RiddenMobState, scale: number, forward: number) {
    const f32 = Math.fround;
    const blockJumpFactor = this.verLessThan("1.15") ? 1 : this.getBlockJumpFactor(mob, this.colliderWorld!, this.colliderCtx!.worldSettings);
    if (this.verLessThan("1.15")) mob.vel.y = mob.jumpStrength * scale;
    else if (this.verLessThan("1.20.5")) mob.vel.y = mob.jumpStrength * scale * blockJumpFactor;
    else mob.vel.y = f32(f32(f32(mob.jumpStrength) * scale) * f32(blockJumpFactor));
    mob.horseJumping = true;
    if (forward > 0) {
      const yaw = floatRadians(mob.yawDegrees ?? 0);
      mob.vel.x += f32(f32(f32(-0.4) * this.mth.sin(yaw)) * scale);
      mob.vel.z += f32(f32(f32(0.4) * this.mth.cos(yaw)) * scale);
    }
  }

  /**
   * The camel's travelRidden part (AbstractHorse, Camel): the input it takes (xxa * 0.5F, zza, a quarter of it
   * backwards; none while it refuses to move), then tickRidden (turn to the rider, dash when the rider asked on the
   * ground), and the speed (MOVEMENT_SPEED, + 0.1F while the rider sprints and it can dash).
   */
  private tickRiddenCamel(mob: RiddenMobState, rider: RiderInput) {
    const f32 = Math.fround;
    const refuseToMove = this.camelRefusesToMove(mob);
    const xxa = f32(rider.xxa ?? 0);
    const zza = f32(rider.zza ?? 0);
    mob.heading = refuseToMove ? { forward: 0, strafe: 0 } : { forward: zza <= 0 ? f32(zza * f32(0.25)) : zza, strafe: f32(xxa * f32(0.5)) };
    // AbstractHorse.tickRidden: setRot(rider yaw, rider pitch * 0.5F) unless it refuses to move
    if (!refuseToMove) {
      mob.yawDegrees = f32(f32(rider.yawDegrees) % 360);
      mob.pitchDegrees = f32(f32(f32(rider.pitchDegrees) * f32(0.5)) % 360);
      mob.pitch = -mob.pitchDegrees * (Math.PI / 180);
    }
    if (mob.onGround) {
      if (mob.jumpPendingScale > 0) this.camelDash(mob, mob.jumpPendingScale);
      mob.jumpPendingScale = 0;
    }
    // Camel.tickRidden: moving forward stands it up
    if (zza > 0 && mob.camelSitting && !this.camelInPoseTransition(mob)) {
      mob.camelSitting = false;
      mob.poseTime = 0;
    }
    const sprintBonus = rider.sprinting && mob.dashCooldown === 0 ? f32(0.1) : 0;
    mob.riddenSpeed = f32(f32(mob.movementSpeed) + sprintBonus);
  }

  /**
   * A server teleport of the mob its rider controls (ClientPacketListener.handleTeleportEntity, which applies it to a
   * controlled vehicle from 1.21.2): the mob interpolates there over 3 ticks (LivingEntity.lerpTo, InterpolationHandler),
   * or is put there at once when it is more than 64 blocks away.
   */
  teleportRidden(mob: RiddenMobState, target: Vec3, rotation?: { yaw: number; pitch: number }) {
    if (mob.pos.distanceSquared(target) > 4096) {
      mob.pos.set(target.x, target.y, target.z);
      if (rotation) this.setRidden(mob, rotation.yaw, rotation.pitch);
      mob.lerpSteps = 0;
      mob.lerpTarget = null;
      mob.lerpYaw = null;
      mob.keptBoundingBox = null;
      return;
    }
    this.interpolateRidden(mob, target, 3, rotation);
  }

  /**
   * The mob eases to target over the steps left (LivingEntity.lerpTo, InterpolationHandler.interpolateTo), turning to
   * the rotation given (float degrees); without one, from 1.21.5, to the rotation it already heads to, else its own
   * (AbstractInterpolationHandler.interpolateTo). What a teleport of the mob starts, and the interpolation of the
   * server's moves the mob was in when its rider took control of it.
   */
  interpolateRidden(mob: RiddenMobState, target: Vec3, steps: number, rotation?: { yaw: number; pitch: number }) {
    const heading = mob.lerpSteps > 0 && mob.lerpYaw !== null ? { yaw: mob.lerpYaw, pitch: mob.lerpPitch } : null;
    const to = rotation ?? (this.verLessThan("1.21.5") ? null : heading ?? { yaw: mob.yawDegrees ?? 0, pitch: mob.pitchDegrees });
    mob.lerpTarget = target.clone();
    mob.lerpSteps = steps;
    mob.lerpPrevious = mob.pos.clone();
    mob.lerpYaw = to ? Math.fround(to.yaw) : null;
    mob.lerpPitch = to ? Math.fround(to.pitch) : 0;
    mob.lerpPreviousRotation = { yaw: mob.yawDegrees ?? 0, pitch: mob.pitchDegrees };
    // 26.3+: one step of the update interval (3 ticks) from where the mob is (SteppedInterpolationHandler: its first
    // tick a third of the way)
    if (!this.verLessThan("26.3")) {
      mob.lerpStart = mob.pos.clone();
      mob.lerpStartRotation = { yaw: mob.yawDegrees ?? 0, pitch: mob.pitchDegrees };
      mob.lerpTicks = 1 + (3 - steps);
    }
  }

  /** Entity.setRot: the yaw and pitch, each kept within 360. */
  private setRidden(mob: RiddenMobState, yaw: number, pitch: number) {
    mob.yawDegrees = Math.fround(yaw % 360);
    mob.pitchDegrees = Math.fround(pitch % 360);
    mob.pitch = -mob.pitchDegrees * (Math.PI / 180);
  }

  /** Where the mob is headed (Entity.lerpTargetX, what the vehicle move reports): the teleport's target while it runs. */
  lerpTargetOf(mob: RiddenMobState): Vec3 {
    return mob.lerpSteps > 0 && mob.lerpTarget ? mob.lerpTarget.clone() : mob.pos.clone();
  }

  /**
   * The rotation the vehicle move reports (Entity.lerpTargetYRot / XRot from 1.21.5, the InterpolationHandler's target
   * while it runs; before, the mob's own rotation), in float degrees.
   */
  lerpTargetRotationOf(mob: RiddenMobState): { yaw: number; pitch: number } {
    if (!this.verLessThan("1.21.5") && mob.lerpSteps > 0 && mob.lerpYaw !== null) return { yaw: mob.lerpYaw, pitch: mob.lerpPitch };
    return { yaw: mob.yawDegrees ?? 0, pitch: mob.pitchDegrees };
  }

  /** Camel.executeRidersJump: a dash along its look, 22.2222F * scale * MOVEMENT_SPEED far and 1.4285F * scale high. */
  private camelDash(mob: RiddenMobState, scale: number) {
    const f32 = Math.fround;
    // the jump power: in double before 1.20.5, LivingEntity.getJumpPower (float) since
    const blockJumpFactor = this.getBlockJumpFactor(mob, this.colliderWorld!, this.colliderCtx!.worldSettings);
    const jumpPower = this.verLessThan("1.20.5") ? mob.jumpStrength * blockJumpFactor : f32(f32(mob.jumpStrength) * blockJumpFactor);
    const look = this.lookAngle(mob);
    const length = Math.sqrt(look.x * look.x + look.z * look.z);
    const horizontal = length < 1.0e-5 ? 0 : f32(f32(22.2222) * scale) * mob.movementSpeed * this.getBlockSpeedFactor(mob, this.colliderWorld!);
    mob.vel.x += length < 1.0e-5 ? 0 : (look.x / length) * horizontal;
    mob.vel.z += length < 1.0e-5 ? 0 : (look.z / length) * horizontal;
    mob.vel.y += f32(f32(1.4285) * scale) * jumpPower;
    mob.dashCooldown = 55;
    mob.dashing = true;
  }

  /** Camel.refuseToMove: sitting, or sitting down or standing up. */
  private camelRefusesToMove(mob: RiddenMobState): boolean {
    return mob.camelSitting || this.camelInPoseTransition(mob);
  }

  private camelInPoseTransition(mob: RiddenMobState): boolean {
    return mob.poseTime < (mob.camelSitting ? 40 : 52);
  }

  /**
   * The rider's jump released (LocalPlayer.aiStep calls onPlayerJump with the charge in percent): a camel that can
   * dash, saddled on the ground with its cooldown run out, dashes at its next tick (getPlayerJumpPendingScale).
   */
  riderJump(mob: RiddenMobState, power: number) {
    if (HORSE_TYPES.has(mob.type)) {
      // AbstractHorse.onPlayerJump: a charge lets a rearing horse move and rears it where the client runs its AI
      // (standIfPossible), and jumps at its next tick on the ground
      const f32 = Math.fround;
      if (power >= 0) {
        mob.allowStandSliding = true;
        if (this.horseStandsLocally() && canPerformRearing(mob)) {
          mob.standing = true;
          mob.standCounter = this.verLessThan("1.21.6") ? 1 : 20;
        }
      }
      const percent = Math.max(0, power);
      mob.jumpPendingScale = percent >= 90 ? 1 : f32(f32(0.4) + f32(f32(f32(0.4) * percent) / f32(90)));
      return;
    }
    // AbstractNautilus.onPlayerJump: saddled, with its cooldown run out, it dashes at its next tick
    if (NAUTILUS_TYPES.has(mob.type)) {
      if (mob.dashCooldown > 0) return;
      const f32 = Math.fround;
      const percent = Math.max(0, power);
      mob.jumpPendingScale = percent >= 90 ? 1 : f32(f32(0.4) + f32(f32(f32(0.4) * percent) / f32(90)));
      return;
    }
    if (mob.type !== "camel" || mob.dashCooldown > 0 || !mob.onGround) return;
    const f32 = Math.fround;
    const percent = Math.max(0, power);
    mob.jumpPendingScale = percent >= 90 ? 1 : f32(f32(0.4) + f32(f32(f32(0.4) * percent) / f32(90)));
  }

  /**
   * Whether the client runs the ridden horse's rearing (AbstractHorse.standIfPossible and its counter): the locally
   * controlled horse before 1.19.4; 1.19.4 - 1.21.4 only the server (isEffectiveAi); from 1.21.5 the client that moves
   * the horse (isEffectiveAi is isLocalInstanceAuthoritative).
   */
  private horseStandsLocally(): boolean {
    return this.verLessThan("1.19.4") || !this.verLessThan("1.21.5");
  }

  /**
   * Strider.tick: warm when the block at its feet or the one it stands on is in STRIDER_WARM_BLOCKS (lava) or it
   * touched lava in the tick before.
   */
  private isWarmForStrider(mob: RiddenMobState, world: World): boolean {
    return this.isLava(world.getBlock(mob.pos.floored())) || this.isLava(world.getBlock(this.getOnPosLegacy(mob, world))) || mob.isInLava;
  }

  private isLava(block: Block | null | undefined): boolean {
    return block != null && block.type === this.lavaId;
  }

  /** EntityCollisionContext.isAbove: the entity's feet above the shape's top in the block, less 1e-5F. */
  private isAboveStableFluid(mob: RiddenMobState, pos: Vec3): boolean {
    return mob.pos.y > pos.y + STABLE_FLUID_SHAPE[4] - 9.999999747378752e-6;
  }

  /**
   * LiquidBlock.getCollisionShape: a still lava block (LEVEL 0) under no lava is its lower half for a strider whose
   * feet are above that (LivingEntity.canStandOnFluid).
   */
  protected collisionShapes(block: Block, pos: Vec3): AABBPoints[] {
    const mob = this.collider;
    if (mob instanceof RiddenMobState && mob.type === "strider" && block.type === this.lavaId) {
      const level = Number(block.getProperties().level ?? block.metadata);
      const lavaAbove = this.isLava(this.colliderWorld?.getBlock(pos.offset(0, 1, 0)));
      return level === 0 && !lavaAbove && this.isAboveStableFluid(mob, pos) ? [STABLE_FLUID_SHAPE] : [];
    }
    return super.collisionShapes(block, pos);
  }

  /** AbstractNautilus.isPushedByFluid: no current moves a nautilus. */
  protected isPushedByFluid(player: PlayerState): boolean {
    if (player instanceof RiddenMobState && NAUTILUS_TYPES.has(player.type)) return false;
    return super.isPushedByFluid(player);
  }

  /** Strider.checkFallDamage: a strider in lava skips LivingEntity.checkFallDamage and its look at the fluids. */
  protected fluidsAfterMove(ctx: EPhysicsCtx, world: World) {
    const mob = ctx.state;
    if (mob instanceof RiddenMobState && mob.type === "strider" && mob.isInLava) return;
    super.fluidsAfterMove(ctx, world);
  }

  /**
   * The speed ItemSteerable.travel takes the air speed from before 1.19.4 (flyingSpeed = getSpeed() * 0.1F, before it
   * sets the steering speed): the speed of the tick before, but a strider's Strider.travel sets it first to its move
   * speed (MOVEMENT_SPEED, * 0.66F while suffocating, in float).
   */
  private legacyFlyingBase(mob: RiddenMobState, speedBefore: number): number {
    if (mob.type !== "strider") return speedBefore;
    const f32 = Math.fround;
    return f32(f32(mob.movementSpeed) * (mob.suffocating ? f32(0.66) : 1));
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
    ctx.stepHeight = Math.max(mob.type === "camel" ? 1.5 : 0.6, 1);
    // HappyGhast.travel flies, in a fluid too
    if (mob.type === "happy_ghast") {
      this.travelHappyGhast(ctx, world);
      return;
    }
    // AbstractNautilus.travelInWater: its input at its speed, the move, then 0.9 of the motion kept (no gravity)
    const nautilus = NAUTILUS_TYPES.has(mob.type);
    if (nautilus && mob.isInWater) {
      this.moveRelative3d(mob.riddenSpeed, mob.riddenInput, mob);
      this.applyMovement(ctx, world);
      mob.vel.scale(0.9);
      return;
    }
    // LivingEntity.shouldTravelInFluid: not in a fluid it stands on (a strider in lava)
    const standsOnFluid = mob.type === "strider" && this.isLava(world.getBlock(mob.pos.floored()));
    if ((mob.isInWater || mob.isInLava) && !standsOnFluid) {
      this.movePlayer(ctx, world);
      return;
    }

    const f32 = Math.fround;
    // Camel.travel: it does not move while it refuses to, on the ground
    if (mob.type === "camel" && this.camelRefusesToMove(mob) && mob.onGround) {
      mob.vel.x = 0;
      mob.vel.z = 0;
      mob.heading = { forward: 0, strafe: 0 };
    }
    const blockBelow = world.getBlock(this.getBlockBelowAffectingMovement(mob, world));
    const friction = (blockBelow ? this.blockSlipperiness[blockBelow.type] : undefined) ?? ctx.worldSettings.defaultSlipperiness;
    const inertia = mob.onGround ? f32(f32(friction) * f32(0.91)) : f32(0.91);
    const inputStrength = mob.onGround ? this.getFrictionInfluencedSpeed(mob.riddenSpeed, friction) : airSpeed;
    // (a nautilus's input has its up along the rider's look)
    if (nautilus) this.moveRelative3d(inputStrength, mob.riddenInput, mob);
    else this.applyInputs(inputStrength, mob);

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
