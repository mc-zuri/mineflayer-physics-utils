import { Block } from "prismarine-block";
import { world } from "prismarine-world";
import { Vec3 } from "vec3";
import * as math from "../info/math";
import { EPhysicsCtx } from "../settings/entityPhysicsCtx";
import { HORSE_TYPES, RiddenMobState } from "../states/riddenMobState";
import { floatRadians } from "../../util/mth";
import { BotcraftPhysics } from "./botcraft";

type World = { getBlock: world.WorldSync["getBlock"] };
type AABBPoints = [number, number, number, number, number, number];

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
}

/**
 * The client side of a mob the local player rides and steers (pig, strider, camel): the vehicle ticks before its
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
    if (mob.type === "strider") mob.suffocating = !this.isWarmForStrider(mob, world);

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

    // AbstractHorse.travel before 1.19.4: once on the ground after the move, a pending jump is dropped and the jump
    // ends
    if (HORSE_TYPES.has(mob.type) && this.verLessThan("1.19.4") && mob.onGround) {
      mob.jumpPendingScale = 0;
      mob.horseJumping = false;
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
        // * 0.55F, or 0.35F suffocating, * the boost factor
        mob.yawDegrees = f32(f32(rider.yawDegrees) % 360);
        this.tickBoost(mob);
        mob.heading = { forward: 1, strafe: 0 };
        const movementSpeed = mob.suffocating ? mob.movementSpeed + mob.movementSpeed * -0.3400000035762787 : mob.movementSpeed;
        mob.riddenSpeed = f32(movementSpeed * f32(mob.suffocating ? 0.35 : 0.55) * this.boostFactor(mob));
        return;
      }
      case "camel":
        this.tickRiddenCamel(mob, rider);
        return;
    }
    if (HORSE_TYPES.has(mob.type)) this.tickRiddenHorse(mob, rider);
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
      // AbstractHorse.onPlayerJump: a charge lets a rearing horse move, and jumps at its next tick on the ground
      const f32 = Math.fround;
      if (power >= 0) mob.allowStandSliding = true;
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
