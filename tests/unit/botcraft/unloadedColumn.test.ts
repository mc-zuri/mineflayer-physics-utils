import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";

// Before 1.14 LivingEntity.travel lets a client player over a chunk that is not loaded sink at 0.1 a tick instead of
// falling; from 1.14 it falls as anywhere else. Recorded as m_death_respawn: the respawned player ticks before the
// server sends the chunk it stands in (1.8.8 ticks without its chunk; 1.20.4's level has every chunk).
const recorded: { version: string; start: Vec3; ticks: { y: number; velY: number }[] }[] = [
  {
    version: "1.8.8",
    start: new Vec3(-180.5, 4, 335.5),
    ticks: [
      { y: 4, velY: -0.09800000190734864 },
      { y: 3.901999998092651, velY: -0.09800000190734864 },
    ],
  },
  {
    version: "1.20.4",
    start: new Vec3(-6.5, -60, -4.5),
    ticks: [
      { y: -60, velY: -0.0784000015258789 },
      { y: -60.07840000152588, velY: -0.1552320045166016 },
    ],
  },
];

describe("Botcraft over an unloaded chunk", () => {
  for (const { version, start, ticks } of recorded) {
    it(`moves as vanilla's client over a chunk it has not loaded (${version}, m_death_respawn)`, () => {
      const rig = createBotcraftPlayerRig({ version, position: start.clone(), groundLevel: Number.NaN });
      const unloaded = { getBlock: () => null };
      rig.playerState.vel.set(0, 0, 0);
      rig.playerState.onGround = false;

      for (const { y, velY } of ticks) {
        rig.physics.simulate(rig.playerCtx, unloaded as any);
        expect(rig.playerState.pos.y).toBe(y);
        expect(rig.playerState.vel.y).toBe(velY);
      }
    });
  }
});
