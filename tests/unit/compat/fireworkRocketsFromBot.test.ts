import { describe, it } from "mocha";
import expect from "expect";
import { Vec3 } from "vec3";
import { BotcraftPhysics } from "../../../src/physics/engines";
import { PlayerState } from "../../../src/physics/states";
import { createBotcraftPlayerRig } from "../../helpers/unit/botcraftTestSupport";

const version = "1.16.5";

function fakeBot() {
  const rig = createBotcraftPlayerRig({ version, position: new Vec3(0.5, 130, 0.5), groundLevel: 64 });
  return rig.fakePlayer;
}

describe("firework rockets from the bot", () => {
  it("reads how many rockets are attached and how many the client ticks before the player", () => {
    const bot = fakeBot();
    bot.fireworkRocketDuration = 1;
    bot.fireworkRockets = 2;
    bot.fireworkRocketsBeforePlayer = 1;

    const state = new PlayerState(new BotcraftPhysics(bot.registry), bot);

    expect(state.fireworkRocketDuration).toBe(1);
    expect(state.fireworkRockets).toBe(2);
    expect(state.fireworkRocketsBeforePlayer).toBe(1);
  });

  it("counts none when the bot does not say", () => {
    const bot = fakeBot();
    bot.fireworkRocketDuration = 0;

    const state = new PlayerState(new BotcraftPhysics(bot.registry), bot);
    state.fireworkRockets = 3;
    state.fireworkRocketsBeforePlayer = 3;
    state.update(bot);

    expect(state.fireworkRockets).toBe(0);
    expect(state.fireworkRocketsBeforePlayer).toBe(0);
  });
});
