import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { IPhysics } from "../engines/IPhysics";
import { ControlStateHandler } from "../player/playerControls";
import { PlayerState } from "./playerState";

/** The mobs a player rides and steers itself: their own movement is LivingEntity.travel with the rider's input. */
export type RiddenMobType = "pig" | "strider" | "camel" | "happy_ghast" | NautilusType | HorseType;

/** The nautiluses a player rides and steers once saddled (AbstractNautilus, 26.1+). */
export type NautilusType = "nautilus" | "zombie_nautilus";
export const NAUTILUS_TYPES: ReadonlySet<string> = new Set<NautilusType>(["nautilus", "zombie_nautilus"]);

/** The horses a player rides and steers once saddled (AbstractHorse). */
export type HorseType = "horse" | "donkey" | "mule" | "skeleton_horse" | "zombie_horse";
export const HORSE_TYPES: ReadonlySet<string> = new Set<HorseType>(["horse", "donkey", "mule", "skeleton_horse", "zombie_horse"]);

/** EntityType dimensions (EntityType.Builder.sized), in float. */
const DIMENSIONS: Record<RiddenMobType, { width: number; height: number }> = {
  pig: { width: Math.fround(0.9), height: Math.fround(0.9) },
  strider: { width: Math.fround(0.9), height: Math.fround(1.7) },
  camel: { width: Math.fround(1.7), height: Math.fround(2.375) },
  happy_ghast: { width: 4, height: 4 },
  nautilus: { width: Math.fround(0.875), height: Math.fround(0.95) },
  zombie_nautilus: { width: Math.fround(0.875), height: Math.fround(0.95) },
  horse: { width: Math.fround(1.3964844), height: Math.fround(1.6) },
  donkey: { width: Math.fround(1.3964844), height: Math.fround(1.5) },
  mule: { width: Math.fround(1.3964844), height: Math.fround(1.6) },
  skeleton_horse: { width: Math.fround(1.3964844), height: Math.fround(1.6) },
  zombie_horse: { width: Math.fround(1.3964844), height: Math.fround(1.6) },
};

/** The base movement speed of each mob (createAttributes' MOVEMENT_SPEED). */
const MOVEMENT_SPEED: Record<RiddenMobType, number> = {
  pig: 0.25,
  strider: 0.17499999701976776,
  camel: 0.09000000357627869,
  happy_ghast: 0.05,
  nautilus: 1,
  zombie_nautilus: 1.100000023841858,
  horse: 0.22499999403953552,
  donkey: 0.17499999701976776,
  mule: 0.17499999701976776,
  skeleton_horse: 0.20000000298023224,
  zombie_horse: 0.20000000298023224,
};

export interface RiddenMobInit {
  type: RiddenMobType;
  pos: Vec3;
  vel?: Vec3;
  yawDegrees?: number;
  onGround?: boolean;
  /** the MOVEMENT_SPEED attribute's value, when it is not the mob's base */
  movementSpeed?: number;
  /** a horse's or camel's JUMP_STRENGTH attribute's value */
  jumpStrength?: number;
  /** a happy ghast's FLYING_SPEED attribute's value, when it is not its base */
  flyingSpeed?: number;
}

/**
 * The state of a mob the local player rides and steers (its LivingEntity fields the engine needs): a PlayerState
 * with the mob's dimensions, so BotcraftPhysics' Entity.move and block lookups apply to it unchanged.
 */
export class RiddenMobState extends PlayerState {
  public readonly type: RiddenMobType;
  /** the MOVEMENT_SPEED attribute's value */
  public movementSpeed: number;
  /** HappyGhast: the FLYING_SPEED attribute's value (createAttributes: 0.05) */
  public flyingSpeed = 0.05;
  /** HappyGhast, AbstractNautilus: what getRiddenInput took from the rider this tick (strafe, up, forward), the travel's input */
  public riddenInput = new Vec3(0, 0, 0);
  /** LivingEntity.speed: what the last travelRidden set (getRiddenSpeed) */
  public riddenSpeed = 0;
  /** ItemBasedSteering (pig, strider): boosting, the ticks into the boost and its length (DATA_BOOST_TIME) */
  public boosting = false;
  public boostTime = 0;
  public boostTimeTotal = 0;
  /** Strider: off the warm blocks (DATA_SUFFOCATING) */
  public suffocating = false;
  /** Mob.isNoAi (its flags' bit 1): a strider without AI keeps the suffocating it was synced */
  public noAi = false;
  /** Camel (AbstractHorse): the JUMP_STRENGTH attribute's value, the dash the rider asked for (playerJumpPendingScale) */
  public jumpStrength = 0.41999998688697815;
  public jumpPendingScale = 0;
  /** where a server teleport has the mob interpolate to, and the steps left (LivingEntity.lerpTo, InterpolationHandler) */
  public lerpTarget: Vec3 | null = null;
  public lerpSteps = 0;
  /** InterpolationHandler (1.21.5+): where the last step left the mob, to carry its own moves into the target */
  public lerpPrevious: Vec3 | null = null;
  /** SteppedInterpolationHandler (26.3+): where the step starts from (lastStepPosRot) and the ticks into it */
  public lerpStart: Vec3 | null = null;
  public lerpTicks = 0;
  /** Camel, AbstractNautilus: ticks until it can dash again, and whether it dashes (DASH) */
  public dashCooldown = 0;
  public dashing = false;
  /** Camel: sitting, and the ticks since it last sat down or stood up (getPoseTime) */
  public camelSitting = false;
  public poseTime = 1000;
  /** the mob's pitch in float degrees (the camel dashes along its look) */
  public pitchDegrees = 0;
  /** AbstractHorse: jumping (setIsJumping), rearing (DATA_ID_FLAGS 32) and the rider's jump letting it move rearing */
  public horseJumping = false;
  public standing = false;
  public allowStandSliding = false;
  /** AbstractHorse.standCounter: the ticks the rearing the horse started itself has lasted (or, from 1.21.6, has left) */
  public standCounter = 0;
  /** AbstractHorse.standAnim and standAnimO: its stand animation now and before its last tick (0 - 1, in float) */
  public standAnim = 0;
  public standAnimO = 0;

  constructor(ctx: IPhysics, init: RiddenMobInit) {
    super(ctx, fakeBot(init));
    this.type = init.type;
    this.dimensions = DIMENSIONS[init.type];
    this.movementSpeed = init.movementSpeed ?? MOVEMENT_SPEED[init.type];
    if (init.jumpStrength !== undefined) this.jumpStrength = init.jumpStrength;
    if (init.flyingSpeed !== undefined) this.flyingSpeed = init.flyingSpeed;
    this.yawDegrees = init.yawDegrees ?? 0;
    this.lastOnGround = this.onGround;
    this.control = ControlStateHandler.DEFAULT();
  }

  /** ItemBasedSteering.onSynced: the boost time arrived from the server (the rider used its item). */
  public startBoost(boostTimeTotal: number) {
    this.boosting = true;
    this.boostTime = 0;
    this.boostTimeTotal = boostTimeTotal;
  }
}

// The fields PlayerState reads from a bot, for a mob that has none.
function fakeBot(init: RiddenMobInit): Bot {
  const entity = {
    position: init.pos.clone(),
    velocity: (init.vel ?? new Vec3(0, 0, 0)).clone(),
    onGround: init.onGround ?? false,
    yaw: 0,
    pitch: 0,
    effects: {},
    attributes: {},
    equipment: [],
    metadata: [],
  };
  return {
    entity,
    inventory: { slots: [] },
    food: 20,
    game: { gameMode: "survival" },
    getControlState: () => false,
    getEquipmentDestSlot: () => 0,
  } as unknown as Bot;
}
