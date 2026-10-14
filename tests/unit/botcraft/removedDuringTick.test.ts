import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// 1.17 - 1.19 remove the local player in its tick at the 20th tick of its death (LocalPlayer.tickDeath) and still let
// it travel; from 1.17 Entity.move stops after the collision for a removed entity, so its landing does not stop its
// fall. Recorded as m_death_respawn: the dead player standing on the floor at its 20th dead tick (1.16.5 moves on).
const recorded: { version: string; velY: number }[] = [
  { version: "1.16.5", velY: -0.0784000015258789 },
  { version: "1.17.1", velY: -0.1552320045166016 },
  { version: "1.19", velY: -0.1552320045166016 },
];

describe("Botcraft player removed during its tick", () => {
  for (const { version, velY } of recorded) {
    it(`keeps the motion its landing would stop (${version}, m_death_respawn)`, () => {
      const start = new Vec3(0.5, 101, 2839.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 101);
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.removed = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(101);
      expect(rig.playerState.onGround).toBe(true);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
