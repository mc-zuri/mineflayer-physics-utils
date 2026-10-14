import { Vec3 } from "vec3";
import { RiddenMobPhysics } from "../../../src/physics/engines/riddenMobPhysics";
import { EPhysicsCtx } from "../../../src/physics/settings";
import { RiddenMobState, RiddenMobType } from "../../../src/physics/states/riddenMobState";
import { loadMcData } from "./botcraftTestSupport";

/** A ridden mob where a recording has it: its state, the engine and the context it is simulated in. */
export function createRiddenMobRig(options: {
  version: string;
  type: RiddenMobType;
  pos: [number, number, number];
  vel: [number, number, number];
  yawDegrees: number;
  onGround?: boolean;
  /** the box vanilla kept (before 1.17 the position is its centre), as the recorder logs it */
  box?: [number, number, number, number, number, number];
}) {
  const { mcData } = loadMcData(options.version);
  const physics = new RiddenMobPhysics(mcData);
  const state = new RiddenMobState(physics, {
    type: options.type,
    pos: new Vec3(...options.pos),
    vel: new Vec3(...options.vel),
    yawDegrees: options.yawDegrees,
    onGround: options.onGround ?? true,
  });
  if (options.box) {
    const bb = state.getBB();
    bb.set(...options.box);
    state.keptBoundingBox = { bb, pos: state.pos.clone(), width: state.dimensions!.width, height: state.dimensions!.height };
  }
  const ctx = EPhysicsCtx.FROM_ENTITY_STATE(physics, state, mcData.entitiesByName.player);
  return { mcData, physics, state, ctx };
}
