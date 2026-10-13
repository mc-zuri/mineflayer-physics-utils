import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The first tick of walking east from rest on a strip of slow blocks (the recorder's "surfaces" area: honey at
// z 1168..1170, soul sand at z 1172..1174, on y 100). Entity.move ends by scaling the motion by the block speed
// factor, 0.4F for both (since 1.21 lerped toward 1 by the movement efficiency attribute).
function walkOn(version: string, block: string, z: number, height: number, attributes?: object) {
  const y = 100 + height;
  const world = createFlatWorld(version, 100);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, y, z), groundLevel: y });
  for (let x = -4; x <= 22; x++) {
    for (let stripZ = Math.floor(z) - 1; stripZ <= Math.floor(z) + 1; stripZ++) {
      world.setOverrideBlock(new Vec3(x, 100, stripZ), rig.mcData.blocksByName[block].id);
    }
  }
  if (attributes) rig.playerState.attributes = attributes as any;
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;

  rig.physics.simulate(rig.playerCtx, world as any);

  return rig.playerState.vel.x;
}

describe("Botcraft block speed factor", () => {
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`slows a walk on soul sand as vanilla (${version}, s_walk_soul_sand)`, () => {
      expect(walkOn(version, "soul_sand", 1173.5, 0.875)).toBe(0.021403203540468353);
    });
  }

  it("slows a walk on honey as vanilla (1.21.11, s_walk_honey_block)", () => {
    expect(walkOn("1.21.11", "honey_block", 1169.5, 0.9375)).toBe(0.021403203540468353);
  });

  it("lets Soul Speed's movement efficiency lift the slowdown (1.21.11, q_soul_speed_1_walk_soul_sand)", () => {
    const rig = createBotcraftPlayerRig({ version: "1.21.11", position: new Vec3(0, 0, 0) });
    const soulSpeed = "minecraft:enchantment.soul_speed/feet";
    const attributes = {
      [rig.physics.movementSpeedAttribute]: { value: 0.10000000149011612, modifiers: [{ uuid: soulSpeed, amount: 0.04050000011920929, operation: 0 }] },
      [rig.physics.movementEfficiencyAttribute]: { value: 0, modifiers: [{ uuid: soulSpeed, amount: 1, operation: 0 }] },
    };
    expect(walkOn("1.21.11", "soul_sand", 1173.5, 0.875, attributes)).toBe(0.0751787550431689);
  });
});
