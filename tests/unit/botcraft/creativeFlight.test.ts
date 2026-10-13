import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 64;

// f_fly_forward tick 1: flying from rest facing east (yaw 270) with the forward key. Vanilla's air speed while flying
// is the abilities' flying speed (Player.getFlyingSpeed, the jump movement factor before 1.13), 0.05F here.
const recorded: { version: string; posX: number; velX: number }[] = [
  { version: "1.12.2", posX: 0.5490000024437904, velX: 0.0445900035089255 },
  { version: "1.21.11", posX: 0.5490000016838312, velX: 0.044590002817362605 },
];

describe("Botcraft creative flight", () => {
  for (const { version, posX, velX } of recorded) {
    it(`flies forward at the flying speed (${version}, f_fly_forward)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 105, 2619.5), groundLevel });
      const state = rig.playerState;
      state.vel = new Vec3(0, 0, 0);
      state.onGround = false;
      state.gameMode = "creative";
      state.mayFly = true;
      state.flying = true;
      state.flySpeed = 0.05000000074505806;
      state.yawDegrees = 270;
      state.control.forward = true;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(state.vel.x).toBe(velX);
      expect(state.pos.x).toBe(posX);
      expect(state.pos.y).toBe(105);
      expect(state.vel.y).toBe(0);
    });
  }
});
