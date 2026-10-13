import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;

// f_elytra_rocket_level tick 8: falling with an elytra, the jump key is pressed. From 1.15 LocalPlayer.aiStep starts
// gliding on the client at once (tryToStartFallFlying); before, the client only asks and keeps falling until the
// server's entity data starts the glide.
const recorded: { version: string; gliding: boolean; pos: [number, number, number]; vel: [number, number, number] }[] = [
  {
    version: "1.14.4",
    gliding: false,
    pos: [0.5, 130.23152379758702, 2220.694831150342],
    vel: [0, -0.37663049823865513, 0.044183358514664935],
  },
  {
    version: "1.15.2",
    gliding: true,
    pos: [0.5, 130.24979317765974, 2220.7232422490115],
    vel: [0, -0.28604744738482135, 0.07696423849522663],
  },
];

describe("Botcraft fall flying start", () => {
  for (const { version, gliding, pos, vel } of recorded) {
    it(`${gliding ? "starts" : "does not start"} gliding on the jump press (${version}, f_elytra_rocket_level)`, () => {
      const rig = createBotcraftPlayerRig({
        version,
        position: new Vec3(0.5, 130.53584062504456, 2220.646278010516),
        groundLevel,
      });
      const state = rig.playerState;
      state.vel = new Vec3(0, -0.30431682745754424, 0.04855313982561337);
      state.onGround = false;
      state.validElytraEquipped = true;
      state.fireworkRocketDuration = 0;
      state.yawDegrees = 0;
      state.control.jump = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(state.fallFlying).toBe(gliding);
      expect(state.vel.x).toBe(vel[0]);
      expect(state.vel.y).toBe(vel[1]);
      expect(state.vel.z).toBe(vel[2]);
      expect(state.pos.y).toBe(pos[1]);
      expect(state.pos.z).toBe(pos[2]);
    });
  }
});
