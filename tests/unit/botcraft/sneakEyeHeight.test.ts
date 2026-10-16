import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// EntityPlayer.getEyeHeight: before 1.14 a sneaking player's eyes are 1.62F - 0.08F high, sneaking being the sneak key
// of the last input update (EntityPlayerSP.isSneaking): after a tick with the key down, where the next tick's keys and
// crosshair look from (m_c_use_chest_sneak 1.12.2: its use hits the chest 0.08 lower than from 1.62). From 1.14 the
// crouching pose's eyes are 1.27F high.
const SNEAKING_LEGACY = Math.fround(Math.fround(1.62) - Math.fround(0.08));

describe("Botcraft sneaking eye height", () => {
  for (const version of ["1.8.8", "1.12.2", "1.13.2"]) {
    it(`lowers the eyes by 0.08F after a tick sneaking, before 1.14 (${version})`, () => {
      const start = new Vec3(0.5, 100, 0.5);
      const rig = createBotcraftPlayerRig({ version, position: start, groundLevel: start.y });
      const world = createFlatWorld(version, 100);
      expect(rig.playerState.eyeHeight).toBe(1.62);

      rig.playerState.control.sneak = true;
      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.eyeHeight).toBe(SNEAKING_LEGACY);

      rig.playerState.control.sneak = false;
      rig.physics.simulate(rig.playerCtx, world as any);
      expect(rig.playerState.eyeHeight).toBe(1.62);
    });
  }

  it("keeps the eyes low in the 1.65F box a stand-up was kept from (1.12.2)", () => {
    const start = new Vec3(0.5, 100, 0.5);
    const rig = createBotcraftPlayerRig({ version: "1.12.2", position: start, groundLevel: start.y });
    rig.playerState.keptBoundingBox = { bb: rig.playerState.getBB(), pos: start.clone(), width: Math.fround(0.6), height: Math.fround(1.65) };
    expect(rig.playerState.eyeHeight).toBe(SNEAKING_LEGACY);
  });

  it("takes the crouching pose's eyes from 1.14 (1.14.4)", () => {
    const start = new Vec3(0.5, 100, 0.5);
    const rig = createBotcraftPlayerRig({ version: "1.14.4", position: start, groundLevel: start.y });
    const world = createFlatWorld("1.14.4", 100);
    rig.playerState.control.sneak = true;
    rig.physics.simulate(rig.playerCtx, world as any);
    expect(rig.playerState.eyeHeight).toBe(1.27);
  });
});
