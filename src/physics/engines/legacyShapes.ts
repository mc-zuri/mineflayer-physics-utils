import legacyConnections from "../info/legacyConnections.json";

/** A collision box within its block: minX, minY, minZ, maxX, maxY, maxZ. */
export type LegacyBox = [number, number, number, number, number, number];
/** The block (id and data value) at an offset from the block asked about, or null for none (air). */
export type LegacyNeighbour = (dx: number, dy: number, dz: number) => { type: number; metadata: number } | null;

type Ranges = [number, number][];
interface Family {
  blocks: number[];
  connect: { all?: Ranges; north?: Ranges; south?: Ranges; west?: Ranges; east?: Ranges };
  boxes: LegacyBox[][];
}

const SIDES = [
  ["north", 0, -1, 1],
  ["south", 0, 1, 2],
  ["west", -1, 0, 4],
  ["east", 1, 0, 8],
] as const;

type Dir = "north" | "south" | "west" | "east";
const OFFSET: Record<Dir, [number, number]> = { north: [0, -1], south: [0, 1], west: [-1, 0], east: [1, 0] };
const OPPOSITE: Record<Dir, Dir> = { north: "south", south: "north", west: "east", east: "west" };
const CCW: Record<Dir, Dir> = { north: "west", west: "south", south: "east", east: "north" };
const CW: Record<Dir, Dir> = { north: "east", east: "south", south: "west", west: "north" };
const axis = (d: Dir) => (d === "north" || d === "south" ? "z" : "x");
// the stairs' FACING by data value & 3 (EnumFacing.getFront(5 - i)), the lower door's (fromHorizontal(i) rotated
// counterclockwise)
const STAIRS_FACING: Dir[] = ["east", "west", "south", "north"];
const DOOR_FACING: Dir[] = ["east", "south", "west", "north"];

/**
 * The collision boxes before 1.13 of the blocks whose shape the client takes from their neighbours (Block.getActualState
 * and the blocks' appendCollisionBoxes / getCollisionBoundingBox of 1.8.9 - 1.12.2), which the block state of the data
 * value does not carry: the fences, panes, iron bars and walls joined to their neighbours, the stairs' corners, the
 * door halves' hinge, facing and opening, from 1.9 the double chests and the chorus plants' arms. Null for any other
 * block, version or data value: its shape is minecraft-data's.
 *
 * The fences, panes and walls join each side's neighbour by the client's own test (BlockFence.canConnectTo,
 * BlockPane.canPaneConnectTo, BlockWall.canConnectTo; from 1.12 by the neighbour's face shape), recorded per version
 * in legacyConnections.json as the neighbour block states that join, with the boxes of each of the 16 ways to join.
 */
export class LegacyShapes {
  private readonly families = new Map<number, { joins: Record<Dir, Set<number>>; boxes: LegacyBox[][] }>();
  private readonly stairs = new Set<number>();
  private readonly doors = new Set<number>();
  private readonly chests = new Set<number>();
  private readonly chorusPlant: number = -1;
  private readonly chorusFlower: number = -1;
  private readonly endStone: number = -1;
  readonly enabled: boolean;
  private readonly major: string;

  constructor(mcData: any) {
    const major: string = mcData.version.majorVersion;
    this.major = major;
    const data = (legacyConnections as unknown as Record<string, Family[]>)[major];
    this.enabled = data != null;
    if (!this.enabled) return;
    for (const family of data) {
      const expand = (ranges: Ranges) => {
        const set = new Set<number>();
        for (const [from, to] of ranges) for (let raw = from; raw <= to; raw++) set.add(raw);
        return set;
      };
      const all = family.connect.all ? expand(family.connect.all) : null;
      const joins = {} as Record<Dir, Set<number>>;
      for (const [side] of SIDES) joins[side] = all ?? expand(family.connect[side]!);
      for (const id of family.blocks) this.families.set(id, { joins, boxes: family.boxes });
    }
    for (const block of mcData.blocksArray) {
      if (/_stairs$/.test(block.name)) this.stairs.add(block.id);
      if (/_door$/.test(block.name)) this.doors.add(block.id);
    }
    // (1.8's chest boxes are whatever bounds the block was last given, and it has no chorus plant)
    if (major !== "1.8") {
      for (const name of ["chest", "trapped_chest"]) if (mcData.blocksByName[name]) this.chests.add(mcData.blocksByName[name].id);
      this.chorusPlant = mcData.blocksByName.chorus_plant?.id ?? -1;
      this.chorusFlower = mcData.blocksByName.chorus_flower?.id ?? -1;
      this.endStone = mcData.blocksByName.end_stone?.id ?? -1;
    }
  }

  /** The block's collision boxes among its neighbours, or null when minecraft-data's shape is the block's. */
  shapes(type: number, metadata: number, neighbour: LegacyNeighbour): LegacyBox[] | null {
    if (!this.enabled) return null;
    const family = this.families.get(type);
    if (family) {
      let mask = 0;
      for (const [side, dx, dz, bit] of SIDES) {
        const n = neighbour(dx, 0, dz);
        if (n != null && family.joins[side].has((n.type << 4) | n.metadata)) mask |= bit;
      }
      return family.boxes[mask];
    }
    if (this.stairs.has(type)) return this.stairsShapes(metadata, neighbour);
    if (this.doors.has(type)) return this.doorShapes(type, metadata, neighbour);
    if (this.chests.has(type)) return this.chestShapes(type, neighbour);
    if (type === this.chorusPlant) return this.chorusShapes(neighbour);
    return null;
  }

  /**
   * BlockStairs.getActualState's SHAPE (getStairsShape): a stair of the same half ahead turned across makes an outer
   * corner, one behind an inner corner, unless the stair beside on that side continues this one. The boxes: the half
   * slab, the upper half (straight and inner), the quarter (corners) (getCollisionBoxList).
   */
  private stairsShapes(metadata: number, neighbour: LegacyNeighbour): LegacyBox[] {
    const facing = STAIRS_FACING[metadata & 3];
    const top = (metadata & 4) !== 0;
    const at = (d: Dir) => {
      const n = neighbour(OFFSET[d][0], 0, OFFSET[d][1]);
      return n != null && this.stairs.has(n.type) ? { facing: STAIRS_FACING[n.metadata & 3], top: (n.metadata & 4) !== 0 } : null;
    };
    const differs = (d: Dir) => {
      const n = at(d);
      return n == null || n.facing !== facing || n.top !== top;
    };
    let shape: "straight" | "outer_left" | "outer_right" | "inner_left" | "inner_right" = "straight";
    const ahead = at(facing);
    const behind = at(OPPOSITE[facing]);
    if (ahead != null && ahead.top === top && axis(ahead.facing) !== axis(facing) && differs(OPPOSITE[ahead.facing])) {
      shape = ahead.facing === CCW[facing] ? "outer_left" : "outer_right";
    } else if (behind != null && behind.top === top && axis(behind.facing) !== axis(facing) && differs(behind.facing)) {
      shape = behind.facing === CCW[facing] ? "inner_left" : "inner_right";
    }
    const [y0, y1] = top ? [0, 0.5] : [0.5, 1];
    const half: Record<Dir, LegacyBox> = {
      north: [0, y0, 0, 1, y1, 0.5],
      south: [0, y0, 0.5, 1, y1, 1],
      west: [0, y0, 0, 0.5, y1, 1],
      east: [0.5, y0, 0, 1, y1, 1],
    };
    const quarter: Record<Dir, LegacyBox> = {
      north: [0, y0, 0, 0.5, y1, 0.5],
      south: [0.5, y0, 0.5, 1, y1, 1],
      west: [0, y0, 0.5, 0.5, y1, 1],
      east: [0.5, y0, 0, 1, y1, 0.5],
    };
    const boxes: LegacyBox[] = [top ? [0, 0.5, 0, 1, 1, 1] : [0, 0, 0, 1, 0.5, 1]];
    if (shape === "straight" || shape === "inner_left" || shape === "inner_right") boxes.push(half[facing]);
    if (shape !== "straight") {
      const corner = { outer_left: facing, outer_right: CW[facing], inner_right: OPPOSITE[facing], inner_left: CCW[facing] }[shape];
      boxes.push(quarter[corner]);
    }
    return boxes;
  }

  /**
   * BlockDoor.getActualState (1.9+): the lower half (data value < 8) has the facing and opening, the upper half the
   * hinge, each taking the other's from the same door above or below (without it, facing north, closed, hinge left).
   * The box is 3/16 thick on the side the door closes or opens to.
   */
  private doorShapes(type: number, metadata: number, neighbour: LegacyNeighbour): LegacyBox[] {
    let facing: Dir = "north";
    let open = false;
    let right = false;
    if (this.major === "1.8") {
      // 1.8's BlockDoor.combineMetadata: the data values of the blocks below and above, whatever they are (air's 0)
      const data = (n: { metadata: number } | null) => n?.metadata ?? 0;
      const lower = metadata & 8 ? data(neighbour(0, -1, 0)) : metadata;
      const upper = metadata & 8 ? metadata : data(neighbour(0, 1, 0));
      facing = DOOR_FACING[lower & 3];
      open = (lower & 4) !== 0;
      right = (upper & 1) !== 0;
    } else if (metadata & 8) {
      right = (metadata & 1) !== 0;
      const below = neighbour(0, -1, 0);
      // (an upper half below has the default state's facing and opening)
      if (below != null && below.type === type && !(below.metadata & 8)) {
        facing = DOOR_FACING[below.metadata & 3];
        open = (below.metadata & 4) !== 0;
      }
    } else {
      facing = DOOR_FACING[metadata & 3];
      open = (metadata & 4) !== 0;
      const above = neighbour(0, 1, 0);
      if (above != null && above.type === type && above.metadata & 8) right = (above.metadata & 1) !== 0;
    }
    // the 3/16 slab along each side of the block (BlockDoor's NORTH_AABB etc.: the one at the north side is z 0 - 3/16)
    const T = 0.1875;
    const side: Record<Dir, LegacyBox> = { north: [0, 0, 0, 1, 1, T], south: [0, 0, 1 - T, 1, 1, 1], east: [1 - T, 0, 0, 1, 1, 1], west: [0, 0, 0, T, 1, 1] };
    // closed: at the side it faces away from; open: at the side of its hinge or the other (getBoundingBox)
    const closed: Record<Dir, Dir> = { east: "west", south: "north", west: "east", north: "south" };
    const opened: Record<Dir, [Dir, Dir]> = { east: ["south", "north"], south: ["west", "east"], west: ["north", "south"], north: ["east", "west"] };
    return [side[!open ? closed[facing] : opened[facing][right ? 0 : 1]]];
  }

  /** BlockChest.getBoundingBox (1.9+): a chest of the same kind beside makes the box reach it (north, south, west, east). */
  private chestShapes(type: number, neighbour: LegacyNeighbour): LegacyBox[] {
    const same = (dx: number, dz: number) => neighbour(dx, 0, dz)?.type === type;
    if (same(0, -1)) return [[0.0625, 0, 0, 0.9375, 0.875, 0.9375]];
    if (same(0, 1)) return [[0.0625, 0, 0.0625, 0.9375, 0.875, 1]];
    if (same(-1, 0)) return [[0, 0, 0.0625, 0.9375, 0.875, 0.9375]];
    if (same(1, 0)) return [[0.0625, 0, 0.0625, 1, 0.875, 0.9375]];
    return [[0.0625, 0, 0.0625, 0.9375, 0.875, 0.9375]];
  }

  /**
   * BlockChorusPlant.getActualState (1.9+): an arm toward each chorus plant or flower beside, above or below (end stone
   * too below), around the 3/16-inset core.
   */
  private chorusShapes(neighbour: LegacyNeighbour): LegacyBox[] {
    const joins = (dx: number, dy: number, dz: number, ...also: number[]) => {
      const n = neighbour(dx, dy, dz);
      return n != null && (n.type === this.chorusPlant || n.type === this.chorusFlower || also.includes(n.type));
    };
    const a = 0.1875;
    const b = 0.8125;
    const boxes: LegacyBox[] = [[a, a, a, b, b, b]];
    if (joins(-1, 0, 0)) boxes.push([0, a, a, a, b, b]);
    if (joins(1, 0, 0)) boxes.push([b, a, a, 1, b, b]);
    if (joins(0, 1, 0)) boxes.push([a, b, a, b, 1, b]);
    if (joins(0, -1, 0, this.endStone)) boxes.push([a, 0, a, b, a, b]);
    if (joins(0, 0, -1)) boxes.push([a, a, 0, b, b, a]);
    if (joins(0, 0, 1)) boxes.push([a, a, b, b, b, 1]);
    return boxes;
  }
}
