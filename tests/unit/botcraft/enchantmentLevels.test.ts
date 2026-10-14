import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";
import { CheapEnchantments } from "../../../src/util/physicsUtils";

// The armour enchantments the engine reads (depth strider and soul speed on the boots, swift sneak on the leggings,
// as q_depth_strider_*, q_soul_speed_* and q_swift_sneak_* wear them), each by its own name, from the item's list as
// the 1.13+ nbt names them.
describe("Botcraft enchantment levels", () => {
  const enchantments = [
    { id: "minecraft:depth_strider", lvl: 3 },
    { id: "minecraft:swift_sneak", lvl: 2 },
    { id: "minecraft:soul_speed", lvl: 1 },
  ];
  for (const { enchantment, level } of [
    { enchantment: CheapEnchantments.DEPTH_STRIDER, level: 3 },
    { enchantment: CheapEnchantments.SWIFT_SNEAK, level: 2 },
    { enchantment: CheapEnchantments.SOUL_SPEED, level: 1 },
  ]) {
    it(`reads ${CheapEnchantments[enchantment]} by its own name (1.20.4)`, () => {
      const rig = createBotcraftPlayerRig({ version: "1.20.4", position: new Vec3(0.5, 101, 38.5) });
      expect(rig.physics.getEnchantmentLevel(enchantment, enchantments)).toBe(level);
    });
  }
});
