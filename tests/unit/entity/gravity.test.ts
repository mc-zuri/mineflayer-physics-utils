import { describe, it } from "mocha";
import expect from "expect";
import { BotcraftPhysics, EPhysicsCtx } from "../../../src";
import { loadMcData } from "../../helpers/unit/botcraftTestSupport";

// Entity.getDefaultGravity of the vanilla jar (E:\gen packages/minecraft-data-oracle, the same from 1.20.5 to 26.3),
// for entities physics-utils' own branches gave another gravity.
const VANILLA: Record<string, number> = {
  item: 0.04,
  experience_bottle: 0.07,
  spectral_arrow: 0.05,
  shulker_bullet: 0.04,
  fireball: 0,
  wind_charge: 0,
  eye_of_ender: 0,
  item_frame: 0,
  arrow: 0.05,
  snowball: 0.03,
  zombie: 0.08,
  // before 26.3 the bobber adds its own -0.03 each tick (default gravity 0)
  fishing_bobber: 0.03,
};

describe("Entity gravity", () => {
  for (const version of ["1.20.6", "1.21.11", "26.3"]) {
    it(`gives each entity vanilla's default gravity (${version})`, () => {
      const { mcData } = loadMcData(version);
      const physics = new BotcraftPhysics(mcData);
      EPhysicsCtx.loadData(mcData);
      // splash_potion and oak_boat were potion and boat until 1.21.5 and 1.21.2
      const potion = mcData.entitiesByName.splash_potion ? "splash_potion" : "potion";
      const boat = mcData.entitiesByName.oak_boat ? "oak_boat" : "boat";
      for (const [name, gravity] of Object.entries({ ...VANILLA, [potion]: 0.05, [boat]: 0.04 })) {
        const type = mcData.entitiesByName[name];
        expect({ name, gravity: EPhysicsCtx.FROM_ENTITY_TYPE(physics, type).gravity }).toEqual({ name, gravity });
      }
    });
  }
});
