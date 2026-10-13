import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// f_fly_forward and f_spectator_through_wall tick 1 (1.21.11): a flying vanilla client starts forward from still air,
// facing east, on the flying speed the server sent in its abilities (0.05F) whatever its game mode; sprinting doubles
// it (Player.getFlyingSpeed).
describe("Botcraft flying speed", () => {
  for (const { gameMode, sprint, startX, x, vx } of [
    { gameMode: "creative", sprint: false, startX: 0.5, x: 0.5490000016838312, vx: 0.044590002817362605 },
    { gameMode: "spectator", sprint: true, startX: 24.5, x: 24.598000003367662, vx: 0.08918000563472521 },
  ]) {
    it(`flies on the abilities' flying speed in ${gameMode} (1.21.11)`, () => {
      const version = "1.21.11";
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(startX, 105, 2619.5), groundLevel });
      rig.fakePlayer.game.gameMode = gameMode;
      rig.fakePlayer.entity.abilities = { flags: 6, flyingSpeed: 0.05000000074505806, walkingSpeed: 0.10000000149011612 };
      rig.fakePlayer.entity.flying = true;
      rig.playerState.update(rig.fakePlayer, rig.playerState.control);
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.control.sprint = sprint;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.x).toBe(x);
      expect(rig.playerState.vel.x).toBe(vx);
    });
  }
});
