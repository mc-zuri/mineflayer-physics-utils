import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// b_water_walk_out_to_land: walking west at yaw 90 from (-4.5, 100.5, 1833.5) through water (y 99 east of x -6,
// y 100 everywhere) onto the stone at y 99, x <= -6. The swim leaves a z motion of about 2e-18 that the landing tick
// meets the floor with. Entity.move before 1.14: 1.13's VoxelShapes.calculateMaxOffset drops a move under 1e-7 once
// a collider is in reach, and the collision flags compare the moves exactly, so that z counts as a horizontal
// collision and the z motion is reset; before 1.13 AxisAlignedBB.calculateZOffset keeps it.
function walkOutOfWater(version: string, ticks: number) {
  const world = createFlatWorld(version, 99);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(-4.5, 100.5, 1833.5), groundLevel: 100 });
  const { stone, water } = rig.mcData.blocksByName;
  for (let x = -10; x <= 20; x++) {
    for (let z = 1830; z <= 1838; z++) {
      world.setOverrideBlock(new Vec3(x, 99, z), x <= -6 ? stone.id : water.id);
      world.setOverrideBlock(new Vec3(x, 100, z), water.id);
    }
  }
  rig.playerState.yawDegrees = 90;
  rig.playerState.control.forward = true;
  for (let i = 0; i < ticks; i++) rig.physics.simulate(rig.playerCtx, world as any);
  return rig.playerState;
}

describe("Botcraft Entity.move before 1.14", () => {
  it("drops the tiny z move against the floor as a collision (1.13.2, b_water_walk_out_to_land tick 25)", () => {
    const player = walkOutOfWater("1.13.2", 25);
    expect(player.onGround).toBe(true);
    expect(player.pos.x).toBe(-6.559481052765083);
    expect(player.isCollidedHorizontally).toBe(true);
    expect(player.vel.z).toBe(0);
  });

  it("keeps the tiny z move against the floor (1.12.2, b_water_walk_out_to_land tick 10)", () => {
    const player = walkOutOfWater("1.12.2", 10);
    expect(player.onGround).toBe(true);
    expect(player.pos.x).toBe(-5.130090704731799);
    expect(player.isCollidedHorizontally).toBe(false);
    expect(player.vel.z).toBe(1.9202463847881833e-18);
  });
});
