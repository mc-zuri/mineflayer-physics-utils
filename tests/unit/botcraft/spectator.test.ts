import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// The recorder's feature area: flat ground at y 100, the player standing on it at (0.5, 101, 2839.5) when the server
// makes it a spectator (m_gamemode tick 41), flying.
function spectatorOnGround(version: string, vy: number) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 2839.5) });
  const state = rig.playerState;
  state.gameMode = "spectator";
  state.mayFly = true;
  state.flying = true;
  state.onGround = true;
  state.vel.set(0, vy, 0);
  state.yawDegrees = 270;
  return { state, tick: () => rig.physics.simulate(rig.playerCtx, world as any) };
}

describe("Botcraft spectator", () => {
  // Player.tick: a spectator is set off the ground every tick and moves through the ground as it flies.
  it("leaves the ground and flies through it (1.12.2, m_gamemode tick 41)", () => {
    const { state, tick } = spectatorOnGround("1.12.2", -0.0784000015258789);
    tick();
    expect(state.pos.y).toBe(100.92159999847412);
    expect(state.vel.y).toBe(-0.04704000091552734);
    expect(state.onGround).toBe(false);
  });

  // 1.20.4: the game mode update has zeroed the vertical motion before the tick (LocalPlayer.onGameModeChanged)
  for (const version of ["1.20.4", "1.21.11"]) {
    it(`is off the ground without moving (${version}, m_gamemode tick 41)`, () => {
      const { state, tick } = spectatorOnGround(version, 0);
      tick();
      expect(state.pos.y).toBe(101);
      expect(state.vel.y).toBe(0);
      expect(state.onGround).toBe(false);
    });
  }
});
