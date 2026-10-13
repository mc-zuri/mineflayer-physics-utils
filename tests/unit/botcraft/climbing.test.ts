import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld, loadMcData } from "../../helpers/unit/botcraftTestSupport";

// The recorder's climbing area: a column of climbable blocks at x 5 from y 101 up, against a stone wall at x 6, the
// player starting at its foot (5.5, 101, z) facing it (yaw 270).
function climbRig(version: string, z: number, column: Array<[string, Record<string, string>]>) {
  const { Block } = loadMcData(version);
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(5.5, 101, z) });
  column.forEach(([name, properties], i) => {
    const block = Block.fromProperties(name, properties, 0);
    world.setOverrideBlock(new Vec3(5, 101 + i, Math.floor(z)), block.type, block.metadata);
  });
  for (let y = 101; y <= 105; y++) {
    world.setOverrideBlock(new Vec3(6, y, Math.floor(z)), rig.mcData.blocksByName.stone.id);
  }
  rig.playerState.yawDegrees = 270;
  return { world, rig, state: rig.playerState, tick: () => rig.physics.simulate(rig.playerCtx, world as any) };
}

const ladder = (count: number): Array<[string, Record<string, string>]> =>
  Array.from({ length: count }, () => ["ladder", { facing: "west", waterlogged: "false" }]);

describe("Botcraft climbing", () => {
  // LivingEntity.travel looks the climbable block up where the player is, so a jump at the foot of a ladder climbs on
  // the very first tick: the jump moves the player 0.42F up, then the climb sets the motion to 0.2.
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`climbs from the first tick of a jump at the foot of a ladder (${version}, b_climb_jump_up_ladder[facing=west])`, () => {
      const { state, tick } = climbRig(version, 1757.5, ladder(5));
      state.control.jump = true;
      tick();
      expect(state.pos.y).toBe(101.41999998688698);
      expect(state.vel.y).toBe(0.11760000228881837);
    });
  }
});
