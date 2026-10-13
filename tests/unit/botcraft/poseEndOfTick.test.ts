import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { createBotcraftPlayerRig, createFlatWorld, loadMcData } from "../../helpers/unit/botcraftTestSupport";

// g_step_sneak_snow_layers_2: sneaking east (yaw 270) from (0.5, 101, 1345.5) up onto two snow layers (x 3..5,
// z 1344..1346), then releasing every key at tick 51. Vanilla changes the pose only at the end of the tick
// (Player.updatePlayerPose), so tick 51 still moves the crouching box; on 1.14 - 1.16 the kept box is refitted to the
// standing pose after that move (Entity.refreshDimensions keeps its lower corner), on 1.17+ the box follows the
// position anyway.
const EXPECTED_X_AT_TICK_51: Record<string, number> = {
  "1.16.5": 3.8464648970626656,
  "1.20.4": 3.846464897062666,
};

// Stepped as mineflayer's physics plugin does (throughBot): PlayerState.update from the bot before each tick and
// apply to it after, so the pose the engine decided must come back through the bot.
function sneakOntoSnowAndRelease(version: string, ticks = 51, throughBot = false) {
  const world = createFlatWorld(version, 101);
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 101, 1345.5) });
  const { Block } = loadMcData(version);
  const snow = (Block as any).fromProperties("snow", { layers: 2 }, 0);
  for (let x = 3; x <= 5; x++) {
    for (let z = 1344; z <= 1346; z++) world.setOverrideBlock(new Vec3(x, 101, z), snow.type, snow.metadata);
  }
  const bot = rig.fakePlayer;
  bot.entity.yawDegrees = 270;
  bot.entity.yaw = Math.PI / 2; // mineflayer's radians for yaw 270
  rig.playerState.update(bot);
  const setKeys = (held: boolean) => {
    bot.setControlState("forward", held);
    bot.setControlState("sneak", held);
    rig.playerState.control.forward = held;
    rig.playerState.control.sneak = held;
  };
  setKeys(true);
  for (let t = 1; t <= ticks; t++) {
    if (t === 51) setKeys(false);
    if (throughBot) rig.playerState.update(bot);
    rig.physics.simulate(rig.playerCtx, world as any);
    if (throughBot) rig.playerState.apply(bot);
  }
  return rig.playerState;
}

describe("Botcraft pose change at the end of the tick", () => {
  for (const version of ["1.16.5", "1.20.4"]) {
    it(`moves the crouching box on the tick sneak is released (${version}, g_step_sneak_snow_layers_2 tick 51)`, () => {
      const player = sneakOntoSnowAndRelease(version);
      expect(player.pos.y).toBe(101.125);
      expect(player.pos.x).toBe(EXPECTED_X_AT_TICK_51[version]);
    });
  }

  it("keeps the pose it decided through PlayerState.update (1.16.5, g_step_sneak_snow_layers_2 tick 52)", () => {
    expect(sneakOntoSnowAndRelease("1.16.5", 52, true).pos.x).toBe(3.8657702157242237);
  });
});
