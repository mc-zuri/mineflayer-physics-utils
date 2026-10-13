import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// Boats and shulkers are solid like blocks (Level.getEntityCollisions). The recorder's "n_fall_onto_boat": the
// player falls from y 106 onto a boat floating on nothing at y 101 (x 0.5, z 38.5) and lands on its top, 0.5625 up.
function fallOnto(version: string, name: string, boundingBox: AABB) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101.936654946153, 38.5), groundLevel: 101 });
  rig.playerState.vel.set(0, -0.7811331932098841, 0);
  rig.playerState.onGround = false;
  rig.playerState.yawDegrees = 270;
  rig.playerState.nearbyEntities = [{ name, living: false, position: new Vec3(0.5, 101, 38.5), boundingBox }];

  rig.physics.simulate(rig.playerCtx, world as any);

  return rig.playerState;
}

describe("Botcraft entity collision", () => {
  const boatBox = new AABB(-0.1875, 101, 37.8125, 1.1875, 101.5625, 39.1875);

  for (const [version, name] of [["1.12.2", "boat"], ["1.13.2", "boat"], ["1.20.4", "boat"], ["1.21.11", "oak_boat"]]) {
    it(`lands on a boat (${version}, n_fall_onto_boat)`, () => {
      const player = fallOnto(version, name, boatBox);
      expect(player.pos.y).toBe(101.5625);
      expect(player.vel.y).toBe(-0.0784000015258789);
      expect(player.onGround).toBe(true);
    });
  }

  // n_stand_on_shulker: standing still on a shulker (no AI) at x 2.5, y 101, z 38.5.
  for (const version of ["1.12.2", "1.21.11"]) {
    it(`stands on a shulker (${version}, n_stand_on_shulker)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.5, 102, 38.5) });
      rig.playerState.vel.set(0, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      rig.playerState.nearbyEntities = [
        { name: "shulker", living: true, position: new Vec3(2.5, 101, 38.5), boundingBox: new AABB(2, 101, 38, 3, 102, 39) },
      ];

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.pos.y).toBe(102);
      expect(rig.playerState.vel.y).toBe(-0.0784000015258789);
      expect(rig.playerState.onGround).toBe(true);
    });
  }

  it("falls through an entity that is not solid, such as a cow", () => {
    const player = fallOnto("1.21.11", "cow", boatBox);
    expect(player.pos.y).toBeLessThan(101.5625);
    expect(player.onGround).toBe(false);
  });
});
