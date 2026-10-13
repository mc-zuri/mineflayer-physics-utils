import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Vanilla's Entity.move sets onGround = verticalCollision && dy < 0 on every move of the local player, so a move
// without vertical motion leaves the ground even when standing on a floor; the next tick's sinking lands again.
// Recorded as b_flow_idle_drift: standing still at rest (vel 0, on ground) in shallow still water on a stone floor.
const recorded: { version: string; velY: number }[] = [
  { version: "1.12.2", velY: -0.02 },
  { version: "1.20.4", velY: -0.005 },
  { version: "1.21.11", velY: -0.005 },
];

describe("Botcraft ground contact without vertical motion", () => {
  for (const { version, velY } of recorded) {
    it(`leaves the ground on a move with no vertical motion (${version}, b_flow_idle_drift)`, () => {
      const start = new Vec3(-3.5, 101, 1881.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 101);
      for (let x = -5; x <= -2; x++) {
        for (let z = 1880; z <= 1883; z++) world.setOverrideBlock(new Vec3(x, 101, z), rig.mcData.blocksByName.water.id);
      }
      rig.playerState.vel.set(0, 0, 0);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.onGround).toBe(false);
      expect(rig.playerState.pos.y).toBe(101);
      expect(rig.playerState.vel.y).toBe(velY);

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.pos.y).toBe(101);
    });
  }
});
