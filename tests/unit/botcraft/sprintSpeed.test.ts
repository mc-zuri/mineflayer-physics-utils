import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// The first tick of sprinting forward on stone from rest, facing south, as recorded vanilla clients made it.
// LivingEntity.setSprinting adds the 0.30000001192092896 multiply-total modifier to the movement speed the server
// synced (the player's base is 0.1F); it does not replace that attribute.
function sprintTick(version: string, movementSpeed?: number) {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, groundLevel, 38.5), groundLevel });
  if (movementSpeed !== undefined) {
    rig.playerState.attributes = { [rig.physics.movementSpeedAttribute]: { value: movementSpeed, modifiers: [] } } as any;
  }
  rig.playerState.yawDegrees = 0;
  rig.playerState.control.forward = true;
  rig.playerState.control.sprint = true;

  rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

  return { z: rig.playerState.pos.z, velocityZ: rig.playerState.vel.z };
}

describe("Botcraft sprint speed", () => {
  it("sprints the first tick as vanilla with the default speed (1.12.2, j_sprint_f)", () => {
    expect(sprintTick("1.12.2")).toEqual({ z: 38.62739998102188, velocityZ: 0.06956039771757005 });
  });

  for (const version of ["1.20.4", "1.21.11"]) {
    it(`sprints the first tick as vanilla with the default speed (${version}, j_sprint_f)`, () => {
      expect(sprintTick(version)).toEqual({ z: 38.62740001240969, velocityZ: 0.0695604148553142 });
    });

    it(`keeps the movement speed the server set when sprinting (${version}, e_attr_movement_speed_*)`, () => {
      expect(sprintTick(version, 0.2)).toEqual({ z: 38.7547999956131, velocityZ: 0.13912081376399957 });
      expect(sprintTick(version, 0.05)).toEqual({ z: 38.563699998903274, velocityZ: 0.03478020344099989 });
    });
  }
});
