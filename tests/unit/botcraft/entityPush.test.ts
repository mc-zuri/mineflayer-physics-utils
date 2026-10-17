import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { AABB } from "@nxg-org/mineflayer-util-plugin";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";

// A cow (no AI) at x 0.9 pushes the player standing beside it, at x 0.5 on y 101 (the recorder's "n_pushed_by_cow").
// The cow ticks after the player and pushes it away by Entity.push at the end of the client tick.
const cow = {
  name: "cow",
  living: true,
  position: new Vec3(0.9, 101, 38.5),
  boundingBox: new AABB(0.450000011920929, 101, 38.05000001192093, 1.349999988079071, 102.39999997615814, 38.94999998807907),
};

// The third tick of n_pushed_by_cow: the player drifts west from the push of the tick before, then is pushed again.
function tickBesideCow(version: string, x: number, vx: number, nearbyEntities: object[]) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(x, 101, 38.5) });
  rig.playerState.vel.set(vx, -0.0784000015258789, 0);
  rig.playerState.onGround = true;
  rig.playerState.yawDegrees = 270;
  rig.playerState.nearbyEntities = nearbyEntities as any;

  rig.physics.simulate(rig.playerCtx, world as any);

  return rig.playerState.vel.x;
}

describe("Botcraft entity push", () => {
  // Before 1.17 Entity.push takes the square root of the distance in float (Mth.sqrt).
  for (const version of ["1.12.2", "1.13.2"]) {
    it(`is pushed away by a cow it touches (${version}, n_pushed_by_cow)`, () => {
      expect(tickBesideCow(version, 0.4683772227145383, -0.06162573109345272, [cow])).toBe(-0.06876348048345965);
    });
  }

  for (const version of ["1.20.4", "1.21.11"]) {
    it(`is pushed away by a cow it touches (${version}, n_pushed_by_cow)`, () => {
      expect(tickBesideCow(version, 0.4683772229271001, -0.061625730611736124, [cow])).toBe(-0.06876347982323287);
    });
  }

  // 1.14 - 1.16 tick the client's entities in their hash map's order: the cow (id 13) comes before the player (id 1),
  // so on the first tick its push moves the player in the same tick (n_pushed_by_cow on 1.15.2, tick 1).
  it("is pushed before its own tick by a cow the client ticks first (1.15.2, n_pushed_by_cow)", () => {
    const version = "1.15.2";
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 38.5) });
    rig.playerState.vel.set(0, 0, 0);
    rig.playerState.onGround = true;
    rig.playerState.yawDegrees = 270;
    rig.playerState.nearbyEntities = [{ ...cow, ticksBeforePlayer: true }];

    rig.physics.simulate(rig.playerCtx, createFlatWorld(version, 101) as any);

    expect(rig.playerState.pos.x).toBe(0.4683772227145383);
    expect(rig.playerState.vel.x).toBe(-0.017266038403357803);
  });

  it("is not pushed by an entity that is not a LivingEntity, such as an item", () => {
    const item = { ...cow, name: "item", living: false };
    const alone = tickBesideCow("1.21.11", 0.4683772229271001, -0.061625730611736124, []);
    expect(tickBesideCow("1.21.11", 0.4683772229271001, -0.061625730611736124, [item])).toBe(alone);
  });
});

// Walking east into a boat at x 3.5 (the recorder's "n_walk_into_boat"), on the tick before the player reaches it: the
// boat's box grown by 0.2 already meets the player's, so the boat pushes the player back.
describe("Botcraft boat push", () => {
  const boat = {
    name: "oak_boat",
    living: false,
    position: new Vec3(3.5, 101, 38.5),
    boundingBox: new AABB(2.8125, 101, 37.8125, 4.1875, 101.5625, 39.1875),
  };

  for (const version of ["1.20.4", "1.21.11"]) {
    it(`is pushed back by a boat it walks up to (${version}, n_walk_into_boat)`, () => {
      const world = createFlatWorld(version, 101);
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2.1842496592612073, 101, 38.5) });
      rig.playerState.vel.set(0.11735079181837918, -0.0784000015258789, 0);
      rig.playerState.onGround = true;
      rig.playerState.yawDegrees = 270;
      rig.playerState.control.forward = true;
      rig.playerState.nearbyEntities = [{ ...boat, name: version === "1.20.4" ? "boat" : "oak_boat" }];

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(rig.playerState.vel.x).toBe(0.06758154708392641);
    });
  }

  // v_boat_dismount on 1.15.2, tick 23: the player has just left the boat it steered, shown under it at x
  // 5.653907637539506, which the server sent back to x 5.337675300844518. The boat ticks after the player: it first
  // eases a tenth of the way there (Boat.tickLerp), then pushes the player from there (Boat.tick, Boat.push).
  it("is pushed from where the boat's own tick leaves it (1.15.2, v_boat_dismount)", () => {
    const version = "1.15.2";
    const boatAt = (x: number, y: number) => ({
      position: new Vec3(x, y, 2125.5),
      boundingBox: new AABB(x - 0.6875, y, 2124.8125, x + 0.6875, y + 0.5625, 2126.1875),
    });
    const rig = createBotcraftPlayerRig({ version, position: new Vec3(5.653907637539506, 100.07326531022936, 2125.5) });
    rig.playerState.vel.set(0, -0.0784000015258789, 0);
    rig.playerState.yawDegrees = 270;
    rig.playerState.nearbyEntities = [{
      name: "boat",
      living: false,
      ...boatAt(5.653907637539506, 100.52326529830843),
      afterTick: boatAt(5.622284403870007, 100.52326536116496),
    }];

    rig.physics.simulate(rig.playerCtx, createFlatWorld(version, 90) as any);

    expect(rig.playerState.pos.y).toBe(99.99486530870348);
    expect(rig.playerState.vel.x).toBe(0.00889146170192836);
  });

  // Entity.push moves both: the camel the server put the mounting player inside (m_c_mount_click_camel on 1.21.1, tick
  // 42: the player at x 2.0, the camel at 2.5) goes the other way, 0.05F * the square root of 0.5 east, which the client
  // keeps in the camel's motion (pushedEntities). A mob that carries passengers is not moved, nor does the vehicle the
  // player rides push it (Entity.isPassengerOfSameVehicle).
  describe("the push back", () => {
    const camel = (extra: object) => ({
      name: "camel",
      id: 108,
      living: true,
      position: new Vec3(2.5, 101, 3143.5),
      boundingBox: new AABB(1.649999976158142, 101, 3142.649999976158, 3.350000023841858, 103.375, 3144.350000023842),
      ...extra,
    });
    const pushed = (extra: object) => {
      const version = "1.21.1";
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(2, 102.4, 3143.5) });
      rig.playerState.vel.set(0, 0, 0);
      rig.playerState.nearbyEntities = [camel(extra)] as any;
      rig.physics.simulate(rig.playerCtx, createFlatWorld(version, 0) as any);
      return rig.playerState;
    };

    it("goes to the mob that pushed the player (1.21.1, m_c_mount_click_camel tick 42)", () => {
      const player = pushed({});
      expect(player.pushedEntities).toEqual([{ id: 108, x: 0.03535533958616298, z: 0 }]);
    });

    it("does not move a mob carrying passengers, and the player's own vehicle does not push", () => {
      expect(pushed({ isVehicle: true }).pushedEntities).toEqual([]);
      const riding = pushed({ sameVehicle: true });
      expect(riding.pushedEntities).toEqual([]);
      expect(riding.vel.x).toBe(0);
    });
  });
});

