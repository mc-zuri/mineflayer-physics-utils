import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld, loadMcData } from "../../helpers/unit/botcraftTestSupport";

// The recorder's pointed dripstone strip: upward tips over x 3..5, z 1424..1426 on flat ground (y 100). Their shape
// is moved by the offset of each column (BlockBehaviour's OffsetType.XZ from Mth.getSeed(x, 0, z)), so the tips do not
// stand where minecraft-data's shape (the offset of column 0, 0) puts them.
function onDripstone(version: string, position: Vec3) {
  const { Block } = loadMcData(version);
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position });
  const tip = Block.fromProperties("pointed_dripstone", { vertical_direction: "up", thickness: "tip", waterlogged: "false" }, 0);
  for (let x = 3; x <= 5; x++) {
    for (let z = 1424; z <= 1426; z++) world.setOverrideBlock(new Vec3(x, 101, z), tip.type, tip.metadata);
  }
  rig.playerState.yawDegrees = 270;
  return { state: rig.playerState, tick: () => rig.physics.simulate(rig.playerCtx, world as any) };
}

describe("Botcraft offset block shapes", () => {
  // The tip at x 5, z 1425 is offset east, so the player walking off it is still held at its top (0.6875).
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`holds a player on an offset dripstone tip (${version}, g_step_jump_pointed_dripstone tick 29)`, () => {
      const { state, tick } = onDripstone(version, new Vec3(5.889567743088254, 101.6875, 1425.5));
      state.vel.set(0.11796674441830877, -0.0784000015258789, 0);
      tick();
      expect(state.pos.x).toBe(6.007534487506562);
      expect(state.pos.y).toBe(101.6875);
      expect(state.vel.x).toBe(0.0644098499337699);
      expect(state.onGround).toBe(true);
    });
  }

  // 26.2's sulfur spike is offset as pointed dripstone is (OffsetType.XZ, getMaxHorizontalOffset 0.125F; its shapes
  // are the dripstone's), so its tips stand where the dripstone tips of the same column would.
  for (const version of ["26.2", "26.3"]) {
    it(`moves a sulfur spike by its column's offset as a dripstone tip (${version})`, () => {
      const { Block } = loadMcData(version);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(5.5, 101, 1425.5) });
      const props = { vertical_direction: "up", thickness: "tip", waterlogged: "false" };
      const spike = Block.fromProperties("sulfur_spike", props, 0);
      const tip = Block.fromProperties("pointed_dripstone", props, 0);
      const pos = new Vec3(5, 101, 1425);
      const shapes = (block: any) => (rig.physics as any).collisionShapes(block, pos);
      expect(shapes(spike)).toEqual(shapes(tip));
      expect(shapes(spike)).not.toEqual(spike.shapes);
    });
  }
});
