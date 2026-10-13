import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld, loadMcData } from "../../helpers/unit/botcraftTestSupport";

// g_crouch_tunnel_enter: sneaking east (yaw 270) from (-2.5, 101, 2034.5) into a tunnel too low to enter (stone walls
// at z 2033 and 2035, a bottom stone slab roof at y 102 from x 0), then standing up with forward still held at tick
// 61. 1.9 - 1.13's EntityPlayer.updateSize makes a sneaking player 1.65F tall and, at the end of the tick the sneak key
// is released, refits the box to 1.8F on its lower corner: its max x becomes minX + 0.6F, 1.1e-16 short of the wall.
// The next tick moves into that gap (1.12.2) or drops the move as under 1e-7 (1.13.2's VoxelShapes); either way the
// position is the centre of the refitted box. Since 1.14 the crouching pose is 1.5F tall and the position follows
// the movement from 1.17.
const EXPECTED_X_AT_TICK_62: Record<string, number> = {
  "1.12.2": -0.30000001192092896,
  "1.13.2": -0.30000001192092907,
  "1.20.4": -0.30000001192092896,
};

function bottomSlab(version: string) {
  const { mcData, Block } = loadMcData(version);
  if (version === "1.12.2") return { type: mcData.blocksByName.stone_slab.id, metadata: 0 };
  const slab = (Block as any).fromProperties("stone_slab", { type: "bottom", waterlogged: "false" }, 0);
  return { type: slab.type as number, metadata: slab.metadata as number };
}

function enterTunnelAndStandUp(version: string) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(-2.5, 101, 2034.5) });
  const slab = bottomSlab(version);
  for (let x = 0; x <= 16; x++) {
    world.setOverrideBlock(new Vec3(x, 101, 2033), rig.mcData.blocksByName.stone.id);
    world.setOverrideBlock(new Vec3(x, 101, 2035), rig.mcData.blocksByName.stone.id);
    for (let z = 2033; z <= 2035; z++) world.setOverrideBlock(new Vec3(x, 102, z), slab.type, slab.metadata);
  }
  rig.playerState.yawDegrees = 270;
  rig.playerState.control.forward = true;
  rig.playerState.control.sneak = true;
  for (let t = 1; t <= 62; t++) {
    if (t === 61) rig.playerState.control.sneak = false;
    rig.physics.simulate(rig.playerCtx, world as any);
  }
  return rig.playerState;
}

describe("Botcraft player size before 1.14", () => {
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`refits the box on its lower corner when the player stands up (${version}, g_crouch_tunnel_enter tick 62)`, () => {
      expect(enterTunnelAndStandUp(version).pos.x).toBe(EXPECTED_X_AT_TICK_62[version]);
    });
  }

  it("leaves the crouching pose's box alone (1.20.4, g_crouch_tunnel_enter tick 62)", () => {
    expect(enterTunnelAndStandUp("1.20.4").pos.x).toBe(EXPECTED_X_AT_TICK_62["1.20.4"]);
  });
});
