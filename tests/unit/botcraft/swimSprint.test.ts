import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { PlayerPoses } from "../../../src/physics/states/poses";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// LocalPlayer.aiStep keeps a sprint by the swim rules while the swimming flag is set (Entity.isSwimming): only
// leaving the water, or losing the forward input off the ground, stops it. A swimmer surfacing with its eyes out of
// the water keeps sprinting; the run rule (in water but not under water) does not apply.
// Recorded as b_water_sprint_swim_surface_up (1.21.11): sprint swimming east and up (pitch -60), tick 15, the first
// tick the eyes of the tick before were out of the water.
describe("Botcraft sprinting while swimming", () => {
  it("keeps the sprint by the swimming flag when the eyes surface (1.21.11, b_water_sprint_swim_surface_up)", () => {
    const version = "1.21.11";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(1.8689285598406133, 100.65696138952488, 1833.5), groundLevel: 97 });
    const world = createFlatWorld(version, 97);
    for (let x = -3; x <= 8; x++) {
      for (let y = 97; y <= 100; y++) {
        for (let z = 1831; z <= 1835; z++) world.setOverrideBlock(new Vec3(x, y, z), rig.mcData.blocksByName.water.id);
      }
    }
    const state = rig.playerState;
    state.vel.set(0.13554711129200958, 0.0790598007429575, 0);
    state.onGround = false;
    state.isInWater = true;
    state.isUnderWater = true;
    state.eyeInWater = false; // the eyes left the water at the start of the tick before
    state.sprinting = true;
    state.swimming = true;
    state.pose = PlayerPoses.SWIMMING;
    state.yawDegrees = 270;
    state.pitch = (60 * Math.PI) / 180;
    state.control.forward = true;
    state.control.sprint = true;

    rig.physics.simulate(rig.playerCtx, world as any);

    expect(state.isUnderWater).toBe(false);
    expect(state.sprinting).toBe(true);
    expect(state.swimming).toBe(true);
    expect(state.pos.x).toBe(2.0240756710759986);
    expect(state.vel.x).toBe(0.13963239641285127);
  });
});
