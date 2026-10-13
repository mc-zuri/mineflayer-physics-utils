import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

const groundLevel = 101;

// e_attr_gravity_0.16_fall: a vanilla client falls from y 111 with the gravity attribute set to 0.16. Since 1.20.5
// LivingEntity.travel takes the gravity from the attribute (getDefaultGravity), not the constant 0.08.
describe("Botcraft gravity attribute", () => {
  for (const { version, tick, start, pos, velY } of [
    // tick 3, from tick 2
    { version: "1.21.1", tick: 3, start: { y: 110.92159999847412, velY: -0.23363200604248052 }, pos: 110.68796799243164, velY: -0.38575937342956557 },
    // tick 4, from tick 3
    { version: "1.21.11", tick: 4, start: { y: 110.76636799395752, velY: -0.3089273704388429 }, pos: 110.45744062351868, velY: -0.45954883197414587 },
  ]) {
    it(`falls by the gravity attribute (${version}, tick ${tick})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, start.y, 38.5), groundLevel });
      rig.playerState.vel.set(0, start.velY, 0);
      const gravity: string = (rig.mcData.attributesByName as any).gravity.resource;
      rig.playerState.attributes = { [gravity]: { value: 0.16, modifiers: [] } } as any;
      rig.playerState.yawDegrees = 0;

      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, groundLevel) as any);

      expect(rig.playerState.pos.y).toBe(pos);
      expect(rig.playerState.vel.y).toBe(velY);
    });
  }
});
