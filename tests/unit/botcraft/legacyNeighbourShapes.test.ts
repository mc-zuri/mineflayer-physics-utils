import { describe, it } from "mocha";
import expect from "expect";
import md from "minecraft-data";
import { Vec3 } from "vec3";
import { LegacyShapes } from "../../../src/physics/engines/legacyShapes";
import { createBotcraftPlayerRig, createFlatWorld } from "../../helpers/unit/botcraftTestSupport";
import fixtures from "./fixtures/legacyNeighbourShapes.json";

// Before 1.13 the client takes some blocks' collision boxes from the blocks around them (getActualState and the
// blocks' appendCollisionBoxes): fences, panes, iron bars and walls join their neighbours, stairs make corners with the
// stairs beside, door halves take the other half's hinge or facing and opening, and from 1.9 chests reach the chest
// beside and chorus plants reach their neighbours. The fixtures are the boxes the 1.8.9 - 1.12.2 clients give, run on
// random neighbour configurations: [block id, data value, [[dx, dy, dz, id, data value], ...], boxes].
type Config = [number, number, number[][], number[][]];
const sorted = (boxes: number[][]) => boxes.map((b) => b.map(Number)).sort((a, b) => (a.join() < b.join() ? -1 : 1));

describe("Botcraft collision shapes from the neighbours before 1.13", () => {
  for (const [version, configs] of Object.entries(fixtures as unknown as Record<string, Config[]>)) {
    it(`gives the client's boxes (${version}, ${configs.length} configurations)`, () => {
      const mcData = md(version);
      const legacy = new LegacyShapes(mcData);
      const { blocks, shapes } = (mcData as any).blockCollisionShapes;
      const wrong: string[] = [];
      for (const [id, metadata, neighbours, boxes] of configs) {
        const at = new Map(neighbours.map(([dx, dy, dz, type, data]) => [`${dx},${dy},${dz}`, { type, metadata: data }]));
        // (null: minecraft-data's shape)
        const name = mcData.blocks[id].name;
        const got = legacy.shapes(id, metadata, (dx, dy, dz) => at.get(`${dx},${dy},${dz}`) ?? null) ??
          shapes[Array.isArray(blocks[name]) ? blocks[name][metadata] : blocks[name]];
        if (JSON.stringify(sorted(got)) !== JSON.stringify(sorted(boxes))) wrong.push(`${name}:${metadata} ${JSON.stringify(neighbours)}`);
      }
      expect(wrong).toEqual([]);
    });
  }

  it("is off from 1.13 (the block state carries the shape)", () => {
    expect(new LegacyShapes(md("1.13.2")).enabled).toBe(false);
  });

  // two oak fences joined north - south: their arms reach each other, where each one's post alone leaves a gap
  for (const version of ["1.8.8", "1.12.2"]) {
    it(`collides with a fence's arms (${version})`, () => {
      const rig = createBotcraftPlayerRig({ version, position: new Vec3(1.5, 101, 0), groundLevel: 101 });
      const world = createFlatWorld(version, 101);
      const fence = rig.mcData.blocksByName.fence.id;
      world.setOverrideBlock(new Vec3(0, 101, 0), fence);
      world.setOverrideBlock(new Vec3(0, 101, -1), fence);
      const state = rig.playerState;
      state.vel.set(-1, 0, 0);
      state.onGround = true;

      rig.physics.simulate(rig.playerCtx, world as any);

      expect(state.isCollidedHorizontally).toBe(true);
      expect(state.pos.x).toBeCloseTo(0.925, 6);
    });
  }
});
