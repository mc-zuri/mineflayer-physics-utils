import { describe, it } from "mocha";
import expect from "expect";
import type { Entity } from "prismarine-entity";
import { Vec3 } from "vec3";
import { BoatState, BoatStatus } from "../../../src/physics/states/boatState";
import {
  createBoatRig,
  fillWaterColumn,
  loadMcData,
  simulateBoatTick,
} from "../../helpers/unit/botcraftTestSupport";

/* eslint-disable @typescript-eslint/no-require-imports */
function loadBoatSettingsModule() {
  return require("../../../src/physics/settings/boatSettings");
}

function loadBoatSettingsJson() {
  return require("../../../src/physics/info/entity_physics.json");
}

function loadEPhysicsCtx() {
  return require("../../../src/physics/settings").EPhysicsCtx;
}
/* eslint-enable @typescript-eslint/no-require-imports */

describe("Boat settings resolution", () => {
  it("normalizes float32 fields and preserves double fields from default", () => {
    const { FLOAT32_FIELDS, resolveBoatSettings } = loadBoatSettingsModule();
    const boatSection = loadBoatSettingsJson().boats;
    const defaultSettings = boatSection.default;
    const { mcData } = loadMcData("1.17.1");
    const resolved = resolveBoatSettings(mcData);

    for (const field of FLOAT32_FIELDS) {
      expect(resolved[field]).toBe(Math.fround(defaultSettings[field]));
    }

    const doubleFields = Object.keys(defaultSettings).filter(
      (key: string) => !FLOAT32_FIELDS.includes(key),
    );

    for (const field of doubleFields) {
      expect(resolved[field]).toBe(defaultSettings[field]);
    }

    expect(resolved).not.toHaveProperty("height");
    expect(resolved).not.toHaveProperty("width");
  });

  it("returns default settings for an unknown major version", () => {
    const { FLOAT32_FIELDS, resolveBoatSettingsFromSection } = loadBoatSettingsModule();
    const defaultSettings = loadBoatSettingsJson().boats.default;
    const { mcData } = loadMcData("1.17.1");
    const fakeMcData = {
      ...mcData,
      version: { ...mcData.version, majorVersion: "99.99" },
    };
    const resolved = resolveBoatSettingsFromSection(fakeMcData, loadBoatSettingsJson().boats);

    for (const field of FLOAT32_FIELDS) {
      expect(resolved[field]).toBe(Math.fround(defaultSettings[field]));
    }
  });

  it("applies version-specific overrides and normalizes overridden float32 values", () => {
    const { resolveBoatSettingsFromSection } = loadBoatSettingsModule();
    const boatSection = loadBoatSettingsJson().boats;
    const { mcData } = loadMcData("1.17.1");
    const testSection = {
      ...boatSection,
      overrides: [{ versions: ["1.17"], values: { gravity: 0.05 } }],
    };

    const onTarget = resolveBoatSettingsFromSection(mcData, testSection);
    expect(onTarget.gravity).toBe(Math.fround(0.05));

    const offTarget = resolveBoatSettingsFromSection(
      { ...mcData, version: { ...mcData.version, majorVersion: "1.15" } },
      testSection,
    );
    expect(offTarget.gravity).toBe(Math.fround(boatSection.default.gravity));
  });

  it("lets the last matching override win when multiple entries match", () => {
    const { resolveBoatSettingsFromSection } = loadBoatSettingsModule();
    const boatSection = loadBoatSettingsJson().boats;
    const { mcData } = loadMcData("1.17.1");
    const testSection = {
      ...boatSection,
      overrides: [
        { versions: ["1.17"], values: { forwardAcceleration: 0.01 } },
        { versions: ["1.17"], values: { forwardAcceleration: 0.02 } },
      ],
    };

    const resolved = resolveBoatSettingsFromSection(mcData, testSection);
    expect(resolved.forwardAcceleration).toBe(Math.fround(0.02));
  });

  it("isolates resolved settings from JSON and from each other", () => {
    const boatSection = loadBoatSettingsJson().boats;
    const originalGravity = boatSection.default.gravity;
    const rigA = createBoatRig({ version: "1.17.1", position: new Vec3(0, 64, 0) });
    const rigB = createBoatRig({ version: "1.17.1", position: new Vec3(0, 64, 0) });

    expect(rigA.boatCtx.boat).toBeDefined();
    expect(rigB.boatCtx.boat).toBeDefined();
    rigA.boatCtx.boat!.gravity = 999;
    expect(rigB.boatCtx.boat!.gravity).not.toBe(999);
    expect(boatSection.default.gravity).toBe(originalGravity);
  });
});

describe("Boat settings simulation parity", () => {
  const version = "1.17.1";
  const waterSurfaceY = 64;
  const boatY = waterSurfaceY - 0.4;

  // the same tick through the context with the resolved boat settings and through one without an entity type
  function bothPaths(setup: (rig: ReturnType<typeof createBoatRig>) => void, floorY: number, y: number) {
    const EPhysicsCtx = loadEPhysicsCtx();
    const withSettings = createBoatRig({ version, position: new Vec3(0, y, 0), floorY });
    setup(withSettings);
    simulateBoatTick(withSettings);
    const without = createBoatRig({ version, position: new Vec3(0, y, 0), floorY });
    setup(without);
    const boatCtx = EPhysicsCtx.FROM_ENTITY_STATE(without.physics, without.boatState);
    expect(boatCtx.boat).toBeUndefined();
    without.physics.simulate(boatCtx, without.world);
    return [withSettings.boatState, without.boatState];
  }

  it("simulates an IN_WATER tick the same without an entity type", () => {
    const [a, b] = bothPaths((rig) => {
      for (let x = -1; x <= 1; x++) {
        for (let z = -1; z <= 1; z++) {
          fillWaterColumn(rig.world, x, z, waterSurfaceY - 1, waterSurfaceY - 1, 0);
        }
      }
      rig.boatState.status = BoatStatus.IN_WATER;
      rig.boatState.previousStatus = BoatStatus.IN_WATER;
    }, waterSurfaceY - 2, boatY);
    expect(b.pos).toEqual(a.pos);
    expect(b.vel).toEqual(a.vel);
  });

  it("simulates a controlled ON_LAND tick the same without an entity type", () => {
    const [a, b] = bothPaths((rig) => {
      rig.boatState.status = BoatStatus.ON_LAND;
      rig.boatState.previousStatus = BoatStatus.ON_LAND;
      rig.boatState.landFriction = 0.6;
      rig.boatState.controllingPlayer = true;
      rig.boatState.control.forward = true;
    }, waterSurfaceY - 1, waterSurfaceY);
    expect(b.pos).toEqual(a.pos);
    expect(b.vel).toEqual(a.vel);
  });
});

describe("Boat dimensions resolution", () => {
  const cases = [
    { version: "1.11.2", width: 1.375, height: 0.5625 }, // vanilla's, not minecraft-data's 1.5 x 0.6
    { version: "1.12.2", width: 1.375, height: 0.5625 },
    { version: "1.13.2", width: 1.375, height: 0.5625 },
    { version: "1.14.4", width: 1.375, height: 0.5625 },
    { version: "1.21.4", width: 1.375, height: 0.5625 },
  ];

  for (const { version, width, height } of cases) {
    it(`resolves boat dimensions for ${version}`, () => {
      const { resolveBoatDimensions } = loadBoatSettingsModule();
      const { mcData } = loadMcData(version);
      const dims = resolveBoatDimensions(mcData);
      expect(dims.width).toBe(width);
      expect(dims.height).toBe(height);
    });
  }

  it("resolves dimensions by explicit entity name", () => {
    const { resolveBoatDimensions } = loadBoatSettingsModule();
    const { mcData } = loadMcData("1.17.1");
    const fakeMcData = {
      ...mcData,
      entitiesByName: {
        ...mcData.entitiesByName,
        wide_boat: { name: "wide_boat", width: 2.5, height: 0.8 },
        narrow_raft: { name: "narrow_raft", width: 1.0, height: 0.4 },
      },
    };
    expect(resolveBoatDimensions(fakeMcData, "wide_boat")).toEqual({ width: 2.5, height: 0.8 });
    expect(resolveBoatDimensions(fakeMcData, "narrow_raft")).toEqual({ width: 1.0, height: 0.4 });
  });

  it("uses version-correct dimensions when entity lacks height and width", () => {
    const rig = createBoatRig({ version: "1.11.2", position: new Vec3(0, 64, 0) });
    const entity: Partial<Entity> = {
      position: new Vec3(0, 64, 0),
      velocity: new Vec3(0, 0, 0),
      yaw: 0,
      pitch: 0,
      onGround: false,
      name: "boat",
    };
    const state = BoatState.CREATE_FROM_ENTITY(rig.physics, entity as Entity);
    expect(state.height).toBe(0.5625);
    expect(state.halfWidth).toBe(1.375 / 2);
  });

  it("rejects partially filled entity descriptors and continues the chain", () => {
    const { resolveBoatDimensions } = loadBoatSettingsModule();
    const { mcData } = loadMcData("1.17.1");
    const fakeMcData = {
      ...mcData,
      entitiesByName: {
        ...mcData.entitiesByName,
        broken_boat: { name: "broken_boat", width: 1.375 },
      },
    };
    const fallback = { width: 9, height: 9 };
    const dims = resolveBoatDimensions(fakeMcData, "broken_boat", fallback);
    expect(dims).toEqual({ width: 1.375, height: 0.5625 });
  });

  it("returns the provided fallback when no boat entities exist", () => {
    const { resolveBoatDimensions } = loadBoatSettingsModule();
    const { mcData } = loadMcData("1.17.1");
    const fakeMcData = {
      ...mcData,
      entitiesByName: { player: mcData.entitiesByName.player },
    };
    const fallback = { width: 2, height: 1 };
    const dims = resolveBoatDimensions(fakeMcData, undefined, fallback);
    expect(dims).toEqual(fallback);
  });
});
