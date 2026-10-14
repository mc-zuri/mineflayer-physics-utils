import type { Bot } from "mineflayer";
import { Vec3 } from "vec3";
import { IPhysics } from "../engines/IPhysics";
import { ControlStateHandler } from "../player/playerControls";
import { PlayerState } from "./playerState";

/** The mobs a player rides and steers itself: their own movement is LivingEntity.travel with the rider's input. */
export type RiddenMobType = "pig" | "strider" | "camel";

/** EntityType dimensions (EntityType.Builder.sized), in float. */
const DIMENSIONS: Record<RiddenMobType, { width: number; height: number }> = {
  pig: { width: Math.fround(0.9), height: Math.fround(0.9) },
  strider: { width: Math.fround(0.9), height: Math.fround(1.7) },
  camel: { width: Math.fround(1.7), height: Math.fround(2.375) },
};

/** The base movement speed of each mob (createAttributes' MOVEMENT_SPEED). */
const MOVEMENT_SPEED: Record<RiddenMobType, number> = {
  pig: 0.25,
  strider: 0.17499999701976776,
  camel: 0.09000000357627869,
};

export interface RiddenMobInit {
  type: RiddenMobType;
  pos: Vec3;
  vel?: Vec3;
  yawDegrees?: number;
  onGround?: boolean;
  /** the MOVEMENT_SPEED attribute's value, when it is not the mob's base */
  movementSpeed?: number;
}

/**
 * The state of a mob the local player rides and steers (its LivingEntity fields the engine needs): a PlayerState
 * with the mob's dimensions, so BotcraftPhysics' Entity.move and block lookups apply to it unchanged.
 */
export class RiddenMobState extends PlayerState {
  public readonly type: RiddenMobType;
  /** the MOVEMENT_SPEED attribute's value */
  public movementSpeed: number;
  /** LivingEntity.speed: what the last travelRidden set (getRiddenSpeed) */
  public riddenSpeed = 0;
  /** ItemBasedSteering (pig, strider): boosting, the ticks into the boost and its length (DATA_BOOST_TIME) */
  public boosting = false;
  public boostTime = 0;
  public boostTimeTotal = 0;

  constructor(ctx: IPhysics, init: RiddenMobInit) {
    super(ctx, fakeBot(init));
    this.type = init.type;
    this.dimensions = DIMENSIONS[init.type];
    this.movementSpeed = init.movementSpeed ?? MOVEMENT_SPEED[init.type];
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
